# 版本与分支

最新正式版为 0.7.1，发布结果见 [发布记录](RELEASE_0.7.1_2026-10-16.md)。SemVer 使用 `major.minor.patch`；Beta 是产品成熟度说明，不代表每次都创建预发布 tag。

| 分支 / 入口 | 职责 |
| --- | --- |
| `feat/*`、`fix/*`、`refactor/*`、`chore/*` | 类型、行为、原生领域、协议、图标与生产依赖检查；不创建 Release |
| `dev` | 集成和 Linux / Windows / Android 预览构建 |
| `main` | 发布前验证与 Linux 候选包；合并不等于对外发布 |
| `v*` tag | 校验提交在 main 历史中，构建正式签名产物，创建 GitHub Draft Release |
| Release 手动运行 | 可在工作分支构建签名产物与短期 Artifacts；不发布 Release |

## 统一版本

```bash
node scripts/sync-version.mjs 0.7.1
```

同时更新 `package.json`、`package-lock.json`（含根包）、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 的本包记录和 `src-tauri/tauri.conf.json`。不要手改一个文件而遗漏 lockfile。MSI 四段版本只在对应 Windows 构建中作为第二参数传入；旧的 `bundle.windows.version` 字段会移除。

版本脚本先验证所有输入，再写入；测试会检查非法版本不写入、Cargo lock 一致性，以及 Tauri 实际接受生成的 Windows 配置。

## 发布顺序

1. 候选通过 [完整自检](RELEASE_READINESS_2026-10-15.md) 和平台验收后合入 main。
2. 确认版本及 tag 尚未发布，再为已验收提交创建新 tag；不要移动已有 tag 或覆盖已发布附件。
3. 等待 Linux / Windows / Android 构建与实际签名验证成功，核对 Draft Release 的附件、SHA-256 和更新说明。
4. 正式发布 Draft 后，官网在下一轮定时检查更新下载入口。Preview 和 Draft 始终不进入默认下载。

工作流以 `.github/workflows/` 为准，部署与回退见 [部署指南](DEPLOYMENT.md)。
