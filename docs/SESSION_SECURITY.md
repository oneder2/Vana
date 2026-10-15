# 原生会话与渲染边界

Auth 注册、登录、用户验证、刷新和退出由 `src-tauri/src/auth.rs` 执行，30 秒网络超时、禁止认证重定向、响应上限 1 MiB。只允许 HTTPS 或本机 HTTP 测试服务。返回到前端的会话 DTO 没有 refresh token；现有文档传输仍在前端使用短期 access token。

系统存储：Linux Secret Service，Windows Credential Manager，Android AES-GCM + Android Keystore（应用 no-backup 文件目录，凭据 ID 作为 AAD）。生产代码没有内存或明文 fallback。独立测试以模拟凭据库验证领域契约，不冒充真实平台凭据验证。

SQLite 保存无令牌的账号摘要及随机凭据 ID。迁移先写入并回读系统凭据，再事务替换摘要；成功后清理旧空间/遗留数据库中的会话，开启 secure_delete，清理 WAL，并对含旧令牌的遗留库执行 VACUUM。清理失败留下重试标记并明确报错。这不能销毁用户曾另存的旧数据库副本、系统快照或外部备份。

系统凭据写入与 SQLite 不存在跨资源事务：新凭据在数据库提交失败时尝试删除；旧凭据在切换后删除，清理失败明确报错。三平台真实登录、刷新和退出已验收，见 [开发记录](archive/DEVELOPMENT_2026-10-13.md)；凭据库锁定/损坏和断电故障未做完整设备验收。旧 `.enc` 文件迁移密钥的 `vault_keys.json` 保持旧用途，不用于会话安全，不代表 SQLite 正文加密。

正文边界：512 KiB、最多 50,000 节点、32 层；支持当前 Tiptap 节点和文字标记；拒绝未知节点/属性、非法目录结构、危险链接、属性中的脚本或 CSS。导出排版参数使用白名单。旧数据不因验证失败被静默删除；非法正文需修复后保存或导入。

CSP：脚本来自应用本身，禁用 object/frame，正文图片只来自应用/data/blob。编辑器保留内联 style；文档传输允许自托管 HTTPS。开发策略额外允许 Vite/HMR。CSP 和凭据库减少暴露面，不提供端到端加密或防篡改审计保证。

验证命令：`npm test`、`npm run typecheck`、`npm run test:native`、`cargo check --locked --manifest-path src-tauri/Cargo.toml`。Linux 原生凭据探针：`bash scripts/test-system-credentials.sh`，使用独立 D-Bus 和临时 keyring。Android minified Release 验证：`python3 scripts/check-android-jni.py`（包含分享和 Keystore JNI 两个入口）。
