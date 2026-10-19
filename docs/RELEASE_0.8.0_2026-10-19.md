# 0.8.0 公开发布 · 2026-10-19

0.8.0 已于 `2026-10-19T16:58:24Z` 公开发布。GitHub 最新 Release 为本版本，非 Draft、非 Prerelease；产品成熟度仍为 Beta。

- [GitHub Release 与校验文件](https://github.com/oneder2/Vana/releases/tag/v0.8.0)
- [官网与下载](https://vana.gellaronline.cc/)
- [更新说明](RELEASE_NOTES_0.8.0.md) · [文字冲印与信稿工坊](LETTERPRESS_STUDIO.md)
- [正式构建流水线](https://github.com/oneder2/Vana/actions/runs/39285957462)
- [主线验证](https://github.com/oneder2/Vana/actions/runs/39285881754) · [官网检查](https://github.com/oneder2/Vana/actions/runs/39285956814)

## 源码与功能

功能提交 `a6cb9c2` 与版本、路线图提交 `3f8d300` 经 [PR #7](https://github.com/oneder2/Vana/pull/7) 合入主线。标签 `v0.8.0` 固定在 `47b4d549334dd11810c48748768b272391ce5fe5`，未移动已有标签。

本次交付可嵌入文档、重新编辑的文字冲印与信稿组件，以及五种介质、字体与排版、材质适配痕迹、图层和撤销重做；修复越出有效纸面后手势卡住的问题，细化介质与痕迹质感，让底部操作栏和预览背景跟随主题。桌面选区和 Android 原生文字选择菜单可进入文段分享与信稿制作。保存、修改记录、空间备份、可选同步及文档导出支持信稿内容块。

本次无需数据库迁移。0.7.x 不支持信稿内容块，含信稿文档应在各设备升级到 0.8.0 后同步；升级前建议导出空间备份。

## 校验与正式产物

本地发布检查和最终标签流水线均通过：版本及锁文件一致性、类型检查、38 项前端行为测试、35 项原生领域测试、数据库协议回归、前端生产构建、Rust 检查、图标资源检查和生产依赖审计。协议回归包含条件写入、幂等、事务回滚、分页、账号边界、RLS 及并发写入。生产 npm 依赖审计为零告警；完整开发工具链的既有 7 项告警未在本次升级。

Supabase 只读发布检查中，Auth health、Auth settings 和零行文档结构查询均返回 HTTP 200。本次没有重新执行真实双账号认证与同步全流程，不能用只读健康检查替代此前的真实同步验收。

三个平台正式构建全部成功。下载全部 CI 产物后，逐个比对 Release 附件大小及 GitHub SHA-256，8 个附件均一致；额外上传覆盖这 8 个文件的 `SHA256SUMS.txt`，Release 共 9 个附件。

| 平台 | 格式与核验 |
| --- | --- |
| Linux x86_64 | AppImage、DEB、RPM 齐备；DEB 元数据为 0.8.0 / amd64 |
| Windows x86_64 | EXE、MSI 齐备；CI 验证安装包及应用 EXE 的 Authenticode 签名与预期证书 |
| Android arm64 | APK、AAB 齐备；CI 与本地复验正式签名，源码、构建 run ID 和清单哈希一致；CI 验证压缩后 JNI 契约 |

Android 包名为 `com.vana.no_visitors`，版本为 0.8.0/code8000，最低 API 24，目标 API 36，无相机权限。APK 与 AAB 正式签名证书 SHA-256 均为 `df2e35d9b993cd0f9f3663e9563623316db271905e7b3bf859a2101010c9d089`，与 0.7.1 一致。正式 APK SHA-256 为 `dcad70b086c3634fdef7ce8af2905181e41a1f65e616cb47bba9d7352a3316c3`。

## 原生验收边界

发布前的 OnePlus Preview 体验包已由用户实际操作并确认；手势、原生选择菜单、嵌入、重开编辑、导出及主题质感的具体证据见工坊说明。这些结果来自独立 Preview 包，不等于本次正式 0.8.0 包的设备升级验收。

本次 OnePlus 未连接。独立 Android 模拟器多次未能稳定完成系统启动，0.7.1 基线安装尝试返回设备仍在启动；因此没有形成正式 0.7.1 → 0.8.0 覆盖升级与数据保留的成功证据。原有 AVD 数据和已连接实体手机未被清除或覆盖；本次新建的测试 AVD 已删除。正式签名一致性已验证，正式包的原生设备覆盖升级仍需补验。

Windows 沿用项目自签名证书；签名完整性检查不代表系统认可发行者。本次没有新增 Windows 真实桌面安装升级证据。

## 官网与下载

公开 Release 后，使用既有官网生成器原子更新至 `/var/www/vana/releases/site-v0.8.0-ef0a87b61c8d8299`。官网运行源码和 Nginx 路由未改变；Nginx 与 `vana-site-refresh.timer` 均为 active，定时更新最近结果为 success。

公网首页和 `/release.json` 提供 0.8.0；清单的发布时间、Release 链接及六种下载格式的名称、大小和 SHA-256 与正式 Release 一致。六种下载链接跟随重定向后的 HEAD 均返回 HTTP 200。

## 后续阶段

按用户确定的节奏执行：0.8.x 增加新功能，0.9.x 完成最后一轮前端界面优化，验收后正式发布 1.0.0。个人预设、文字组件和介质自定义是功能候选，具体取舍根据试玩反馈确定；详见 [开发路线](ROADMAP.md)。
