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

最新状态栏修复后的本地 Android Release/R8 产物：`dist/android/vana-0.7.0-android-release.apk`（SHA-256 `418081f6b84ccb40c06924244474cbfd1ff3ff2752fded44f71ae5862835fac7`），AAB（SHA-256 `6d71ab741a2e5da0108fefe97766c43c8ee2078be2b060000d1410f2d9418599`）。包名 `com.vana.no_visitors.preview`，标签 Vana Preview，使用 Android Debug 测试证书，不是正式签名。最新包通过 universalRelease JNI 检查，APK/AAB 签名指纹一致，校验脚本拒绝错误的预期签名。此前 `7a46210` 包已在解锁设备上验证访客首次进入、创建/保存/阅读保护、历史差异、确认恢复（数字正文 `111222` → `111`）。最新版原位更新、force-stop/relaunch 后默认打开 Welcome；从文档库选回标题 `111222` 的测试文档，UI 正文确认为 `111`，恢复的持久化回读通过。真机截图发现 Android edge-to-edge 时 CSS safe-area 为零，系统状态栏覆盖顶部工具栏；已在 Activity 内容根视图处理系统栏/屏幕切口的原生 Insets，并向 WebView 继续转发 IME Insets。修复后的 Release/R8 包构建、JNI、APK/AAB 测试签名和原位安装通过，截图及 WebView bounds `[0,128,1440,3037]` 确认顶部工具栏与底部内容均避开系统栏。编辑模式下点击正文，IME 正常出现（`mInputShown=true`），返回关闭键盘，再切回阅读模式成功。设置页导出空间备份成功，系统分享 `android/com.android.internal.app.ChooserActivity` 打开后取消，未选择外部分享目标。随后已完成备份复制导入和重启回读：非法孤儿目录整次拒绝，合法三层目录、标签及正文记录先预览后导入；重启后可逐层找到正文，历史仍可预览。Markdown、DOCX、PDF 均生成文件并打开系统 Chooser 后取消，没有向外部目标发送。真实账号登录和进程重启后会话读取通过，未出现 Keystore 错误；当前仍是 Preview 测试证书包，不能替代正式签名设备验收。

Linux 隔离 XDG 空间的真实应用中已验证编辑、保存、历史差异和确认恢复，SQLite 保留恢复前正文的历史。当前 X11 已恢复可用：使用包含 Hosted 配置的 `7c342f7` 原生包真实登录自建测试账号，经应用同步拉取正文；正常关闭并重启后会话与正文回读通过。SQLite 会话摘要中的 access/refresh token 均为空。随后 Linux 修改上行、Android 下行，以及 Android 修改上行、重启后的 Linux 下行均通过，两端待同步为 0。Linux Markdown、DOCX 和 PDF 原生导出均成功；Markdown 文本、DOCX OOXML 正文和 PDF 经 pdftotext 提取的正文均与测试文本一致。原生空间备份包含两份并发正文与 7 条保留历史，且不含会话字段。

新增 `tests/native-core/examples/live_auth_probe.rs` 使用生产 Rust Auth/SQLite 模块与真实系统凭据实现，在独立 Secret Service 和临时目录运行。真实登录、无明文 token 的 SQLite 摘要、重建 AppHandle 后读取、refresh 后凭据 ID 替换与旧凭据删除、logout 清除凭据/摘要并切回访客均通过。此探针不是完整应用进程重启证据；应用重启由上一段的原生 UI 场景另行确认。

`021a6f8` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38451662971) 全部通过：项目检查及 Linux/Windows/Android 预览构建，包含 Android minified Release 分享/Keystore JNI 验证。

