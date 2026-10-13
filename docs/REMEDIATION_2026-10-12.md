# 审查问题修复记录

修复前基线：a291cae，已推送 origin/dev。范围对应 CODE_REVIEW_2026-10-12.md 全部 15 项缺陷，并处理相关架构契约与文档说明。

| 编号 | 问题 | 状态 | 验证 |
| --- | --- | --- | --- |
| 1 | 账号及项目数据隔离 | 已修复 | 项目/账号/访客隔离、迟到 IPC 和 Auth 刷新拒绝、旧库原件保留与明确恢复测试通过 |
| 2 | 切换保存丢失和标签串写 | 已修复 | 4 项队列测试；浏览器切换、标签隔离、独立撤销和关闭保存通过 |
| 3 | 刷新与通知覆盖草稿 | 已修复 | 浏览器导出通知保留草稿、导航提交通过；typecheck/build 通过 |
| 4 | 同步覆盖本地修改和并发上行 | 已修复 | revision CAS、整树冲突副本、迟到内存草稿代次检查、丢确认幂等、并发写入测试通过 |
| 5 | 旧目录结构覆盖云端 | 已修复 | 删除常态结构 PATCH；客户端仅调用 RPC，服务端禁用旧直接写入；子树移动验证通过 |
| 6 | 子树同步任务遗漏 | 已修复 | 移动/删除/恢复为每个受影响节点排队；恢复子树父状态不符时移至根层 |
| 7 | 数据库部分提交 | 已修复 | IMMEDIATE 领域事务；深度超限和注入 outbox 写失败均完整回滚 |
| 8 | Android JNI 入口混淆 | 已修复 | Arm64 Release R8 成功；实际 minified DEX 中类名、public static 方法签名与错误字段均验证通过 |
| 9 | 全量拉取未分页 | 已修复 | 500 条固定快照分页；前端及 PostgreSQL 的 1201 条完整分页测试通过 |
| 10 | 同步失败反馈为成功 | 已修复 | HTTP、网络、缺页、并发拒绝均 rejection，并持久化错误；旧任务不确认 |
| 11 | 搜索正则崩溃 | 已修复 | 字面量高亮、SQL instr 查询、结构化文档 ID 和真实片段；特殊字符与回收站过滤测试通过 |
| 12 | 历史与任务无限增长 | 已修复 | 20 版本/30 天/全空间 5 MiB 历史保留、单文档任务压缩、全 payload 统计、子树永久删除标记 |
| 13 | JSONB 正文契约 | 已修复 | JSONB 对象契约及旧字符串转换；拒绝非法正文；原生及前端测试通过 |
| 14 | 登录验证与会话导入 | 已修复 | 未登录检测返回 reachable；401/非法 UUID 拒绝保存；登录/刷新/退出校验项目和空间 |
| 15 | 导出文件名与路径 | 已修复 | 3 项 Rust 测试：保留名/Unicode、碰撞/扩展名、符号链接越界 |

架构跟进：账号空间与领域接口、树结构验证、按文档草稿服务、事务化 outbox、版本化云同步、历史保留、CI 行为测试，以及当前安全模型、Hosted 限制和功能文档校准。尚未验证的项目不标为完成。详见 ARCHITECTURE.md；当前仍是明文 SQLite/云端/会话，未承诺系统密钥库或端到端加密。

## 验证与部署边界

- 已通过：17 项实际后端源文件测试、14 项前端行为测试、Linux cargo check、typecheck、前端 build。
- 已通过：独立 PostgreSQL 上实际核心迁移、RLS/账号边界、条件写入/幂等、原子回滚、固定分页和两个独立会话并发写入。
- 浏览器：真实 React/Tiptap，模拟 IPC 的切换、标签、撤销隔离、导出通知、导航和关闭保存场景通过；原生 ACL/真机不能据此视为通过。
- Android Arm64 Release/R8：独立 R8 的 52 个 Gradle 任务完成，完整 `npm run tauri:build:android -- --apk true` 构建成功。Arm64 与 universal Release 的实际 DEX 均通过 JNI 类名、public static 方法签名及错误字段检查；最终 APK 的 DEX 与已验证的 universal Release DEX 完全一致。
- APK：`dist/android/vana-0.7.0-android-release.apk`，70,906,562 字节，SHA-256 `9d90aa695a2793327f39b34a33bf51f7861e3bb9088199f7ef02a2a2e2ddeb09`。包内含 `lib/arm64-v8a/libvana.so`，版本 0.7.0、minSdk 24、targetSdk 36；实际 Manifest 的 FileProvider authority、禁止导出和 URI 临时授权，以及引用的 `exports/` 路径资源均已检查。签名验证通过，证书为 Android Debug，仅作本地验证产物，正式发布须使用发布密钥。
- 无连接真机，安装运行和真实系统分享的设备验证仍是发布验证范围。
- 服务端迁移尚未部署到真实 Supabase。新客户端需要 202610120001_revision_sync.sql；旧直接写入客户端应同步升级。
- CI 已接入前端、原生领域及独立 PostgreSQL 协议测试。`6e89166` 对应 [运行 38336504044](https://github.com/oneder2/Vana/actions/runs/38336504044) 的 Validate Project、Linux Preview、Windows Preview、Android Preview 全部成功；`e821aa1` 与 `1e2de9f` 对应运行也已全部成功。Android Preview 是 Debug 构建，Release/R8 的证据来自上述本地完整打包验证。

## 提交

- `a291cae`：修复前业务代码与审查报告基线。
- `d98a2a1`：独立草稿队列、通知及生命周期保存。
- `2dbd6e9`：原生导出校验、Android JNI 保留与 ClassLoader。
- `8abfd71`：账号空间、领域事务、revision RPC、固定分页、搜索、保留/永久删除及行为测试。
- `cfd9b7c`：修正 Android SDK 安装及发布 JNI 检查。
- `1e2de9f`：并发删除收敛、一致状态读取、实际 DEX 检查及容器正式服务 readiness。
- `e821aa1`：当前架构、登录与迁移说明及修复验证文档。
- `6e89166`：完成 Android Release APK 打包、签名及包内配置验证记录。

以上提交已推送 `origin/dev`。提交按草稿保存、原生导出、账号/事务/同步、CI 和文档分组保留，便于逐项追溯；不变更审查报告中的历史基线结论。下一阶段以 [开发路线](ROADMAP.md) 为准，版本发布另行进行。
