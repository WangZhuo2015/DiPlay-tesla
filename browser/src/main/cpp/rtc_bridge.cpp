// GPL-3.0-only. JNI lifecycle/signaling adapted from tepla 0.2.1 rtc_bridge.cpp.
// Uses upstream libdatachannel's H.264 packetizer; no codec or SRTP source patches.
#include <jni.h>
#include <rtc/rtc.h>
#include <android/log.h>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <vector>

namespace {
struct Peer {
    JavaVM* vm = nullptr;
    jobject owner = nullptr;
    jmethodID event = nullptr;
    int pc = -1, track = -1;
    void emit(const char* kind, const char* value = "") {
        JNIEnv* env = nullptr;
        bool attached = vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) == JNI_EDETACHED;
        if (attached && vm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        auto k = env->NewStringUTF(kind), v = env->NewStringUTF(value);
        env->CallVoidMethod(owner, event, k, v);
        if (env->ExceptionCheck()) env->ExceptionClear();
        env->DeleteLocalRef(k); env->DeleteLocalRef(v);
        if (attached) vm->DetachCurrentThread();
    }
    void dispose(JNIEnv* env) {
        // Deletion waits for callbacks before releasing their Java owner.
        if (track >= 0) { rtcDeleteTrack(track); track = -1; }
        if (pc >= 0) { rtcClosePeerConnection(pc); rtcDeletePeerConnection(pc); pc = -1; }
        if (owner) { env->DeleteGlobalRef(owner); owner = nullptr; }
    }
};
void check(int result) { if (result < 0) throw std::runtime_error("WebRTC operation failed: " + std::to_string(result)); }
void fail(JNIEnv* env, const std::exception& error) {
    env->ThrowNew(env->FindClass("java/lang/IllegalStateException"), error.what());
}
Peer* peer(jlong handle) { return reinterpret_cast<Peer*>(handle); }
}
extern "C" JNIEXPORT jlong JNICALL
Java_com_diplay_browser_rtc_RtcNative_create(JNIEnv* env, jobject owner, jstring profile, jint port) {
    auto p = std::make_unique<Peer>();
    try {
        static std::once_flag logging;
        std::call_once(logging, [] { rtcInitLogger(RTC_LOG_WARNING, [](rtcLogLevel, const char* message) {
            __android_log_write(ANDROID_LOG_WARN, "DiPlayRtc", message);
        }); });
        env->GetJavaVM(&p->vm);
        p->owner = env->NewGlobalRef(owner);
        auto cls = env->GetObjectClass(owner);
        p->event = env->GetMethodID(cls, "onEvent", "(Ljava/lang/String;Ljava/lang/String;)V");
        env->DeleteLocalRef(cls);
        rtcConfiguration config{};
        config.disableAutoNegotiation = true;
        config.forceMediaTransport = true;
        config.mtu = 1200;
        if (port != 0) {
            if (port < 1024 || port > 65535) throw std::invalid_argument("Invalid test port");
            config.portRangeBegin = port; config.portRangeEnd = port;
        }
        p->pc = rtcCreatePeerConnection(&config); check(p->pc);
        rtcSetUserPointer(p->pc, p.get());
        check(rtcSetGatheringStateChangeCallback(p->pc, [](int id, rtcGatheringState state, void* ptr) {
            if (state != RTC_GATHERING_COMPLETE) return;
            int size = rtcGetLocalDescription(id, nullptr, 0);
            if (size <= 0 || size > 32768) { static_cast<Peer*>(ptr)->emit("failed"); return; }
            std::vector<char> sdp(size);
            if (rtcGetLocalDescription(id, sdp.data(), size) > 0) static_cast<Peer*>(ptr)->emit("offer", sdp.data());
        }));
        check(rtcSetStateChangeCallback(p->pc, [](int, rtcState state, void* ptr) {
            if (state == RTC_CONNECTED) static_cast<Peer*>(ptr)->emit("connected");
            // A temporary ICE disconnection may recover on this peer. Kotlin owns its deadline.
            if (state == RTC_DISCONNECTED) static_cast<Peer*>(ptr)->emit("disconnected");
            if (state == RTC_FAILED || state == RTC_CLOSED) static_cast<Peer*>(ptr)->emit("failed");
        }));
        const char* format = env->GetStringUTFChars(profile, nullptr);
        rtcTrackInit track{};
        track.direction = RTC_DIRECTION_SENDONLY; track.codec = RTC_CODEC_H264;
        track.payloadType = 96; track.ssrc = 42;
        track.mid = "video"; track.name = "diplay"; track.msid = "diplay";
        track.trackId = "screen"; track.profile = format;
        p->track = rtcAddTrackEx(p->pc, &track);
        env->ReleaseStringUTFChars(profile, format); check(p->track);
        rtcSetUserPointer(p->track, p.get());
        rtcPacketizerInit packetizer{};
        packetizer.ssrc = 42; packetizer.cname = "diplay"; packetizer.payloadType = 96;
        packetizer.clockRate = 90000; packetizer.nalSeparator = RTC_NAL_SEPARATOR_START_SEQUENCE;
        packetizer.maxFragmentSize = 1100;
        check(rtcSetH264Packetizer(p->track, &packetizer));
        check(rtcChainRtcpSrReporter(p->track));
        check(rtcChainRtcpNackResponder(p->track, 512));
        check(rtcChainPliHandler(p->track, [](int, void* ptr) { static_cast<Peer*>(ptr)->emit("keyframe"); }));
        return reinterpret_cast<jlong>(p.release());
    } catch (const std::exception& error) { p->dispose(env); fail(env, error); return 0; }
}
extern "C" JNIEXPORT void JNICALL
Java_com_diplay_browser_rtc_RtcNative_begin(JNIEnv* env, jobject, jlong handle) {
    try { check(rtcSetLocalDescription(peer(handle)->pc, "offer")); } catch (const std::exception& error) { fail(env, error); }
}
extern "C" JNIEXPORT void JNICALL
Java_com_diplay_browser_rtc_RtcNative_answer(JNIEnv* env, jobject, jlong handle, jstring sdp) {
    const char* text = env->GetStringUTFChars(sdp, nullptr);
    int result = rtcSetRemoteDescription(peer(handle)->pc, text, "answer");
    env->ReleaseStringUTFChars(sdp, text);
    try { check(result); } catch (const std::exception& error) { fail(env, error); }
}
extern "C" JNIEXPORT jboolean JNICALL
Java_com_diplay_browser_rtc_RtcNative_send(JNIEnv* env, jobject, jlong handle, jbyteArray frame, jlong timestamp) {
    auto p = peer(handle);
    if (!rtcIsOpen(p->track)) return false;
    auto data = env->GetByteArrayElements(frame, nullptr);
    if (!data) return false;
    int result = rtcSetTrackRtpTimestamp(p->track, static_cast<uint32_t>(timestamp));
    if (result >= 0) result = rtcSendMessage(p->track, reinterpret_cast<char*>(data), env->GetArrayLength(frame));
    env->ReleaseByteArrayElements(frame, data, JNI_ABORT);
    return result >= 0;
}
extern "C" JNIEXPORT void JNICALL
Java_com_diplay_browser_rtc_RtcNative_destroy(JNIEnv* env, jobject, jlong handle) {
    std::unique_ptr<Peer> p(peer(handle));
    if (p) p->dispose(env);
}
