# Supabase Setup

Vana 当前主线使用：

- `Supabase Auth` 处理邮箱登录
- `Supabase Postgres` 存储同步后的文档
- 本地 `SQLite` 仍然是第一落点

当前同步模型是：

1. 文档先写本地 SQLite
2. 本地变更先进入 `sync_queue`
3. 客户端自动把有改动的文档增量 upsert 到 `public.documents`
4. 再按 `updated_at` 游标增量拉取远端更新

## 0. 分发模式

Vana 现在支持两种运行方式：

- 默认公共服务
  - 应用在构建时内置 `VANA_PUBLIC_SUPABASE_URL` 和 `VANA_PUBLIC_SUPABASE_ANON_KEY`
  - 普通用户下载安装后不需要自己找数据库 URL 或 key
  - 只需要登录邮箱账号即可使用
- 自托管高级模式
  - 在设置页展开“高级配置”
  - 手动覆盖成你自己的 Supabase 项目

注意：

- `anon key` 是公开配置，可以内置在客户端
- `service_role key` 绝对不能放进客户端或仓库
- 客户端权限隔离依赖 `Auth + RLS`

仓库提供了示例文件：

- `.env.example`

构建正式公共版本时，至少要注入：

```bash
VANA_PUBLIC_SUPABASE_URL=...
VANA_PUBLIC_SUPABASE_ANON_KEY=...
```

## 1. 创建项目

在 Supabase 控制台新建一个项目，然后记下：

- `Project URL`
- `anon public key`

如果你走自托管模式，这两个值填入应用设置页的高级配置即可。

## 2. 应用数据库 Migration

进入 Supabase 控制台：

`SQL Editor -> New query`

你有两种方式。

### 方式 A：直接在控制台执行

执行仓库中的 migration：

`supabase/migrations/202604180001_init_documents.sql`

它会创建：

- `public.documents`
- `public.document_assets`
- 必要索引
- 仅允许用户访问自己文档的 RLS policy

### 方式 B：使用 Supabase CLI

如果你已经在本机登录并 link 了项目，可以直接执行：

```bash
supabase db push
```

当前仓库已经整理成标准结构：

- `supabase/config.toml`
- `supabase/migrations/`
- `supabase/seed.sql`

## 3. 配置 Auth

进入：

`Authentication -> Providers -> Email`

确保：

- Email provider 已启用
- Magic Link / OTP 登录可用

然后进入：

`Authentication -> URL Configuration`

至少配置以下地址：

- `Site URL`
  - 本地开发可先填 `http://localhost:3000`
- `Redirect URLs`
  - `http://localhost:3000/auth/callback`
  - 你实际使用的桌面端前端地址，例如开发时 Tauri 指向的本地地址
  - 如果你会在局域网手机调试，也把对应地址加入，例如 `http://192.168.x.x:3000/auth/callback`

当前 Vana 的过渡登录方案会把 Magic Link 回调落到：

- `/auth/callback`

然后你把完整回调 URL 复制回应用设置页中的“导入会话”区域。

## 4. 应用内配置

打开 Vana 设置页，按顺序做：

默认公共服务模式：

1. 打开应用设置页
2. 直接输入邮箱，点击“发送 Magic Link”
3. 打开邮箱中的登录链接
4. 在回调页复制完整 URL
5. 回到设置页，粘贴到“导入会话”
6. 点击“导入会话”

自托管模式：

1. 展开高级配置
2. 填 `Supabase URL`
3. 填 `Anon Key`
4. 点击“保存并校验高级配置”
5. 再按默认公共服务模式继续登录

如果一切正常，你会看到：

- 账户模式变为 `authenticated`
- 显示账户邮箱
- 同步模式保持 `configured`
- `上次同步` 出现时间

## 5. 当前远端表结构约束

当前同步代码固定依赖以下字段：

- `user_id`
- `id`
- `title`
- `content_json`
- `plain_text`
- `status`
- `is_favorite`
- `is_template`
- `created_at`
- `updated_at`
- `archived_at`
- `deleted_at`
- `tags`

因此在你修改远端 schema 之前，先同步修改：

- `src/lib/supabaseSync.ts`
- `supabase/migrations/202604180001_init_documents.sql`

## 6. 当前限制

这版已经够你开始试运行，但还不是最终形态：

- 自动同步是“前台最小可靠版”，不是后台常驻守护进程
- 目前仍然没有实时订阅和多端冲突合并策略
- 还没有原生 deep link，会话导入还靠复制回调 URL
- 附件/图片目前只预留元数据表，没有开放 Storage 上传
- 还没有历史版本云端合并策略

## 7. 推荐的下一步

如果你要继续固化，优先顺序建议是：

1. 给 `documents.updated_at` 增加服务端更新时间策略
2. 落实 `document_assets` 对应的 Storage bucket policy 与限额
3. 把登录回调改成真正的 deep link / Tauri scheme
4. 再决定是否引入实时订阅或后台同步

## 8. 如果要让我直接操作你的 Supabase

我可以直接用命令行操作，但你需要先完成下面的最小授权条件。

你在本机执行：

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

完成后告诉我“已经 login + link 到目标项目”，我就可以继续直接执行例如：

```bash
supabase db push
supabase db pull
supabase migration new <name>
```

如果没有 `login + link`，我只能整理本地结构，不能安全地对你的远端项目直接操作。
