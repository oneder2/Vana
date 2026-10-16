# 0.7.1 公开发布 · 2026-10-16

0.7.1 已于 `2026-10-16T22:52:39Z` 公开发布，GitHub `/releases/latest` 与官网均指向本版本；不是 Draft 或 Prerelease。产品仍处于 Beta 阶段。

- [GitHub Release](https://github.com/oneder2/Vana/releases/tag/v0.7.1)
- [官网与下载](https://vana.gellaronline.cc/)
- [正式构建流水线](https://github.com/oneder2/Vana/actions/runs/38975623114)
- [主线校验](https://github.com/oneder2/Vana/actions/runs/38975608481) · [官网检查](https://github.com/oneder2/Vana/actions/runs/38975608421)

## 源码与产物

已验收候选通过 [PR #6](https://github.com/oneder2/Vana/pull/6) 合入主线，标签 `v0.7.1` 指向 `7f93bdb14f8513364cce0f6e31579e10b3381729`。合并树与最终候选 `2208aaa` 完全一致。附件实验分支未合入，本次无新数据库迁移。

标签流水线全部成功：前端行为、原生领域、数据库协议、线上 Supabase 只读发布检查、图标、生产依赖审计和编译通过，再生成 Linux、Windows、Android 正式产物。详细功能验收沿用 [上线前自检](RELEASE_READINESS_2026-10-15.md)，没有用此次构建替代先前的真实双账号同步验收。

Release 包含 7 个安装/分发文件、Android 构建清单和 `SHA256SUMS.txt`，共 9 个附件。发布前下载各平台 CI 产物，逐个核对 GitHub 附件大小与 SHA-256，全部一致；统一校验文件覆盖前 8 个附件。

| 平台 | 正式格式 | 核验 |
| --- | --- | --- |
| Linux x86_64 | AppImage、DEB、RPM | 三格式完整；DEB 元数据为 0.7.1 / amd64 |
| Windows x86_64 | EXE、MSI | CI 验证应用 EXE、EXE/MSI 签名及预期证书指纹 |
| Android arm64 | APK、AAB | CI 与本地复验签名；清单的源码、run ID、文件哈希一致 |

Android 包名为 `com.vana.no_visitors`，版本为 0.7.1/code7001，最低 API 24，目标 API 36；权限中没有相机。正式签名证书 SHA-256 为 `df2e35d9b993cd0f9f3663e9563623316db271905e7b3bf859a2101010c9d089`，与公开版 0.7.0 一致。正式 APK SHA-256 为 `9646fa90ab81603d5526f77d039eb2f526b1d095e4861d662053e3000beefa1d`。

## Android 升级抽查及边界

在独立 Android 36.1 x86_64 模拟器中，通过系统 ARM64 转译安装从 GitHub 下载的正式 0.7.0，进入访客空间，在正文写入唯一测试标记。关闭应用并重启后，正文完整回读。

随后用最终标签流水线的正式 APK 执行覆盖安装。模拟器系统进程多次超时并断开连接，安装命令最终返回 Broken pipe，因此不将这次过程记为无中断的安装命令验收。保留同一 AVD 数据重启后，包管理器确认版本已为 0.7.1/code7001，首次安装时间不变；实际打开正式 0.7.1，旧正文和测试标记完整保留，新账号按钮可见，旧阅读提示已移除。真实点击账号入口后显示独立认证页面，切换设置后显示主题与备份选项，无密码表单。升级后的安装状态、正文保留和账号/设置分离得到验证；无中断升级流程仍需在原生设备补验。

当前连接的 Pixel 9a 中，包名为 `com.vana.no_visitors` 的 0.7.0 使用 Android Debug 证书，不能覆盖为正式证书版本。本次没有卸载、清数据或覆盖手机上的现有安装；独立 Preview 的既有真机验收见前述自检。

## 官网与公网验证

公开 Release 后，以既有 `gellar` 账号执行官网生成器，原子更新页面至 `/var/www/vana/releases/site-v0.7.1-91f81cea677ab009`。官网运行源码未改变，未修改 Nginx 路由或其他站点。

公网 HTTPS 首页与 `/release.json` 均可访问，清单显示 0.7.1、正确发布时间及 Release 链接，六种下载格式的大小与 SHA-256 均和正式文件一致。对六个公开下载链接跟随重定向执行 HEAD，全部返回 HTTP 200。Nginx 与 `vana-site-refresh.timer` 保持 active，后续仍每 15 分钟检查最新公开版本。

## 保留限制与下一步

- Windows 使用项目自签名证书，签名完整性已验证，不代表系统认可发行者；本次没有新增 Windows 真实桌面安装升级证据。
- 真实云端认证验收没有涵盖 SMTP 收件箱投递。
- 生产 npm 依赖审计为零告警；开发构建工具链的 7 项告警与既有 Rust 格式差异保留为独立维护工作。
- 本次发布记录不承诺端到端加密、附件云上传、多人权限或实时协作。

后续优先处理日常写作、保存反馈和手机布局的实际问题，并补齐原生设备的正式签名升级记录；详见 [开发路线](ROADMAP.md)。
