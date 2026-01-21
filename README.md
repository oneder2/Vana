# Vana - No Visitors: Git-based Arcane Archive

**版本**: v5.2 (Data Safety & UX Enhancement) / **Beta**: `0.5.2-beta.1`  
**核心理念**: Git 为核 (Git as Engine)、零知识加密 (Zero-Knowledge Encryption)、氛围拟态 (Atmosphere Protocol)、Tauri 驱动。

## 项目概述

Vana 是一个基于 Tauri v2 + Next.js App Router 构建的加密文档管理系统，实现零知识加密、双层保存策略和氛围协议驱动的多主题 UI。

## 技术栈

- **前端**: Next.js App Router + React + TypeScript + Tailwind CSS
- **后端**: Tauri v2 (Rust)
- **加密**: AES-256-GCM (aes-gcm crate)
- **Git**: git2-rs (`git2` crate, libgit2 绑定)
- **密钥存储**: 系统 Keychain/Keystore (通过 tauri-plugin-store)

## 功能特性

### 已实现

1. **Tauri 基础架构**
   - Tauri v2 项目初始化
   - Next.js App Router 集成
   - TypeScript 配置

2. **加密模块**
   - AES-256-GCM 加密/解密
   - 密钥管理（系统 Keychain）
   - 加密文件读写

3. **文件系统操作**
   - 加密文件读写 API
   - 目录列表功能
   - 文件信息查询

4. **Git 集成**
   - Git 仓库初始化
   - 自动提交功能
   - 仓库状态查询
   - 仓库验证功能（检查初始化、提交历史）
   - 提交历史查询

5. **双层保存策略**
   - Tier 1: 防抖磁盘保存（停止打字 2 秒后）
   - Tier 2: Git 自动提交（文档关闭/后台/15分钟）

6. **氛围协议**
   - .vnode.json 配置读写
   - 主题自动加载

7. **多主题 UI**
   - 4 种主题：arcane（奥术）、terminal（终端）、rusty（废土）、vellum（极简）
   - 主题切换功能
   - 响应式设计

8. **核心 UI 组件**
   - 侧边栏文件浏览器
   - 块式编辑器
   - 环形菜单
   - 主题提供者

9. **PAT 存储和管理** (Phase 2 完成)
   - GitHub PAT Token 安全存储（Keychain）
   - PAT 的存储、读取、删除功能
   - 前端 PAT 配置界面

10. **远程仓库配置** (Phase 3 部分完成)
    - 远程仓库添加、查询、删除
    - 支持 HTTPS + PAT 认证
    - 前端远程仓库配置界面

11. **GitHub 云端同步** (Phase 3 完成 ✅)
    - 单分支 `main` 工作流（不使用 draft）
    - 远程同步操作（fetch / fast-forward / rebase / push）✅
    - 同步状态显示
    - 手动同步功能
    - 自动同步集成（在 Git 提交后触发）
    - 冲突检测：rebase 冲突会返回结构化冲突文件列表（用于前端弹窗）✅
    - 冲突处理：支持 ours/theirs/copyBoth（保留两者会生成 *_conflict_<timestamp> 副本）✅

12. **Git 维护功能** (Phase 2 完成 ✅)
    - Git GC 实现（轻量维护策略）✅
    - 打包引用和松散对象 ✅
    - 清理不可达对象 ✅

13. **二维码功能** (Phase 3 完成 ✅)
    - 二维码显示组件（桌面端生成 PAT Token 二维码）✅
    - 二维码扫描组件（移动端扫描导入 PAT Token）✅
    - 设置页面完整集成 ✅
    - 移动端/桌面端自动适配 ✅

### 待实现

- 生物识别认证
- Git 历史折叠功能
- 更多主题和自定义主题
- 文档搜索功能
- 导出功能（PDF、Markdown 等）

> **注意**：所有核心 Git 操作（提交、分支、远程同步、rebase）已完全迁移到 git2-rs API（libgit2 的 Rust 绑定）。Git GC 维护操作（pack-refs、repack、prune）仍使用命令行，但这是低优先级维护功能，不影响核心功能。

