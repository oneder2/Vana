# Vana

**版本**: v0.6.0  
**当前主线**: Local-first、SQLite、Supabase、Tauri 驱动。

## 项目概述

Vana 是一个基于 Tauri v2 + Vite + React 构建的本地优先文档应用。当前主线已经从 Git/PAT 同步切换到 `SQLite + Supabase` 路线：

- 本地写作先落 SQLite
- Supabase 负责账号与同步中心
- 保留 PDF / DOCX / Markdown 导出与多主题编辑体验

## 核心特性

- Local-first：文档先写入本地 SQLite
- Supabase 登录与同步：邮箱 Magic Link + 自动增量同步
- 文档库能力：收藏、最近文档、归档、回收站、标签、模板入口
- 导出能力：PDF、DOCX、Markdown
- 多主题编辑界面：arcane、terminal、rusty、vellum
- 跨平台：Linux、Windows、Android（Beta）

## 快速开始

### 下载

从 [GitHub Releases](https://github.com/your-username/Vana/releases) 下载对应平台的安装包。

> **Windows 用户注意**：首次运行可能遇到 SmartScreen 警告，这是正常现象。详见 [部署文档](./docs/DEPLOYMENT.md#windows-下载与-smartscreen-说明重要)。

### 基本使用

1. **配置 Supabase**（可选，但推荐）
   - 打开设置页面
   - 填写 Supabase URL 和 Anon Key
  - 发送 Magic Link
  - 导入回调会话
  - 返回主页等待自动同步

2. **创建文档**
   - 在左侧文件树中右键创建文件或目录
   - 点击文件开始编辑

3. **主题切换**
   - 点击顶部导航栏的"氛围协议"按钮
   - 预览并选择主题（预览不会应用到实际文件）

4. **导出文档**
   - 打开文档后，点击顶部工具栏的导出按钮（下载图标）
   - 选择导出格式（PDF、DOCX 或 Markdown）
   - 导出的文档会自动应用当前文档的氛围协议主题样式

5. **管理文档库**
   - 在侧边栏查看文档库、归档、回收站与标签筛选
   - 使用顶部工具栏完成收藏、归档、移至回收站等操作

## 文档导航

### 用户文档

- [产品需求文档](./docs/产品需求文档%20(PRD)_%20Project_%20No%20Visitors%20(游客止步).md) - 完整的产品设计说明
- [更新日志](./docs/CHANGELOG.md) - 版本更新记录和功能列表

### 开发者文档

- [Supabase 配置指南](./docs/SUPABASE_SETUP.md) - 主线同步方案的表结构、RLS 和账号配置
- [附件 / 图片 Storage 方案](./docs/ATTACHMENT_STORAGE_PLAN.md) - Storage 元数据预留与后续实现顺序
- [开发指南](./docs/DEVELOPMENT.md) - 技术栈、项目结构、构建说明
- [部署指南](./docs/DEPLOYMENT.md) - CI/CD、发布流程、Windows SmartScreen 说明、工作流测试
- [版本号管理策略](./docs/VERSIONING.md) - 版本号格式和构建流程
- [同步协议](./docs/Sync%20Protocol.md) - Git 自动化同步协议详细说明

## 当前状态说明

- 主线不再依赖 GitHub PAT 与远程仓库
- 旧 Git 同步路线将作为归档/极客分支保留，不再是默认产品方向
- 当前 Supabase 同步已切到自动增量基础版，后续再继续补实时与附件云同步

## 许可证

ISC

## 开发状态

项目目前处于 **Beta 阶段**。当前主线已覆盖本地写作、基础 Supabase 登录/同步、导出、多主题 UI 与移动端最低可运行支持。

---

**相关链接**：
- [GitHub Issues](https://github.com/your-username/Vana/issues)
- [GitHub Releases](https://github.com/your-username/Vana/releases)
