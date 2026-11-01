package com.diplay.tesla

import android.app.Application
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Context
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlertDialog
import org.robolectric.shadows.ShadowLooper
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [29], application = Application::class)
class BrowserEntryProfileTest {
    @Test fun mediaBindsOnlyToAnAddressOwnedByThisHost() {
        val alias = java.net.InetAddress.getByName("7.7.7.1")
        val lan = java.net.InetAddress.getByName("192.168.0.1")
        val remote = java.net.InetAddress.getByName("203.0.113.1")
        val own = { setOf(alias, lan) }
        assertEquals("7.7.7.1", BrowserEntryProfile.mediaBindAddress("https://carplay.example.invalid",
            { listOf(remote, alias) }, own))
        assertEquals("192.168.0.1", BrowserEntryProfile.mediaBindAddress("https://carplay.example.invalid",
            { listOf(lan) }, own))
        assertNull(BrowserEntryProfile.mediaBindAddress("https://remote.example.invalid", { listOf(remote) }, own))
        assertNull(BrowserEntryProfile.mediaBindAddress("https://missing.example.invalid", { throw java.net.UnknownHostException() }, own))
        assertNull(BrowserEntryProfile.mediaBindAddress(null, { error("No DNS expected") }, own))
        val loopback = java.net.InetAddress.getByName("127.0.0.1")
        assertNull(BrowserEntryProfile.mediaBindAddress("https://carplay.example.invalid", { listOf(loopback) }, { setOf(loopback) }))
    }
    @Test fun editingAnEntryOnlyPersistsAValidatedOriginAndInvalidEditsPreserveIt() {
        val context = RuntimeEnvironment.getApplication()
        val file = File(context.noBackupFilesDir, BrowserEntryProfile.FILE_NAME)
        try {
            BrowserEntryProfile.save(context, "https://carplay.example.invalid:443/")
            assertEquals("https://carplay.example.invalid", BrowserEntryProfile.load(context))
            val previous = file.readBytes()
            for (value in listOf("http://carplay.example.invalid", "https://192.168.0.1", "https://carplay.example.invalid/?code=123456")) {
                try { BrowserEntryProfile.save(context, value); fail(value) } catch (_: IllegalArgumentException) { }
                assertArrayEquals(previous, file.readBytes())
            }
            BrowserEntryProfile.save(context, null)
            assertNull(BrowserEntryProfile.load(context))
        } finally { file.delete() }
    }
    @Test fun localGatewayOriginSupportsStandardAndCustomTlsPorts() {
        assertEquals("https://carplay.example.invalid", BrowserEntryProfile.parse("""{"version":1,"url":"https://carplay.example.invalid:443/"}"""))
        assertEquals("https://carplay.example.invalid:8443", BrowserEntryProfile.parse("""{"version":1,"url":"https://carplay.example.invalid:8443"}"""))
    }

    @Test fun malformedOrCredentialBearingEntriesDoNotReplaceDirectAccess() {
        for (url in listOf("http://carplay.example.invalid", "https://user:secret@carplay.example.invalid",
            "https://carplay.example.invalid/path", "https://carplay.example.invalid/?token=secret",
            "https://carplay.example.invalid/#code=123456", "https://carplay.example.invalid:0",
            "https://carplay.example.invalid:65536", "https://127.0.0.1", "https://*.example.invalid")) {
            assertNull(url, BrowserEntryProfile.parse("""{"version":1,"url":"$url"}"""))
        }
        assertNull(BrowserEntryProfile.parse("not JSON"))
        assertNull(BrowserEntryProfile.parse("""{"version":2,"url":"https://carplay.example.invalid"}"""))
        assertEquals(listOf("http://192.0.2.10:8081"), BrowserEntryProfile.links(null,listOf("http://192.0.2.10:8081")))
    }

    @Test fun phoneCopiesTheConfiguredHttpsEntryBeforeFallbackAddresses() {
        val links=BrowserEntryProfile.links("https://carplay.example.invalid",listOf("http://192.0.2.10:8081"))
        assertEquals("https://carplay.example.invalid/#code=123456", "${links.first()}/#code=123456")
        assertEquals("http://192.0.2.10:8081",links.last())
    }

    @Test fun metadataIsReadFromTheAppPrivateNoBackupDirectoryAndCanBeRemoved() {
        val context=RuntimeEnvironment.getApplication()
        val file=File(context.noBackupFilesDir,BrowserEntryProfile.FILE_NAME)
        try {
            file.writeText("""{"version":1,"url":"https://carplay.example.invalid"}""")
            assertEquals("https://carplay.example.invalid",BrowserEntryProfile.load(context))
            file.writeText("x".repeat(2049))
            assertNull(BrowserEntryProfile.load(context))
        } finally { file.delete() }
        assertNull(BrowserEntryProfile.load(context))
    }

    @Test fun actualPhoneConnectionDialogCopiesHttpsWithAnOwnerOpenedPairingCode() {
        val activityController=Robolectric.buildActivity(Activity::class.java).setup()
        val activity=activityController.get()
        val file=File(activity.noBackupFilesDir,BrowserEntryProfile.FILE_NAME)
        try {
            file.writeText("""{"version":1,"url":"https://carplay.example.invalid"}""")
            val output=TeslaBrowserOutput(activity)
            // Model the already-running HTTP backend; this UI test does not open sockets.
            TeslaBrowserOutput::class.java.getDeclaredField("serverPort").apply { isAccessible=true }.set(output,8081)
            assertEquals("https://carplay.example.invalid",output.connectionSummary())
            output.showConnectionSettings(activity) {}
            val dialog=ShadowAlertDialog.getLatestAlertDialog()
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).performClick()
            ShadowLooper.shadowMainLooper().idle()
            val clipboard=activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val copied=clipboard.primaryClip!!.getItemAt(0).text.toString()
            assertTrue(copied, Regex("https://carplay[.]example[.]invalid/#code=[0-9]{6}").matches(copied))
            dialog.dismiss()
        } finally {
            file.delete()
            activityController.pause().stop().destroy()
        }
    }
}
