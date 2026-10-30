# Browser media efficiency

## Scope and baseline

This change targets sustained playback on Android hosts and Tesla browsers with limited
CPU or thermal headroom. The source baseline is `f39ab328d2a061c28adb192cc121a2d39792e0d7`
(Tesla 0.1.11). It retains the selected resolution, JPEG quality, H.264 prediction-chain
rules, audio routing, and the existing RTC recovery policy.

No physical Android host, iPhone, or Tesla was attached to this development environment.
The measurements below are local synthetic workloads or counts established by code and
tests. They are not vehicle FPS, power, temperature, or end-to-end latency measurements.

## Bottlenecks and changes

### JPEG fallback

Previously `JpegVideoSink` both drained MediaCodec and synchronously converted/compressed
each selected image. A slow JPEG compression blocked decoder progress and could fill
the H.264 input queue, forcing a decoder reset and another keyframe. It also performed
this work without an active JPEG viewer.

The decoder now copies pixels only when the encoder's single slot is available, releases
the codec image, and continues draining reference frames. A separate worker compresses
that owned NV21 buffer. There is no queue of images awaiting compression; an occupied
slot skips another picture without copying it. Compressed H.264 reference frames are
still decoded in order while the viewer is active.

Conversion is paced by both the selected JPEG FPS cap and its measured wall time. The
next conversion begins no earlier than the selected frame period, and has an idle
interval at least as long as the previous conversion. For example, a 10 ms conversion
at 20 FPS can retain the 50 ms period; a 60 ms conversion waits another 60 ms before
starting the next picture. This trades JPEG output rate for bounded sustained work on
a slow or thermally throttled host. It does not renegotiate or persist a lower source
FPS, lower resolution, or lower JPEG quality. It is a worker time budget, not a claim
about whole-device CPU utilization.

Each new stream retains one successful startup JPEG publication even without a
viewer. Some wireless peers without the optional iAP2 tunnel require that real rendered
frame proof to keep Bluetooth control alive; merely receiving compressed data must not
be substituted for successful decoding. The decoder may drain additional reference
frames while that first JPEG is being compressed. After that one-time proof, an authenticated
`GET /api/frame` renews a two-second demand lease. When it expires,
the JPEG prediction chain is invalidated and the decoder is released. A returning
viewer starts from a fresh chain and requests a keyframe. Unauthorized, cross-origin,
and wrong-method requests cannot renew the lease. The existing browser already stops
JPEG requests when hidden or when RTC takes over. RTC suspension also releases JPEG
decoding immediately. Stream generations prevent an old compression job from publishing
after reset, suspension, or close.

NV21 pixels and the JPEG compression scratch buffer are reused. Each HTTP-visible JPEG
still has its own immutable byte array. Luma rows with pixel stride one use bulk copies;
padded/cropped planes, interleaved chroma, and strided luma remain supported. At
1920 × 1080, the NV21 array is 3,110,400 bytes. Reusing it removes that allocation per
converted frame: 62.2 MB/s at 20 converted FPS or 93.3 MB/s at 30 converted FPS, before
considering the reused compression scratch buffer. These are allocation-size calculations,
not measured garbage-collector or throughput improvements.

The decoder also stops draining when MediaCodec reports no output, instead of making
all sixteen dequeue calls on an empty output queue.

### RTC forwarding

The production `ScreenStream` supplies an Annex-B access unit. The old IDR check scanned
its entire compressed payload. `RtcAccessUnit` now checks leading NAL headers and stops
at the first VCL header. This relies on the single-access-unit callback contract and
H.264 section 7.4.1: an IDR picture cannot mix IDR type 5 with non-IDR VCL types 1–4.

The bounded queue allocates payload storage only after admission. SPS/PPS are included
in the same allocation as an accepted IDR, removing the second whole-IDR concatenation
at send time. Alternate AVCC callers are validated by NAL lengths and converted only
after admission. The normal Annex-B P-frame path still requires its existing owned
queue copy; this change does not claim to eliminate that copy.

The 50 ms queue age, six-frame limit, 2 MiB budget, disconnect handling, and requirement
for a fresh keyframe after dropping a reference remain in place. Rejected frames do not
schedule an empty drain task.

### Browser presentation and audio

Healthy Canvas playback previously ran a display-rate animation loop alongside
`requestVideoFrameCallback`. It now draws on video callbacks and checks their deadline
with a timer. Old browsers, rejected callback APIs, and stalled compositors retain the
animation fallback. Recovery cancels that fallback and fences old callbacks.

A deterministic ten-second workload presenting 500 frames requests zero animation
callbacks and about forty watchdog callbacks while video callbacks are healthy. The
baseline requested animation callbacks continuously at the display refresh rate.
This affects optional Canvas presentation; native video remains the default.