## Beta 分发（Desktop）

> 目标：在 Linux/macOS/Windows 上分发 **Beta 版桌面应用**（Tauri bundle）。

### 版本对齐

- **统一版本号**：`0.5.2-beta.1`
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

## Windows 下载与 SmartScreen 说明（重要）

Windows 运行从 GitHub Release 下载的 `.exe` / 安装包时，可能会看到蓝色背景的提示：

- “Windows 已保护你的电脑”（SmartScreen）

这不是你的电脑“发现了病毒”，而是 **SmartScreen 对“未知发布者/信誉不足”的正常拦截**。
对于个人项目/新项目，即使做了自签名，也可能依旧出现提示（需要时间积累信誉，或使用正式证书）。

### 继续运行的方法

1. 在弹窗中点击 **更多信息**（More info）
2. 再点击 **仍要运行**（Run anyway）

### 解除文件“来自互联网”的锁定（可选）

如果你是下载的单个 `.exe`，也可以：

1. 右键文件 → **属性**
2. 在“常规”页底部找到 **解除锁定（Unblock）** 勾选
3. 点击确定后再运行

### 我们当前的策略

- **已补全 Windows 版本资源元数据**（公司名/产品名/文件描述/图标/版本号等），提升“正规软件”观感
- **支持自签名证书签名**（免费方案）：可验证文件完整性，但不保证消除 SmartScreen
- 未来会考虑 **提交 Microsoft 样本分析** 来逐步建立信誉

### 触发条件

推送以 `v` 开头的 tag 时自动触发构建和发布：

```bash
git tag v0.5.2-beta.1
git push origin v0.5.2-beta.1
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
   git commit -m "chore: bump version to 0.5.2-beta.1"
   git push
   ```
3. **创建并推送 tag**：
   ```bash
   git tag v0.5.2-beta.1
   git push origin v0.5.2-beta.1
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

### Phase 5 已完成功能（数据安全与用户体验增强）

- **删除操作 Git 同步** ✅
  - 删除文件/目录时自动提交到 Git 并同步到远程
  - 与重命名操作保持一致的同步机制
  
- **冲突处理安全性增强** ✅
  - 冲突分支创建后验证机制
  - 防止冲突处理时数据丢失
  
- **同步状态 UI 指示灯** ✅
  - 编辑器右上角显示同步状态
  - 呼吸绿：正在同步
  - 静止灰：已是最新
  - 警告红：存在冲突/需要授权
  
- **冲突提示优化** ✅
  - 冲突发生时显示 Toast 通知
  - 同步状态指示器显示冲突警告
  
- **环形菜单操作逻辑** ✅
  - H1、引用、列表、代码块等快捷操作
  - 集成编辑器命令
  
- **窗口状态恢复** ✅
  - 集成 Tauri 窗口 API
  - 应用重启后自动恢复窗口大小和位置
  
- **移动端生命周期事件补强** ✅
  - 集成 Tauri 窗口事件监听
  - 移动端锁屏等场景及时触发 commit

## 项目结构

```
Vana/
├── src-tauri/              # Tauri Rust 后端
│   ├── src/
│   │   ├── main.rs         # Tauri 入口
│   │   ├── commands.rs      # Tauri 命令定义
│   │   ├── crypto.rs        # 加密/解密逻辑
│   │   ├── git.rs           # Git 操作封装
│   │   ├── storage.rs       # 文件系统操作
│   │   └── keychain.rs      # 密钥管理
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                     # Next.js 前端
│   ├── app/                 # App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx         # 主编辑器页面
│   │   └── globals.css
│   ├── components/          # React 组件
│   │   ├── Sidebar.tsx      # 文件浏览器侧边栏
│   │   ├── Editor.tsx        # 主编辑器
│   │   ├── RadialMenu.tsx   # 环形菜单
│   │   ├── ThemeProvider.tsx # 主题管理
│   │   └── BlockRenderer.tsx # 块渲染器
│   ├── lib/                 # 工具函数
│   │   ├── themes.ts        # 主题配置
│   │   ├── atmosphere.ts    # 氛围协议逻辑
│   │   └── api.ts           # Tauri 命令调用封装
│   └── types/               # TypeScript 类型定义
├── public/                  # 静态资源
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## 开发指南

