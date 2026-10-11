package com.diplay.browser

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONArray
import org.json.JSONObject
import java.io.Closeable
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Cached device readings. No media, addresses or credentials; HTTP never performs sysfs I/O. */
class BrowserDiagnostics(context: Context) : Closeable {
    private val app = context.applicationContext
    private val worker = Executors.newSingleThreadScheduledExecutor { Thread(it, "browser-diagnostics").apply { isDaemon = true } }
    @Volatile private var latest: String? = null
    init { worker.scheduleAtFixedRate({ runCatching { sample() } }, 0, 2, TimeUnit.SECONDS) }
    fun snapshot(): JSONObject? = latest?.let {
        JSONObject(it).apply { put("ageMs", SystemClock.elapsedRealtime() - getLong("elapsedMs")) }
    }
    private fun sample() {
        val memory = ActivityManager.MemoryInfo().also { app.getSystemService(ActivityManager::class.java).getMemoryInfo(it) }
        val data = JSONObject().put("elapsedMs", SystemClock.elapsedRealtime())
            .put("availableBytes", memory.availMem).put("totalBytes", memory.totalMem)
            .put("thermalStatus", if (Build.VERSION.SDK_INT >= 29) app.getSystemService(PowerManager::class.java).currentThermalStatus else -1)
            .put("thermalSensors", thermalSensors(File("/sys/class/thermal")))
            .put("cpuPolicies", cpuPolicies(File("/sys/devices/system/cpu/cpufreq")))
        latest = data.toString()
    }
    override fun close() { worker.shutdownNow() }
    companion object {
        internal fun thermalSensors(root: File): JSONArray {
            val result = JSONArray()
            root.listFiles()?.filter { Regex("thermal_zone[0-9]+").matches(it.name) }?.take(64)?.forEach { zone ->
                runCatching {
                    val name = File(zone, "type").readText().trim()
                    if (!Regex("[A-Za-z0-9_-]{1,40}").matches(name)) return@runCatching
                    val raw = File(zone, "temp").readText().trim().toDouble()
                    val value = if (kotlin.math.abs(raw) >= 1000) raw / 1000 else raw
                    if (value.isFinite() && value in -20.0..150.0) result.put(JSONObject().put("name", name).put("celsius", value))
                }
            }
            return result
        }
        internal fun cpuPolicies(root: File): JSONArray {
            val result = JSONArray()
            root.listFiles()?.filter { Regex("policy[0-9]{1,4}").matches(it.name) }?.sortedBy { it.name.removePrefix("policy").toInt() }?.take(16)?.forEach { policy ->
                fun read(name: String): Long = runCatching {
                    File(policy, name).readText().trim().toLong().takeIf { it in 1..10_000_000 } ?: -1
                }.getOrDefault(-1)
                result.put(JSONObject().put("policy", policy.name.removePrefix("policy").toInt())
                    .put("currentKhz", read("scaling_cur_freq")).put("maxKhz", read("scaling_max_freq"))
                    .put("hardwareMaxKhz", read("cpuinfo_max_freq")))
            }
            return result
        }
    }
}
