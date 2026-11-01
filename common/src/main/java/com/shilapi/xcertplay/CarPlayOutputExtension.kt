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
    /** Optional remote-display product shell; ordinary head-unit applications keep their own home. */
    val remoteHostUi: Boolean get() = false
    /** Product default only; a saved owner preference always takes precedence. */
    val defaultHevcEnabled: Boolean get() = false
    /** Encoded video goes to an external decoder; local MediaCodec capability does not gate HEVC. */
    val encodedVideoPassthrough: Boolean get() = false
    val hostProductName: String? get() = null
    fun hostSnapshot(): RemoteHostSnapshot? = null
    fun openHostPairing(renew: Boolean = false) {}
    fun showEntrySettings(activity: Activity, saved: () -> Unit) {}
    fun configure(config: AirPlayConfig): AirPlayConfig
    fun mediaSink(local: MediaSink): MediaSink
    fun attach(controller: CarPlayController, reconnect: () -> Unit)
    fun detach(controller: CarPlayController?)
    fun connectionStage(message: String) {}
    fun diagnosticReport(): String? = null
    fun connectionSummary(): String
    fun displaySummary(): String
    fun showConnectionSettings(activity: Activity, saved: () -> Unit)
    fun showDisplaySettings(activity: Activity, saved: () -> Unit)
}

data class RemoteHostSnapshot(
    val address: String?,
    val httpsEntryConfigured: Boolean,
    val pairingCode: String?,
    val iphoneConnected: Boolean,
    /** An authenticated media viewer is attached; this does not assert video playback or vehicle identity. */
    val browserConnected: Boolean,
    val error: String? = null,
)

object CarPlayOutput {
    @Volatile var extension: CarPlayOutputExtension? = null
    fun markReconnectNeeded() {
        CarPlayBackgroundSession.snapshot()?.controller?.let(PendingReconnect::mark)
    }
}
