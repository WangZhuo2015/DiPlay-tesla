# Android 本机 HTTPS 入口（独立、需要 root）

用于已经 root 的 Android 主机：车机连接主机热点，Caddy 在同一主机提供 HTTPS，
转发到 DiPlay 的本地 HTTP 端口。APK、iPhone 连接、WebRTC 编码与代理分别运行。
停止 Caddy 后仍可使用 DiPlay 的直接 HTTP 入口。无需安装 Node 到 Android；Node
只在电脑生成配置。Caddy 自动转发 WebSocket；WebRTC 视频仍走车机与 Android 的
直接 UDP 连接，音乐/导航 PCM 走 WSS。这里不提供 TURN 或互联网中继。

车机只需连接 Android 热点并打开自己的域名，不需要修改车机路由或代理。
地址别名建立在 Android 上；域名解析到该地址后，车机经热点的默认网关到达本机
HTTPS 服务。电脑同时连接多个网络时，其请求可能走另一个网关；那属于电脑测试
环境，不能作为车机部署步骤。本方案不要求 Windows 配置或管理员操作。

参考实现有两种：root 主机用本机地址别名与独立 TLS 代理；无 root 主机可通过
独立 VpnService 建立本地地址，再使用非特权 TLS 端口。VPN 地址接力依赖具体
Android 固件，在其他设备上需要验证，也可能与 CarPlay 的 VPN 冲突。本目录提供
的是 root 方案，不在已有 root 地址上再叠加 VPN。

## 先准备自己的域名和证书

1. 准备自己控制的域名、覆盖该域名的有效证书链和私钥，车机必须信任签发机构。
   可用 DNS-01 签发，不要求把手机服务暴露到互联网。续期由用户自己的工具处理。
2. 域名必须解析到车辆通过热点能到达的地址。普通热点地址是否允许被车机浏览器
   访问需要现场检查；如果使用单独的 IPv4 别名，需要配置解析、Android 别名和路由。
   `addLoopbackAlias` 只在 Android 的 lo 上增加 /32 地址，不管理 DNS、VPN、热点、
   Windows 路由或 NAT。不要使用不属于自己网络方案的任意公网地址。
3. 从 [Caddy 官方发布](https://github.com/caddyserver/caddy/releases) 选择设备架构的
   Linux 二进制并验证官方校验值。安装到自己的 `directory/caddy`，设置可执行权限。
   将证书链和私钥放到配置指定的设备路径，目录限 root，私钥权限 600。
4. 在 DiPlay 的“连接 → Tesla 浏览器”确认实际 HTTP 端口。主机固件可能占用 8080，
   DiPlay 会选择后续可用端口；示例的 8081 需要按实际情况调整。

## 本地配置

把模板复制到仓库已经忽略的 `.private/https-gateway/config.json`，然后编辑：

```powershell
New-Item -ItemType Directory -Force .private/https-gateway
Copy-Item proxy/android-root/config.example.json .private/https-gateway/config.json
node proxy/android-root/config.mjs --config .private/https-gateway/config.json --output .private/https-gateway/generated
```

模板域名和 TEST-NET 地址仅作占位。`domain`、`bindAddress`、端口、设备目录、
证书路径、私钥路径及是否增加别名均可配置。上游必须是固定的
`http://127.0.0.1:PORT`；不能用这个入口请求任意地址。生成器不读取证书或私钥，
生成文件只引用设备上的路径。真实 JSON、生成文件、证书、日志和 APK 都不提交 Git。
公开仓库仅保存模板、生成器与说明，APK 不打包 HTTPS 证书或域名。

## Android 连接页显示自己的 HTTPS 入口（0.1.8+）

生成器同时输出 `tesla-https-entry.json`，仅含格式版本和 HTTPS 来源地址，
不含证书、私钥、上游或设备路径。代理安装验证通过后，将该文件和安装脚本推到
Android 临时目录：

```powershell
adb push .private/https-gateway/generated/tesla-https-entry.json /data/local/tmp/tesla-https-entry.json
adb push proxy/android-root/install-entry.sh /data/local/tmp/diplay-install-entry.sh
adb shell su -c 'sh /data/local/tmp/diplay-install-entry.sh com.diplay.tesla /data/local/tmp/tesla-https-entry.json'
```

多个 ADB 设备连接时为每条命令指定 `-s 目标设备`。脚本检查应用私有目录、UID、
元数据格式与符号链接，将文件安装到该应用的 `no_backup` 目录，权限 600，
不修改路由、代理、热点或 CarPlay。调试 APK 使用 `com.diplay.tesla.debug`。

重新打开 Android“连接 → Tesla 浏览器”，摘要、地址列表和“复制链接”优先使用
配置中的 HTTPS 域名。直接 HTTP 地址仍用于独立排障。移除私有目录中的该元数据
文件即恢复原有地址显示。无效配置退回直接地址；不自动绕过证书校验或重连 iPhone。
这个文件只改变入口显示，域名可达性与证书仍由独立 Android 代理负责。

## 验证后安装

通过 ADB 将生成文件推送到临时目录，以 root 执行：

```sh
/data/local/diplay-https/caddy validate --config /data/local/tmp/Caddyfile --adapter caddyfile
```

命令中的路径按自己的目录替换。验证通过后备份旧配置，复制 Caddyfile 到
`directory/Caddyfile`，复制启动脚本到 Magisk 的
`/data/adb/service.d/diplay-https.sh` 并设置权限 700。更新已有代理时，只停止 PID 文件
记录且 `/proc/PID/cmdline` 确认为该目录 Caddy 的进程，再运行启动脚本；不要停止
DiPlay 或所有 Caddy 进程。验证失败保留原配置。证书续期后同样需要重启代理。

用车机打开 `https://自己的域名`（非 443 端口需要写 `:端口`），使用手机上的
六位配对码。HTTP 与 HTTPS 是不同浏览器来源，首次可能需要重新配对。证书有效、
域名匹配、路径可达三项都需要满足；不要绕过证书报错。

检查 HTTPS 页面是否使用当前 APK 的 `app.js`、`display-presets.js` 和音频脚本。
不要用旧项目的静态文件覆盖这些资源。代理保留配对认证，并先拒绝外部 Origin，
再将同源请求转为 Android 上游 Origin。CSP 的 WebSocket 地址改成入口的 WSS。

配置语法参考 [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
和 [TLS](https://caddyserver.com/docs/caddyfile/directives/tls)。无 root 的 Android
可使用外部网关或独立 Node 代理；该方案不在 APK 内申请 VPN 或 root 权限。
