#!/usr/bin/env python3
"""Compare pure JVM media helpers with a git baseline; does not invoke Gradle or download tools.

Example (after the project's Gradle distribution has been downloaded):
    python3 scripts/benchmark-browser-media.py --base-ref f39ab328 \
        --gradle-home /path/to/gradle-user-home --java /path/to/jdk/bin/java

These synthetic host-JVM microbenchmarks are not Android FPS, heat, or battery measurements.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import statistics
import subprocess
import tempfile


HARNESS = r'''
package com.diplay.browser

import com.diplay.browser.rtc.RtcAccessUnit
import com.shilapi.xcertplay.airplay.VideoCodec
import com.shilapi.xcertplay.media.MediaCodecSupport
import java.nio.ByteBuffer

private object Sink {
    @Volatile var checksum = 0L
    @Volatile var bytes: ByteArray? = null
}

private class Variant(val name: String, val batch: (Int) -> Long) {
    var iterations = 1
    var checksum = 0L
    val samples = mutableListOf<Double>()
    fun run(count: Int): Long {
        val started = System.nanoTime()
        checksum = batch(count)
        Sink.checksum = checksum
        return System.nanoTime() - started
    }
}

private fun compare(scenario: String, variants: List<Variant>) {
    // Warm each compiled helper, then calibrate each variant independently to at least 75 ms.
    for (variant in variants) {
        val until = System.nanoTime() + 500_000_000L
        while (System.nanoTime() < until) variant.run(32)
        while (variant.run(variant.iterations) < 75_000_000L && variant.iterations < 134_217_728) {
            variant.iterations *= 2
        }
    }
    repeat(9) { sample ->
        val order = if (sample % 2 == 0) variants else variants.reversed()
        for (variant in order) {
            variant.samples += variant.run(variant.iterations).toDouble() / variant.iterations
        }
    }
    for (variant in variants) {
        println("""{"scenario":"$scenario","variant":"${variant.name}","iterationsPerSample":${variant.iterations},"samplesNsPerOperation":[${variant.samples.joinToString(",")}],"checksum":${variant.checksum}}""")
    }
}

private fun classify(size: Int) {
    // A small rotating working set, 31 P pictures per IDR. Headers differ, so the result is consumed.
    val pictures = Array(32) { index ->
        ByteArray(size) { offset -> ((index * 17 + offset * 13) % 250 + 4).toByte() }.apply {
            this[0] = 0; this[1] = 0; this[2] = 0; this[3] = 1
            this[4] = if (index == 31) 0x65 else 0x41
        }
    }
    for (picture in pictures) {
        check(MediaCodecSupport.isRandomAccess(picture, VideoCodec.H264) == RtcAccessUnit.inspect(picture)!!.key)
    }
    compare("annex-b-${size / 1024}KiB-31P-1IDR", listOf(
        Variant("baseline") { count ->
            var sum = 0L
            repeat(count) { if (MediaCodecSupport.isRandomAccess(pictures[it and 31], VideoCodec.H264)) sum++ }
            sum
        },
        Variant("current") { count ->
            var sum = 0L
            repeat(count) { if (RtcAccessUnit.inspect(pictures[it and 31])!!.key) sum++ }
            sum
        },
    ))
}

private fun nv21() {
    val width = 1920
    val height = 1080
    val rowStride = 1984
    fun plane(rows: Int, seed: Int): ByteBuffer = ByteBuffer.allocateDirect(rowStride * rows).apply {
        repeat(capacity()) { put(it, ((it * 13 + seed) and 255).toByte()) }
    }
    val buffers = listOf(plane(height, 17), plane(height / 2, 31), plane(height / 2, 53))
    val current = buffers.mapIndexed { index, buffer -> YuvPlanes.Plane(buffer, rowStride, if (index == 0) 1 else 2) }
    val baseline = buffers.mapIndexed { index, buffer -> BaselineYuvPlanes.Plane(buffer, rowStride, if (index == 0) 1 else 2) }
    val reusable = ByteArray(width * height * 3 / 2)
    val expected = BaselineYuvPlanes.nv21(baseline, 0, 0, width, height)
    check(expected.contentEquals(YuvPlanes.nv21(current, 0, 0, width, height)))
    check(expected.contentEquals(YuvPlanes.nv21(current, 0, 0, width, height, reusable)))
    fun consume(output: ByteArray, index: Int): Long {
        // Publishing the array makes every write observable; sample bytes keep a data-dependent checksum.
        Sink.bytes = output
        return (output[(index * 7919) % output.size].toInt() and 255).toLong() +
            (output[width * height].toInt() and 255) + (output.last().toInt() and 255)
    }
    compare("nv21-1920x1080-direct-padded-chroma-stride2", listOf(
        Variant("baseline-allocate") { count ->
            var sum = 0L
            repeat(count) { sum += consume(BaselineYuvPlanes.nv21(baseline, 0, 0, width, height), it) }
            sum
        },
        Variant("current-allocate") { count ->
            var sum = 0L
            repeat(count) { sum += consume(YuvPlanes.nv21(current, 0, 0, width, height), it) }
            sum
        },
        Variant("current-reuse") { count ->
            var sum = 0L
            repeat(count) { sum += consume(YuvPlanes.nv21(current, 0, 0, width, height, reusable), it) }
            sum
        },
    ))
}

fun main() {
    for (size in listOf(20, 50, 100)) classify(size * 1024)
    nv21()
}
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-ref", required=True, help="Git commit before these optimizations")
    parser.add_argument("--gradle-home", type=Path, default=Path(os.environ.get("GRADLE_USER_HOME", Path.home() / ".gradle")))
    parser.add_argument("--java", default=shutil.which("java"), help="Java executable (project JDK recommended)")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    compilers = sorted(args.gradle_home.glob("wrapper/dists/gradle-*/**/lib/kotlin-compiler-embeddable-*.jar"))
    if not compilers or not args.java:
        parser.error("Java and a downloaded Gradle distribution with its Kotlin compiler are required")
    library = compilers[-1].parent
    stdlib = sorted(library.glob("kotlin-stdlib-*.jar"))[-1]
    annotations = sorted(library.glob("annotations-*.jar"))[-1]

    def git(*command):
        return subprocess.check_output(["git", "-C", str(root), *command], text=True)

    base = git("rev-parse", "--verify", f"{args.base_ref}^{{commit}}").strip()
    with tempfile.TemporaryDirectory(prefix="diplay-media-benchmark-") as directory:
        scratch = Path(directory)
        original_yuv = git("show", f"{base}:browser/src/main/java/com/diplay/browser/YuvPlanes.kt")
        (scratch / "BaselineYuvPlanes.kt").write_text(original_yuv.replace("object YuvPlanes", "object BaselineYuvPlanes"))
        (scratch / "MediaCodecSupport.kt").write_text(git("show", f"{base}:shared/src/main/java/com/shilapi/xcertplay/media/MediaCodecSupport.kt"))
        (scratch / "VideoCodec.kt").write_text("package com.shilapi.xcertplay.airplay\nenum class VideoCodec { H264, H265 }\n")
        (scratch / "Benchmark.kt").write_text(HARNESS)
        classes = scratch / "classes"
        compile_command = [args.java, "-cp", str(library / "*"), "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
                           "-no-stdlib", "-no-reflect", "-jvm-target", "11", "-classpath",
                           os.pathsep.join(map(str, [stdlib, annotations])), "-d", str(classes)]
        sources = [*scratch.glob("*.kt"), root / "browser/src/main/java/com/diplay/browser/YuvPlanes.kt",
                   root / "browser/src/main/java/com/diplay/browser/rtc/RtcAccessUnit.kt"]
        subprocess.run([*compile_command, *map(str, sources)], check=True)
        runtime = os.pathsep.join(map(str, [classes, stdlib]))
        output = subprocess.check_output([args.java, "-Xms256m", "-Xmx256m", "-cp", runtime,
                                          "com.diplay.browser.BenchmarkKt"], text=True)
    results = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
    medians = {}
    for result in results:
        result["medianNsPerOperation"] = statistics.median(result["samplesNsPerOperation"])
        scenario = result["scenario"]
        if result["variant"].startswith("baseline"):
            medians[scenario] = result["medianNsPerOperation"]
        result["baselineMedianDividedByMedian"] = medians[scenario] / result["medianNsPerOperation"]
    java_version = subprocess.run([args.java, "-version"], text=True, capture_output=True, check=True).stderr.strip()
    current_sources = ["browser/src/main/java/com/diplay/browser/YuvPlanes.kt",
                       "browser/src/main/java/com/diplay/browser/rtc/RtcAccessUnit.kt"]
    print(json.dumps({"baseline": base, "head": git("rev-parse", "HEAD").strip(),
                      "sourceSha256": {path: hashlib.sha256((root / path).read_bytes()).hexdigest()
                                       for path in current_sources},
                      "worktreeChanges": git("status", "--short").splitlines(),
                      "platform": platform.platform(), "machine": platform.machine(),
                      "java": java_version, "kotlinCompiler": compilers[-1].name,
                      "jvmOptions": ["-Xms256m", "-Xmx256m"], "warmupMsPerVariant": 500,
                      "samplesPerVariant": 9, "sampleOrder": "alternating forward/reverse",
                      "limitations": "Synthetic host JVM; excludes decoding, JPEG compression, networking, Android/ART and thermal behavior. Classification workload is 31 P access units per IDR; NV21 verifies full output equivalence before timing.",
                      "results": results}, indent=2))


if __name__ == "__main__":
    main()
