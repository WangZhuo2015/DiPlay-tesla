# DiPlay Tesla 0.1.1 — WebRTC、可选浏览器音频与 HTTPS 网关

浏览器默认尝试直接播放 iPhone 的 H.264 WebRTC 码流，减少 Android 解码再转 JPEG 的开销。收到并播放视频后才切换画面；协商失败、浏览器不支持 H.264 或解码停止时自动回退到 JPEG，也可手动选择 JPEG。队列有帧数、字节和时效上限，丢帧后等待新的关键帧。

- 选择性参考 tepla 0.2.1 的 WebRTC、关键帧恢复和 PCM 分流；使用固定版本、校验 SHA-256 的官方 libdatachannel/MbedTLS 等依赖，保留来源和许可证。
- 点击“浏览器音频（实验性）”可让音乐和导航提示在网页播放。缓冲支持 80 / 200 / 400 ms，默认 200 ms；页面隐藏、音频暂停或积压后恢复 Android 路线。电话、Siri 与麦克风仍走 Android。车辆浏览器能否播放声音尚待实测。
- 右侧与全屏分辨率独立保存；修改仍在下次连接或确认重连后应用。JPEG 画质只影响回退路线。画布仅在尺寸变化时重新分配。
- 核心只增加可选 PCM 输出接口；原有应用默认保持 Android 输出。WebRTC 与网页音频位于 `browser`，proxy 仍为独立进程。
- 独立 proxy 支持配置 TLS 的 HTTPS/WSS 入口，默认 `8443`，最低 TLS 1.2。证书缺失或无效时停止启动。HTTP/WebSocket 配对、来源检查、消息长度和发送队列都有边界。

HTTPS 使用方法：设置 `DIPLAY_UPSTREAM=http://Android主机IP:8080`、`DIPLAY_TLS_CERT` 与 `DIPLAY_TLS_KEY`，启动 proxy 后访问 `https://你的域名:8443`。域名、浏览器信任的证书和车辆可达的网关需自行准备；本项目尚未部署域名或证书。Android `8080` 本身仍是 HTTP。

WebRTC 视频需浏览器直接访问 Android 的 UDP 通路；proxy 转发网页、信令和可选音频，不提供 TURN/UDP 中继。只有网关可达时仍可用 JPEG。设备专用的 VPN 路由方案未引入。

完整 AGENTS.md CI、新增模块单元测试和 lint、签名 Release 构建，以及 9 项 Node 音频/HTTPS/WSS/proxy 测试通过。专用模拟器测试验证真实 H.264 → WebRTC → 桌面浏览器播放，以及旧 WebView 的 JPEG 回退。没有连接实际 iPhone 或 Tesla，不能据此承诺实车清晰度、延迟或音频稳定性。

APK 包名 `com.diplay.tesla`，versionCode 2，使用与 0.1.0 相同的签名，可覆盖升级。附件为 `DiPlay-Tesla-0.1.1.apk`、独立 `DiPlay-Tesla-Proxy-0.1.1.zip` 和 `SHA256SUMS.txt`。

**此预览未内置 MFi 配件身份，不能直接完成 iPhone 的离线 CarPlay 认证。** HTTPS 证书与 MFi 认证互不替代。

[中文配置与排查](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.1/docs/TESLA.zh-CN.md) · [proxy 参数](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.1/proxy/README.md) · [验证记录](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.1/docs/testing/tesla/README.md)
