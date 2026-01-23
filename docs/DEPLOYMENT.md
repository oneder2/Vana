# 部署与发布指南

本文档说明如何构建、签名和发布应用。

## Beta 分发（Desktop）

### 版本对齐

- **统一版本号**：`0.5.2`（语义化版本格式）
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
git tag v0.5.2
git push origin v0.5.2
```

### 支持的平台

- **Linux**: `.deb`, `.AppImage`, `.rpm` 安装包
- **Windows**: `.exe`, `.msi` 安装包（已签名）
- **Android**: Release APK

### GitHub Secrets 配置

在 GitHub 仓库设置中配置以下 Secrets（Settings → Secrets and variables → Actions）：

#### 检查方法

1. 前往 GitHub 仓库：`Settings` → `Secrets and variables` → `Actions`
2. 检查以下 Secrets 是否存在

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

Android 应用需要使用数字证书签名才能发布。以下是配置步骤：

##### 1. 生成 Keystore

使用 `keytool` 生成签名密钥：

```bash
# macOS/Linux
keytool -genkey -v -keystore ~/upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias release

# Windows
keytool -genkey -v -keystore %USERPROFILE%\upload-keystore.jks ^
  -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias release
```

**重要提示**:
- 妥善保管 keystore 文件和密码
- 不要将 keystore 提交到版本控制
- 建议使用密码管理器保存密码
- 证书有效期建议设置为 10000 天（约 27 年）

##### 2. 验证 Keystore

```bash
# 查看 keystore 信息
keytool -list -v -keystore upload-keystore.jks -storepass <密码>

# 验证 alias
keytool -list -keystore upload-keystore.jks -alias release -storepass <密码>
```

记录以下信息（发布到 Google Play 时需要）:
- **SHA256 指纹**: 用于 Google Play App Signing
- **有效期**: 确保证书在应用生命周期内有效

##### 3. 配置 GitHub Secrets

将以下信息添加到 GitHub Repository Secrets:

- `ANDROID_KEYSTORE_BASE64`: Keystore 文件的 Base64 编码
  ```bash
  # macOS/Linux
  base64 -i upload-keystore.jks | pbcopy

  # Linux (如果没有 pbcopy)
  base64 upload-keystore.jks | xclip -selection clipboard

  # Windows
  certutil -encode upload-keystore.jks keystore.txt
  # 然后打开 keystore.txt，复制内容（去掉首尾的 BEGIN/END 行）
  ```

- `ANDROID_KEYSTORE_PASSWORD`: Keystore 密码（storePassword）
- `ANDROID_KEY_ALIAS`: 密钥别名（通常是 `release`）
- `ANDROID_KEY_PASSWORD`: 密钥密码（keyPassword，可以与 storePassword 相同）

##### 4. 本地测试签名配置

运行测试脚本验证配置：

```bash
chmod +x scripts/test-android-signing.sh
./scripts/test-android-signing.sh
```

此脚本会检查：
- ✅ 环境变量是否正确设置
- ✅ Keystore 文件是否有效
- ✅ 密码和 alias 是否匹配
- ✅ 证书信息和有效期

##### 5. CI/CD 自动签名流程

CI 构建时会自动执行以下步骤：

1. **解码 Keystore**: 从 `ANDROID_KEYSTORE_BASE64` 解码 JKS 文件
2. **创建配置文件**: 生成 `keystore.properties` 文件
3. **配置 Gradle**: 运行 `configure-android-signing.py` 修改 `build.gradle.kts`
4. **构建签名 APK**: Gradle 自动使用配置的签名密钥
5. **清理敏感文件**: 构建完成后删除 keystore 和配置文件

##### 6. 验证签名

下载构建的 APK 后，验证签名：

```bash
# 使用 apksigner (Android SDK)
apksigner verify --print-certs your-app.apk

# 使用 jarsigner (JDK)
jarsigner -verify -verbose -certs your-app.apk
```

确认：
- ✅ 签名有效
- ✅ SHA256 指纹与 keystore 一致
- ✅ 证书未过期

### 发布流程

1. **更新版本号**：确保 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 中的版本号一致（当前为 `0.5.2`）
2. **提交更改**（如有代码更改）：
   ```bash
   git add .
   git commit -m "chore: prepare for release v0.5.2"
   git push
   ```
3. **创建并推送 tag**：
   ```bash
   git tag v0.5.2
   git push origin v0.5.2
   ```
   
   > **注意**：版本号会自动从 tag 提取，无需在源代码中手动更新版本号。
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

### Secrets 配置验证

#### 验证 Base64 格式

可以使用以下命令验证 Base64 编码是否正确：

```bash
# 验证 Windows 证书
echo "$WINDOWS_CERTIFICATE" | base64 -d > test_cert.pfx
file test_cert.pfx  # 应显示 "PKCS #7" 或类似

