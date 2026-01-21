# 开发指南

本文档面向开发者，提供技术栈、项目结构、构建和开发流程的详细说明。

## 技术栈

- **前端**: Next.js App Router + React + TypeScript + Tailwind CSS
- **后端**: Tauri v2 (Rust)
- **加密**: AES-256-GCM (aes-gcm crate)
- **Git**: git2-rs (`git2` crate, libgit2 绑定)
- **密钥存储**: 系统 Keychain/Keystore (通过 tauri-plugin-store)

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
│   │   ├── Editor.tsx       # 主编辑器
│   │   ├── RadialMenu.tsx   # 环形菜单
│   │   ├── ThemeProvider.tsx # 主题管理
│   │   └── BlockRenderer.tsx # 块渲染器
│   ├── lib/                 # 工具函数
│   │   ├── themes.ts        # 主题配置
│   │   ├── atmosphere.ts    # 氛围协议逻辑
│   │   └── api.ts           # Tauri 命令调用封装
│   └── types/               # TypeScript 类型定义
├── public/                  # 静态资源
├── docs/                   # 项目文档
├── package.json
├── next.config.js
├── tailwind.config.js
└── tsconfig.json
```

## 前置要求

- Node.js 18+
- Rust 1.70+
- Tauri CLI v2

## 安装依赖

```bash
# 安装前端依赖
npm install

# Rust 依赖会在首次构建时自动下载
```

## 开发模式

```bash
# 启动开发服务器（同时启动 Next.js 和 Tauri）
npm run tauri:dev
```

## 构建

```bash
# 构建生产版本
npm run tauri:build
```

构建产物位置：`src-tauri/target/release/bundle/`（按平台生成 `deb/AppImage/msi/dmg` 等）

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

## 核心功能实现

### Git 操作

> **注意**：所有核心 Git 操作（提交、分支、远程同步、rebase）已完全迁移到 git2-rs API（libgit2 的 Rust 绑定）。Git GC 维护操作（pack-refs、repack、prune）仍使用命令行，但这是低优先级维护功能，不影响核心功能。

### 双层保存策略

- **Tier 1**: 防抖磁盘保存（停止打字 2 秒后）
- **Tier 2**: Git 自动提交（文档关闭/后台/15分钟）

### 氛围协议

- `.vnode.json` 配置读写
- 主题自动加载
- 多主题 UI（arcane、terminal、rusty、vellum）

## 版本管理

版本号格式：`major.minor.patch.build`

版本号需要在以下文件中保持一致：
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

## 相关文档

- [产品需求文档](./产品需求文档%20(PRD)_%20Project_%20No%20Visitors%20(游客止步).md)
- [同步协议](./Sync%20Protocol.md)
- [Git 命令迁移状态](./Git命令迁移状态.md)

