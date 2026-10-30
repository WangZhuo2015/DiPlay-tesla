package com.shilapi.xcertplay

import android.content.Context
import com.shilapi.xcertplay.media.NavigationAudioGain

/** One persisted guidance level for host settings and authenticated browser controls. */
object NavigationAudioSettings {
    fun observe(context: Context, changed: () -> Unit): java.io.Closeable =
        AirPlayPersistence.observeNavigationAudioAttenuation(context, changed)

    @Synchronized fun level(context: Context): Int = AirPlayPersistence.loadNavigationAudioAttenuationDb(context)

    @Synchronized fun save(context: Context, db: Int) {
        require(db in NavigationAudioGain.MIN_DB..NavigationAudioGain.MAX_DB)
        AirPlayPersistence.saveNavigationAudioAttenuationDb(context, db)
        CarPlayBackgroundSession.snapshot()?.sink?.setNavigationAttenuationDb(db)
    }

    /** Stale browser controls must refresh instead of overwriting a change made elsewhere. */
    @Synchronized fun compareAndSave(context: Context, expectedDb: Int, db: Int): Boolean {
        require(expectedDb in NavigationAudioGain.MIN_DB..NavigationAudioGain.MAX_DB)
        require(db in NavigationAudioGain.MIN_DB..NavigationAudioGain.MAX_DB)
        if (level(context) != expectedDb) return false
        save(context, db)
        return true
    }
}