### 前置要求

- Node.js 18+ 
- Rust 1.70+
- Tauri CLI v2

### 安装依赖

```bash
# 安装前端依赖
npm install

# Rust 依赖会在首次构建时自动下载
```

### 开发模式

```bash
# 启动开发服务器（同时启动 Next.js 和 Tauri）
npm run tauri:dev
```

### 构建

```bash
# 构建生产版本
npm run tauri:build
```

## 存储结构

```
App_Sandbox_Data/
├── .vault_keys/           # 密钥元数据（实际密钥在 Keychain）
├── workspace/             # Git 仓库根目录
│   ├── .git/
│   ├── .config/           # 全局配置
│   ├── 奇幻项目/
│   │   ├── .vnode.json   # 主题配置
│   │   └── 序章.enc      # 加密文件
│   └── 废土项目/
│       └── 坐标.enc
```

## 安全说明

- 所有文件内容使用 AES-256-GCM 加密
- 主密钥存储在系统 Keychain/Keystore
- 实现零知识加密，即使文件泄露也无法解密
- 密钥不会出现在代码或日志中

## 许可证

ISC

## 开发状态

项目目前处于开发阶段，核心功能已实现。Phase 2（Git 仓库验证）和 Phase 3（PAT 部署和 GitHub 同步）的基础框架已完成：

### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户


   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户


   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户


   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户


   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户


   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户



### 最新更新 (Phase 2 & Phase 3)

1. **本地 Git 仓库验证**
   - 实现了仓库初始化检查
   - 实现了提交历史查询功能
   - 提供了仓库状态验证 API

2. **PAT 存储系统**
   - 实现了 PAT Token 的安全存储（使用 Keychain）
   - 提供了完整的 PAT 管理 API（存储、读取、删除、检查）
   - 实现了前端 PAT 配置界面

3. **远程仓库配置**
   - 实现了远程仓库的添加、查询、删除功能
   - 支持配置 GitHub 远程仓库 URL

4. **远程同步功能**
   - 实现了同步操作的基础框架（fetch/push）
   - 实现了同步状态显示和手动同步功能
   - 集成了自动同步（在 Git 提交后自动触发）
   - 实现了冲突处理的基础框架
   - **2026-01 更新**：Tier 2 自动提交改为**始终对工作区全局内容提交**（避免“只提交当前文档”的错觉），并在桌面端补强 `blur/focus` 触发以更贴合 `docs/Sync Protocol.md` 的“后台/前台恢复”语义

**注意**: gix 0.66 的 fetch/push API 实现较为复杂，当前版本提供了基础框架和占位符实现。完整的网络同步功能需要进一步研究 gix 的远程操作 API 或考虑使用其他方案。

## 使用说明

### 配置 GitHub 同步

1. **配置 PAT Token**
   - 打开设置页面
   - 在 "GitHub PAT 配置" 区域输入您的 GitHub Personal Access Token
   - 点击 "保存 PAT" 按钮

2. **配置远程仓库**
   - 在 "远程仓库配置" 区域点击 "配置远程仓库" 按钮
   - 系统会自动配置默认的 GitHub 仓库 URL

3. **执行同步**
   - 手动同步：在设置页面点击 "立即同步" 按钮
   - 自动同步：在 Git 自动提交后，如果已配置 PAT 和远程仓库，系统会自动执行同步

### 冲突处理

当检测到同步冲突时，系统会：
1. 自动创建冲突分支（格式：`conflict_[timestamp]`）
2. 尝试恢复主线到远程状态
3. 显示冲突信息给用户

