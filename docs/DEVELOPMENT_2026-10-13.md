# 数据恢复与可信同步开发记录

延续用户确认的优先级：让修改记录可查看，便于追溯；保留 Vite + React 19 + Tiptap + Tauri 2 架构。

## 已实现

- 正文差异：所选版本 → 打开记录时正文，中文/emoji 增删明确显示；格式变化提示切换排版预览，大范围变化使用有界计算。
- 正文恢复：预览正文 + content_generation 双重校验，IMMEDIATE 事务保留当前正文、更新代次和 outbox；相同版本无额外写入。草稿先保存，恢复期间禁用编辑和返回中断。
- 空间备份 v1：一致性快照、白名单字段、隔离验证、摘要预览、新 ID 复制导入；损坏/非法树拒绝整次写入，所有写入及额度检查原子回滚。
- 冲突查看：本机记录原文关联，列表传摘要，按需读取两份正文；旧/其他端副本按名称提示发现，不能推断缺失的原文关联。“已查看”保留正文。
- UI：时间线和差异面板，短暂淡入、键盘焦点、移动端布局、reduced-motion；参考 React Bits FadeContent/AnimatedList，应用内改编，许可随源码和打包资源保留。
- Auth：Rust 认证和系统凭据存储，前端没有 refresh token DTO；旧 SQLite 会话在系统存储写入回读成功后迁移与清理。Linux/Windows/Android 适配均有代码；真实平台认证仍需验收。
- 渲染：生产 CSP、支持的正文结构/属性/链接限制，以及 HTML/Typst/DOCX 排版参数白名单。
- CI：发布 tag 验证行为测试；dev Android 使用独立 Preview 包名、临时测试签名、Release/R8，并验证分享和 Keystore 两条 JNI 签名。

## 验证与边界

已执行：22 个 frontend 行为测试、33 个 native 回归、TypeScript 检查、Rust check、frontend build；独立 PostgreSQL 迁移、CAS/幂等/回滚/分页/RLS 和并发会话回归；Linux Secret Service 探针。

浏览器真实 React/Tiptap + 模拟 IPC：恢复 8 场景、备份/冲突 8 场景、移动端 8 场景、恢复忙态和凭据失败 5 场景、四主题 4 场景。浏览器验证不代替真实 SQLite 或 Supabase；原生回归包含重建 AppHandle 后回读，仍不等同于三平台应用重启证据。

最终 Android Release/R8 构建成功；最终 universalRelease mapping 和 DEX 中的分享、Keystore JNI 签名均通过检查。构建目录中的 arm64Release 属于早先旧包，不代表本轮最终产物；验证最终包时明确传入 universalRelease mapping。两份参考许可的压缩资源均与源码一致，并已确认嵌入 APK 的原生库。

产物：`dist/android/vana-0.7.0-android-release.apk`（SHA-256 `7a6a8caf95b6029a8226a6475fa487e0ad0a9d601ff47f2b4b57b334cb03d4da`），AAB（SHA-256 `9080acfe88f57ae5d35e738ab005f96a89d09423d6ee7b4281ca27472ba8168d`）。包名 `com.vana.no_visitors.preview`，标签 Vana Preview，使用 Android Debug 测试证书，不是正式签名。已安装到连接设备，未覆盖原有 Vana；设备锁屏，尚未完成交互、重启、分享或 Keystore 真机验收。

dev 三平台 CI 的结果在完成后补记。真实 Supabase 专用项目、两账号/两端验收、Windows 实机与正式签名尚未完成；未部署生产迁移、合并 main、创建发布标签或 Release。`git diff --check` 通过；全仓 `cargo fmt --check` 仍存在历史及当前文件格式差异，不是本轮 CI 必需项，未做全仓格式重写。

完整路线保持 [ROADMAP](ROADMAP.md) 的五个工作包。当前完成的是本地实现和验证准备；全路线验收仍在进行。附件按路线保留在第 5 包，云附件需要前四包验收及服务端配额/权限/重试/孤儿清理，当前不开启云附件。
