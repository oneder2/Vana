# Vana

当前正式版本：0.7.1。基于 Tauri v2、Vite、React、Tiptap、SQLite 的本地优先文档应用，支持可选 Supabase 同步。

面向个人写作与长期阅读，重点是层级清晰、改动可理解、误改可恢复。以离线空间、正文差异、受保护的恢复和可携带备份建立优势。真实多设备验收及适用边界见 [开发记录](docs/archive/DEVELOPMENT_2026-10-13.md)，定位见 [产品方向](docs/PRODUCT_DIRECTION.md)。

## 当前功能

- 访客离线写作；各账号和 Supabase 项目使用独立本地空间。
- 邮箱/密码登录与注册；支持经 Auth 校验的已有会话导入。
- 文件夹、收藏、标签、归档、回收站、永久删除和本地全文搜索。
- 按文档独立自动保存；前台触发的 revision 同步和目录树冲突副本。
- 完整目录路径与逐级返回；已有文档默认阅读，新建文档直接编辑，阅读不会生成保存任务。
- 查看本机保留的正文修改记录、增删差异和排版预览；恢复正文前校验并发修改，并保留恢复前版本。
- 导出当前空间备份、验证与预览后复制导入；定位同步冲突副本并对照正文。
- PDF、DOCX、Markdown 导出；Android 系统分享。
- 独立账号页；设置中的四主题预览与本机偏好保存。
- arcane、terminal、rusty、vellum 主题；Linux、Windows、Android（Beta）。

同步拉取使用完整固定快照分页，上行仅包含待同步文档。目前没有实时订阅、后台常驻同步、原生登录 deep link 或附件云上传。本地历史有限保留，只恢复正文，不包含历史标题、标签、目录或修改者身份。阅读模式用于避免误改，不是多人共享的访问权限。上述恢复、备份和会话保护属于 0.7.0 发布内容。

SQLite 与云端正文均为明文；当前版本不提供端到端加密。详细的数据、令牌存储与安全边界见 [架构文档](docs/ARCHITECTURE.md)。

## 使用

1. 可直接以访客身份写作；登录后进入独立账号空间。账号页可复制本机文档到账号；设置的高级选项可恢复旧数据库。
2. 从独立账号页使用邮箱/密码登录或注册；账号页提供登录状态与退出，同步自动执行。内置公共服务需要构建时配置；高级配置可连接自有 Supabase 项目。
3. 用侧边栏创建文档或分组；打开已有文档后点击“编辑”修改，正文自动保存，点击“阅读”先保存再锁定正文和标签。顶部路径可返回任一父分组，“修改记录”可对照并确认恢复保留的正文版本。
4. 从文件菜单导出 PDF、DOCX 或 Markdown；Android 会打开系统分享界面。
5. 回收站节点的右键菜单支持恢复和永久删除。永久删除保留云同步删除标记，正文与历史不可恢复。
6. 设置中的空间备份可导出当前空间，或预览备份后复制导入；备份不包含账号会话。正文页“更多文档操作 → 查看同步副本”可查看冲突，标记已查看后仍保留副本。

[官网与下载](https://vana.gellaronline.cc/) · [下载 Releases](https://github.com/oneder2/Vana/releases) · [Issues](https://github.com/oneder2/Vana/issues)

## 开发与验证

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
cargo test -j 2 --manifest-path tests/native-core/Cargo.toml
cargo check -j 2 --manifest-path src-tauri/Cargo.toml
python3 scripts/test-supabase-protocol.py  # 需要 Docker
```

原生开发使用 `npm run tauri:dev`；Android 使用 `npm run tauri:dev:android`。Linux 的原生构建需要 GTK/WebKit 系统依赖，详见 [开发指南](docs/DEVELOPMENT.md)。

## 文档

[文档索引](docs/README.md) · [上线前自检](docs/RELEASE_READINESS_2026-10-15.md) · [0.7.1 发布记录](docs/RELEASE_0.7.1_2026-10-16.md)

- [当前架构、同步契约与安全边界](docs/ARCHITECTURE.md)
- [产品方向](docs/PRODUCT_DIRECTION.md) · [界面与账号优化](docs/archive/UIUX_REFINEMENT_2026-10-13.md) · [空间备份格式](docs/BACKUP_FORMAT.md) · [会话与渲染安全](docs/SESSION_SECURITY.md)
- [Supabase 配置与迁移](docs/SUPABASE_SETUP.md)
- [审查报告](docs/archive/CODE_REVIEW_2026-10-12.md) · [逐项修复记录](docs/archive/REMEDIATION_2026-10-12.md)
- [变更记录](docs/CHANGELOG.md) · [下一阶段开发路线与验收条件](docs/ROADMAP.md)
- [开发指南](docs/DEVELOPMENT.md) · [部署指南](docs/DEPLOYMENT.md)
- [附件规划](docs/ATTACHMENT_STORAGE_PLAN.md)（尚未实现）

旧 PRD 和 Git Sync Protocol 保留为历史设计；当前主线已停用 Git/PAT 产品同步接口。

项目许可证：ISC；参考素材的许可与来源见 [第三方声明](THIRD_PARTY_NOTICES.md)。项目处于 Beta 阶段。
