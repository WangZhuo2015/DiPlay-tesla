# DiPlay Tesla 0.1.12 — 待发布候选

新版定为 **0.1.12／versionCode 13**，仍在本地准备，**尚未发布 GitHub Release 或 0.1.12 APK**。当前公开完整连接版仍为 [0.1.10](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.10)。包名保留 `com.diplay.tesla`；`.debug` 包为独立调试应用，不能覆盖正式版。

## 本次整合

- **独立导航音量：** 网页菜单增加 −20～0 dB 滑块和 ± 按钮，复用 Android 保存值与实时 PCM 增益。只降低导航提示，不改变音乐音量；快速操作合并提交，其他端改值或保存未确认时先回读。
- **实际视频状态：** 菜单直接显示 WebRTC／JPEG、收到的尺寸、实测帧率及回退原因。统计不可用显示“未知”，静止画面可实测为 0 fps；不使用目标分辨率和设置帧率冒充测量结果。
- **性能调整：** 整合 [PR #5](https://github.com/WangZhuo2015/DiPlay-tesla/pull/5) 的单槽 JPEG 编码工作、NV21／压缩缓冲复用、按浏览器需求启停转换、RTC NAL／队列处理、Canvas 回调和音频状态去重。保留有界丢帧策略，没有为条件性静态末帧场景增加额外拷贝。
- **中文说明：** 默认 README 以 Tesla 安装、连接、设置和故障排查为主，不再附带旧版通用车机的宣传、发布日志和安装入口。项目标识、许可证和必要作者署名保留。

此前已整合的接收端同步、认证边界和 RTC 重试仍保留；相关范围见[同步说明](UPSTREAM-SYNC-20261028.md)、[RTC 重试说明](TESLA-RTC-RETRY.md)和[第三方归属](THIRD_PARTY_NOTICES.md)。性能调整旨在减少不必要的工作，不代表实际车机帧率、温度或延迟已经改善。[性能说明与实测计划](browser-performance.md)

## 版本与验证

2026-10-30 核对远端：最新公开完整包为 0.1.10／code 11，`main` 配置为 0.1.11／code 12；没有 0.1.11、0.1.12 的 tag 或 Release。旧 0.1.2 draft 保持原样。新版选择 code 13，高于这两项已有配置。

本轮仅调整版本号与文档，**没有重新运行 Android 构建、测试、lint 或设备检查**，以免占用同机音响真实 API 任务的资源。

此前整合提交 `d5ecfac202b55da13886512e7b65f9008e825bc7` 的轻量浏览器／代理测试 **92 项全部通过**；Android 单元测试 **3,645 项中 3,641 通过、3 失败、1 跳过、无测试错误**。失败仍是未修改的双栈网络用例，没有禁用。五个 lint 目标无错误／致命问题，合计 56 项警告；四个 source-only debug APK 与 RTC 三种 ABI 构建完成。完整 Android gate 因上述失败仍未通过。这些记录属于 **0.1.11／code 12**，不能称为 0.1.12 的最终制品验证。[原始整合验证记录](testing/tesla/README.md#release-integration-preparation--2026-10-30-not-published)

目前没有本轮 V50、iPhone 或 Tesla 实车续测。编码繁忙时静态源结束发送仍是条件性待测场景，尚未确认为实车缺陷。

## 认证、签名与制品

- 下次完整连接构建继续使用已明确授权、从 **Tesla 0.1.10 release APK** 提取的认证资源；输入保留在 Git 外私有目录。必须通过外部 `DIPLAY_AUTH_ASSETS_DIR` 和 `assembleStandaloneDebug`／`assembleStandaloneRelease` 任务显式校验，不能将无认证的普通 `assembleDebug` 产物当作完整连接包。
- 认证资源不是 Android APK 发布签名。原发布 keystore 仍缺；没有新建替代发布 key。
- 用户尚未确认是否接受独立 `.debug` 测试版。原签名及包类型明确之前，不推送、创建 Release 或发布 APK，也不把 debug 包称为可覆盖升级版。
- 现有本地 APK 均为 **0.1.11／code 12**：整合检查包不含认证资源；旧 `9904b44c` 认证调试包不含 PR #5。两者都不是 0.1.12 制品。

正式发布前仍需明确包类型与签名方案、README 品牌展示范围，完成 0.1.12 认证构建和制品核对，并在合适环境核验网络测试失败及真实设备表现。认证私钥、签名私钥、密码和用户 HTTPS 配置不进入 Git、源码包或公开构建日志。
