# Supabase 配置

当前客户端使用 Auth、Postgres 和 revision RPC。部署前阅读 [当前协议](ARCHITECTURE.md)。服务端迁移和客户端升级应一起进行；迁移会拒绝旧客户端的直接 upsert/PATCH 写入。

## 配置

公共服务构建注入 `VANA_PUBLIC_SUPABASE_URL` 和 `VANA_PUBLIC_SUPABASE_ANON_KEY`，可参考 `.env.example`。自托管项目在设置的高级配置中填写 URL 和 Anon Key。Anon key 是公开配置；不要提供 service_role key。生产环境使用 HTTPS。

在 Supabase 控制台启用 Email provider，根据需求配置邮箱确认。应用当前支持邮箱/密码注册和登录。也可以导入已有 Auth 回调 URL、hash 或 JSON 会话；保存前会请求 `/auth/v1/user` 验证身份。界面没有发送 Magic Link 的入口，也没有原生 deep link。

更换项目会清除旧项目会话并返回访客空间；登录新项目后使用独立数据。退出登录保留原账号空间供以后登录恢复，不自动搬运到访客空间。

## 数据库迁移

备份现有云数据库，然后按顺序应用 `supabase/migrations/` 内全部迁移：

1. `202604180001_init_documents.sql`
2. `202604180002_reserve_attachment_storage.sql`（标准 Supabase Storage 环境中的规划预留）
3. `202604210001_align_documents_hierarchy.sql`
4. `202610120001_revision_sync.sql`（当前客户端必需）

可在控制台 SQL Editor 执行文件，或在已登录并 link 到目标项目的 CLI 中执行 `supabase db push`。本次开发验证只使用独立测试 PostgreSQL，没有自动部署到实际项目。

新迁移把合法旧 JSONB 字符串转为对象。若旧数据包含非法 JSON、缺失 doc/content 字段或非法 kind/depth，迁移会报错而不是丢弃正文；保留备份并修复对应数据后再运行。云端既有孤儿/循环目录会在后续同步验证时拒绝，应先修复层级。

## 协议接口

- `vana_open_pull_snapshot()` → `{snapshot_id,total}`
- `vana_pull_snapshot_page(snapshot_id,page_offset)` → 最多 500 条固定快照记录
- `vana_close_pull_snapshot(snapshot_id)` → 释放快照
- `vana_push_documents(changes)` → `{accepted,documents}`；一个批次原子提交，检查 revision，mutation UUID 幂等

正文 `content_json` 必须是 JSONB 对象。文档还包含 `node_kind,parent_id,depth,revision,last_mutation_id,is_purged`。写接口从 `auth.uid()` 获取 owner；客户端不能指定其他用户。读取受 RLS 限制，直接 insert/update/delete 对 authenticated/anon 均被撤销。没有旧协议降级路径。

文档历史不上传；附件 Storage 只有元数据与 policy 预留。Hosted 配额是客户端保护，还不是完整的服务端防滥用策略。

## 验证

```sh
python3 scripts/test-supabase-protocol.py
```

需要 Docker，脚本启动无公开端口的临时 `postgres:16` 并自动删除。它验证核心迁移、CAS/幂等、原子回滚、1201 行快照分页、账号/RLS 边界和两个独立会话的并发写入。它使用 Auth stub，未覆盖托管 Auth 服务、Storage 扩展或真实项目部署。
