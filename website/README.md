# Vana 官网

线上：<https://vana.gellaronline.cc/>。官网提供介绍、三个平台下载、安装帮助和版本说明入口；安装文件始终来自 `oneder2/Vana` 的正式 GitHub Release。Preview 不进入默认下载入口。

页面使用静态 HTML / CSS 和约 1.5 KB 的浏览器增强脚本，没有 Node 服务、前端运行时框架、远程字体或客户端 GitHub API 请求。无需 JavaScript 也能下载和展开安装帮助。文档对照是交互示意，已在页面标注。

## 本地预览与检查

```bash
python3 -m unittest discover -s website -p 'test_*.py'
node --check website/site.js
bash -n website/deploy.sh website/deploy/install-host.sh
python3 website/build.py
python3 -m http.server 3091 --directory website/output/current
```

生成器从公开 `/releases/latest` 读取正式版本，校验版本标签、日期、附件名称、来源、文件大小和 GitHub SHA-256。草稿、预发布、缺少附件或哈希的响应会失败；已有页面不会被替换。所选六种格式为 Windows EXE / MSI、Android APK、Linux AppImage / DEB / RPM。若未来更改附件命名或平台清单，需要更新 `build.py` 的选择规则。

每次生成一个完整目录，包含 HTML、`release.json`、CSS、JS 和图标；只有生成成功才原子切换 `current`。相同版本和源码重复检查不产生新目录。`release.json` 提供版本、发布日期、文件 URL、大小、SHA-256 和平台信息。

## 部署

```bash
bash website/deploy.sh
```

目标固定为 SSH `Gellar` 和 `vana.gellaronline.cc`。首次部署需要主机已有 Nginx、Python 3、可用的 Cloudflare DNS 和覆盖该域名的 `/etc/nginx/ssl/origin.pem` 证书。部署在提交源码后执行，使服务器目录标记对应 Git 提交。

- 源码：`/opt/vana-site/releases/<部署 ID>`，`/opt/vana-site/current` 指向生效源码。
- 页面：`/var/www/vana/releases/<内容摘要>`，`/var/www/vana/current` 指向当前完整页面。
- 路由：`/etc/nginx/sites-available/vana`，由 `sites-enabled/vana` 启用。
- 更新：`vana-site-refresh.service` 与 `vana-site-refresh.timer`。每刻钟检查一次，加最多 30 秒随机延迟，重启后也会检查；服务以 `gellar` 用户运行，只可写官网页面目录。
- 回退资料：`/opt/vana-site/backups/<部署 ID>`。保留上一个源码与页面指针、Vana 站点配置及定时任务文件。

SSH 账号可使用免密 sudo 时，部署脚本使用 sudo。当前 Gellar 的账号已有 Docker 管理权限，使用已有 `alpine:3.20` 镜像运行一次性容器，通过 host namespace / chroot 执行明确的安装脚本；不添加管理员账号、不保存密码、不安装常驻容器。脚本先备份并核对其他 Nginx 站点，再写入独立路由、校验、平滑重载和验证源站；失败恢复原 Vana 指针与配置。临时目录保留以便排查，定期检查磁盘占用。

Cloudflare 对外提供可信 HTTPS，源站使用 Cloudflare Origin CA 证书。只有本机源站验收使用 `--insecure`；公网验收正常校验证书。源站只返回官网资源，未知路径 404，不暴露部署源码、测试文件或应用数据。

查看运行状态：

```bash
ssh Gellar 'systemctl list-timers vana-site-refresh.timer --no-pager'
ssh Gellar 'systemctl show vana-site-refresh.service -p Result -p ExecMainStatus'
```

发布新应用版本仍走 GitHub 的原发布流程：准备、验收、签名、发布 Release；服务器下一次检查自动更新官网。网络或限流失败保留上一版，通过服务日志排查。升级客户端的签名密钥仍由原应用发布流程管理，官网不参与重新构建或签名。

## 回退

回退前检查备份和当前指针，防止覆盖后续更新。由主机管理员先停止 `vana-site-refresh.timer`，再按备份中的 `source-link` 与 `site-link` 原子恢复两个 `current` 指针；需要回退站点配置时，只恢复 Vana 的站点文件，`nginx -t` 通过后 reload。历史目录无需删除。

如果希望官网下载暂时停留在旧版本，应保持定时任务停止，否则下一次检查会重新指向 GitHub 最新正式版本。客户端是否允许降级需另外验证，官网回退不代表安装包可直接覆盖降级。

部署验收与边界见 [官网上线记录](../docs/WEBSITE_DEPLOYMENT_2026-10-14.md)。
