# 部署与发布指南

本文档描述当前主线的发布方式。重点是多端构建、版本对齐和 GitHub Release 交付，不再包含旧的 Git/PAT 运行时同步叙事。

## 分支模型

- `feat/*`、`fix/*`、`refactor/*`、`chore/*`：功能开发分支，执行类型、行为、原生领域与协议 CI
- `dev`：集成分支，触发测试构建
- `main`：发布候选分支，触发发布前校验
- `v*` tag：正式发布入口，创建 GitHub Release

## 发布前检查

```bash
./scripts/check-build-ready.sh
```

它检查源码与 lockfile 版本、已跟踪敏感文件、严格 TypeScript、前端行为、原生领域、隔离 PostgreSQL 协议、生产构建、Rust、图标、官网生成与脚本语法、生产依赖审计。需要 Node.js 22 LTS、Python 3.11+、Pillow、Rust、Linux 原生依赖和 Docker。

传入 `--hosted` 时额外运行只读 Supabase gate，需在环境中提供两项公开构建配置。设备、安装升级、凭据与正式签名是另外的验收项，脚本成功不代替它们。当前结果见 [发布自检](RELEASE_READINESS_2026-10-15.md)。

## 本地构建

统一入口：

```bash
npm run tauri:build
```

按平台构建：

```bash
npm run tauri:build:windows
npm run tauri:build:android
```

产物统一整理到：

- `dist/linux`
- `dist/windows`
- `dist/android`

## CI / Release

工作流分层：

- `ci.yml`：功能分支自动化校验
- `build-dev.yml`：`dev` 分支测试构建
- `main-verify.yml`：`main` 分支发布前校验
- `release.yml`：`v*` tag 正式发版

`release.yml` 也支持 `workflow_dispatch`：可先在 dev 验证正式签名构建和产物完整性，不创建 Release。分支手动构建使用源码版本；tag 才强制校验 main 祖先关系和 Hosted schema，并创建 Draft Release。手动构建通过不代表真实同步通过。

正式发布流程：

1. 合并到 `main`
2. 确认 `main` 状态满足发版
3. 创建 tag

```bash
git checkout main
git pull
# 仅在新版本验收通过、版本号唯一后执行
git tag v0.7.1
git push origin v0.7.1
```

4. GitHub Actions 自动构建 Linux / Windows / Android
5. 构建产物上传到 GitHub Draft Release；核对更新说明、附件和签名后再正式发布。官网每 15 分钟读取最新公开正式版，失败保留原页面。

## Android 说明

正式 Android Release 必须配置以下 GitHub Secrets：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

发布流程通过 `VANA_ANDROID_KEYSTORE_*` 环境变量配置 Gradle，密钥文件只写入 runner 临时目录，不在 shell 脚本中插值密码，也不再生成 keystore.properties 或改写 Gradle。构建后验证 APK/AAB 签名并与 keystore 导出的证书 SHA-256 比对；只上传这次的正式 Release 产物。Debug 证书仅用于 dev 预览。

## Windows 说明

如果需要签名安装包，需要在 CI 中配置：

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`
证书指纹从实际导入的 PFX 中读取，并通过 Tauri 配置覆盖传入，安装器和应用可执行文件均需验证签名及指纹一致。当前本机签名证书是项目自签名证书，有效期至 2027-01-21；CI 只在临时 runner 中信任它以验证完整性，不会让用户系统信任该发行者。面向公共发行的商业 CA 证书需另行准备。

## Hosted 配置与发布门槛

GitHub Repository Variables 需配置 `VANA_PUBLIC_SUPABASE_URL` 与 `VANA_PUBLIC_SUPABASE_ANON_KEY`。它们是可公开的应用连接配置，必须指向已验收的项目；绝不能放入 service_role 或 secret key。Release 的所有原生构建都继承这两项配置。

`python3 scripts/check-supabase-release.py --require-protocol` 只读检查公开配置、Auth 和文档同步字段，查询限制为零行，不读取用户正文。它会阻止缺配置、错误项目、特权密钥或未升级 schema 的发布；它不能替代两账号真实 RPC/认证及设备验收，仍须满足 [SYNC_ACCEPTANCE](SYNC_ACCEPTANCE.md)。

服务端迁移需要先备份并核对迁移链，再运行真实验收。当前 revision 协议已在 0.7.0 完成部署，本次候选不包含新的数据库迁移；不要重复执行无关迁移或清理用户数据。

## 版本对齐

以下文件必须保持一致：

- `package.json` 与 `package-lock.json` 根包
- `src-tauri/Cargo.toml` 与 `src-tauri/Cargo.lock` 本包记录
- `src-tauri/tauri.conf.json`

详细策略见 [VERSIONING.md](VERSIONING.md)。
