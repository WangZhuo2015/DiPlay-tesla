# DiPlay Tesla 0.1.10 — 完整连接版

安装 `DiPlay-Tesla-0.1.10.apk` 到 Android 主机，可本地认证 iPhone 并在 Tesla 浏览器使用 CarPlay，无需自己编译。包名 `com.diplay.tesla`，versionCode 11，Android 7.1+；沿用原签名，可覆盖同签名旧版保留设置。

**[中文使用指南：安装、iPhone 连接、HTTPS、配对、画面与声音](https://github.com/WangZhuo2015/DiPlay-tesla/blob/main/docs/TESLA-QUICKSTART.zh-CN.md)** · [English quick start](https://github.com/WangZhuo2015/DiPlay-tesla/blob/main/docs/TESLA-QUICKSTART.md)

## 下载

| 文件 | 用途 |
| --- | --- |
| `DiPlay-Tesla-0.1.10.apk` | 已签名的完整连接 APK，包含明确配置的实验性 CarPlay 认证身份 |
| `DiPlay-Tesla-Proxy-0.1.10.zip` | 单独部署的网关源码与 HTTPS 配置模板，不依赖核心连接 |
| `SHA256SUMS.txt` | APK 与 proxy ZIP 的校验值 |

GitHub 的 Source code 压缩包是源码，不含配件身份。旧的 0.1.0／0.1.1 APK 和普通源码构建无法单独完成本地 iPhone 认证。

## 开始使用

1. 安装并打开 APK，授予连接权限，打开 Android 主机热点。
2. 在 DiPlay **设置 → 连接 → 连接设置 → 车载热点**保存主机热点的名称与密码。保持 iPhone 蓝牙和 Wi-Fi 开启，与 Android 主机蓝牙配对后，在 DiPlay 选择 iPhone 并点 **连接手机**。
3. 第一次使用 HTTPS，需要先按[Android 本机网关说明](https://github.com/WangZhuo2015/DiPlay-tesla/blob/main/proxy/android-root/README.md)配置自己的域名、证书和转发；已有网关检查上游实际 HTTP 端口即可。
4. Tesla 连接 Android 热点。在 Android **设置 → 连接 → Tesla 浏览器（实验性）**查看入口和 **6 位配对码**，车机打开入口并输入短码。有效期五分钟，过期后重新打开 Android 连接页；配对后浏览器会记住。
5. 顶部中央小把手打开菜单。显示设置先选与车机一致的右侧／全屏配置，建议从 **适配窗口 · 1/2** 开始；保存在下次连接生效，需要立即应用时选择 **应用并重新连接**。
6. 浏览器音频默认开启。播放音乐，浏览器要求手势时点一下页面；此前手动关闭的浏览器需要在菜单重新开启。

**公开文件不包含用户的域名、HTTPS 证书／私钥、热点密码或设备路由配置。** 这些由用户自行配置；APK 本身只提供 HTTP。Android 本机 HTTPS 方案需要 root 和另行安装的 Caddy。无线热点并发能力取决于主机固件，其他设备可以比较 USB 或现有局域网连接。

## 变化

- 默认浏览器音乐／导航音频，手动关闭后记住；80／200／400 ms 缓冲可选，默认 200 ms。
- 顶部中央菜单把手闲置两秒收起，仅露出 12 px，虚拟按键默认隐藏。
- 修复 CarPlay 左侧图标／主页按键有动画但不切换，按下和松开保留坐标并按顺序传送。
- 独立右侧／全屏分辨率，适配 1/2、3/4、1×，以及 720p／1080p／2K（最高 2560×1440）预设。
- H.264 WebRTC 和自动 JPEG 回退；摘要合并实际视频路线、分辨率、fps 与 SoC 温度。移除没有物理电池的供电设备上误导性的电池温度字段，详细诊断保留热传感器名称。

## 验证与范围

完整 Android CI、2271 项 Android 单元测试和 29 项浏览器／代理测试通过，签名及 APK 资源检查通过。0.1.10 已装到 V50，用户在无线 iPhone 和 HTTPS 页面确认默认有声音、把手正常收起；0.1.9 同一路线已确认图标切换、连续画面和声音。公开图片使用合成内容，不包含真实账号、车辆、导航位置或网络配置。

通话、Siri 语音和麦克风仍使用 Android 主机，网页目前不提供麦克风采集或回传。不同 Tesla 固件、目标 Model Y Juniper 的长时间 2K 性能及通话／Siri 仍需停车测试；有浏览器音乐不等于主机语音硬件已正常工作。

完整连接 APK 包含此前明确配置的实验性配件身份，不是 Apple 为 DiPlay 新签发的身份；APK 接收者可提取这份配件私钥。认证身份不进入 Git 或源码压缩包，Android 签名私钥和用户 HTTPS 私钥留在本地。[认证资产说明](https://github.com/WangZhuo2015/DiPlay-tesla/blob/main/docs/THIRD_PARTY_NOTICES.md#experimental-authentication-data) · [验证记录与截图](https://github.com/WangZhuo2015/DiPlay-tesla/blob/main/docs/testing/tesla/README.md#0110-default-audio-and-retracting-menu--2026-10-11)

APK SHA-256：

```text
605c2dd283889db9581ac4fd3df78b8522ab6a4d3e6637d04ae38e43e5c2f612
```
