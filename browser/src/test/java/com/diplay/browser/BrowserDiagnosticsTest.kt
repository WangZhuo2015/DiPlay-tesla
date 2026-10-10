package com.diplay.browser

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class) @Config(sdk=[29])
class BrowserDiagnosticsTest {
    @get:Rule val temporary = TemporaryFolder()
    @Test fun sensorNamesRemainAccurateAndInvalidReadingsAreOmitted() {
        val root = temporary.newFolder()
        fun zone(index: Int, name: String, value: String) {
            val dir = File(root, "thermal_zone$index").apply { mkdir() }
            File(dir, "type").writeText(name); File(dir, "temp").writeText(value)
        }
        zone(0, "soc-thmzone", "71500"); zone(1, "board-thmzone", "-12000")
        zone(2, "gpu", "NaN"); zone(3, "unknown", "999999")
        zone(4, "untrusted <name>", "40")
        val readings = BrowserDiagnostics.thermalSensors(root)
        assertEquals(2, readings.length())
        val values = (0 until readings.length()).associate { readings.getJSONObject(it).let { row -> row.getString("name") to row.getDouble("celsius") } }
        assertEquals(71.5, values.getValue("soc-thmzone"), 0.0)
        assertEquals(-12.0, values.getValue("board-thmzone"), 0.0)
    }
    @Test fun unavailableCpuLimitsRemainUnknown() {
        val root = temporary.newFolder()
        val policy = File(root, "policy0").apply { mkdir() }
        File(policy, "scaling_cur_freq").writeText("1800000")
        File(policy, "cpuinfo_max_freq").writeText("999999999")
        val row = BrowserDiagnostics.cpuPolicies(root).getJSONObject(0)
        assertEquals(1800000L, row.getLong("currentKhz"))
        assertEquals(-1L, row.getLong("maxKhz")); assertEquals(-1L, row.getLong("hardwareMaxKhz"))
    }
}
