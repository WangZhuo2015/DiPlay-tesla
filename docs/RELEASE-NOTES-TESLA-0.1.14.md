# DiPlay Tesla 0.1.14 — WebRTC 连接修复与自动诊断日志

- **修复 WebRTC 连接**：本机 HTTPS 入口使用地址别名时，媒体连接会绑定到相同的本机地址，修复请求与回复地址不一致导致的连接失败。
- **统一主机与网页体验**：更新 Android 首页、首次配置向导和 Tesla 网页菜单，集中显示 iPhone、浏览器与配对状态，保留音乐和导航独立音量。
- **自动保留诊断记录**：接车时无需连接电脑。主机自动保存浏览器/WebRTC 状态、编码、首帧与定期计数，重开 App 后仍保留；在“设置 → 诊断 → 保存诊断报告”导出。
- **明确媒体占用与失败原因**：另一个网页占用媒体连接时会提示，关闭后自动接入。WebRTC 失败会显示原因并重试；JPEG 改为手动排障模式。
- **默认使用 H.264**：HEVC 已有实际兼容问题反馈，默认关闭，保留实验开关。

## 升级

安装 `DiPlay-Tesla-0.1.14.apk` 到 Android 主机。包名 `com.diplay.tesla`，沿用原签名，可覆盖升级 0.1.10／0.1.13并保留设置。0.1.12 的 `.debug` 测试应用会继续并存，数据不会自动迁移。

升级后刷新车机网页。此前手动开启 HEVC 的用户，请在 Android **设置 → 高级 → HEVC 视频（实验性）**关闭，再重新连接 CarPlay。只保留一个媒体网页，避免 PC 页面占用车机连接。

## 附件

- `DiPlay-Tesla-0.1.14.apk`：完整连接 APK。
- `DiPlay-Tesla-Proxy-0.1.14.zip`：可选的独立 proxy 与 Android 本机 HTTPS 网关模板。
- `SHA256SUMS.txt`：附件校验文件。

[中文使用指南](TESLA-QUICKSTART.zh-CN.md) · [问题反馈](https://github.com/WangZhuo2015/DiPlay-tesla/issues)
