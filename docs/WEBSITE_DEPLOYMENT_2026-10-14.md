# Vana 官网部署验收

2026-10-14 部署至 SSH `Gellar`（`198.23.246.114`），域名 <https://vana.gellaronline.cc/>。未修改应用正式 Release、数据库、已有站点内容或 TLS 密钥。

## 首次部署配置（历史记录）

- 部署源码：`/opt/vana-site/releases/web-20261014T174242Z-566f673`。
- 源码指针：`/opt/vana-site/current`。
- 页面指针：`/var/www/vana/current` → `releases/site-v0.7.0-965a14612c93c5c2`。
- 独立 Nginx 站点：`/etc/nginx/sites-available/vana`。
- `vana-site-refresh.timer` 按每刻钟执行，随机延迟最多 30 秒；服务以非 root 用户 `gellar` 运行。手动检查任务返回成功，重复生成保持同一页面指针。
- 当前官网版本 `v0.7.0`；所有六种安装格式来自已公开的正式 Release。

官网源码单独基于 `origin/main` 建立 `feat/website` 分支，没有带入应用 UI 的草稿改动。外观使用最新图标作为独立品牌资源，示意正文明确标为“交互示意”。

## 验证

- 5 项离线生成器检查通过：拒绝草稿、预发布、错误版本标签、不完整或重复附件、错误下载来源、缺少哈希与未上传文件；更新失败保留当前页面；重复生成幂等。
- 通过 Playwright CLI 在真实 Chrome 上检查本地和 Cloudflare 公网页面。320 / 390 / 768 / 1440 宽度无横向溢出；修改对照切换、安装帮助锚点展开、键盘跳转、减少动画与无 JavaScript 下载和帮助均通过；没有页面 JavaScript 异常。
- 公网 HTTPS 返回 200，证书验证正常；清单与本地生成内容一致；公网 CSS、JS 和图标逐字节匹配；未知路径返回 404。
- 六个 GitHub 附件的 HEAD 请求均返回 200，大小与清单一致；清单保留 GitHub API 的 SHA-256，没有重新生成安装包。
- Nginx 配置检查通过，服务和平滑重载正常。部署前后其他虚拟主机配置的 SHA-256 一致。
- 两次早期部署检查触发回退：一次因容器进程命名空间无法访问主机 systemd；一次因 Nginx 重载后首个请求仍进入旧进程。已分别修复 host PID namespace 与等待新 worker 的健康检查，最终部署成功，备份保留。

证据在工作区 `output/website/`：桌面/手机公网页面截图、六个下载地址检查 JSON。设计与维护命令见 [网站说明](../website/README.md)。

## 边界

本机所用 DNS 未能解析该域名，因此本机公网验收使用权威 DNS 返回的 Cloudflare 地址进行 hostname mapping，仍正常校验域名证书；服务器通过普通域名请求返回 200，Cloudflare 权威 DNS、1.1.1.1 与 8.8.8.8 均返回该域名的公网记录。未修改本机或服务器全局 DNS。

Cloudflare 注入的统计脚本被官网 `script-src 'self'` 策略拦截，浏览器控制台有对应 CSP 日志；它不影响官网交互或下载，也未为它开放第三方脚本权限。

本轮没有下载并重新安装六种正式安装包，附件检查到真实 URL 状态、文件大小与 GitHub 哈希记录。新版本更改平台或附件命名时需更新生成器；此前下载清单继续服务，失败任务通过 systemd 日志排查。没有增加 CDN 安装包镜像。


## 动效改版 · 当前生效配置

2026-10-14 按新版视觉要求更新官网。源码提交 `b7f814d`，部署目录 `/opt/vana-site/releases/web-20261014T183053Z-b7f814d`；页面指针 `/var/www/vana/current` → `releases/site-v0.7.0-c84bd36ba346515a`。备份在 `/opt/vana-site/backups/web-20261014T183053Z-b7f814d`。

首屏使用深蓝、青紫配色，改编 React Bits Aurora WebGL 着色器，加入轨道流光、标题入场和悬浮文档；能力与下载区域使用指针聚光和滚动显现。示意窗口仍明确标注用途。原许可随网站分发，不新增运行时框架、远程依赖或 Node 服务。动效脚本约 14.4 KB，首屏画布上限约 65 万像素、1.25 DPR 和 30fps；这些是预算上限，不是设备实际帧率承诺。

新增可记住选择的暂停按钮；遵循动态减少动画偏好。首屏离屏及标签页隐藏时停止持续渲染。无 WebGL 保留静态光晕，无 JavaScript 保留静态页面、下载和原生安装帮助。

验收结果：

- 5 项生成器边界检查、两份 JS 语法和部署脚本语法检查通过；生成器完整打包动效脚本与许可。
- Chrome 本地实测真实着色器编译、绘制与时间推进、聚光、手动暂停/恢复、选择持久化、离屏暂停/回到首屏恢复、动态减少动画、无 JS 和无 WebGL 退路通过。严格 CSP 下无新增违规。
- Chrome 公网实测极光、聚光、暂停、正文修改对照、六个正式附件链接、安装帮助锚点、键盘跳转、减少动画与无 JS 使用均通过，无页面 JS 异常。320 / 390 / 560 / 768 / 1024 / 1440 宽度无横向溢出。
- 公网 HTML、清单、CSS、两份 JS、图标和许可逐字节匹配本地构建；HTTPS 200、未知路径 404。自动刷新服务返回 `Result=success` / `ExecMainStatus=0`，定时器和 Nginx 运行正常；其他虚拟主机配置摘要保持一致。

截图与资源摘要保存在工作区 `output/playwright/`：`motion-desktop.png`、`motion-mobile.png`、`motion-history.png`、`public-motion-desktop.png`、`public-motion-mobile.png`、`public-resource-check.json`。截图为静止帧，动效生命周期另行用浏览器实测。公网 DNS 映射及 Cloudflare 统计脚本被 CSP 拦截的边界与初次部署相同。
