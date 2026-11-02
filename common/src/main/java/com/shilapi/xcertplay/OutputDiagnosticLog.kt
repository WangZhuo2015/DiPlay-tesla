package com.shilapi.xcertplay

import android.os.SystemClock
import java.io.Closeable
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Product transport history survives app restarts. Same bounded writer/redaction as CarPlay logs. */
class OutputDiagnosticLog(private val directory: File) : Closeable {
    private val log = SessionLogFile(File(directory, "diplay.log"))
    init { runCatching { directory.mkdirs() } }

    fun append(message: String) {
        val safe = DiagnosticRedactor.redact(message) ?: return
        val time = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).format(Date())
        log.append("$time uptimeMs=${SystemClock.elapsedRealtime()} $safe")
    }

    /** Exporting never clears history; no reset/rotation merely because the app restarts. */
    fun report(carPlayLogs: File? = null): String {
        log.awaitIdle(2_000)
        return buildString {
            appendLine("--- Browser transport history (up to about 4 MiB; oldest files rotate) ---")
            fun appendLogs(directory: File, label: String) {
                for (name in SessionLogFile.REPORT_NAMES) {
                    val file = File(directory, name)
                    if (file.isFile) {
                        appendLine("--- $label $name ---")
                        runCatching { file.useLines { lines -> lines.forEach { line ->
                            DiagnosticRedactor.redact(line)?.let { appendLine(it) }
                        } } }.onFailure { appendLine("History file unavailable during export") }
                    }
                }
            }
            appendLogs(directory, "Browser")
            if (carPlayLogs != null) appendLogs(carPlayLogs, "CarPlay")
        }
    }

    override fun close() = log.close()
}
