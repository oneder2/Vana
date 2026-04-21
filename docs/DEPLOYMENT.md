# 部署与发布指南

本文档描述当前主线的发布方式。重点是多端构建、版本对齐和 GitHub Release 交付，不再包含旧的 Git/PAT 运行时同步叙事。

## 分支模型

- `feat/*`、`fix/*`、`refactor/*`、`chore/*`：功能开发分支，只跑轻量 CI
- `dev`：集成分支，触发测试构建
- `main`：发布候选分支，触发发布前校验
- `v*` tag：正式发布入口，创建 GitHub Release

## 发布前检查

```bash
./scripts/check-build-ready.sh
```

它会检查：

- 版本号一致性
- 前端类型检查与 Rust `cargo check`
- Vite 生产构建
- Tauri 配置和图标文件

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

- `ci.yml`：功能分支轻量校验
- `build-dev.yml`：`dev` 分支测试构建
- `main-verify.yml`：`main` 分支发布前校验
- `release.yml`：`v*` tag 正式发版

正式发布流程：

1. 合并到 `main`
2. 确认 `main` 状态满足发版
3. 创建 tag

```bash
git checkout main
git pull
git tag v0.6.0
git push origin v0.6.0
```

4. GitHub Actions 自动构建 Linux / Windows / Android
5. 构建产物上传到 GitHub Release

## Android 说明

Android Release 如需签名，仍然需要：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

辅助脚本：

- `scripts/configure-android-signing.py`
- `scripts/test-android-signing.sh`

## Windows 说明

如果需要签名安装包，需要在 CI 中配置：

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`
- `WINDOWS_CERTIFICATE_THUMBPRINT`（可选）

## 版本对齐

以下文件必须保持一致：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

详细策略见 [VERSIONING.md](./VERSIONING.md)。
