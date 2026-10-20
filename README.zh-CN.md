# DiPlay Tesla

本仓库在 DiPlay 核心上增加 **Tesla 浏览器 CarPlay**：Android 设备负责 USB／无线 CarPlay，Tesla 在同一网络打开浏览器使用。新增 `tesla` APK 和独立 `browser` 模块；可选 `proxy/` 单独运行，核心连接不依赖 proxy。

[下载完整连接版 0.1.10](https://github.com/WangZhuo2015/DiPlay-tesla/releases/tag/tesla-v0.1.10) · **[从安装到车机使用的步骤](docs/TESLA-QUICKSTART.zh-CN.md)** · [English](docs/TESLA-QUICKSTART.md)

**已在 2026 Model Y Juniper 实车测试：CarPlay 音频、触摸均正常。** Android 主机为 **ZTE V50 移动 WiFi**；测试手机为 **iPhone 16 Pro Max／iPhone 17 Pro Max，均运行 iOS 27.0.1**。这是用户确认的实测组合，其他车型、固件和手机需要分别验证。

![Model Y Juniper 实测照片，地址栏域名已遮挡](docs/testing/tesla/model-y-juniper-v50-redacted.png)

下载安装 `DiPlay-Tesla-0.1.10.apk` 到 Android 主机，开启主机热点，先在 DiPlay 连接 iPhone。让 Tesla 连接该热点，在 Android **设置 → 连接 → Tesla 浏览器（实验性）**查看入口和 6 位配对码，然后在车机浏览器打开入口并配对。后续浏览器会记住连接；配对码有效五分钟，过期后重新打开 Android 连接页获取。

完整连接 APK 包含明确配置的实验性 CarPlay 配件身份，可以本地认证 iPhone，无需用户自己编译。它不是 Apple 为 DiPlay 新签发的身份；[资产来源与范围](docs/THIRD_PARTY_NOTICES.md#experimental-authentication-data)有单独说明。源码和 proxy 不包含该身份，Android 签名私钥留在本地。

**HTTPS 由用户单独配置。** APK 和公开文件不包含用户的域名、HTTPS 证书／私钥、热点密码或设备路由配置。首次部署请准备自己的域名和证书，参考 [Android 本机 HTTPS 入口](proxy/android-root/README.md)（需要 root）或[独立 proxy](proxy/README.md)。Android 连接页可显示自行配置的 HTTPS 入口；车机经热点默认网关访问，配置在 Android／网关端完成。

**Tesla 浏览器可能限制内网 IP 访问。** 电脑或手机能打开热点内的 HTTP 地址，不代表车机也能访问；只换成域名或 HTTPS 也不能保证解决。请阅读[内网 IP 限制与入口配置](docs/TESLA-QUICKSTART.zh-CN.md#tesla-内网-ip-访问限制)，按自己的网络配置可达地址、DNS、证书和独立网关。

0.1.10 浏览器音频默认开启并记住手动关闭；浏览器要求手势时点一下页面。菜单改为顶部中央小把手，闲置约两秒收起，虚拟按键默认隐藏。包含 0.1.9 的触摸修复：左侧应用图标和主页按键正常切换，快速点按按顺序发送。温度按可读的命名热传感器显示，移除了没有物理电池的主机上误导性的电池温度字段。

显示提供“适配窗口／720p／1080p／2K 清晰 1440p”预设，以及适配 1/2、3/4、1× 缩放。右侧和全屏分别保存尺寸；保存后下次连接生效，或明确选择“应用并重新连接”。H.264 WebRTC 默认优先，失败时自动回退 JPEG；菜单合并显示实际路线、分辨率、fps 与 SoC 温度。[详细预设与屏幕资料](docs/TESLA-DISPLAY-PRESETS.md)包含公开界面图。

![顶部菜单与诊断摘要（合成测试内容）](docs/testing/tesla/browser-0.1.10-menu-compact-font130.jpg)

0.1.10 的 Model Y Juniper 实测确认音频、触摸正常；V50 的此前测试也确认默认音频和菜单把手收起。通话、Siri 语音和麦克风仍走 Android，网页目前不采集麦克风；长时间 2K 性能及语音没有在这次反馈中单独验证。[版本说明](docs/RELEASE-NOTES-TESLA-0.1.10.md) · [实车验证记录](docs/testing/tesla/README.md#model-y-juniper-vehicle-report--2026-10-12)

[源码构建与模块边界](docs/TESLA.zh-CN.md) · [独立 proxy](proxy/README.md)。普通源码构建不含 CarPlay 认证资产，独立连接构建需自行提供获授权的外部资产。下面保留上游 DiPlay 的说明；Tesla 端口请优先阅读上面的使用指南。

[English](README.md) · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md)

为兼容的比亚迪安卓车机提供有线及无线 CarPlay，采用 DiAuto 风格界面。

> 这些项目专注于比亚迪汽车。它们可能在其他品牌上运行，但其他品牌不在支持范围内，也没有增加支持或修复其品牌特定兼容性问题的计划。

[下载与中文网站](https://shihabal3amri.github.io/DiPlay/zh-Hans/) · [0.2.21 版本](https://github.com/shihabal3amri/DiPlay/releases/tag/v0.2.21) · [完整说明](README.md) · [报告问题](https://github.com/shihabal3amri/DiPlay/issues/new/choose)

## 0.2.21 — 公开预览版

请安装在允许 APK 安装的 Android 7.0+（API 24+）车机上；Android 7.0–8.1 尚未经实车验证。无需越狱、转接盒、账户或认证服务器。有线及无线核心连接不要求 ADB；可选车辆数据及车辆控制需要支持的固件和已授权网络 ADB。

Wi-Fi Direct 现支持 Android 7.0–9 的旧版建组路径，使用系统返回的真实凭据。首选信道依赖固件 API；Android 7.0–9 无法读回协商频率，所以请求信道在诊断中标为未经验证，系统默认为信道 0。Android 10+ 保留频率验证。也可使用车机内置热点、USB 或[现有 Wi-Fi／同一局域网](docs/EXISTING_WIFI.md)；同一局域网模式由车机和 iPhone 自行连接外部路由器，DiPlay 不替你修改默认路由。[Android 9 Wi-Fi Direct 限制](docs/ANDROID9_WIFI_DIRECT.md)说明清理及持久配置边界。

### 新增与修正

- **音乐**：修正 0.2.20 中音乐落后于 iPhone 的问题；暂停、切歌不再延迟几秒，播放速度也不再忽快忽慢。
- **有线连接**：iPhone 收下开始请求却一直不打开 CarPlay 时，DiPlay 会自动重新连接；点“断开连接”后不再一直等待；已经自行恢复的连接不再被重试断开。
- **麦克风与音乐**：在没有安卓自带 Opus 编码器的车机上使用麦克风时，DiPlay 不再闪退；通话或短暂打断后，音乐会恢复播放。
- **无线连接与比亚迪车机**：无线 CarPlay 无法启动时会显示原因；CarPlay 结束后，DiPlay 会把仪表交还给原车；从 DiYou 桌面卡片打开时不再闪退；Android 10 以上的比亚迪车机可使用“隐藏比亚迪来电弹窗（实验性）”。
- **安装与语言**：DiPlay 可安装在 Android 7.0 上，并新增意大利语。
- **新选项（默认关闭）**：临时显示系统栏（5 秒）、黑色圆角遮罩、方向盘播放／暂停按钮、双击触发 Siri、导入车机热点详情（实验性）、桌面悬浮球（实验性）、车辆原厂音乐律动。

[0.2.21 完整说明](docs/RELEASE-NOTES-0.2.21.md)包含贡献链接及功能限制；构建和验证信息见[验证记录](docs/VALIDATION.md)。Android 7.0–8.1 尚需实车验证，不宣称所有车型的连接、音频或 Siri 问题均已解决。可选功能请停车后测试。

### 请提供 0.2.21 的新诊断报告

1. 更新到 **0.2.21**，复现问题并记录发生时间。开机／自动启动问题发生后，可手动打开 DiPlay 导出。
2. 打开“**设置 → 诊断 → 保存诊断报告**”。Android 10+ 通常保存到 **Downloads/DiPlay**；Android 7.0–9 会请求存储权限并同样保存到该位置，也可点“选择保存位置”。如选择器或公共存储不可用，应用会使用专用外部或私有目录，并在确认中说明目的地。
3. 使用确认中的**查看报告／分享**；没有分享应用时，可在报告视图中选择并复制文本。检查 `.txt` 并删除隐私信息，再附到匹配的[现有问题](https://github.com/shihabal3amri/DiPlay/issues)，或[新建问题](https://github.com/shihabal3amri/DiPlay/issues/new/choose)。报告不会自动上传，请勿公开热点密码或私有认证文件。
4. 注明车型／车机、DiLink/Android/完整固件版本、iPhone/iOS、USB／车机热点／Wi-Fi Direct／同一局域网、相关设置、复现步骤、预期与实际结果及故障时间。

[从源码构建](docs/BUILD.md)：主应用请选择 `mobile` 模块。`maphost` 是地图演示应用，构建步骤和 APK 路径见说明。

历史记录：[0.2.17](docs/RELEASE-NOTES-0.2.17.md)、[0.2.16](docs/RELEASE-NOTES-0.2.16.md)、[0.2.15](docs/RELEASE-NOTES-0.2.15.md)、[0.2.14](docs/RELEASE-NOTES-0.2.14.md)、[0.2.13](docs/RELEASE-NOTES-0.2.13.md)、[0.2.12](docs/RELEASE-NOTES-0.2.12.md)、[0.2.11](docs/RELEASE-NOTES-0.2.11.md)、[安装与连接](docs/INSTALL.md)。

这是公开预览版，**未经 Apple 认证**。APK 使用来自公开 Carlinkit 固件的既有实验性配件身份，并非为 DiPlay 新签发的 MFi 身份；未来 iOS 是否继续接受及其公开分发适用性尚未确定。Android 签名密钥和配件身份不进入 Git 或源代码压缩包；普通源代码/CI 构建默认不配置身份。部分车机仍可能卡顿或无法应用图标大小设置。

标准导航小组件需要支持 Android 小组件的启动器；比亚迪内置主页不接受任意小组件。悬浮地图和嵌入地图需要启用“CarPlay 仪表地图”。应用及网站源代码包含英语、简体中文、繁体中文（台湾）、阿拉伯语、俄语、乌克兰语、西班牙语和日语。应用的香港／澳门及 Hant 选择使用台湾译文，不宣称提供独立地区翻译。[繁体中文说明](README.zh-TW.md)提供安装、设置、隐私和构建指南。源代码、构建说明及许可证随版本提供。
