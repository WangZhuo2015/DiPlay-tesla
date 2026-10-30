# DiPlay Tesla 0.1.12 — 独立测试版

> **本包是 `com.diplay.tesla.debug` 独立测试应用，可与原正式包并存，不能覆盖升级原正式包或继承其应用数据。** 签名与原正式版不同。不建议作为生产稳定版使用。

版本 **0.1.12／versionCode 13**，已建立[对应发布页](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.12)。这是独立测试版本，版本号或发布平台标记不代表已完成稳定性与实车验收。原 [0.1.10 历史版本](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.10)仍保留；安装前请认清包名。

## 本次整合

- **独立导航音量：** 网页菜单增加 −20～0 dB 滑块和 ± 按钮，复用 Android 保存值与实时 PCM 增益。只降低导航提示，不改变音乐音量；快速操作合并提交，其他端改值或保存未确认时先回读。
- **实际视频状态：** 菜单直接显示 WebRTC／JPEG、收到的尺寸、实测帧率及回退原因。统计不可用显示“未知”，静止画面可实测为 0 fps；不使用目标分辨率和设置帧率冒充测量结果。
- **性能调整：** 整合 [PR #5](https://github.com/WangZhuo2015/DiPlay-tesla/pull/5) 的单槽 JPEG 编码工作、NV21／压缩缓冲复用、按浏览器需求启停转换、RTC NAL／队列处理、Canvas 回调和音频状态去重。保留有界丢帧策略，没有为条件性静态末帧场景增加额外拷贝。
- **中文说明：** README 以 Tesla 安装、连接、设置和故障排查为主，并介绍用 RemoteOrbit iOS／macOS App 管理 V50 等无屏 Android 主机。[使用说明与 RemoteOrbit 推荐](../README.md#用-remoteorbit-管理无屏设备)

此前已整合的接收端同步、认证边界和 RTC 重试仍保留。性能调整旨在减少不必要的工作，不代表实际车机帧率、温度或延迟已经改善。[实现范围和实测计划](browser-performance.md) · [第三方归属](THIRD_PARTY_NOTICES.md)

## 构建与验证

APK 从精确源码提交 [`ed62af2a5aac2dc40c0aeb996046a2bc498370f2`](https://github.com/WangZhuo2015/DiPlay-tesla/commit/ed62af2a5aac2dc40c0aeb996046a2bc498370f2) 构建；`tesla-v0.1.12` tag 固定于该提交；后续发布说明更新没有产品代码差异。

- 独立构建执行 `assembleStandaloneDebug`、Tesla 测试和 lint，以及浏览器测试和 lint，Gradle **BUILD SUCCESSFUL in 51s**。
- Tesla **12/12** 测试通过；浏览器 **82/82** 的未改动源码结果被 Gradle 标记为 `UP-TO-DATE` 重用。两项 lint 均无错误／致命问题，合计 27 项警告（Tesla 17、browser 10）。
- 本轮浏览器／代理 Node 回归 **92/92** 通过，无失败或跳过。
- APK 实际包名、0.1.12／code 13、签名均核验通过，签名证书与既有 debug 包一致；RTC 库包含 **arm64-v8a、armeabi-v7a、x86_64**。
- 包内认证资源与 **Tesla 0.1.10 release APK** 逐字节匹配；无额外私钥／证书文件或签名 keystore 容器。

**完整 Android gate 仍不能称为全绿。** 此前整合提交 `d5ecfac202b55da13886512e7b65f9008e825bc7` 的 3,645 项单元测试为 **3,641 通过、3 失败、1 跳过、0 错误**。失败是原有 Mac 双栈网络用例；没有禁用或改写测试。本轮没有重跑这套完整门禁。[完整整合记录](testing/tesla/README.md#release-integration-preparation--2026-10-30-not-published) · [本次制品核验](testing/tesla/standalone-debug-0.1.12-20261030.json)

0.1.12 尚未完成 V50、iPhone 或 Tesla 实机验证。编码繁忙时静态源结束发送仍是条件性待测场景，尚未确认为实车缺陷。持续高分辨率性能、温度、延迟、音乐与导航并播、断线恢复及 Tesla 固件兼容性仍需实机检查。

## 版本与制品核验

发布页中的独立测试 APK 为 **`DiPlay-TeslaDebug-0.1.12.apk`**；以下元数据与已核验制品一致。源码／CI 普通调试构建默认不含独立连接所需认证资源，不能视作同一完整连接包。

- APK 大小：**46,361,711 bytes**。
- SHA-256：`ff0d1b3f6a15fc72794636cbdc287a097238481c7dd86a10a588fcdbc19ea011`。
- 最低 Android 7.1／API 25。实际连接能力取决于设备、iPhone、网络和 Tesla 固件。

认证资源和 APK 签名用途不同。原始认证文件、签名 keystore、密码及私人配置不进入 Git。保留项目许可证和上游署名。
