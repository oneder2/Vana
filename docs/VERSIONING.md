# 版本号管理策略

## 版本号格式

项目采用**语义化版本（SemVer）**格式：`major.minor.patch`

- **源代码版本号**：`0.5.2`（纯版本号，无构建元数据）
- **开发构建版本号**：`0.5.2+build.123`（带构建元数据）
- **正式发布版本号**：`0.5.2`（从 Git tag 提取）

## 版本号文件

以下文件需要保持版本号一致：

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## 构建流程

### 开发构建（`build-dev.yml`）

**触发条件**：Push 到 `main` 分支

**版本号处理**：
- 读取源代码中的基础版本号（如 `0.5.2`）
- 添加构建元数据：`0.5.2+build.${{ github.run_number }}`
- Windows MSI 特殊处理：`0.5.2.${{ github.run_number }}`（MSI 要求 `major.minor.patch.build` 格式）

**产物**：
- 上传到 GitHub Artifacts
- 保留 7 天
- **不创建 Release**

**用途**：内部测试、CI 验证

### 正式发布（`release.yml`）

**触发条件**：推送 Git tag（格式：`v*`，如 `v0.5.2`）

**版本号处理**：
1. 从 tag 提取版本号（移除 `v` 前缀）
2. 更新所有源代码文件中的版本号
3. Windows MSI 特殊处理：
   - 正式发布：`major.minor.patch.0`
   - 预发布（beta/alpha/rc）：`major.minor.patch.build`（从 tag 提取，如 `v0.5.2-beta.1` → `0.5.2.1`）

**产物**：
- 创建 GitHub Release
- 上传所有平台构建产物
- 永久保留

**用途**：正式发布给用户

## 版本号更新流程

### 开发阶段

1. 在源代码中更新版本号（三个文件保持一致）
2. 提交并推送到 `main` 分支
3. 自动触发开发构建（带构建元数据）

### 发布阶段

1. 确认代码已测试通过
2. 创建并推送 Git tag：
   ```bash
   git tag v0.5.2
   git push origin v0.5.2
   ```
3. 自动触发正式发布构建
4. CI/CD 自动提取版本号并更新源代码
5. 构建完成后自动创建 Release

## 预发布版本

支持预发布版本（beta、alpha、rc）：

```bash
# Beta 版本
git tag v0.5.2-beta.1
git push origin v0.5.2-beta.1

# Alpha 版本
git tag v0.5.2-alpha.1
git push origin v0.5.2-alpha.1

# Release Candidate
git tag v0.5.2-rc.1
git push origin v0.5.2-rc.1
```

**处理逻辑**：
- 源代码版本号：`0.5.2-beta.1` → `0.5.2`（提取基础版本）
- Windows MSI 版本号：`0.5.2.1`（提取 build 号）
- Release 类型：自动识别为 Pre-release

## 错误构建处理

### 开发构建

- **不影响发布**：开发构建不会创建 Release
- **自动清理**：Artifacts 7 天后自动删除
- **可覆盖**：新的构建会覆盖旧的 Artifacts

### 正式发布

- **Tag 不可变**：Git tag 一旦推送不应删除
- **验证机制**：构建前验证所有必需文件
- **草稿模式**：可考虑先创建 Draft Release，验证后再发布

## 版本号示例

| 场景 | Tag | 源代码版本 | 开发构建版本 | Windows MSI 版本 | Release 类型 |
|------|-----|-----------|-------------|-----------------|-------------|
| 开发构建 | - | `0.5.2` | `0.5.2+build.123` | `0.5.2.123` | - |
| 正式发布 | `v0.5.2` | `0.5.2` | `0.5.2` | `0.5.2.0` | Release |
| Beta 发布 | `v0.5.2-beta.1` | `0.5.2` | `0.5.2` | `0.5.2.1` | Pre-release |
| Alpha 发布 | `v0.5.2-alpha.2` | `0.5.2` | `0.5.2` | `0.5.2.2` | Pre-release |

## 注意事项

1. **版本号一致性**：确保三个配置文件中的版本号始终一致
2. **Tag 命名规范**：必须使用 `v` 前缀（如 `v0.5.2`）
3. **Windows MSI 限制**：MSI 要求 `major.minor.patch.build` 格式，build 号必须 ≤ 65535
4. **构建元数据**：开发构建的元数据（`+build.123`）不会影响正式发布版本号

