# 部署与发布指南

本文档说明如何构建、签名和发布应用。

## Beta 分发（Desktop）

### 版本对齐

- **统一版本号**：`0.5.2.1`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
  - `package.json`

### 构建与产物

- **构建命令**：

```bash
npm run tauri:build
```

- **产物位置（常见）**：
  - `src-tauri/target/release/bundle/`（按平台生成 `deb/AppImage/msi/dmg` 等）

### Beta 最小回归清单（建议发版前手动点一遍）

- **文件操作**：新建/重命名/删除（确认都落盘并能提交）
- **同步链路**：配置远端 URL + PAT → `fetch` / `rebase` / `push`
- **冲突弹窗**：制造同文件并发修改 → 出现冲突弹窗（ours/theirs/copy）
- **右键菜单**：左侧树与编辑器右键菜单位置一致（无偏移）
- **氛围协议入口**：顶部按钮打开"仅供预览"的主题预览组件

## CI/CD 自动构建与发布

项目已配置 GitHub Actions 工作流，支持自动构建并发布到 GitHub Releases。

### 触发条件

推送以 `v` 开头的 tag 时自动触发构建和发布：

```bash
git tag v0.5.2.1
git push origin v0.5.2.1
```

### 支持的平台

- **Linux**: `.deb`, `.AppImage`, `.rpm` 安装包
- **Windows**: `.exe`, `.msi` 安装包（已签名）
- **Android**: Release APK

### GitHub Secrets 配置

在 GitHub 仓库设置中配置以下 Secrets（Settings → Secrets and variables → Actions）：

#### Windows 签名证书

- `WINDOWS_CERTIFICATE`: Windows 代码签名证书（PFX 文件）的 Base64 编码
  ```bash
  # 生成 Base64 编码
  base64 -i certificate.pfx | pbcopy  # macOS
  base64 certificate.pfx | clip        # Windows
  ```
- `WINDOWS_CERTIFICATE_PASSWORD`: PFX 证书密码
- `WINDOWS_CERTIFICATE_THUMBPRINT`: 证书指纹（可选，用于在 `tauri.conf.json` 中指定）

#### Android 签名密钥

- `ANDROID_KEYSTORE_BASE64`: Android keystore（JKS 文件）的 Base64 编码
  ```bash
  # 生成 Base64 编码
  base64 -i keystore.jks | pbcopy  # macOS
  base64 keystore.jks | clip        # Windows
  ```
- `ANDROID_KEYSTORE_PASSWORD`: Keystore 密码
- `ANDROID_KEY_ALIAS`: 密钥别名
- `ANDROID_KEY_PASSWORD`: 密钥密码（如果与 keystore 密码不同）

### 发布流程

1. **更新版本号**：确保 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中的版本号一致
2. **提交更改**：
   ```bash
   git add .
   git commit -m "chore: bump version to 0.5.2.1"
   git push
   ```
3. **创建并推送 tag**：
   ```bash
   git tag v0.5.2.1
   git push origin v0.5.2.1
   ```
4. **等待构建完成**：在 GitHub Actions 页面查看构建进度
5. **检查 Release**：构建完成后，在 GitHub Releases 页面查看并下载构建产物

### Release 类型判断

- 如果 tag 名称包含 `beta`、`alpha` 或 `rc`，将创建为 **Pre-release**
- 否则创建为 **正式 Release**

### 构建产物位置

构建完成后，所有平台的安装包将自动上传到 GitHub Release：

- Linux: `artifacts/linux-artifacts/**/*.deb`, `**/*.AppImage`, `**/*.rpm`
- Windows: `artifacts/windows-artifacts/**/*.exe`, `**/*.msi`
- Android: `artifacts/android-artifacts/**/*.apk`

### 故障排查

- **Linux 构建失败**：检查依赖安装步骤，确保所有系统库已正确安装
- **Windows 签名失败**：验证证书是否正确导入，检查 `WINDOWS_CERTIFICATE_THUMBPRINT` 是否匹配
- **Android 构建失败**：确认 Android SDK、NDK 版本与项目配置匹配，检查 keystore 配置是否正确

## Windows 下载与 SmartScreen 说明（重要）

Windows 运行从 GitHub Release 下载的 `.exe` / 安装包时，可能会看到蓝色背景的提示：

- "Windows 已保护你的电脑"（SmartScreen）

这不是你的电脑"发现了病毒"，而是 **SmartScreen 对"未知发布者/信誉不足"的正常拦截**。
对于个人项目/新项目，即使做了自签名，也可能依旧出现提示（需要时间积累信誉，或使用正式证书）。

### 继续运行的方法

1. 在弹窗中点击 **更多信息**（More info）
2. 再点击 **仍要运行**（Run anyway）

### 解除文件"来自互联网"的锁定（可选）

如果你是下载的单个 `.exe`，也可以：

1. 右键文件 → **属性**
2. 在"常规"页底部找到 **解除锁定（Unblock）** 勾选
3. 点击确定后再运行

### 我们当前的策略

- **已补全 Windows 版本资源元数据**（公司名/产品名/文件描述/图标/版本号等），提升"正规软件"观感
- **支持自签名证书签名**（免费方案）：可验证文件完整性，但不保证消除 SmartScreen
- 未来会考虑 **提交 Microsoft 样本分析** 来逐步建立信誉

