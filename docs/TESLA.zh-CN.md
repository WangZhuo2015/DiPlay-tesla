# DiPlay Tesla 接入说明

DiPlay Tesla 安装在 Android 7.1 以上的主机上。iPhone 通过 USB 或无线 CarPlay 连接这台主机，Tesla 在同一局域网用浏览器显示画面并发送触控。

## 模块划分

- `shared`：原有 CarPlay 协议与媒体核心。
- `common`：连接、声音、麦克风、诊断和设置，通过 `CarPlayOutputExtension` 接入输出。
- `browser`：H.264 WebRTC、JPEG 回退、可选 PCM 音频、HTTP/WebSocket 服务、配对和触控，只依赖 `shared`。
- `tesla`：独立 APK，负责组合核心和浏览器输出。
- `proxy/`：可选的 Node.js 进程，提供固定上游网关和显式配置的网络代理。核心与浏览器模块均不依赖它。

原版 `mobile`、`home` 和 `maphost` 没有注册浏览器输出，继续使用原有行为。

## 构建与连接

按 [构建说明](BUILD.md) 安装 JDK 25 和 Android SDK，然后运行：

```powershell
$env:ANDROID_HOME = 'G:\Android' # 改为你的 SDK 路径
.\gradlew.bat :tesla:assembleDebug
```

另需 SDK 中的 CMake 3.22.1 和 NDK 28.2.13676358。首次构建下载固定提交及 SHA-256 校验的 libdatachannel、MbedTLS 等开源依赖；三个 ABI 分别编译，不采用参考项目中的本机路径或修改过的 SRTP 源码。固定版本见 `browser/src/main/cpp/NativeDependencies.cmake`。

输出为 `tesla/build/outputs/apk/debug/tesla-debug.apk`，包名为 `com.diplay.tesla.debug`，可与原版共存。

普通源码构建没有 CarPlay 认证身份。连接 iPhone 需要按 BUILD.md 提供已有的外部认证资产，并运行 `:tesla:assembleStandaloneDebug`。此端口不会将认证身份写入仓库。

### Release APK 与认证

[最新公开版为 Tesla 0.1.1](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.1)。0.1.2 Release 仍为草稿，含认证资产的签名 APK 仅保存在本地。APK 安装在 Android 主机上，包名为 `com.diplay.tesla`；它与 `.debug` 测试包分别安装。后续更新须保留相同签名密钥。

**0.1.2 本地独立连接 APK 已使用此前配置的实验性 MFi 资产打包。** 资产沿用“检查 ADB 连接”任务为本项目准备的同一份身份；已核对 APK 内文件与输入一致。认证资产没有进入 Git，普通源码构建仍需自行配置 `DIPLAY_AUTH_ASSETS_DIR`。实际 iPhone 认证或 Tesla 实车验证仍需单独记录。

