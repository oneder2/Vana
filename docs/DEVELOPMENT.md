# 开发指南

本文档描述当前主线的真实开发结构。旧的 `Next.js + Git/PAT` 路线已经退出默认产品方向。

## 技术栈

- 前端：`Vite + React 19 + TypeScript + Tailwind CSS`
- 编辑器：`Tiptap`
- 客户端壳：`Tauri v2`
- 本地数据：`SQLite`
- 远端同步：`Supabase Auth + Postgres`
- 导出：`Typst PDF + DOCX + Markdown`

## 当前目录

```text
Vana/
├── src/                      # React 前端
│   ├── app/                  # 页面入口
│   ├── components/           # UI 组件
│   └── lib/                  # API、路由、同步、导出等
├── src-tauri/                # Tauri Rust 侧
│   ├── src/
│   │   ├── commands.rs
│   │   ├── db.rs
│   │   ├── storage.rs
│   │   ├── keychain.rs
│   │   └── typst_export.rs
├── supabase/                 # Supabase 配置与 migration
├── scripts/                  # 本地构建 / CI 辅助脚本
└── dist/                     # 统一构建产物输出
```

## 本地开发

```bash
npm ci
npm run tauri:dev
```

纯前端调试：

```bash
npm run dev
```

## 最终检查

```bash
bash scripts/check-build-ready.sh
```

完整覆盖类型、前端行为、原生领域、SQL 协议、生产构建、图标、官网和生产依赖审计。设备与正式签名另外记录在发布报告。

## 构建

```bash
npm run check
npm run tauri:build
```

常用单平台命令：

```bash
npm run tauri:build:windows
npm run tauri:build:android
```

构建结果统一输出到：

- `dist/linux`
- `dist/windows`
- `dist/android`

## 数据与同步模型

当前主线是标准的 local-first：

1. 文档先写入本地 SQLite
2. 本地改动写入 `sync_queue`
3. 前端在保存、回前台、联网恢复、定时轮询时触发自动同步
4. 同步层只推送待处理文档，使用服务端 revision 条件写入；下行创建完整固定快照并按 500 条分页拉取，`last_pulled_at` 仅记录状态，不是增量游标

说明：

- 当前自动同步是“前台最小可靠版”
- 还没有实时订阅、后台守护同步、复杂冲突合并
- 附件/图片只预留了本地与 Supabase 元数据结构，还没开放云端上传

## 相关文档

- [Supabase 配置指南](SUPABASE_SETUP.md)
- [附件 / 图片 Storage 方案](ATTACHMENT_STORAGE_PLAN.md)
- [版本号管理策略](VERSIONING.md)
- [部署与发布指南](DEPLOYMENT.md)
- [下一阶段开发路线与验收条件](ROADMAP.md)
