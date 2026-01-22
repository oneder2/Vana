# Vana - No Visitors: Git-based Arcane Archive

**版本**: v0.5.2 (Beta Release)  
**核心理念**: Git 为核 (Git as Engine)、零知识加密 (Zero-Knowledge Encryption)、氛围拟态 (Atmosphere Protocol)、Tauri 驱动。

## 项目概述

Vana 是一个基于 Tauri v2 + Next.js App Router 构建的加密文档管理系统，实现零知识加密、双层保存策略和氛围协议驱动的多主题 UI。

## 核心特性

- 🔐 **零知识加密**：所有文件内容使用 AES-256-GCM 加密，密钥存储在系统 Keychain/Keystore
- 📝 **双层保存策略**：防抖磁盘保存 + Git 自动提交，确保数据安全与版本追溯
- 🌐 **Git 云端同步**：单分支 `main` 工作流，支持 rebase 冲突处理和交互式解决
- 🎨 **氛围协议**：多主题 UI（arcane、terminal、rusty、vellum），支持目录级主题配置
- 📱 **跨平台支持**：Linux、Windows、Android（Beta）

## 快速开始

### 下载

从 [GitHub Releases](https://github.com/your-username/Vana/releases) 下载对应平台的安装包。

> **Windows 用户注意**：首次运行可能遇到 SmartScreen 警告，这是正常现象。详见 [部署文档](./docs/DEPLOYMENT.md#windows-下载与-smartscreen-说明重要)。

### 基本使用

1. **配置 GitHub 同步**（可选）
   - 打开设置页面
   - 配置 GitHub PAT Token 和远程仓库 URL
   - 点击"立即同步"进行首次同步

2. **创建文档**
   - 在左侧文件树中右键创建文件或目录
   - 点击文件开始编辑

3. **主题切换**
   - 点击顶部导航栏的"氛围协议"按钮
   - 预览并选择主题（预览不会应用到实际文件）

## 文档导航

### 用户文档

- [产品需求文档](./docs/产品需求文档%20(PRD)_%20Project_%20No%20Visitors%20(游客止步).md) - 完整的产品设计说明
- [更新日志](./docs/CHANGELOG.md) - 版本更新记录和功能列表

### 开发者文档

- [开发指南](./docs/DEVELOPMENT.md) - 技术栈、项目结构、构建说明、Git 实现
- [部署指南](./docs/DEPLOYMENT.md) - CI/CD、发布流程、Windows SmartScreen 说明、工作流测试
- [版本号管理策略](./docs/VERSIONING.md) - 版本号格式和构建流程
- [同步协议](./docs/Sync%20Protocol.md) - Git 自动化同步协议详细说明

## 安全说明

- 所有文件内容使用 AES-256-GCM 加密
- 主密钥存储在系统 Keychain/Keystore
- 实现零知识加密，即使文件泄露也无法解密
- 密钥不会出现在代码或日志中

## 许可证

ISC

## 开发状态

项目目前处于 **Beta 阶段**，核心功能已实现，正在调试发布release。欢迎反馈和建议！

---

**相关链接**：
- [GitHub Issues](https://github.com/your-username/Vana/issues)
- [GitHub Releases](https://github.com/your-username/Vana/releases)
