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

最新状态栏修复后的本地 Android Release/R8 产物：`dist/android/vana-0.7.0-android-release.apk`（SHA-256 `418081f6b84ccb40c06924244474cbfd1ff3ff2752fded44f71ae5862835fac7`），AAB（SHA-256 `6d71ab741a2e5da0108fefe97766c43c8ee2078be2b060000d1410f2d9418599`）。包名 `com.vana.no_visitors.preview`，标签 Vana Preview，使用 Android Debug 测试证书，不是正式签名。最新包通过 universalRelease JNI 检查，APK/AAB 签名指纹一致，校验脚本拒绝错误的预期签名。此前 `7a46210` 包已在解锁设备上验证访客首次进入、创建/保存/阅读保护、历史差异、确认恢复（数字正文 `111222` → `111`）。最新版原位更新、force-stop/relaunch 后默认打开 Welcome；从文档库选回标题 `111222` 的测试文档，UI 正文确认为 `111`，恢复的持久化回读通过。真机截图发现 Android edge-to-edge 时 CSS safe-area 为零，系统状态栏覆盖顶部工具栏；已在 Activity 内容根视图处理系统栏/屏幕切口的原生 Insets，并向 WebView 继续转发 IME Insets。修复后的 Release/R8 包构建、JNI、APK/AAB 测试签名和原位安装通过，截图及 WebView bounds `[0,128,1440,3037]` 确认顶部工具栏与底部内容均避开系统栏。编辑模式下点击正文，IME 正常出现（`mInputShown=true`），返回关闭键盘，再切回阅读模式成功。设置页导出空间备份成功，系统分享 `android/com.android.internal.app.ChooserActivity` 打开后取消，未选择外部分享目标。备份复制导入、文档多格式分享、Keystore 真实登录仍待验收。

Linux 隔离 XDG 空间的真实应用中已验证编辑、保存、历史差异和确认恢复：保留当前标题，SQLite 正文回读为恢复前版本，content_generation 为 1，并保留恢复前正文的历史。结束进程后的 SQLite 回读也通过；后续应用重启因当前 X11 display 不可访问而启动失败，不能把数据库回读宣称为原生重启验收通过。正常关闭保存与导出仍待验收。

`021a6f8` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38451662971) 全部通过：项目检查及 Linux/Windows/Android 预览构建，包含 Android minified Release 分享/Keystore JNI 验证。

设备解锁后，Android Preview 首次使用复现同路径导航问题：访客继续已保存 onboarding 状态，但根路径没有变化，应用门控没有重新读取状态，停留在欢迎页。Linux CI 原生包在隔离 XDG 目录中也复现。修复为成功导航均更新 navigationVersion，应用按该版本刷新门控；同路径不重复加入浏览器历史。访客继续失败也显示可重试错误。欢迎页移除访客“Hosted 总存储 0 B”误导，明确离线/修改记录/备份能力；未配置同步时登录/注册不可用，并说明设置入口。浏览器真实 React + 模拟 IPC 的首启回归通过；`7a46210` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38454445319) 和 `cbd6126` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38456100517) 均全部通过，包括前端/native/独立 PostgreSQL 行为检查、Linux/Windows/Android 构建及 Android Release JNI。最新本地 Preview 包已原位更新安装并启动，未清除测试空间、未覆盖原有 Vana。

本地 `.env.local`、CLI 关联和原有应用数据库 URL 均指向项目 `csacipzifjwlyqroojho`。项目此前暂停，用户恢复后重新检查：Auth health/settings 均 HTTP 200；邮箱注册允许，但需要邮箱确认。零行文档字段查询 HTTP 400 / `42703`，`documents.revision` 尚不存在，新同步协议迁移未完成。当前 CLI 迁移列表仍返回 403，账号项目列表未包含此项目，无法完成有权限的备份/迁移。只查询配置、权限及零行 schema，没有读取原有会话或用户正文。

用户已授权测试通过后推送和发布。已修正 Release 流程：公开 Supabase 构建变量、只读 schema gate、Android 环境签名及 APK/AAB 指纹验证、Windows 从实际证书导出指纹并传入 Tauri/验证产物、Windows 原生构建归档平台判断、准确的 Vana 发布说明和迁移提醒。GitHub 公开 Variables 已配置当前 anon URL/key，不含特权密钥；发布 gate 实测因未升级 schema 拒绝当前环境。Windows 本机证书是自签名且未过期，不代表受商业 CA 信任；正式产物验证尚需运行发布工作流。新增手动签名构建入口，仅上传 artifacts，不创建 Release；仅 tag 才要求 main 与 Hosted schema gate，真实同步仍为发布的人工验收条件。

新增脚本已通过 Python/Node 语法、Release YAML 解析与 Bash 语法检查；缺配置、service_role、secret key、项目不匹配均被拒绝；前端类型检查和 22 个行为测试通过。

真实 Supabase 两账号/两端验收、Windows 实机与正式签名尚未完成；未部署生产迁移、合并 main、创建发布标签或 Release。`git diff --check` 通过；全仓 `cargo fmt --check` 仍存在历史及当前文件格式差异，不是本轮 CI 必需项，未做全仓格式重写。

完整路线保持 [ROADMAP](ROADMAP.md) 的五个工作包。当前完成的是本地实现和验证准备；全路线验收仍在进行。附件按路线保留在第 5 包，云附件需要前四包验收及服务端配额/权限/重试/孤儿清理，当前不开启云附件。