Audio state callbacks are deduplicated when enabled state, buffer setting, and underrun
count are unchanged. A fifty-packet test retains all fifty packet acknowledgements and
route heartbeats while avoiding fifty repeated UI notifications.

JPEG responses that become obsolete because the page hides, the stream is replaced, or
RTC takes over are discarded before decoding where possible. Decoded bitmaps are always
closed, including when drawing fails.

## Host microbenchmark

`scripts/benchmark-browser-media.py` compiles the actual baseline and current helpers
using an already downloaded Gradle Kotlin compiler. It checks complete NV21 output
equivalence, warms each variant, alternates measurement order, and publishes output
references/checksums so the work remains observable. It does not download dependencies
or invoke a Gradle build.

```sh
python3 scripts/benchmark-browser-media.py --base-ref f39ab328 \
  --gradle-home /path/to/gradle-user-home --java /path/to/jdk/bin/java
```

The final isolated host run on 2026-10-30 used x86_64 Linux, OpenJDK 25.0.5, Kotlin
2.3.20, a 256 MiB heap, 500 ms warmup per variant, and nine alternating samples. For
1920 × 1080 padded direct-buffer YUV with chroma pixel stride two:

| Variant | Median conversion time | Baseline time / variant time |
| --- | ---: | ---: |
| Baseline per-pixel copy and new NV21 array | 3.421 ms | 1.00 |
| Bulk luma copy with a new NV21 array | 1.360 ms | 2.52 |
| Bulk luma copy with reused NV21 storage | 1.064 ms | 3.22 |

These timings cover only YUV-to-NV21 conversion, not JPEG compression or the whole
stream. They do not predict Android/ART, ARM hardware, power, or thermal behavior.
The script also compares isolated NAL classification; the very large ratios for that
small header-only operation must not be presented as whole-stream acceleration.
[Raw samples and source hashes](benchmarks/browser-media-20261030.json) are included
so the result can be checked against the exact helpers used.

## Verification

The regression suite covers the one-time viewerless startup proof, encoder backpressure, pixel/scratch buffer reuse and published
byte ownership, conversion pacing, close and failed-copy behavior, demand expiry and
HTTP authorization, cropped/padded/strided YUV planes, AVCC validation and queue ownership,
RTC recovery, Canvas callback recovery, audio acknowledgements, and stale JPEG disposal.

The final local run on 2026-10-30 passed all 3,641 Android unit tests (shared 1,798;
common 1,736; home 14; browser 82; Tesla 11), all 84 Node tests, five requested lint
gates, four Debug APK builds, and RTC native builds for arm64-v8a, armeabi-v7a, and
x86_64. There were no failed or skipped tests. Instrumentation code was compiled;
the actual device-side instrumentation test was not run.

Run the full gate from `.github/workflows/android.yml`:

```sh
./gradlew :shared:testDebugUnitTest :common:testDebugUnitTest :home:testDebugUnitTest \
  :mobile:lintDebug :home:lintDebug :maphost:lintDebug \
  :mobile:assembleDebug :home:assembleDebug :maphost:assembleDebug \
  :browser:testDebugUnitTest :browser:lintDebug \
  :tesla:testDebugUnitTest :tesla:lintDebug :tesla:assembleDebug --stacktrace
node --test proxy/test/*.test.mjs browser/test/*.test.mjs
python3 scripts/check_public_tree.py
```

The existing Android instrumentation test exercises a real encoder → decoder → JPEG
path and now renews viewer demand. It requires an attached Android target and is separate
from the host unit-test gate:

```sh
./gradlew :browser:connectedDebugAndroidTest
```

## Physical-device comparison

Use the same host, browser, network, power source, source content, resolution, and FPS
for baseline and updated builds. While parked, compare a sustained navigation/animation
workload for at least twenty minutes in each of these cases:

1. Native RTC playback, then optional Canvas playback.
2. Forced JPEG fallback with normal cooling, then the usual warm operating conditions.
3. Hide or disconnect the browser for ten seconds, then return; check keyframe recovery
   and ensure no stale JPEG appears over the replacement stream.
4. Brief Wi-Fi interruptions followed by recovery, including concurrent music/navigation
   audio and touch input.

Record process CPU, memory/GC activity, Android thermal status and available temperature
sensors, decoded/presented FPS, queue/recovery counters, audio underruns, and touch-to-display
latency. Confirm that idle JPEG processing stops and that hot-device JPEG pacing remains
responsive. Thermal-policy efficacy and vendor MediaCodec behavior remain physical-device
validation items; host benchmarks cannot establish them.
