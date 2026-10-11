# DiPlay Tesla 0.1.2 — 画面铺满窗口、隐藏按键与实时诊断

页面画面区域使用整个浏览器窗口，顶部与底部常驻工具栏改为角落浮动菜单。虚拟按键默认隐藏，在菜单中展开或收起，选择在浏览器保存；展开按键不改变画面尺寸或触控坐标。画面保持比例，CarPlay 内容不会被裁切。

- “菜单 → 显示设置 → 使用当前窗口尺寸”填写所选右侧或全屏配置，两份配置独立保存。尺寸保持偶数并受已有范围约束，保存仍在下次连接生效；应用当前会话必须在页内确认重连。
- 选择性移植“检查 ADB 连接”任务的静止画面保护和诊断思路：静止画面保持 WebRTC，持续收到源端新帧而解码不前进时才触发 JPEG 回退；失联及首次播放仍有超时保护。
- 菜单显示实际解码帧率、丢帧、实际音频排队时长和重新缓冲次数。设备温度、可用内存、CPU 当前频率和策略上限每 2 秒采样；数据过期或无权限读取时明确显示。温度保留传感器名称，不以电池温度代替 CPU 温度。
- 网页支持中文、英文与阿拉伯语 RTL，并检查了 130% 字体的右侧与全屏布局。
- `browser` 继续独立于 CarPlay 核心和外部 proxy；设备专属的 root 热点脚本、VPN 路由和 HTTPS 私钥没有移植。HTTPS 部署方式仍见独立 proxy 文档。

**本地签名 APK 已内置用户此前配置的实验性 MFi 资产**，与引用任务为本项目准备的身份一致。Release 当前仍为草稿，含凭证 APK 的公开上传被自动审批阻止，没有公开上传该文件。资产没有进入 Git 或源码压缩包。认证不是 Apple 新签发给本项目的身份；Android APK 签名、HTTPS 证书和 MFi 身份各自独立。

完整 AGENTS.md CI、2255 项单元测试、相关 lint、签名构建以及 12 项 Node 测试通过。本版没有新的 iPhone 认证或 Tesla 实车测试，仍需实际验证连接、音频与持续播放性能。浏览器布局测试使用标有“No CarPlay session”的合成图和模拟状态；在新测试页中实际点击验证了保存、取消重连、确认重连和按键显示／隐藏。取消保留旧画面，确认才应用新尺寸；这不代表已验证实车重连。

APK 包名 `com.diplay.tesla`，versionCode 3，使用与 0.1.0/0.1.1 相同的签名，可覆盖升级。本地文件为 `DiPlay-Tesla-0.1.2.apk`；草稿当前只有独立 `DiPlay-Tesla-Proxy-0.1.2.zip` 和 `SHA256SUMS.txt`。

[中文说明](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.2/docs/TESLA.zh-CN.md) · [proxy 配置](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.2/proxy/README.md) · [验证记录](https://github.com/WangZhuo2015/DiPlay-tesla/blob/tesla-v0.1.2/docs/testing/tesla/README.md)
