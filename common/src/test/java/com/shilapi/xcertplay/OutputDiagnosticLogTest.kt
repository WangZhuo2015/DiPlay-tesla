package com.shilapi.xcertplay

import android.app.Application
import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class OutputDiagnosticLogTest {
    @Test fun reopeningAndExportingKeepsTheEarlierTripWithoutSecrets() {
        val directory = Files.createTempDirectory("browser-history").toFile()
        try {
            OutputDiagnosticLog(directory).use { first ->
                first.append("RTC attempt=1 stopped reason=connection-timeout sent=0")
                first.append("token=private-pairing-secret")
                first.append("RTC remote=192.168.0.1")
                val report = first.report()
                assertTrue(report.contains("connection-timeout"))
                assertTrue(report.contains("uptimeMs="))
                assertTrue(report.contains("remote=[ip]"))
                assertFalse(report.contains("private-pairing-secret"))
                assertFalse(report.contains("192.168.0.1"))
                assertEquals(report, first.report())
            }
            OutputDiagnosticLog(directory).use { second ->
                second.append("RTC attempt=2 first browser frame")
                val report = second.report()
                assertTrue(report.contains("attempt=1 stopped"))
                assertTrue(report.contains("attempt=2 first browser frame"))
                assertFalse(directory.resolve("previous.log").exists())
            }
        } finally { directory.deleteRecursively() }
    }

    @Test fun aFullHistoryRotatesInsteadOfGrowingWithoutABound() {
        val directory = Files.createTempDirectory("browser-history-full").toFile()
        try {
            directory.resolve("diplay.log").writeText("Earlier trip\n" + "x".repeat(SessionLogFile.MAX_BYTES.toInt()))
            OutputDiagnosticLog(directory).use { log ->
                log.append("RTC next trip connected")
                val report = log.report()
                assertTrue(report.contains("Earlier trip"))
                assertTrue(report.contains("next trip connected"))
                assertTrue(directory.resolve("diplay.log").length() < 1024)
                assertTrue(directory.resolve("previous.log").isFile)
            }
        } finally { directory.deleteRecursively() }
    }
}
