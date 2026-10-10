# DiPlay Tesla 接入说明

DiPlay Tesla 安装在 Android 7.1 以上的主机上。iPhone 通过 USB 或无线 CarPlay 连接这台主机，Tesla 在同一局域网用浏览器显示画面并发送触控。

## 模块划分

- `shared`：原有 CarPlay 协议与媒体核心。
- `common`：连接、声音、麦克风、诊断和设置，通过 `CarPlayOutputExtension` 接入输出。
- `browser`：独立 H.264 解码、JPEG 输出、HTTP 服务、配对、触控和浏览器页面，只依赖 `shared`。
- `tesla`：独立 APK，负责组合核心和浏览器输出。
- `proxy/`：可选的 Node.js 进程，提供固定上游网关和显式配置的网络代理。核心与浏览器模块均不依赖它。

原版 `mobile`、`home` 和 `maphost` 没有注册浏览器输出，继续使用原有行为。

## 构建与连接

按 [构建说明](BUILD.md) 安装 JDK 25 和 Android SDK，然后运行：

```powershell
$env:ANDROID_HOME = 'G:\Android' # 改为你的 SDK 路径
.\gradlew.bat :tesla:assembleDebug
```

输出为 `tesla/build/outputs/apk/debug/tesla-debug.apk`，包名为 `com.diplay.tesla.debug`，可与原版共存。

普通源码构建没有 CarPlay 认证身份。连接 iPhone 需要按 BUILD.md 提供已有的外部认证资产，并运行 `:tesla:assembleStandaloneDebug`。此端口不会将认证身份写入仓库。

### Release APK 与认证

[Tesla 0.1.0 预览版](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.0) 提供签名 APK、独立 proxy 压缩包和 `SHA256SUMS.txt`。APK 安装在 Android 主机上，包名为 `com.diplay.tesla`；它与 `.debug` 测试包分别安装。后续更新须保留相同签名密钥。

**此预览 APK 未内置 MFi 配件身份，不能直接完成离线 CarPlay 认证。** 它用于浏览器配对、显示配置及主机部署测试；实际连接 iPhone 还需要配置可用的认证来源。Android APK 签名只验证应用来源，不能代替 MFi 认证。

