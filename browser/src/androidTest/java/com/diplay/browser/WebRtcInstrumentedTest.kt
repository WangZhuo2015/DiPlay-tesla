package com.diplay.browser

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.diplay.browser.rtc.BrowserVideoOutput
import com.diplay.browser.rtc.RtcNative
import com.shilapi.xcertplay.airplay.AirPlayContact
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.net.ServerSocket
import java.nio.ByteBuffer
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Synthetic, real H.264 encoder -> DTLS/SRTP -> Android WebView decoder. No iPhone identity. */
@RunWith(AndroidJUnit4::class)
class WebRtcInstrumentedTest {
    @Test fun browserDecodesVideoOrUsesJpegWhenH264IsUnavailable() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val context=instrumentation.targetContext
        val frames=LatestFrame();val media=BrowserMediaHub()
        val display=BrowserDisplay(right=BrowserResolution(320,240),fps=10)
        val external=InstrumentationRegistry.getArguments().getString("externalBrowser")=="true"
        val jpeg=JpegVideoSink(display,frames){}
        val output=BrowserVideoOutput(jpeg,jpeg::close){callback->
            RtcNative({kind,value->
                android.util.Log.i("MediaTestRtc","event=$kind"+if(kind=="offer")value.lineSequence().filter{it.startsWith("a=setup:")}.joinToString() else "")
                callback(kind,if(external && kind=="offer") value.replace("10.0.2.15","127.0.0.1").replace("10.0.2.16","127.0.0.1") else value)
            },if(external)40000 else 0)
        }
        media.video(output)
        val finished=java.util.concurrent.atomic.AtomicBoolean()
        val target=object:BrowserTarget {
            override fun status()=JSONObject().put("connected",true).put("stage","Synthetic H.264 · ${media.transport} · rx=${output.receivedFrames} sent=${output.sentFrames} failed=${output.sendFailures}").put("display",BrowserDisplayJson.encode(display)).put("activeDisplay",BrowserDisplayJson.encode(display))
            override fun touch(contacts:List<AirPlayContact>)=true
            override fun action(name:String):Boolean {if(name=="home")finished.set(true);return true}
            override fun saveDisplay(display:BrowserDisplay){}
        }
        val port=if(external)8098 else ServerSocket(0).use{it.localPort};val token="1234567890abcdef1234567890abcdef"
        val server=BrowserServer(port,context.assets,token,frames,target,media)
        val encoder=MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        val encoderStarted=java.util.concurrent.atomic.AtomicBoolean()
        output.setVideoRecoveryHandler(110){if(encoderStarted.get())runCatching{
            encoder.setParameters(android.os.Bundle().apply{putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME,0)})
        }}
        var web:WebView?=null
        try {
            server.start(5000,true)
            if(!external) instrumentation.runOnMainSync {
                web=WebView(context).apply {
                    settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.mediaPlaybackRequiresUserGesture=false
                    webViewClient=WebViewClient()
                    webChromeClient=object:android.webkit.WebChromeClient(){
                        override fun onConsoleMessage(message:android.webkit.ConsoleMessage):Boolean {
                            android.util.Log.i("MediaTestWeb",message.message());return true
                        }
                    }
                    loadUrl("http://127.0.0.1:$port/#token=$token")
                }
            }
            encoder.configure(MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC,320,240).apply{
                setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
                setInteger(MediaFormat.KEY_BIT_RATE,250_000);setInteger(MediaFormat.KEY_FRAME_RATE,10);setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,1)
            },null,null,MediaCodec.CONFIGURE_FLAG_ENCODE)
            encoder.start();encoderStarted.set(true);val info=MediaCodec.BufferInfo();var count=0
            val deadline=System.nanoTime()+(if(external)120_000_000_000L else 5_000_000_000L)
            while((if(external)!finished.get() else true) && System.nanoTime()<deadline) {
                val input=encoder.dequeueInputBuffer(10000)
                if(input>=0) {
                    val image=encoder.getInputImage(input)!!
                    image.planes.forEachIndexed{index,plane->
                        val width=if(index==0)320 else 160;val height=if(index==0)240 else 120
                        val value=when(index){0->76;1->85;else->255}.toByte();val base=plane.buffer.position()
                        repeat(height){row->repeat(width){column->plane.buffer.put(base+row*plane.rowStride+column*plane.pixelStride,value)}}
                    }
                    image.close();encoder.queueInputBuffer(input,0,320*240*3/2,count++*100_000L,0)
                }
                when(val index=encoder.dequeueOutputBuffer(info,10000)) {
                    MediaCodec.INFO_OUTPUT_FORMAT_CHANGED->{
                        val actual=encoder.outputFormat;val sps=raw(bytes(actual.getByteBuffer("csd-0")!!));val pps=raw(bytes(actual.getByteBuffer("csd-1")!!))
                        output.onVideoConfig(110,byteArrayOf(1,sps[1],sps[2],sps[3],-1,-31,(sps.size shr 8).toByte(),sps.size.toByte())+sps+byteArrayOf(1,(pps.size shr 8).toByte(),pps.size.toByte())+pps)
                    }
                    else->if(index>=0){
                        try{if(info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG==0 && info.size>0){
                            val buffer=encoder.getOutputBuffer(index)!!.duplicate();buffer.position(info.offset);buffer.limit(info.offset+info.size)
                            val frame=bytes(buffer)
                            if(count<5)android.util.Log.i("MediaTestRtc","frame prefix=${frame.take(5).joinToString{(it.toInt() and 255).toString(16)}} flags=${info.flags}")
                            output.onVideoFrame(110,frame,info.presentationTimeUs*1000,System.nanoTime())
                        }}finally{encoder.releaseOutputBuffer(index,false)}
                    }
                }
                Thread.sleep(100)
            }
            if(external) {
                assertTrue("Desktop browser did not finish the test",finished.get())
                assertEquals("webrtc",media.transport);assertTrue(output.sentFrames>=5)
                return
            }
            val latch=CountDownLatch(1);var snapshot=""
            instrumentation.runOnMainSync{web!!.evaluateJavascript("(()=>{const v=document.getElementById('video');const c=document.createElement('canvas');const p=v.hidden?document.getElementById('picture'):v;c.width=320;c.height=240;const x=c.getContext('2d');x.drawImage(p,0,0);const a=x.getImageData(160,120,1,1).data;return [p.width||p.videoWidth,p.height||p.videoHeight,a[0],a[1]];})()"){snapshot=it;latch.countDown()}}
            assertTrue(latch.await(3,TimeUnit.SECONDS))
            val decoded=org.json.JSONArray(snapshot)
            assertEquals(320,decoded.getInt(0));assertEquals(240,decoded.getInt(1));assertTrue(decoded.getInt(2)>decoded.getInt(3)+80)
            instrumentation.runOnMainSync{web!!.loadUrl("about:blank")}
            val fallbackDeadline=System.nanoTime()+6_000_000_000L
            while(media.transport!="jpeg" && System.nanoTime()<fallbackDeadline)Thread.sleep(50)
            assertEquals("jpeg",media.transport)
            assertEquals(BrowserResolution(320,240),display.right);assertEquals(BrowserResolution(1920,1080),display.full)
        } finally {
            encoderStarted.set(false);instrumentation.runOnMainSync{web?.destroy()};server.close();output.close();encoder.release()
        }
    }
    private fun bytes(buffer:ByteBuffer)=ByteArray(buffer.remaining()).also{buffer.duplicate().get(it)}
    private fun raw(bytes:ByteArray)=when{
        bytes.take(4)==listOf<Byte>(0,0,0,1)->bytes.copyOfRange(4,bytes.size)
        bytes.take(3)==listOf<Byte>(0,0,1)->bytes.copyOfRange(3,bytes.size)
        else->bytes
    }
}