设备解锁后，Android Preview 首次使用复现同路径导航问题：访客继续已保存 onboarding 状态，但根路径没有变化，应用门控没有重新读取状态，停留在欢迎页。Linux CI 原生包在隔离 XDG 目录中也复现。修复为成功导航均更新 navigationVersion，应用按该版本刷新门控；同路径不重复加入浏览器历史。访客继续失败也显示可重试错误。欢迎页移除访客“Hosted 总存储 0 B”误导，明确离线/修改记录/备份能力；未配置同步时登录/注册不可用，并说明设置入口。浏览器真实 React + 模拟 IPC 的首启回归通过；`7a46210` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38454445319) 和 `cbd6126` 的 [dev CI](https://github.com/oneder2/Vana/actions/runs/38456100517) 均全部通过，包括前端/native/独立 PostgreSQL 行为检查、Linux/Windows/Android 构建及 Android Release JNI。最新本地 Preview 包已原位更新安装并启动，未清除测试空间、未覆盖原有 Vana。

本地配置、CLI 关联和应用 Hosted URL 均指向 `csacipzifjwlyqroojho`。用户恢复项目并重新登录 CLI 后，项目为 ACTIVE_HEALTHY，权限生效。已先私有备份 public 与 migration schema/data，再在隔离的官方 PostgreSQL 17.11 容器恢复，确认 13 个原有文档、0 个附件，非法树/正文计数为 0；应用最新迁移并重复执行后，原有文档语义保持。随后实际部署 `202610120001_revision_sync.sql`，四项本地/远端迁移完全一致；只读发布 gate 的 Auth health/settings 与零行 Document schema 均 HTTP 200。备份在 git 忽略的 `secrets/backups/` 内，原有会话与用户正文未输出。

`scripts/test-supabase-live.py` 已在真实服务创建两枚自建隔离账号，完成注册确认、密码登录、refresh、logout、1,201 节点及三层目录、500/500/201 固定快照、跨账号 RLS/RPC 隔离、CAS 并发、整批回滚、丢确认幂等、子树移动/删除和 purge 防复活。协议请求使用真实 user JWT；admin key 仅创建/验证归属/清理自建账号。Admin generate_link 不发送邮件，因此验证了真实 signup token_hash 确认协议，未验证外部 SMTP 或收件箱投递。脚本审查后已用第二组自建账号完整重跑并清理成功；第一组保留供客户端验收，待全部设备场景结束再清理。

用户已授权测试通过后推送和发布。已修正 Release 流程：公开 Supabase 构建变量、只读 schema gate、Android 环境签名及 APK/AAB 指纹验证、Windows 从实际证书导出指纹并传入 Tauri/验证产物、Windows 原生构建归档平台判断、准确的 Vana 发布说明和迁移提醒。GitHub 公开 Variables 已配置当前 anon URL/key，不含特权密钥；发布 gate 在迁移前正确拒绝旧 schema，迁移后通过。Windows 本机证书是自签名且未过期，不代表受商业 CA 信任。实际签名构建发现证书信任确认框和错误的 MSI 版本配置字段；已改为临时 runner 非交互信任，并把 MSI version 写入 Tauri 2 的 bundle.windows.wix.version。回归测试调用真实 Tauri CLI 解析正式/Beta 配置。`b862b15` 签名工作流中的 Windows 构建与产物签名校验已成功；Linux/Android job 与新增 Windows 原生应用验收仍在运行。新增手动签名构建入口，仅上传 artifacts，不创建 Release；仅 tag 才要求 main 与 Hosted schema gate，真实同步仍为发布的人工验收条件。

新增脚本已通过 Python/Node 语法、Release YAML 解析与 Bash 语法检查；缺配置、service_role、secret key、项目不匹配均被拒绝；前端类型检查和 22 个行为测试通过。

真实 Supabase 服务端验收与 Linux/Android 双向同步已通过；Windows 原生运行、正式签名 Android 设备安装、冲突可见性和全部导出验证仍在推进。已部署备份后迁移；尚未合并 main、创建发布标签或 Release。`git diff --check` 通过；全仓 `cargo fmt --check` 仍存在历史及当前文件格式差异，不是本轮 CI 必需项，未做全仓格式重写。

完整路线保持 [ROADMAP](ROADMAP.md) 的五个工作包。当前完成的是本地实现和验证准备；全路线验收仍在进行。附件按路线保留在第 5 包，云附件需要前四包验收及服务端配额/权限/重试/孤儿清理，当前不开启云附件。

## 后续原生验收补充

Linux 暂停的仅是隔离测试账号空间中的自动同步；本机离线修改与 Android 远端修改重连后均保留，产生一份带原文关联的冲突副本，outbox 清空。实际打开同步副本面板，可查看正文差异、原文当前版本与保留副本；标记“已查看”后仅通知移出列表，SQLite 仍保留完整副本正文。

Android 已安装正式签名 `7c342f7` 包并真实登录，再使用 `b862b15` 成功签名构建包原位更新，测试会话与云端正文仍可读。当前正式 APK SHA-256 为 `316e26b6931f9fa79b5b68c261552440bd73d1382f90589882bf9ea6c51501e3`，证书 SHA-256 为 `df2e35d9b993cd0f9f3663e9563623316db271905e7b3bf859a2101010c9d089`。GitHub CI 配置的签名与本地 `secrets/.env` / `release.keystore` 的证书不同；本轮沿用现有 GitHub 发布证书，未轮换密钥。CI 内已从实际 keystore 导出证书并与 APK/AAB 比较，连续构建证书一致；新增公开 artifact manifest 记录证书指纹、源 SHA 和文件哈希，不包含签名密钥。

Windows `b862b15` 的签名 EXE/MSI 与原生程序校验通过，完整三平台签名工作流 [38464671340](https://github.com/oneder2/Vana/actions/runs/38464671340) 全部成功。首轮 Windows UI 验收找到登录输入框，但脚本使用了错误按钮名称“登录”，实际欢迎页为“登录并开始同步”；脚本已修正并增加编辑、导出、备份和重启验证。此自动化脚本错误不作为产品认证失败，也不能将修正前运行宣称通过。

Android 另加独立同证书 Instrumentation 工具，限定已创建测试账号的 ID 与邮箱，读取实际无 token 的 SQLite 摘要与 Keystore 密文。它仅让该 fixture 的 OS 会话过期，再由原生应用执行真实 refresh；验证凭据轮换、旧秘密删除及退出清理。该工具不合入生产 APK，只在手动验收构建中生成，设备结果仍待运行。

Linux 备份导入原生验收复现 WebKit 的“文件对象不可用”：文件选择后立即清空 input，再异步读取 File 导致失败。本轮已将清空延后至读取/预览结束，等待新的原生包验证，未把失败场景记为通过。编辑器同时添加明确的 textbox、多行与只读语义及“文档正文”标签，改善辅助技术识别，并用于 Windows 正文操作验收。