DiPlay 和 DiPlay-CN 的[公开公告](THIRD_PARTY_NOTICES.md#experimental-authentication-data)均说明，实验身份来自 Carlinkit C2Air Allwinner V821 固件，并非 Apple 为项目新签发的身份。此端口不会自动提取或再分发第三方私钥。

自行构建签名包时，按 [BUILD.md](BUILD.md#build-a-release-apk) 设置四个 `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` 签名变量，然后运行：

```powershell
.\gradlew.bat :tesla:lintRelease :tesla:assembleRelease
```

输出为 `tesla/build/outputs/apk/release/tesla-release.apk`。如拥有可使用且允许随 APK 分发的资产，额外设置 `DIPLAY_AUTH_ASSETS_DIR` 并运行 `:tesla:assembleStandaloneRelease`；该任务在资产缺失或为空时停止。认证私钥会包含在这种 APK 内并可被接收者提取，Android 签名私钥则始终留在本地。

1. 在 Android 主机安装并打开 DiPlay Tesla。
2. 让 Tesla 连接能够访问该主机、同时提供互联网的网络。
3. 打开 **设置 → 连接 → Tesla 浏览器**，查看主机地址和配对码。
4. 在 Tesla 浏览器访问 `http://主机IP:8080`，输入配对码，也可使用 Android 中复制的连接链接。
5. 在 Android 主机启动原有的 USB／无线 CarPlay 连接，保持应用或会话服务运行。

Android 的 Wi-Fi 已用于向 Tesla 提供热点时，优先使用 USB CarPlay。无线 CarPlay 与 Tesla 热点同时工作需要主机支持相应的并发网络模式，也可以使用外部路由器及已有的“现有 Wi-Fi／同一局域网”功能。

声音沿用 Android 主机输出到汽车蓝牙，或者原有的“汽车蓝牙音频”选项，让 iPhone 音频保留在车内。浏览器不传输音频，也不采集麦克风。Siri 和通话的麦克风路径需要用实际 Android、iPhone 和 Tesla 组合验证。

## 右侧窗口与全屏

在 **设置 → 显示 → Tesla 分辨率**，或浏览器的“显示设置”中配置。两处编辑同一份持久化设置。

| 配置 | 初始画布 |
| --- | --- |
| 右侧窗口 | 1024 × 768 |
| 全屏窗口 | 1920 × 1080 |

这两个值是可修改的起点。Tesla 型号、固件、工具栏和窗口模式会影响实际可用区域，需要根据车辆调整。

宽度支持 320–2560，高度支持 240–1440，均须为偶数；帧率支持 5–30，JPEG 画质支持 40–95。选中的画布尺寸用于和 iPhone 协商，不随 Android 主机的窗口大小变化。两个配置独立保存。

修改在下次 CarPlay 连接生效。保存不会中断正在运行的会话；准备好后点击“应用并重新连接”或 Android 的“立即重新连接”。相同配置不触发重连提示。

选择配置不会替 Tesla 改变系统窗口模式，仍需使用车辆自己的窗口控制。浏览器“全屏”按钮在支持时调用 Fullscreen API。页面保持画面比例，并将触控映射到实际画布；黑边起始触控会被忽略。

浏览器支持双指触控、主页、返回、Siri 和媒体快捷键。一次只允许一个页面持有触控；页面隐藏或关闭后释放，丢失的触控在一秒无心跳后自动释放。

## 独立 proxy

直连主机无需 proxy。需要在另一个设备转发浏览器服务时，可运行：

```powershell
$env:DIPLAY_UPSTREAM = 'http://Android主机IP:8080'
$env:DIPLAY_BIND = '0.0.0.0'
node proxy/server.mjs
```

此时 Tesla 访问代理设备的 `8090` 端口，配对码仍由 Android 主机验证。代理默认只监听本机；上例显式开放局域网。

可选的 HTTP／CONNECT 网络代理需单独启用和认证，详见 [proxy/README.md](../proxy/README.md)。HTTP 代理不会自动建立热点、NAT 或 DNS，也不会自动让 Tesla 接受没有互联网的 Wi-Fi；这些由主机热点或外部路由器负责。

## 参考 DiPlay-CN 的功能

参考 [DiPlay-CN](https://github.com/serein-morii/DiPlay-CN) 的中文默认策略：仅在设备语言不受支持且用户没有明确选择时，首次回退到简体中文。保留用户选择及受支持的语言，包括乌克兰语。

同时采用相同配置不重连、恢复已有会话的原则，并在浏览器显示核心连接阶段信息。上游已有的蓝牙重连及细粒度设置继续保留。浏览器另提供即时日夜样式和常用操作快捷键。BYD 仪表、ADB 固件控制等车辆专属功能没有为 Tesla 启用。

## 验证边界

本次检查结果与实际截图见 [验证记录](testing/tesla/README.md)。

自动检查覆盖画布协商与持久化、触控租约、YUV 转换、HTTP 配对与来源检查、更新包筛选和独立 proxy。Android 设备测试还覆盖实际 H.264 编码 → 浏览器解码 → JPEG 输出。

局域网 HTTP 不加密画面与配对码，应使用可信网络；独立 HTTPS 网关可增加传输加密。JPEG 会增加 CPU、带宽和温度负担，建议从 1024×768、20 fps 开始调整。

实际 iPhone 认证、Tesla 固件的浏览器限制、持续解码性能和蓝牙通话需要停车实测。目前不宣称已完成实车验证或行驶支持。

协议细节及检查命令见 [英文技术说明](TESLA.md)。
