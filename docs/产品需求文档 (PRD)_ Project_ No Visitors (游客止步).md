# **产品需求文档 (PRD): Project: No Visitors (游客止步) \- Git-based Arcane Archive**

版本: v5.1 (Refined Storage & Sync)  
核心理念: Git 为核 (Git as Engine)、零知识加密 (Zero-Knowledge Encryption)、氛围拟态 (Atmosphere Protocol)、Tauri 驱动。

## **1\. 架构方案 (Technical Architecture)**

* **客户端 (Client):** **Tauri v2** (Next.js \+ Rust).  
  * *优势:* 跨平台（iOS/Android/Desktop），原生访问文件系统，支持 Rust 层的极速加密。  
* **存储引擎 (Storage):** **本地文件系统 \+ Git**.  
  * *逻辑:* App 作为“逻辑管理器”，Git 仓库作为“持久化后端”。  
  * *关系:* App 在系统沙盒的数据目录下维护一个标准的 Git 仓库。  
* **同步后端 (Remote):** **GitHub Private Repo**.  
  * *协议:* HTTPS \+ PAT (Personal Access Token)。  
* **安全层 (Security):** **应用层 AES-256-GCM 加密**.  
  * *逻辑:* 写入磁盘前加密。密钥保存在设备原生的安全存储（Keychain/Keystore）中。

## **2\. 核心功能设计 (Functional Requirements)**

### **2.1 双层保存逻辑 (Two-Tier Saving)**

为了平衡响应速度与版本冗余，采用双层策略：

* **Tier 1: 磁盘缓存 (Debounced Disk Save)**  
  * 触发：用户停止打字 2 秒。  
  * 操作：将当前 Block 的加密密文覆盖写入对应的 .enc 文件。  
  * 目的：防止 App 异常退出导致丢稿。  
* **Tier 2: Git 快照 (Contextual Commit)**  
  * 触发：退出文档、App 切入后台、或连续编辑超过 15 分钟。  
  * 操作：git add . \+ git commit \-m "auto\_snapshot"。  
  * 目的：生成可追溯的版本历史。

### **2.2 存储优化与历史归档 (History Management)**

针对海量文字产生的 Git 历史堆积：

* **自动整理 (Auto-GC):** 应用闲时后台执行 git gc。  
* **历史折叠 (History Squash):** 提供“归档历史点”功能。  
  * 允许用户选择某个时间点以前的所有 Commit 压缩合并为一个。  
  * 极大缩减 .git 文件夹体积并优化扫描速度。

### **2.3 氛围协议 (Atmosphere Protocol)**

* **元数据存储:** 在每个文件夹下存放一个隐藏的 .vnode.json。  
* **动态主题:** 进入不同目录，UI 自动加载对应的 CSS 变量、字体和音效。

### **2.4 极致私密 (Private Fortress)**

* **本地屏障:** 启动应用需调用设备原生的生物识别（FaceID/指纹）。  
* **零知识同步:** 即使云端泄露，无密钥也无法解密内容。

## **3\. 物理存储结构 (Storage Layout)**

/App\_Sandbox\_Data/  
  ├── .vault\_keys/           \# 本地 PIN 码的盐值及关键指纹（核心密钥在 Keychain）  
  ├── workspace/             \# Git 仓库根目录  
  │    ├── .git/             \# 压缩后的版本历史  
  │    ├── .config/          \# 全局氛围配置  
  │    ├── 奇幻项目/           
  │    │    ├── .vnode.json  \# 存储主题：{"theme": "arcane"}  
  │    │    └── 序章.enc      \# 加密正文  
  │    └── 废土项目/  
  │         └── 坐标.enc

## **4\. 关键技术细节 (Technical Implementation)**

### **4.1 离线与同步冲突策略**

* **Git Rebase 优先:** 同步时先 fetch。  
* **冲突自动隔离:** 若 rebase 失败（检测到内容冲突），系统不显示代码冲突标记，而是自动：  
  1. git checkout \-b conflict\_\[date\] 创建孤立分支。  
  2. git reset \--hard origin/main 恢复主线干净状态。  
  3. UI 提醒：“检测到其他位面的干预，已为您创建一份副本存入\[回收站\]。”

### **4.2 加密流程**

1. 用户输入文字。  
2. 调用 Rust 层使用 **AES-256-GCM** 加密。  
3. 将密文及认证标签写入文件。

## **5\. 开发路线图 (Roadmap for Agent)**

1. **Phase 1: Tauri 基础 & 文件系统接口**  
   * 搭建 Tauri v2 环境。  
   * **核心:** 在 Rust 侧实现加密的文件读写 API (read\_encrypted, write\_encrypted)。  
2. **Phase 2: Git 自动化组件**  
   * 集成 Rust 层的 gix 绑定。  
   * 实现双层保存逻辑（缓存写入 vs Git 提交）。  
3. **Phase 3: 授权与云端**  
   * 对接 GitHub OAuth/PAT 流程。  
   * 实现 Rebase \+ 冲突自动隔离逻辑。  
4. **Phase 4: 多维主题 UI**  
   * 编写前端的主题切换引擎。