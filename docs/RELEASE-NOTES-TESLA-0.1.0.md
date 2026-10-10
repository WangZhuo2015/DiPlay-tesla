# DiPlay Tesla 0.1.0 — 签名预览版

APK 安装在 Android 7.1+ 主机上，Tesla 通过同一局域网的浏览器访问 `http://主机IP:8080`。包名 `com.diplay.tesla`，版本号 `0.1.0`（versionCode 1）。

**此预览未内置 MFi 配件证书和私钥，不能直接完成离线 CarPlay 认证。** 可测试浏览器配对、双尺寸配置与主机部署。实际连接 iPhone 需要另行配置可用的认证来源；Android APK 签名不能代替 MFi 认证。本次未提取或分发第三方私钥。

## 功能

- 将 CarPlay 核心、浏览器输出及可选 proxy 分开；直连 Android 无需 proxy。
- 右侧窗口和全屏窗口独立保存分辨率，默认 1024×768 / 1920×1080，支持自定义画布、帧率及 JPEG 画质。
- 显示更改在下次连接或用户明确选择“应用并重新连接”后生效。
- 浏览器配对、双指触控、主页、返回、Siri、媒体快捷键和日夜样式。
- 参考 DiPlay-CN 的中文回退、连接状态提示及相同配置不重连策略。

## 文件

- `DiPlay-Tesla-0.1.0.apk`：使用独立固定密钥签名的 Release APK，未内置离线认证。
- `DiPlay-Tesla-Proxy-0.1.0.zip`：独立 Node.js 22+ 服务，无 npm 依赖，包含说明和测试。
- `SHA256SUMS.txt`：下载文件的 SHA-256 校验值。
- GitHub 自动生成的源码包对应此 Release 标签，含构建说明与许可证。

APK 与此前 `.debug` 测试包分别安装。后续 Release 更新需要相同签名；签名私钥留在本地，不进入 Git 或发布附件。

## 检查与边界

完整 Android CI、Tesla/browser 单元测试与 lint、proxy 集成测试通过。Android 模拟器已验证真实 H.264 解码到 JPEG、浏览器配对和配置持久化；[验证记录与截图](testing/tesla/README.md)随源码提供。

实际 iPhone 认证和 Tesla 浏览器、持续解码性能、音频及通话尚待停车实测。浏览器目前传输 JPEG 画面及触控；声音沿用主机或 iPhone 到汽车的蓝牙路径。proxy 不自动创建热点、NAT 或 DNS。

详见 [中文使用与构建说明](TESLA.zh-CN.md)、[独立 proxy](../proxy/README.md)及[认证来源公告](THIRD_PARTY_NOTICES.md#experimental-authentication-data)。
