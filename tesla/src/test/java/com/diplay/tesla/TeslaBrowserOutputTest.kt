package com.diplay.tesla

import android.app.Application
import com.diplay.browser.BrowserDisplay
import com.diplay.browser.BrowserMode
import com.diplay.browser.BrowserResolution
import com.shilapi.xcertplay.AppLocale
import com.shilapi.xcertplay.airplay.AirPlayConfig
import com.shilapi.xcertplay.airplay.AirPlayDisplayConfig
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class TeslaBrowserOutputTest {
    private val context get() = RuntimeEnvironment.getApplication()
    @After fun clean() {
        context.getSharedPreferences("tesla-browser",0).edit().clear().commit()
        context.getSharedPreferences("diplay",0).edit().clear().commit()
    }
    @Test fun remoteCanvasOverridesHostSizeAndHevcWithoutChangingAudioOrIdentity() {
        val output = TeslaBrowserOutput(context)
        val config = AirPlayConfig("DiPlay","device","bt","version", AirPlayDisplayConfig(640,480),
            cluster = AirPlayDisplayConfig(480,320), hevc = true, microphone = true, mainBufferedAudio = true)
        val selected = BrowserDisplay(BrowserMode.FULL,full = BrowserResolution(1600,900),fps = 25)
        output.saveDisplay(selected)
        val actual = output.configure(config)
        assertEquals(1600,actual.main.widthPixels)
        assertEquals(900,actual.main.heightPixels)
        assertEquals(25,actual.main.fps)
        assertFalse(actual.hevc)
        assertNull(actual.cluster)
        assertNull(actual.main.viewAreas)
        assertTrue(actual.microphone)
        assertTrue(actual.mainBufferedAudio)
        assertEquals(config.deviceId,actual.deviceId)
        assertEquals(selected,TeslaBrowserOutput(context).status().getJSONObject("display").let(com.diplay.browser.BrowserDisplayJson::decode))
    }
    @Test fun changingProfileDefersNegotiationAndSavingTheSameProfileDoesNotRequestReconnect() {
        val output = TeslaBrowserOutput(context)
        output.configure(AirPlayConfig("DiPlay","device","bt","version",AirPlayDisplayConfig(640,480)))
        assertFalse(output.status().getBoolean("pendingReconnect"))
        output.saveDisplay(BrowserDisplay(mode = BrowserMode.FULL))
        val state = output.status()
        assertTrue(state.getBoolean("pendingReconnect"))
        assertEquals("RIGHT",state.getJSONObject("activeDisplay").getString("mode"))
        assertEquals("FULL",state.getJSONObject("display").getString("mode"))
    }
    @Test @Config(qualifiers = "fr") fun cnLanguageFallbackRunsOnceAndPreservesTheChosenLanguage() {
        TeslaLocaleDefault.apply(context)
        assertEquals(AppLocale.SIMPLIFIED_CHINESE,AppLocale.preference(context))
        AppLocale.save(context,AppLocale.ENGLISH)
        TeslaLocaleDefault.apply(context)
        assertEquals(AppLocale.ENGLISH,AppLocale.preference(context))
    }
    @Test @Config(qualifiers = "uk") fun supportedUkrainianKeepsSystemLanguage() {
        TeslaLocaleDefault.apply(context)
        assertEquals(AppLocale.SYSTEM,AppLocale.preference(context))
    }
}
