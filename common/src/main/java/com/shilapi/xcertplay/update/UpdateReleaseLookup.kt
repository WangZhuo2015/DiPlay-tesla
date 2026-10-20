package com.shilapi.xcertplay.update

import com.shilapi.xcertplay.CarPlayOutput
import java.net.URL
import java.net.URLConnection

internal object UpdateReleaseLookup {
    fun latest(
        installedVersion: String,
        userAgent: String,
        openConnection: (URL) -> URLConnection = { it.openConnection() },
    ): UpdateRelease? {
        // Both foreground and background checks must use the composing application's channel.
        val output = CarPlayOutput.extension
        val json = UpdateClient.fetchText(
            output?.updateReleasesUrl ?: UpdateClient.RELEASES_URL,
            "application/vnd.github+json",
            userAgent,
            openConnection,
        )
        val release = UpdateCatalog.parse(json, output?.updateApkPrefix) ?: return null
        return release.takeIf { UpdateVersion.isNewer(it.tagName, installedVersion) }
    }
}
