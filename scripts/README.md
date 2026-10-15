# 构建、验证与发布脚本

以仓库根目录执行以下命令。前端使用 Vite；Android Gradle 已在仓库中配置环境变量签名，不需要生成 `keystore.properties` 或再次改写工程。

| 入口 | 用途 |
| --- | --- |
| `bash scripts/check-build-ready.sh` | 版本、已跟踪敏感文件、类型、行为测试、原生领域、SQL 协议、生产构建、图标、官网与依赖审计 |
| `bash scripts/check-build-ready.sh --hosted` | 在上述检查后，额外只读检查构建所用 Supabase 的 Auth / schema |
| `npm run tauri:dev` / `npm run tauri:dev:android` | 原生开发；Android 开发入口处理 dev server 与 adb reverse |
| `npm run tauri:build` / `npm run tauri:build:android` | 生产构建；`run-tauri.mjs` 负责环境、产物归档与平台差异 |
| `node scripts/sync-version.mjs <版本>` | 同步 npm、npm lock、Cargo、Cargo lock 与 Tauri 版本；不创建 tag |
| `python3 scripts/check-app-icons.py` | 检查桌面和 Android 自适应、单色、圆形图标与不透明边缘 |
| `python3 scripts/check-android-jni.py` | 检查实际 Release/R8 DEX 是否保留分享与 Keystore JNI 契约 |
| `python3 scripts/check-android-release-signature.py` | 校验构建 APK / AAB 的实际证书指纹 |
| `python3 scripts/test-supabase-protocol.py` | 临时 Docker PostgreSQL 中验证迁移、RLS、分页、CAS 和事务回滚 |
| `python3 scripts/check-supabase-release.py --require-protocol` | 只读 Hosted 健康与零行 schema gate，不代替认证同步验收 |
| `python3 scripts/test-supabase-live.py --help` | 使用私有配置和自建隔离账号的真实协议验收，不发送邮件 |
| `bash scripts/test-system-credentials.sh` | 独立 D-Bus 和临时 keyring 中验证系统凭据读写、删除 |
| `scripts/test-windows-native.ps1` | Windows 隔离空间的原生保存、导出、备份和会话验收 |
| `python3 scripts/build-android-acceptance.py` | 为自建测试账号构建独立的同签名 Android 原生验收工具 |
| `python3 website/build.py` / `bash website/deploy.sh` | 生成 / 部署轻量官网下载站，详见 [官网维护](../website/README.md) |

Android 正式签名使用 `VANA_ANDROID_KEYSTORE_PATH`、`VANA_ANDROID_KEYSTORE_PASSWORD`、`VANA_ANDROID_KEY_ALIAS`、`VANA_ANDROID_KEY_PASSWORD`。CI 从 GitHub Secrets 装载；不要打印变量或把凭据写入版本库。`VANA_ANDROID_PREVIEW=1` 为独立体验包，正式版不能使用 Debug 测试签名。

旧的 Git/PAT、Next.js 等待脚本和自动改写 Gradle 的签名脚本已移除。历史设计和当时的验收结论保留在 [文档归档](../docs/archive/README.md)，当前操作以 [部署指南](../docs/DEPLOYMENT.md) 为准。
