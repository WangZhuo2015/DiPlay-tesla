package com.diplay.tesla

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.util.Locale

/** Optional local gateway metadata. Transport, certificates and root stay outside CarPlay. */
internal object BrowserEntryProfile {
    const val FILE_NAME = "tesla-https-entry.json"
    private const val MAX_BYTES = 2048L
    private val hostname = Regex("(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}")

    fun load(context: Context): String? = runCatching {
        val file = File(context.noBackupFilesDir, FILE_NAME)
        if (!file.isFile || file.length() !in 1..MAX_BYTES) return null
        parse(file.readText(Charsets.UTF_8))
    }.getOrNull()

    fun parse(text: String): String? = runCatching {
        val json = JSONObject(text)
        if (json.optInt("version") != 1) return null
        val uri = URI(json.getString("url"))
        val host = uri.host?.lowercase(Locale.ROOT) ?: return null
        if (uri.scheme != "https" || host.length > 253 || !hostname.matches(host) ||
            uri.rawUserInfo != null || uri.rawQuery != null || uri.rawFragment != null ||
            uri.rawPath !in listOf("", "/") || (uri.port != -1 && uri.port !in 1..65535)) return null
        "https://$host" + if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
    }.getOrNull()

    fun links(origin: String?, direct: List<String>): List<String> =
        if (origin == null) direct else listOf(origin) + direct
}
