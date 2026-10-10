package com.shilapi.xcertplay

import android.app.Activity
import com.shilapi.xcertplay.airplay.AirPlayConfig
import com.shilapi.xcertplay.airplay.MediaSink
import com.shilapi.xcertplay.orchestration.CarPlayController

/** Optional output installed by an application, with no browser/proxy dependency in the core. */
interface CarPlayOutputExtension {
    val fixedDisplay: Boolean get() = false
    val updateReleasesUrl: String? get() = null
    val updateApkPrefix: String? get() = null
    fun configure(config: AirPlayConfig): AirPlayConfig
    fun mediaSink(local: MediaSink): MediaSink
    fun attach(controller: CarPlayController, reconnect: () -> Unit)
    fun detach(controller: CarPlayController?)
    fun connectionStage(message: String) {}
    fun connectionSummary(): String
    fun displaySummary(): String
    fun showConnectionSettings(activity: Activity, saved: () -> Unit)
    fun showDisplaySettings(activity: Activity, saved: () -> Unit)
}

object CarPlayOutput {
    @Volatile var extension: CarPlayOutputExtension? = null
    fun markReconnectNeeded() {
        CarPlayBackgroundSession.snapshot()?.controller?.let(PendingReconnect::mark)
    }
}
