# DiPlay Tesla 0.1.13 — 音乐与导航独立音量预览版

版本 **0.1.13／versionCode 14**，发布标签为 [`tesla-v0.1.13`](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.13)。这是预览版；完整 Android CI 仍有已知失败，未完成新一轮实车验收。

## 本次更新

- 合并 [PR #6](https://github.com/WangZhuo2015/DiPlay-tesla/pull/6)：浏览器菜单分别提供音乐和导航音量，范围 0–100%，默认 100%。100% 保留输入音量，0% 静音；不放大声音，也不自动压低音乐。
- 调整立即生效，只在当前浏览器保存，不重连 CarPlay 或浏览器媒体连接。未标记音频角色的旧版主机保留原音量。
- 保留 0.1.12 的主机导航音量、与 Android 同步的保存值、并发保存冲突回读，以及音频状态去重和视频性能调整。主机导航音量与浏览器音量使用不同标签；浏览器导航音量会进一步降低主机已经处理的导航声音。
- 保留原有音频分流范围；通话、Siri 语音和麦克风仍由 Android 主机处理。

## 安装和制品

`DiPlay-Tesla-0.1.13.apk` 的包名是 **`com.diplay.tesla`**，使用与已发布 0.1.10 相同的签名，可覆盖升级并保留该应用数据。0.1.12 的 **`com.diplay.tesla.debug`** 是另一个应用，会继续并存，其设置不会自动迁移。

附件包括完整连接 APK、独立 Node.js proxy ZIP 和 `SHA256SUMS.txt`。proxy 仍可独立部署，APK 不要求运行 proxy。签名 keystore、密码、私人域名和网络配置不会进入附件或源码；运行时认证资源沿用已公开的 0.1.10 APK。

APK 为 **29,909,146 bytes**，SHA-256 为 `c1adcac861c6fb5980ea7a3e6b7b68e37c7ab61b289f0d37289747111c8b4752`。最低 Android 7.1／API 25；RTC 库包含 arm64-v8a、armeabi-v7a、x86_64。

## 验证范围

- 浏览器／代理 Node 回归 **99 项通过，无失败或跳过**。
- 完整 Android CI（加 `--continue` 收集全部结果）对应 **3,649 项单元测试：3,640 通过、7 失败、2 跳过**。browser 为 86/86，Tesla 为 12/12，home 为 14/14；未变更任务可能复用 Gradle 的 `UP-TO-DATE` 结果，逐任务状态保存在记录中。
- 使用真实桌面浏览器和合成 WebRTC／HTTP 服务验证英文全屏、中文高密度紧凑窗口与阿拉伯语窄窗口，字号为 130%。检查独立音量、键盘和指针操作、刷新持久化、主机设置同步与冲突恢复，以及不额外重连媒体。
- [本次检查和制品核验](testing/tesla/release-0.1.13-20261031.json)记录 Android CI、单元测试、lint、APK 元数据、签名、认证资源一致性和 SHA-256。
- 完整连接 Release 构建通过；Tesla 和 browser 的 debug／release lint 均无错误或致命问题，仍分别有 17 和 10 项警告。
- 界面截图：[英文全屏](testing/tesla/browser-volume-20261031/browser-volume-menu-full-en-font130.jpg)、[中文紧凑高密度](testing/tesla/browser-volume-20261031/browser-volume-menu-compact-zh-font130.jpg)、[阿拉伯语窄窗口](testing/tesla/browser-volume-20261031/browser-volume-menu-narrow-ar-font130.jpg)。截图来自合成测试。

完整 Android CI 不能称为全绿。本机 Windows 在合并前已经复现 3 项符号链接创建权限失败和 4 项 FileProvider 路径失败；本次结果单独保留在验证记录中，没有禁用或改写这些测试。

本轮没有连接 V50、iPhone 或 Tesla，界面和自动化测试不能证明实车音量、并播表现、持续性能、温度、延迟或固件兼容性。
