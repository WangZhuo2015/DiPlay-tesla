package com.shilapi.xcertplay.update

import com.shilapi.xcertplay.CarPlayOutput
import com.shilapi.xcertplay.CarPlayOutputExtension
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.doReturn
import org.mockito.Mockito.mock
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29])
class UpdateReleaseLookupTest {
    @After fun clearOutput() { CarPlayOutput.extension = null }

    @Test fun foregroundAndBackgroundLookupUseTheTeslaChannelAndApk() {
        teslaOutput()
        var requestedUrl: String? = null
        val release = UpdateReleaseLookup.latest("0.1.10", "DiPlay/test") { url ->
            requestedUrl = url.toString()
            response(url, "tesla-v0.1.11", "DiPlay-Tesla-0.1.11.apk", "DiPlay-0.2.21.apk")
        }
        assertEquals(TESLA_RELEASES, requestedUrl)
        assertEquals("DiPlay-Tesla-0.1.11.apk", release?.apkName)
        assertEquals("tesla-v0.1.11", release?.tagName)
    }

    @Test fun teslaChannelRejectsAnOrdinaryDiPlayApk() {
        teslaOutput()
        assertNull(UpdateReleaseLookup.latest("0.1.10", "DiPlay/test") { url ->
            response(url, "v0.2.21", "DiPlay-0.2.21.apk")
        })
    }

    @Test fun ordinaryApplicationKeepsTheUpstreamChannel() {
        CarPlayOutput.extension = null
        var requestedUrl: String? = null
        val release = UpdateReleaseLookup.latest("0.2.20", "DiPlay/test") { url ->
            requestedUrl = url.toString()
            response(url, "v0.2.21", "DiPlay-0.2.21.apk")
        }
        assertEquals(UpdateClient.RELEASES_URL, requestedUrl)
        assertEquals("DiPlay-0.2.21.apk", release?.apkName)
    }

    private fun teslaOutput() {
        CarPlayOutput.extension = mock(CarPlayOutputExtension::class.java).also {
            doReturn(TESLA_RELEASES).`when`(it).updateReleasesUrl
            doReturn("DiPlay-Tesla-").`when`(it).updateApkPrefix
        }
    }

    private fun response(url: URL, tag: String, vararg names: String): HttpURLConnection {
        val assets = (names.toList() + "SHA256SUMS.txt").joinToString(",") {
            """{"name":"$it","browser_download_url":"https://example.test/$it"}"""
        }
        val bytes = """[{"tag_name":"$tag","assets":[$assets]}]""".toByteArray()
        return object : HttpURLConnection(url) {
            override fun connect() = Unit
            override fun disconnect() = Unit
            override fun usingProxy() = false
            override fun getResponseCode() = 200
            override fun getInputStream() = ByteArrayInputStream(bytes)
        }
    }

    private companion object {
        const val TESLA_RELEASES = "https://api.github.com/repos/WangZhuo2015/DiPlay-tesla/releases?per_page=3"
    }
}