0.1.3 本地测试版在系统服务占用默认端口时依次尝试 8080–8089，连接页显示实际地址。独立 proxy 的上游也应填写实际端口；其他启动错误不会触发端口重试。
它也根据实际 Wi-Fi 网桥成员选择热点地址。[V50 本地测试](testing/tesla/README.md#013-v50-local-test--2026-10-11)已通过 iPhone 无线认证，并在电脑浏览器解码真实 H.264 / WebRTC CarPlay 画面；持续音频与 Tesla 实车表现仍待验证。

DiPlay 和 DiPlay-CN 的[公开公告](THIRD_PARTY_NOTICES.md#experimental-authentication-data)说明实验身份的固件来源。这不是 Apple 为本项目新签发的身份，Android APK 签名和 HTTPS 证书也各自独立。

自行构建签名包时，按 [BUILD.md](BUILD.md#build-a-release-apk) 设置四个 `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` 签名变量，然后运行：

```powershell
.\gradlew.bat :tesla:lintRelease :tesla:assembleRelease
```

输出为 `tesla/build/outputs/apk/release/tesla-release.apk`。如拥有可使用且允许随 APK 分发的资产，额外设置 `DIPLAY_AUTH_ASSETS_DIR` 并运行 `:tesla:assembleStandaloneRelease`；该任务在资产缺失或为空时停止。认证私钥会包含在这种 APK 内并可被接收者提取，Android 签名私钥则始终留在本地。

1. 在 Android 主机安装并打开 DiPlay Tesla。
2. 让 Tesla 连接能够访问该主机、同时提供互联网的网络。
3. 打开 **设置 → 连接 → Tesla 浏览器**，查看实际主机地址和 6 位数字配对码。
4. 在 Tesla 浏览器访问显示的地址，输入 6 位码，也可使用手机复制的连接链接。码在 5 分钟内有效，过期或输错 5 次后重新打开手机连接页获取新码。配对后浏览器保存在本机，再次打开无需重复输入。
5. 在 Android 主机启动原有的 USB／无线 CarPlay 连接，保持应用或会话服务运行。

0.1.4 起 Tesla 版只输出网页视频，停止手机本地的重复视频解码；手机保留连接状态、设置、音频和麦克风处理。网页菜单在顶部横向展开，关闭后画面占满可用区域。

Android 的 Wi-Fi 已用于向 Tesla 提供热点时，优先使用 USB CarPlay。无线 CarPlay 与 Tesla 热点同时工作需要主机支持相应的并发网络模式，也可以使用外部路由器及已有的“现有 Wi-Fi／同一局域网”功能。

默认声音仍由 Android 主机或已有的车辆蓝牙路线播放。0.1.2 在网页“菜单”中点击“浏览器音频（实验性）”，让音乐与导航提示通过 WebSocket PCM 在浏览器播放；首次点击允许浏览器启动音频。缓冲可选 80 / 200 / 400 ms，默认 200 ms。增加缓冲能容忍短暂抖动，也会增加延迟。

页面隐藏、音频上下文暂停、连接断开或发送积压时，浏览器音频停止接管，后续音频回到 Android。电话、Siri、语音识别与麦克风仍使用 Android 原有路线；网页不采集麦克风。声音来源本来就是 iPhone 直连车辆蓝牙时，浏览器缓冲不作用于那条路线。实际车机是否允许浏览器播放声音仍需停车验证。

## 右侧窗口与全屏

在 **设置 → 显示 → Tesla 分辨率**，或浏览器的“菜单 → 显示设置”中配置。两处编辑同一份持久化设置。

| 配置 | 初始画布 |
| --- | --- |
| 右侧窗口 | 1024 × 768 |
| 全屏窗口 | 1920 × 1080 |

这两个值是可修改的起点。Tesla 型号、固件、工具栏和窗口模式会影响实际可用区域，需要根据车辆调整。

0.1.5 的网页默认提供“适配窗口（推荐）／低负载 720p／清晰 1080p”三个预设，手动参数默认折叠。先在 Tesla 选好窗口模式，再选择对应配置和预设。预设保留当前可用窗口的比例，不把物理屏幕简单除以二；仅修改所选配置的尺寸，帧率与 JPEG 画质共用。[屏幕资料与预设说明](TESLA-DISPLAY-PRESETS.md)包含不含私人数据的公开界面截图。

宽度支持 320–2560，高度支持 240–1440，均须为偶数；帧率支持 5–30，JPEG 画质支持 40–95。选中的画布尺寸用于和 iPhone 协商，不随 Android 主机的窗口大小变化。两个配置独立保存。JPEG 画质只影响回退画面；WebRTC 使用 iPhone 的原始 H.264 码流。

修改在下次 CarPlay 连接生效。保存不会中断正在运行的会话；准备好后点击“应用并重新连接”或 Android 的“立即重新连接”。相同配置不触发重连提示。

选择配置不会替 Tesla 改变系统窗口模式，仍需使用车辆自己的窗口控制。浏览器“全屏”按钮在支持时调用 Fullscreen API。页面保持画面比例，并将触控映射到实际画布；黑边起始触控会被忽略。

画面使用整个浏览器可用区域，工具栏改为浮动菜单。虚拟按键默认隐藏；在“菜单 → 显示虚拟按键”展开，或点击“隐藏按键”收起，选择保存在该浏览器。展开按键不会缩小或改变画面的触控坐标。

在“显示设置 → 使用当前窗口尺寸”可将当前区域的宽高填写到所选配置（超出范围时等比例缩小并取偶数），另一份配置保持不变。保存仍在下次连接生效。画面保持比例，减少黑边应通过匹配画布宽高完成，不裁切 CarPlay 内容。

“菜单 → 实时诊断”显示实际解码帧率、丢帧、已排队音频时长和重新缓冲次数，以及主机可读的温度、可用内存、CPU 当前频率与策略上限。设备每 2 秒采样，超过 6 秒未更新的设备读数标记“未更新”；权限不足显示“未知”。温度保留传感器名称，不把电池温度称为 CPU 温度。策略上限低于硬件最高值不能直接判为热降频。静止画面可以显示 0 fps，不再因此强制回退 JPEG。网页支持中文、英文、阿拉伯语，也可用 `?lang=zh-CN`、`?lang=en`、`?lang=ar` 指定。

浏览器支持双指触控、主页、返回、Siri 和媒体快捷键。一次只允许一个页面持有触控；页面隐藏或关闭后释放，丢失的触控在一秒无心跳后自动释放。

## 独立 proxy

直连主机无需 proxy。需要在另一个设备转发浏览器服务时，可运行：

```powershell
$env:DIPLAY_UPSTREAM = 'http://Android主机IP:8080'
$env:DIPLAY_BIND = '0.0.0.0'
node proxy/server.mjs
```

此时 Tesla 访问代理设备的 `8090` 端口，配对码仍由 Android 主机验证。代理默认只监听本机；上例显式开放局域网。

网关转发 HTTP 和 `/api/media` WebSocket（信令与可选音频）。WebRTC 视频使用浏览器到 Android 的独立 UDP/DTLS-SRTP 通路；两者必须能直接通信。这个 proxy 不提供 TURN 或 UDP 中继。只打通网关、无法直达 Android 时，页面自动用 JPEG 回退。

可选的 HTTP／CONNECT 网络代理需单独启用和认证，详见 [proxy/README.md](../proxy/README.md)。HTTP 代理不会自动建立热点、NAT 或 DNS，也不会自动让 Tesla 接受没有互联网的 Wi-Fi；这些由主机热点或外部路由器负责。

### HTTPS 怎么打开

0.1.0 APK 的 `8080` 端口只提供 HTTP，不能把地址直接改为 `https://`。从 0.1.1 起，独立 proxy 可以使用外部 TLS 证书提供 HTTPS：

```powershell
$env:DIPLAY_UPSTREAM = 'http://Android主机IP:8080'
$env:DIPLAY_BIND = '0.0.0.0'
$env:DIPLAY_PORT = '8443'
$env:DIPLAY_TLS_CERT = 'C:\certs\fullchain.pem'
$env:DIPLAY_TLS_KEY = 'C:\certs\privkey.pem'
node proxy/server.mjs
```

在车辆上打开 **`https://你的域名:8443`**，输入 Android 主机上的配对码。域名须指向车辆能到达、且当前固件允许访问的网关地址；网关须能访问 Android 主机的 `8080`。证书须由浏览器信任的 CA 签发、覆盖此域名且在有效期内，并包含中间证书。自签证书或把域名证书用于 IP 地址不适合作为 Tesla 的正式访问入口。

证书可以用 [Let's Encrypt 的 DNS-01 验证](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge)申请；域名验证与网关是否可达是两回事。标准 `443` 端口可通过 `DIPLAY_PORT` 配置，此时 URL 不带端口；系统权限或路由器转发需自行配置。HTTPS 不会自动创建 DNS、热点或 NAT，也不会解除车辆固件的私网访问限制。目前尚未为本项目部署具体域名和车辆可用的证书。

两份 TLS 文件必须一起设置；缺失、无法读取或格式错误时启动失败，不降级到 HTTP。证书更新后需重启 proxy。HTTPS 证书保护传输，MFi 身份负责 iPhone 认证，二者互不替代。详细参数见 [proxy 说明](../proxy/README.md#https-browser-gateway-011)。

## 清晰度、卡顿与音频排查

0.1.1 默认尝试原始 H.264 → WebRTC → 浏览器解码，减少 Android 解码和 JPEG 再编码的开销。连接或解码失败时自动回退到 JPEG；“显示设置 → 视频传输”也可选择 JPEG。页脚显示当前实际路线，收到并播放视频后才显示 WebRTC。队列过期或溢出后丢弃失效的预测帧并请求关键帧，避免堆积延迟。

参考 tepla 的压缩视频传输、关键帧恢复和分流 PCM 思路，音频重新实现了可配置缓冲与回退。没有照搬其 VPN 路由方案，也没有沿用其固定 60 ms 音频调度值。桌面浏览器的合成视频测试已通过，实际 Tesla 的清晰度和稳定性仍需验证。

- 模糊时先确认窗口配置正确，避免把右侧低分辨率画面放大全屏。WebRTC 下优先调整分辨率；JPEG 下可逐步提高画质到 85–90。每次只改一项，观察带宽和延迟。
- 卡顿时先降低帧率到 15，再检查全屏尺寸与主机温度。修改仍在下次连接或明确重连后生效。提高画质并不会提高帧率。
- 浏览器音频断续时先从默认 200 ms 改到 400 ms，并观察是否自动回退到 Android。若经 Android 中转，比较“设置 → 音频 → 音乐缓冲”的 500 ms / 1000 ms；这些是不同路线的缓冲，不应一次同时调整。
- 有条件时比较 USB CarPlay 与无线连接，并比较 iPhone 直连车辆蓝牙与 Android 中转。每次只改变一段链路；其他 App 的卡顿不直接证明本端口有相同原因。

“通过车辆蓝牙播放 CarPlay 音频”是现有的实验性设置，会重连；它要求 iPhone 与车辆保持蓝牙配对并选择蓝牙音源，若声音回到手机应关闭。

## 参考 DiPlay-CN 的功能

参考 [DiPlay-CN](https://github.com/serein-morii/DiPlay-CN) 的中文默认策略：仅在设备语言不受支持且用户没有明确选择时，首次回退到简体中文。保留用户选择及受支持的语言，包括乌克兰语。

同时采用相同配置不重连、恢复已有会话的原则，并在浏览器显示核心连接阶段信息。上游已有的蓝牙重连及细粒度设置继续保留。浏览器另提供即时日夜样式和常用操作快捷键。BYD 仪表、ADB 固件控制等车辆专属功能没有为 Tesla 启用。

## 验证边界

本次检查结果与实际截图见 [验证记录](testing/tesla/README.md)。

自动检查覆盖画布协商与持久化、触控租约、YUV 转换、HTTP/WebSocket 配对与来源检查、队列关键帧恢复、PCM 路由与缓冲、更新包筛选、HTTPS/WSS 和独立 proxy。设备测试覆盖真实 H.264 编码 → WebRTC → 桌面浏览器播放，以及不支持 H.264 的旧 WebView 自动 JPEG 回退。

局域网 HTTP 不加密画面与配对码，应使用可信网络；独立 HTTPS 网关可增加传输加密。JPEG 会增加 CPU、带宽和温度负担，建议从 1024×768、20 fps 开始调整。

实际 iPhone 认证、Tesla 固件的浏览器限制、持续解码性能和蓝牙通话需要停车实测。目前不宣称已完成实车验证或行驶支持。

协议细节及检查命令见 [英文技术说明](TESLA.md)。
