# 2026-10-28 上游同步

## 固定来源

- Tesla 基线：`119f96f9d1a9fda1430ed2b8d69ccf23477c15ac`（此前 PR #1、#2 已合并）。
- DiPlay：[`a2dc2e70b3ff24e9e18e56db71cde776b30a4eec`](https://github.com/shihabal3amri/DiPlay/commit/a2dc2e70b3ff24e9e18e56db71cde776b30a4eec)，提交时间 2026-10-27 13:34:43 UTC。相对已整合的 `6d3b8a8ce927cb4b115b8c3881f17619433e93b1` 新增 254 个提交，267 个文件变化。版本仍为 0.2.21；本次包含该版本之后的主线改动，不称为已发布的 0.2.22。
- WheelPlay：[`ccd01f06f790495782449261840b8853c2f7d84b`](https://github.com/fython/wheelplay/commit/ccd01f06f790495782449261840b8853c2f7d84b)，提交时间 2026-10-26 13:27:32 UTC。相对此前固定比较快照 `4ed3536822998babd086e4fcb1a384e791b0e2d4` 新增 51 个提交，419 个文件变化，版本仍为 0.3.0。WheelPlay 不是本次 DiPlay 主线合并的第二个父提交；其适配必须单独审查和验证。

## 本次 DiPlay 主线改动

完整上游条目及各项真机边界见 [RELEASE-NOTES-NEXT.md](RELEASE-NOTES-NEXT.md)。与 Tesla 共用路径有关的变化包括：

- USB 迟到网络及第二次启动请求、蓝牙打开后立即重试、同局域网手工接口、连接失败原因及最近一次错误记录。
- 多指触摸固定槽位、慢连接拖动位置合并，以及避免设置手势触发底层误点。
- Android 音频时钟微调、通话结束后撤回自己的音频模式请求、默认关闭的通话采样率和导航焦点选项。不能据此宣称 Tesla 浏览器音频已实测改善。
- 设置备份完整性、滑块搜索、韩语、异步会话日志和大诊断报告展示。
- 网络输入长度/分配边界、USB 权限广播、外部 Intent、导入设置键白名单、敏感诊断日志与 APK 更新下载硬化。
- BYD、Geely/ECARX 仪表及车辆特性亦随共用源码同步；不意味着 Tesla 浏览器新增这些车辆集成或获得实车验收。

## Tesla 兼容处理

1. 同时保留上游更新资产限制（HTTPS、`github.com`、安全 APK 文件名、64 MiB 上限）及 Tesla 仓库和 `DiPlay-Tesla-` 前缀筛选；测试覆盖混合普通/CN/Tesla APK 和恶意 URL/文件名。测试用的虚拟资产 URL 改为符合新规则的 GitHub 形式，不发起真实下载。
2. 上游无首帧检测读取 Android sink 的“已收到主画面”状态，而 Tesla 视频仅交给浏览器。增加只报告帧到达、不建立本地解码器的通知，避免正常浏览器画面被误报为 iPhone 无画面。覆盖两个帧回调、迟到首帧、非主画面和后台会话接管。
3. 为新增韩语补齐 17 项 Tesla 浏览器设置文案；不降低现有全语言键覆盖测试。
4. 新增音频时钟模拟测试使用上游 13 参数私有构造器；Tesla 已有远端 PCM 回调使实际构造器为 15 参数。按现有测试模式选择非 synthetic 构造器，并显式传入未消费 PCM 的回调，保留全部音频速率/欠载/重缓冲断言，不改生产音频路径。
5. 仪表首帧测试显式清理旧 ADB 路由偏好和其他 fixture 的全局租约，避免整套测试时旧 ADB 路由同步回调清空模拟 surface。受控保留 ADB 偏好可重现“期望两次 attach、实际一次”；修复仅设置测试前提和清理，保留全部 surface attach/detach 断言，不改生产路由。
6. 保留 `335645ef` 的 Pages 原上游仓库限定条件和 `201e0185` 的 loopback-only 测试 fixture。同步网站源码不授权本 fork 部署。

7. 样例 launcher 的上游包名白名单精确加入 `com.diplay.tesla` 和 `com.diplay.tesla.debug`，恢复此前的 fork 服务发现兼容，继续拒绝未知及相似包；不扩大 manifest 权限。包名白名单不是签名认证，也不表示 Tesla 新增仪表地图支持。
8. 完整 UI 测试首次在云端出现进程 137 退出；每 50 个测试类回收 JVM 后全部 1,736 项 common 测试可完成。将此仅测试进程的内存边界记录在源码构建配置中，不筛选测试、不关闭报告、不更改断言。

## 验证与发布边界

DiPlay 同步及 Tesla 兼容代码 `b8c6c09e7b3e86796dddf3ae056c05a33dfc52d1` 的完整源码门禁已通过，后续仅补充本验证记录：

- 完整 `AGENTS.md` / Android workflow 命令及 browser、tesla 额外目标：**3,596 项测试，3,595 通过，0 失败、0 错误、1 条件跳过**。模块为 shared 1,787、common 1,736、home 14、browser 48、tesla 11。唯一跳过为当前云环境没有可绑定的 link-local IPv6 地址（`CarPlayVpnListenerScopeTest.selectedHostInterfaceScopesALinkLocalAddressThatBinds`）；未删除测试断言。
- mobile、home、maphost、browser、tesla 五项 debug lint 与 mobile/home/maphost/tesla 四个普通 debug APK 构建通过；Tesla RTC 原生库在 arm64-v8a、armeabi-v7a、x86_64 均成功构建并打入 APK。
- Node **68/68**、公开源码检查、JS 语法与静态站点生成检查通过；站点生成未产生额外源码差异，未部署。
- 四个普通 debug APK 均检查为不含 `assets/offline-mfi/`。这些源码验证包不是新签名完整连接版，亦不是已安装正式包的覆盖更新。
- 在相同源码上额外以 Robolectric Native Graphics 运行三项设置截图用例（英文全尺寸、日文紧凑、阿拉伯文 RTL，130% 字体），3/3 通过并检查了实际非空像素。普通 legacy graphics 的空白截图不作为视觉通过证据。

完整门禁在 Linux/JDK 25、SDK 37、NDK 28.2、CMake 3.22.1 下执行；云测试仅额外使用官方 Mockito 测试启动 agent 和系统可信 CA/当前代理。UI 测试每 50 类回收 JVM 的设置已记录于源码，未筛选测试或关闭报告。首次全构建完成后，样例白名单补丁重跑完整命令成功（受影响 sample 测试/构建重新执行，其余合法使用 Gradle 增量缓存）。本轮 Android 结果不是从之前的提交照搬。

上述成绩只覆盖第一部分 DiPlay 同步和兼容修复；后续 WheelPlay 独立适配及 0.1.11 候选必须另行验证。远端 GitHub Actions 未在此记录中冒称已通过。

未发布 APK、未部署站点、未导入认证资产、未新增 Tesla/iPhone 真机验证。公开源码构建和云端协议测试不等同于实车验收。
