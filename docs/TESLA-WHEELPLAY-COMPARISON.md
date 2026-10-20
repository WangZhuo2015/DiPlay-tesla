# WheelPlay 对比与 Tesla 浏览器增强（未发布源码）

本文记录主线同步之后的第二部分源代码变更。**这些新增能力尚未包含在已发布的 Tesla 0.1.10 APK 中**；0.1.10 的下载、实车反馈和照片仍按其原版本解释。源代码变更的验证状态见本文末尾，不能用旧版本实车结果证明此次 60 fps、恢复策略或 Canvas 的效果。

## 比较基线与归属

DiPlay Tesla 的比较基线是第一部分主线同步后的源码：将 Tesla
[`main@a8aa630c7938`](https://github.com/WangZhuo2015/DiPlay-tesla/commit/a8aa630c79387675aba209e825fd0fd3e0e3c6cf)
与 DiPlay [`0.2.21@6d3b8a8ce927`](https://github.com/shihabal3amri/DiPlay/commit/6d3b8a8ce927cb4b115b8c3881f17619433e93b1) 合并。
WheelPlay 使用固定源码快照
[`fython/wheelplay@4ed3536822998babd086e4fcb1a384e791b0e2d4`](https://github.com/fython/wheelplay/tree/4ed3536822998babd086e4fcb1a384e791b0e2d4)，不随其后续主线变化而改变本次比较。
其 [README](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/README.md) 和
[恢复说明](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/docs/WEBRTC_RECOVERY.md)
描述了该快照的功能与边界。

WheelPlay 基于 DiPlay / xcertplay 并保留 GPL-3.0 及各组件原有许可证。
本次选择性改编其压缩帧队列与恢复策略，并参考其 Canvas 显示方式和分段诊断设计，适配本仓库独立的 `browser` 模块。
来源和改编范围同时记录在 [第三方归属](THIRD_PARTY_NOTICES.md#wheelplay-browser-policy-references)
及随 APK 提供的 [rtc-licenses.txt](../browser/src/main/assets/tesla/rtc-licenses.txt)。

## 主线同步后已经具备的能力

以下能力在比较基线中已经存在，不计为此次从 WheelPlay 新增的功能。

| 能力 | DiPlay Tesla 基线 |
| --- | --- |
| Android 承载 USB／无线 CarPlay，浏览器显示和触摸控制 | 已由 `shared`／`common`／`tesla`／`browser` 分工实现；[模块边界](TESLA.md#what-runs-where)保持一致。 |
| H.264 WebRTC 直通、JPEG 回退 | 已转发 iPhone 编码帧；WebRTC 显示成功后暂停 JPEG 解码，回退后恢复。[BrowserVideoOutput](../browser/src/main/java/com/diplay/browser/rtc/BrowserVideoOutput.kt)负责视频路线。 |
| 浏览器音乐与导航音频 | 已有 PCM 传输、80／200／400 ms 浏览器音频缓冲和播放不可用时回到 Android 的机制。通话、Siri 语音及麦克风仍由 Android 处理，见 [音频与连接说明](TESLA.md#build-and-connect)。 |
| 显示配置 | 已有右侧／全屏独立尺寸、适配窗口／720p／1080p／1440p 预设、缩放、保持宽高比和触摸映射；保存后下一次 CarPlay 连接生效，见 [显示预设](TESLA-DISPLAY-PRESETS.md)。 |
| 配对和输入所有权 | 已有六位码配对、当前浏览器 origin 保存会话凭据、单一媒体所有者和触摸租约；不是 WheelPlay 的独立浏览器设备管理功能。[配对](../browser/src/main/java/com/diplay/browser/BrowserPairing.kt)和[媒体所有权](../browser/src/main/java/com/diplay/browser/BrowserMediaHub.kt)分别实现。 |
| 状态与诊断 | 已有解码帧率、音频缓冲、Android 内存和命名热传感器采样；静态画面不会仅因帧率低就被判定为故障，见 [浏览器诊断](TESLA.md#browser-screen-and-diagnostics)。 |
| 本地网络与可选 HTTPS 入口 | 已能直接访问 Android HTTP 服务，也有独立 [proxy](../proxy/README.md) 和 [Android root 网关](../proxy/android-root/README.md)。HTTPS 入口、热点联网和 WebRTC UDP 可达性分别配置和验证。 |

## 此次引入的功能与性能策略

### 1. 更短且可观察的压缩帧队列

[RtcFrameQueue](../browser/src/main/java/com/diplay/browser/rtc/RtcFrameQueue.kt) 将应用层压缩帧排队预算从 **150 ms 缩短到 50 ms**，同时保留 **最多 6 帧、2 MiB** 的容量约束；关键帧附加的 SPS／PPS 字节计入容量。超时或溢出使预测参考链失效，后续依赖帧被丢弃，等待新的关键帧恢复。发送失败也会使排队参考链失效，避免继续发送无法正确解码的后续帧。

较短预算可以减少本队列累积旧画面的机会，也会让繁忙 Android 主机更早丢帧。**150 ms 改为 50 ms 不代表已测得端到端延迟降低 100 ms**。iPhone 编码、网络、原生传输队列、浏览器解码与显示都有各自耗时；本限制也不保证每帧在 50 ms 内送达屏幕。此次继续使用有所有权的帧副本，没有引入 WheelPlay 的原生共享视频缓冲实现。

来源为 WheelPlay 的
[RtcFrameQueue.kt](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/common/src/main/java/com/shilapi/xcertplay/web/RtcFrameQueue.kt)。

### 2. 双端一致的 4／10／30 秒恢复等待

浏览器显示设置新增 **4 秒、10 秒（默认）、30 秒** 三档恢复等待。保存时重建浏览器媒体连接，浏览器和 Android 通过 `recoveryGraceMs` 使用同一策略；不需要重新连接 iPhone。

| 情况 | 新源码行为 |
| --- | --- |
| 已显示视频，RTC 暂时进入 `disconnected` | 保留最后画面和 RTC peer，在所选恢复时间内等待；重新连接后请求关键帧。 |
| 连续本地发送失败、参考链无法恢复、持续发帧但接收端没有解码进展 | 尝试关键帧恢复，持续超时后回退 JPEG。新关键帧仅入队不代表传输恢复。 |
| 静态画面长时间没有新帧 | 在接收端反馈仍正常时保持 WebRTC；再次有源画面时重新计算解码停顿。 |
| 首帧一直未显示，且没有其他连接或发送故障先触发回退 | 首帧看门狗在 4 秒和 10 秒策略下等待 10 秒；30 秒策略下等待 30 秒。其他故障仍按各自期限处理。 |
| 不支持的编码、SDP 拒绝、RTC `failed` 等终止错误 | 立即回退，较长恢复时间不会使已经终止的连接重新可用。 |

恢复时间是**等待新画面恢复的期限，不是视频缓冲长度**。它与固定 50 ms 压缩帧队列和 80／200／400 ms 音频播放缓冲互相独立。健康检查按周期运行，实际回退时刻会受采样与调度影响。

原有 WebSocket 控制连接心跳、自动重连和音频背压规则继续独立工作。因此选择 30 秒并不保证整个 Wi-Fi／控制连接断开 30 秒后仍保持原会话：控制消息约 5 秒无活动，或音频确认积压约 500 ms，仍可提前结束媒体连接。此次没有增加 ICE restart、TURN 或自适应码率。一次 RTC 尝试回退到 JPEG 后，重新连接浏览器媒体或改变视频配置才能重新尝试 RTC。

实现见 [RtcRecoveryPolicy](../browser/src/main/java/com/diplay/browser/rtc/RtcRecoveryPolicy.kt)、
[RtcHealth](../browser/src/main/java/com/diplay/browser/rtc/RtcHealth.kt)、
[BrowserVideoOutput](../browser/src/main/java/com/diplay/browser/rtc/BrowserVideoOutput.kt)、
[浏览器媒体控制](../browser/src/main/assets/tesla/media.js) 和
[WebSocket 边界](../browser/src/main/java/com/diplay/browser/BrowserMediaSocket.kt)。
参考 WheelPlay 的
[RtcVideoStream](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/common/src/main/java/com/shilapi/xcertplay/web/RtcVideoStream.kt) 与
[RtcReceiverHealth](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/common/src/main/java/com/shilapi/xcertplay/web/RtcReceiverHealth.kt)。

### 3. WebRTC 可协商到 60 fps，JPEG 独立限制到 30 fps

Android 和浏览器的帧率设置范围由 5–30 扩为 **5–60**，默认仍为 **20 fps**。设置传入下一次 CarPlay 连接的显示协商；运行中的会话保留当前配置，仍通过明确的“应用并重新连接”操作立即使用新设置。

`fps = 60` 表示向 iPhone 请求的帧率，不保证实际解码或屏幕呈现达到 60 fps。动态内容、iPhone 输出、网络、Android 调度和 Tesla 浏览器能力都需要分别验证；静态画面帧率较低是正常现象。

JPEG 使用 `jpegFps = min(fps, 30)`。该限制同时用于 Android JPEG 压缩和浏览器取帧节奏；60 fps WebRTC 会话回退时，JPEG 转换仍最多 30 fps。Android 解码器仍须处理 H.264 预测链，因此不能据此宣称回退后的总 CPU 用量减半。

实现见 [BrowserDisplay](../browser/src/main/java/com/diplay/browser/BrowserDisplay.kt)、
[Tesla 显示协商](../tesla/src/main/java/com/diplay/tesla/TeslaBrowserOutput.kt)、
[JpegVideoSink](../browser/src/main/java/com/diplay/browser/JpegVideoSink.kt) 和
[浏览器取帧](../browser/src/main/assets/tesla/app.js)。

### 4. Canvas 显示（实验性，默认关闭）

显示设置新增原生视频／Canvas 选择，**默认使用原生视频**。Canvas 模式继续让一个移出可见区域的 `<video>` 解码，再用 `drawImage()` 绘制到可见 Canvas；优先使用视频帧回调，旧浏览器或回调停顿时使用动画帧调度。Canvas 尺寸仅在实际视频尺寸改变时调整，触摸按可见画面的宽高比映射。

选择保存在当前浏览器 origin，保存后立即应用，无需重新连接 CarPlay。绘制失败时本实现恢复原生视频，并给出提示。该行为保留现有 RTC 连接；WheelPlay 参考实现的 Canvas 错误处理则直接回退 JPEG。

Canvas 可能增加 CPU／GPU 绘制开销，不能保证解决车机系统覆盖层、解码停止或页面限制问题。诊断中的解码帧率也不是 Canvas 实际绘制帧率。实现与针对帧回调、切换及失败路径的测试分别见
[rtc-renderer.js](../browser/src/main/assets/tesla/rtc-renderer.js) 和
[rtc-renderer.test.mjs](../browser/test/rtc-renderer.test.mjs)，设计参考 WheelPlay 的
[网页渲染代码](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/common/src/main/assets/web/app.js)。

### 5. 队列与恢复诊断

菜单新增压缩视频队列帧数／字节数、50 ms 排队预算、过期帧、溢出帧、等待关键帧跳过数、本地发送失败数、恢复状态和回退原因。`rtc-progress` 消息另提供 Android 收到源帧数、本地传输接受帧数及参考链失效计数；这些原始计数没有各自的菜单行。本地传输接受帧与浏览器解码进展分别统计，不把一次本地发送成功当作对端已收到或已显示。

WheelPlay 还提供分段耗时均值／P95、接收／呈现速率、丢包、NACK 和 RTT 等更完整指标。本次引入上述队列和恢复计数，未复制其完整性能采样器，也没有宣称测得端到端时延。指标定义可对照固定快照的
[VideoPerformance](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/common/src/main/java/com/shilapi/xcertplay/web/VideoPerformance.kt)。

## 其余差异与后续评估

WheelPlay 的以下能力在固定快照中存在，本次变更集中在可适配现有浏览器输出的视频路径；下列项目需要各自的实现范围与验证，不标记为已移植。

| WheelPlay 能力 | DiPlay Tesla 此次处理及后续要求 |
| --- | --- |
| HEVC／H.265 WebRTC 直通 | Tesla 输出仍明确协商 H.264。引入 HEVC 需要编码协商、浏览器能力探测和不同 Tesla 固件的解码验证。 |
| 浏览器麦克风、Android／浏览器／禁用麦克风路线 | 网页仍不采集麦克风。需要可信 HTTPS、浏览器许可、音频回传、路由与通话／Siri 实机验证，详见 WheelPlay [浏览器音频说明](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/docs/BROWSER_AUDIO.md)。 |
| QR 配对、记忆设备列表、命名与逐台撤销 | 保留现有配对和单媒体所有者。独立设备凭据、迁移与撤销需要一起设计；现有 origin 记忆不能替代逐设备撤销。 |
| App 内 HTTPS 监听与证书导入、mDNS | 继续使用现有 HTTP 服务及独立可选网关；没有把证书生命周期或发现服务并入媒体模块。 |
| 无 root VPN 地址别名、集成 root 热点路由 | 未移入。WheelPlay 自身也注明设备和 Android API 边界，需分别验证 USB／无线 CarPlay、热点默认路由与 RTC UDP；参考其 [Tesla 兼容说明](https://github.com/fython/wheelplay/blob/4ed3536822998babd086e4fcb1a384e791b0e2d4/docs/TESLA_HTTP.md)。 |
| 浏览器离线 1／5 分钟后断开 iPhone、浏览器启动选项页 | 未改变现有连接流程。新增前需确认浏览器暂时隐藏、自动重连与用户主动断开的行为。 |
| 主显示四边安全区、OEM 名称／图标、位置来源偏好 | 未随视频迁移改写 Tesla 的显示和会话配置。上游车辆设置中名称相近的选项不能直接当作浏览器主显示已支持；应按配置协商和实际车机显示分别评估。 |
| 原生视频缓冲、媒体发送反馈、RTP／SRTP 相关补丁 | 未移入 WheelPlay 的底层补丁。当前仍使用本仓库固定官方依赖与既有传输接口，避免把不同内核／依赖版本的补丁效果当作已获得。 |
| 运行时认证资源导入 | 未引入资源导入功能或任何第三方认证资产。此次普通源码构建沿用外部授权资产的既有构建边界。 |

## 验证状态与实际效果

| 范围 | 当前记录 |
| --- | --- |
| 第一部分主线同步（上述基线合并后） | 完整 CI 命令及额外 browser／tesla 门禁通过：3,145 个 Android 单元测试、5 个模块 lint、mobile／home／maphost／tesla debug 构建；Node 29 个测试通过。普通 APK 未含 `offline-mfi` 认证资产。此结果仅属于该同步基线。 |
| 本文第二部分 WheelPlay 启发的增强 | 功能提交 `3dd89e5796b42e4206c2b0947b5eb71b36118ca1` 的完整 Android 门禁通过：3,162 个单元测试零失败／错误／跳过，5 个模块 lint、4 个 debug APK 构建通过；Node 68 个测试和公开源码检查通过。普通 APK 未含 `offline-mfi` 认证资产。生产网页在英文全尺寸、中文紧凑及阿拉伯文窄屏、130% 字体下通过交互和布局验证；详情见 [Tesla 验证记录](testing/tesla/README.md)。后续提交仅更新验证文档。 |
| Tesla／iPhone 真机效果 | 本轮未新增实机验证。0.1.10 既有 Model Y Juniper／V50 音频和触摸反馈不覆盖这些新策略。 |

源码门禁使用 [AGENTS.md](../AGENTS.md) 的完整 CI 命令，再加 `:browser:testDebugUnitTest`、`:browser:lintDebug`、`:tesla:testDebugUnitTest`、`:tesla:lintDebug`、`:tesla:assembleDebug`，以及 `node --test proxy/test/*.test.mjs browser/test/*.test.mjs`。新增回归覆盖恢复期限、静帧后恢复、旧连接回调隔离、队列过期／溢出、60 fps 配置与 JPEG 限速、Canvas 切换，以及空 WebSocket close 帧释放媒体所有权。

实际效果需要在目标 Tesla 固件和 Android 主机上比较 30／60 fps、原生视频／Canvas，记录动态画面帧率、队列丢弃、温度、音频和触摸表现。恢复验证应包含短于／长于所选期限的 UDP 中断、静态画面停留一分钟后继续操作，以及整个控制连接断开后的重新连接。测试使用同一分辨率与网络条件；端到端延迟和长时间负载需单独测量。
