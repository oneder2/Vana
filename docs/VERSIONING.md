# 版本号管理策略

## 总原则

项目采用主干发布制：

- `feat/*`、`fix/*`、`refactor/*`、`chore/*`：功能开发分支，只做轻量 CI
- `dev`：集成分支，用于测试构建和回归验证
- `main`：发布候选分支，只保留接近可发布的内容
- `v*` tag：正式发布入口，只有打在 `main` 提交上的 tag 才允许创建 Release

## 版本号格式

项目采用 **SemVer**：`major.minor.patch`

- 源代码常驻版本号示例：`0.6.0`
- 正式发布 tag 示例：`v0.6.0`
- 不再默认维护频繁的 `beta/alpha/rc` 子版本流

## 需要保持一致的文件

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

PR 中如果改动这些文件，会由 [version-check.yml](/home/gellar/Desktop/program/personal/Vana/.github/workflows/version-check.yml) 检查一致性。

## 工作流分层

### 1. 分支 CI (`ci.yml`)

**触发条件**
- push 到 `feat/*`、`fix/*`、`refactor/*`、`chore/*`
- PR 指向 `dev` 或 `main`

**执行内容**
- `npm run lint`
- `npm run build`
- `cargo check`

**用途**
- 验证单个功能分支是否破坏主线
- 不生成正式安装包
- 不创建 Release

### 2. Dev 测试构建 (`build-dev.yml`)

**触发条件**
- push 到 `dev`

**执行内容**
- 统一校验
- Linux 预览包构建
- Android Debug 预览包构建
- 上传 GitHub Actions Artifacts（短期保留）

**用途**
- 用于集成测试、回归测试、内部试用
- 不创建 GitHub Release

### 3. Main 发布前校验 (`main-verify.yml`)

**触发条件**
- push 到 `main`

**执行内容**
- 统一校验
- Linux release candidate 构建
- 上传短期预览 artifacts

**用途**
- 验证 `main` 是否达到可发布状态
- 合并到 `main` 不等于立即发版

### 4. 正式发布 (`release.yml`)

**触发条件**
- 推送 `v*` tag，例如 `v1.0.0`

**执行内容**
- 校验 tag 对应提交是否来自 `origin/main`
- 同步版本号
- Linux / Windows / Android 正式构建
- 创建 GitHub Draft Release
- 上传所有构建产物到 GitHub Release

**用途**
- 唯一正式对外交付入口

## 推荐发布流程

1. 在 `feat/*` 分支开发并通过轻量 CI
2. 合并到 `dev`
3. 在 `dev` 上完成测试构建和集成验证
4. 确认满意后合并到 `main`
5. 在 `main` 上确认最终状态
6. 创建正式 tag：

```bash
git checkout main
git pull
git tag v0.6.0
git push origin v0.6.0
```

7. 由 CI 创建 Draft Release，并上传多端构建产物

## 注意事项

1. `main` 是发布候选分支，不是“每次提交都正式发版”的分支
2. 只有 `v*` tag 会创建 GitHub Release
3. 正式 tag 应只打在 `main` 的提交上，工作流也会强制校验这一点
4. 日常开发阶段尽量减少无意义的小版本号变更