# 验证 Android keystore
echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > test_keystore.jks
file test_keystore.jks  # 应显示 "Java KeyStore" 或类似
```

#### 测试构建

创建一个测试 tag 来验证 Secrets 是否正确：

```bash
git tag v0.5.2-test
git push origin v0.5.2-test
```

在 GitHub Actions 中观察构建日志，检查：
- Windows 构建：证书导入是否成功
- Android 构建：keystore 配置是否成功

清理测试 tag：

```bash
git push origin --delete v0.5.2-test
git tag -d v0.5.2-test
```

#### 常见问题

- **Windows 证书导入失败**：Base64 编码错误或密码错误
- **Android keystore 配置失败**：Base64 编码错误、密码错误或别名不存在
- **证书/密钥泄露**：Secrets 一旦配置，不要在日志中输出

## 工作流测试指南

### 测试开发构建工作流

#### 步骤 1：推送测试提交

```bash
# 创建一个空提交来触发构建
git commit --allow-empty -m "test: trigger dev build workflow"
git push origin main
```

#### 步骤 2：观察构建

1. 前往 GitHub 仓库的 `Actions` 页面
2. 查看 `Development Build` 工作流
3. 验证：
   - ✅ 构建成功
   - ✅ Artifacts 上传成功
   - ✅ 版本号格式正确（`0.5.2+build.XXX`）
   - ✅ 通知发送成功（如果配置了 Slack Webhook）

#### 步骤 3：检查 Artifacts

1. 在构建完成后，点击 `Artifacts` 部分
2. 下载并验证：
   - Linux: `.deb`, `.AppImage`, `.rpm`
   - Windows: `.exe`, `.msi`
   - Android: `.apk`

### 测试正式发布工作流

#### 步骤 1：创建测试 tag

```bash
# 创建测试 tag
git tag v0.5.2-test
git push origin v0.5.2-test
```

#### 步骤 2：观察构建

1. 前往 GitHub 仓库的 `Actions` 页面
2. 查看 `Build and Release` 工作流
3. 验证：
   - ✅ 版本号提取正确（`0.5.2-test` → `0.5.2-test`）
   - ✅ Windows MSI 版本号正确（`0.5.2-test.0`）
   - ✅ 构建验证通过
   - ✅ Draft Release 创建成功
   - ✅ 通知发送成功

#### 步骤 3：检查 Draft Release

1. 前往 GitHub 仓库的 `Releases` 页面
2. 找到 Draft Release `v0.5.2-test`
3. 验证：
   - ✅ 所有平台产物已上传
   - ✅ 文件大小合理（> 1MB）
   - ✅ Release 说明正确

#### 步骤 4：清理测试 tag

```bash
# 删除远程 tag
git push origin --delete v0.5.2-test

# 删除本地 tag
git tag -d v0.5.2-test
```

### 测试版本号检查工作流

#### 步骤 1：创建测试 PR

```bash
# 创建一个新分支
git checkout -b test/version-check

# 修改版本号（故意不一致）
# 编辑 package.json，将版本号改为 0.5.3
# 编辑 src-tauri/Cargo.toml，保持版本号为 0.5.2

# 提交并推送
git add .
git commit -m "test: version inconsistency"
git push origin test/version-check

# 创建 PR
```

#### 步骤 2：观察检查结果

1. 在 PR 页面查看 `Version Check` 工作流
2. 验证：
   - ✅ 检测到版本不一致
   - ✅ PR 评论已添加
   - ✅ 工作流状态为失败

#### 步骤 3：修复并验证

```bash
# 修复版本号
# 确保三个文件版本号一致

# 提交修复
git add .
git commit -m "fix: version consistency"
git push origin test/version-check
```

### 测试预发布版本

#### 步骤 1：创建 beta tag

```bash
git tag v0.5.2-beta.1
git push origin v0.5.2-beta.1
```

#### 步骤 2：验证

1. 检查版本号提取：
   - 源代码版本：`0.5.2`
   - Windows MSI 版本：`0.5.2.1`
2. 检查 Release 类型：
   - ✅ 应为 Pre-release
3. 清理：
   ```bash
   git push origin --delete v0.5.2-beta.1
   git tag -d v0.5.2-beta.1
   ```

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

