package com.shilapi.xcertplay

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29])
class NavigationAudioSettingsTest {
    private val context get() = RuntimeEnvironment.getApplication()

    @Test fun attachedHostControlsCanObserveChangesAndUnsubscribeWhenDetached() {
        NavigationAudioSettings.save(context, -10)
        val observed = mutableListOf<Int>()
        val observation = NavigationAudioSettings.observe(context) { observed += NavigationAudioSettings.level(context) }
        NavigationAudioSettings.save(context, -15)
        shadowOf(context.mainLooper).idle()
        assertEquals(listOf(-15), observed)
        observation.close()
        NavigationAudioSettings.save(context, -6)
        shadowOf(context.mainLooper).idle()
        assertEquals(listOf(-15), observed)
    }

    @Test fun hostAndBrowserSharePersistenceAndStaleWritesCannotOverwriteIt() {
        NavigationAudioSettings.save(context, -10)
        assertEquals(-10, AirPlayPersistence.loadNavigationAudioAttenuationDb(context))
        assertTrue(NavigationAudioSettings.compareAndSave(context, -10, -15))
        assertEquals(-15, NavigationAudioSettings.level(context))
        assertFalse(NavigationAudioSettings.compareAndSave(context, -10, -5))
        assertEquals(-15, NavigationAudioSettings.level(context))
        for (db in listOf(-21, 1)) {
            assertThrows(IllegalArgumentException::class.java) { NavigationAudioSettings.save(context, db) }
        }
        assertEquals(-15, NavigationAudioSettings.level(context))
    }

    @Test fun twoSimultaneousBrowsersCannotBothReplaceTheSameLevel() {
        NavigationAudioSettings.save(context, -10)
        val pool = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        try {
            val attempts = listOf(-5, -15).map { db ->
                pool.submit<Boolean> { start.await(); NavigationAudioSettings.compareAndSave(context, -10, db) }
            }
            start.countDown()
            assertEquals(1, attempts.count { it.get(2, TimeUnit.SECONDS) })
            assertTrue(NavigationAudioSettings.level(context) in listOf(-5, -15))
        } finally { pool.shutdownNow() }
    }
}
