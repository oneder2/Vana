# 真实同步与设备验收

此文件记录执行流程和已取得的证据；未完成项不视为通过。离线协议回归使用 Auth stub；浏览器 IPC fixture 使用模拟存储，均不能代替真实 Supabase/设备证据。

## 环境

使用专用非生产 Supabase 项目、两个测试账号、两端测试客户端。记录项目名称、迁移版本、客户端 SHA、平台/设备、安装包哈希和签名类型。通过本机安全配置注入账号凭据，报告不记录密码、令牌或完整正文。本轮用户已授权恢复后的项目测试与发布；实际环境为 csacipzifjwlyqroojho，先私有备份和隔离恢复验证，再部署最新迁移。测试仅创建/修改自建隔离账号的数据，未用原有用户数据做并发试验。

## 顺序与通过条件

1. 先备份旧空间，再验证完整迁移链及重复执行；非法旧正文/树须有明确处理结果。确认旧写入协议被拒绝，新客户端仍可读取/备份本地数据。
2. 真实邮箱认证：注册、确认、登录、刷新、退出、重启、项目切换；使用另一个测试账号 JWT 请求 RPC 和快照，必须被隔离。
3. 创建 1,201 条测试记录（至少 3 级目录），固定快照分页完整无重复；两端离线编辑、并发移动目录、删除子树、编辑已删除节点、重连和丢失上行确认。
4. 检查完整数据、revision/outbox 和用户可见的冲突副本；在副本入口对照原文，确认“已查看”不删除正文。
5. 恢复正文历史，重启并同步到另一端；预览期间远端/本地变化应拒绝恢复。导出空间备份，预览并复制到另一测试空间，损坏文件不得部分写入。
6. Linux/Windows：正常关闭保存、重启回读、PDF/DOCX/Markdown/空间备份、文件名边界。Android：minified Release 安装、返回栈、切后台、进程终止后回读、备份和实际系统分享。

系统强杀不保证完成尚在 600 ms debounce 内的草稿。测试必须区分保存后重启与未保存强杀，不夸大保证。

## 证据矩阵

| 类别 | 本轮要求 | 记录位置 |
| --- | --- | --- |
| 自动行为 | frontend/native/PostgreSQL 回归 | CI 日志及开发记录 |
| 三平台构建 | dev 预览 CI；Android Release/R8 JNI | GitHub Actions run + artifact |
| 真实服务 | Auth/PostgREST/RPC，两账号，两客户端 | 私有环境记录与脱敏结果 |
| 设备运行 | Linux、Windows、Android | 设备/包哈希、步骤、结果 |
| 正式签名 | Windows 证书、Android 发布 keystore | 正式发布流水线 |

`dev` Android 包使用临时 CI 测试证书，即使 Release/R8 通过，也不是正式签名发布包。tag 发布流水线运行相同的行为回归后再构建正式包。云附件仍需前四个工作包验收完成。

## 2026-10-13 真实服务结果

四项迁移已对齐；备份在隔离 PostgreSQL 17.11 恢复并重复迁移，13 个旧文档语义保持。真实脚本已通过两组隔离账号的全部协议检查：1,201 节点、固定快照分页、两独立会话并发、RLS、旧写入拒绝、回滚、幂等及删除防复活。第二组账号已验证删除；第一组暂留设备验收。

运行脚本前，将 `url`、`anon`、`service_role` 存入 git 忽略的私有 JSON（0600），不在命令参数或聊天中填写密钥。明确指定期望项目 ref：

```bash
python3 scripts/test-supabase-live.py provision --config PRIVATE_CONFIG --fixtures PRIVATE_FIXTURES --expected-project-ref PROJECT_REF
python3 scripts/test-supabase-live.py run --config PRIVATE_CONFIG --fixtures PRIVATE_FIXTURES --expected-project-ref PROJECT_REF
# 客户端验收结束后，或中途失败需要清理时：
python3 scripts/test-supabase-live.py cleanup --config PRIVATE_CONFIG --fixtures PRIVATE_FIXTURES --expected-project-ref PROJECT_REF
```

`provision` 使用不会发邮件的 admin signup link，随后真实 verify/password/refresh/logout；不代表外部邮箱投递成功。`run` 只通过 user JWT 执行协议。`cleanup` 先核对账号邮箱及本轮 ownership marker，只删除这些自建账号及其级联记录，并核对 HTTP 404；删除确认丢失后可以重跑。首次账号创建遇到网络超时且未记录 ID 时，脚本拒绝盲目删除，需要在控制台确认对应测试账号。

Linux 原生应用与 Android Preview 已通过同一账号双向编辑同步及保存后重启会话/正文回读。Linux 系统凭据原生探针已通过真实 refresh 和 logout。完整运行证据和仍待验收的签名/平台边界见 [开发记录](DEVELOPMENT_2026-10-13.md)。

原生 Auth 探针读取 `VANA_NATIVE_ACCEPTANCE_CONFIG` 所指私有 JSON，字段为 `url`、`anon`、`expected_project_ref`、测试账号 `email`/`password`/`id`，不含 admin key。仅允许自建 `vana-acceptance-…@example.com` fixture；使用全新临时空间和实际 OS 凭据库。Linux 在隔离 D-Bus/keyring 运行；Windows 使用临时 runner。手动签名构建可开启 `windows_native_acceptance`，并临时配置 `VANA_NATIVE_ACCEPTANCE_ACCOUNT` Secret；运行后移除此测试 Secret。探针的重新打开存储与完整应用进程重启是两项独立证据。
