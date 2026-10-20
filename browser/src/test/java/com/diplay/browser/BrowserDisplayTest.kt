package com.diplay.browser

import org.junit.Assert.*
import org.junit.Test

class BrowserDisplayTest {
    @Test fun profilesKeepSeparateSizesAcrossModeSwitches() {
        val right = BrowserResolution(960, 720)
        val full = BrowserResolution(1920, 1200)
        val profile = BrowserDisplay(right = right, full = full)
        assertEquals(right, profile.resolution)
        assertEquals(full, profile.copy(mode = BrowserMode.FULL).resolution)
        assertEquals(right, profile.copy(mode = BrowserMode.FULL).copy(mode = BrowserMode.RIGHT).resolution)
    }
    @Test fun dimensionsAndDecodeBudgetAreBounded() {
        for (size in listOf(319 to 240, 320 to 239, 2562 to 1440, 320 to 1442, 641 to 480)) {
            assertThrows(IllegalArgumentException::class.java) { BrowserResolution(size.first,size.second) }
        }
        assertThrows(IllegalArgumentException::class.java) { BrowserDisplay(fps = 61) }
        assertThrows(IllegalArgumentException::class.java) { BrowserDisplay(jpegQuality = 100) }
    }
    @Test fun highFrameRateForwardingDoesNotRaiseTheJpegConversionBudget() {
        assertEquals(60, BrowserDisplay(fps = 60).fps)
        assertEquals(30, BrowserDisplay(fps = 60).jpegFps)
        assertEquals(30, BrowserDisplay(fps = 30).jpegFps)
        assertEquals(20, BrowserDisplay().jpegFps)
        assertEquals(5, BrowserDisplay(fps = 5).jpegFps)
    }
    @Test fun onlyNewestFrameIsRetainedAndSessionTeardownClearsIt() {
        val latest = LatestFrame()
        latest.publish(byteArrayOf(1)); latest.publish(byteArrayOf(2))
        val frame = latest.after(0)!!
        assertArrayEquals(byteArrayOf(2), frame.jpeg)
        assertNull(latest.after(frame.sequence))
        latest.clear()
        assertNull(latest.after(0))
        latest.publish(byteArrayOf(3))
        assertNotNull(latest.after(frame.sequence))
    }
}
