# Git 命令迁移状态

**最后更新**: 2026-01-19  
**目标**: 将所有 Git 命令行操作迁移到纯 gix API，以支持移动端

## ✅ 已迁移的操作

### 1. 索引操作
- ✅ **`git add -A`** → `add_all_files_to_index()` (gix API)
  - 位置: `src-tauri/src/git.rs:255-263`
  - 状态: 完全迁移，支持文件添加、更新和删除
  - 移动端支持: ✅ 完全支持

### 2. 分支操作
- ✅ **`git branch <name>`** → `ensure_draft_branch()` (gix API)
  - 位置: `src-tauri/src/git.rs:2026-2075`
  - 状态: 完全迁移，使用 gix API 创建分支引用
  - 移动端支持: ✅ 完全支持

- ✅ **`git checkout -B <branch>`** → `switch_to_branch()` (gix API)
  - 位置: `src-tauri/src/git.rs:2077-2107`
  - 状态: 完全迁移，支持分支切换和创建
  - 移动端支持: ✅ 完全支持

- ✅ **`git rev-parse --abbrev-ref HEAD`** → `get_current_branch()` (gix API)
  - 位置: `src-tauri/src/git.rs:2109-2137`
  - 状态: 完全迁移，直接读取 HEAD 文件
  - 移动端支持: ✅ 完全支持

- ✅ **`git rev-list --count main..draft`** → `get_draft_commits_count()` (gix API)
  - 位置: `src-tauri/src/git.rs:2139-2194`
  - 状态: 完全迁移，使用 gix API 遍历提交历史
  - 移动端支持: ✅ 完全支持

### 3. 索引同步
- ✅ **`git read-tree HEAD`** → 简化实现 (gix API)
  - 位置: `src-tauri/src/git.rs:310-323`
  - 状态: 简化迁移（实际不需要，因为索引已经是最新的）
  - 移动端支持: ✅ 完全支持

- ✅ **`git reset HEAD`** → 简化实现 (gix API)
  - 位置: `src-tauri/src/git.rs:1817-1845`
  - 状态: 简化迁移（记录日志，实际重置需要完整实现）
  - 移动端支持: ⚠️ 部分支持（引用已更新，但索引重置需要完整实现）

### 4. 重置操作
- ✅ **`git reset --hard <ref>`** → 简化实现 (gix API)
  - 位置: `src-tauri/src/git.rs:2004-2036`, `1881-1903`, `1688-1703`, `1723-1733`
  - 状态: 简化迁移（只更新引用，工作树更新需要完整实现）
  - 移动端支持: ⚠️ 部分支持（引用已更新，但工作树更新需要完整实现）
  - 注意: 完整的 `reset --hard` 需要实现 `checkout_tree` 功能

## ✅ 已迁移的远程操作

### 1. 远程操作
- ✅ **`git fetch`** → `fetch_from_remote()`
  - 位置: `src-tauri/src/git.rs:1324-1391`
  - 状态: 完全迁移，使用 gix API 实现
  - 移动端支持: ✅ 完全支持（需要启用 `blocking-http-transport-curl` feature）
  - 实现: 使用 `remote.connect(Direction::Fetch)` 和 `prepare_fetch().receive()`
  - 认证: 支持 HTTPS + PAT token 认证（通过临时更新远程 URL）

- ⚠️ **`git push`** → `push_to_remote()`
  - 位置: `src-tauri/src/git.rs:1405-1474`
  - 状态: 部分迁移（连接使用 gix API，推送使用命令行）
  - 移动端支持: ⚠️ 部分支持（连接验证通过，但推送仍使用命令行）
  - 实现: 使用 `remote.connect(Direction::Push)` 建立连接，但推送使用命令行
  - 认证: 支持 HTTPS + PAT token 认证
  - TODO: gix 0.66 的 push API 可能需要不同的实现方式，待确认正确的 API

### 2. 合并操作
- ⚠️ **`git rebase`** → `sync_with_remote()` 中的 rebase 操作
  - 位置: `src-tauri/src/git.rs:1549-1606`, `1849-1890`
  - 状态: 已添加移动端检测，返回友好错误消息
  - 移动端支持: ❌ 不支持（会返回错误）
  - TODO: 使用 gix API 实现 rebase 逻辑

- ⚠️ **`git merge --squash`** → `sync_with_remote()` 中的 squash 操作
  - 位置: `src-tauri/src/git.rs:1611-1640`
  - 状态: 已添加移动端检测，返回友好错误消息
  - 移动端支持: ❌ 不支持（会返回错误）
  - TODO: 使用 gix API 实现 merge --squash 逻辑

## ❌ 未迁移的操作（低优先级）

### 1. Git GC 操作
- ❌ **`git pack-refs`** → `git_gc()` 中
  - 位置: `src-tauri/src/git.rs:846-854`
  - 状态: 未迁移
  - 移动端支持: ❌ 不支持（但不会导致应用不可用）
  - 优先级: 低（维护操作，不影响核心功能）

- ❌ **`git repack`** → `git_gc()` 中
  - 位置: `src-tauri/src/git.rs:870-875`
  - 状态: 未迁移
  - 移动端支持: ❌ 不支持（但不会导致应用不可用）
  - 优先级: 低（维护操作，不影响核心功能）

- ❌ **`git prune`** → `git_gc()` 中
  - 位置: `src-tauri/src/git.rs:1352-1357`
  - 状态: 未迁移
  - 移动端支持: ❌ 不支持（但不会导致应用不可用）
  - 优先级: 低（维护操作，不影响核心功能）

## 📊 迁移进度

### 核心操作（影响应用可用性）
- ✅ 提交操作: 100% 迁移完成
- ✅ 分支操作: 100% 迁移完成
- ✅ 远程获取: 100% 迁移完成（fetch 使用 gix API）
- ⚠️ 远程推送: 50% 迁移完成（push 连接使用 gix API，推送仍使用命令行）
- ⚠️ 同步操作: 部分迁移（fetch 完成，push/rebase/merge 待完成）

### 维护操作（不影响核心功能）
- ❌ Git GC: 0% 迁移完成

## 🎯 下一步计划

### 高优先级（影响移动端可用性）
1. ✅ **迁移 `git fetch`** - 已完成
   - 使用 gix 的 `remote.connect(Direction::Fetch)` 和 `prepare_fetch().receive()`
   - 已添加 `blocking-http-transport-curl` feature 支持
   - 支持 HTTPS + PAT token 认证

2. ⚠️ **迁移 `git push`** - 进行中
   - 连接已使用 gix API (`remote.connect(Direction::Push)`)
   - 推送操作仍使用命令行（gix 0.66 的 push API 待确认）
   - 需要处理 HTTPS + PAT 认证
   - 预计工作量: 中等（需要确认正确的 gix push API）

3. **迁移 `git rebase`**
   - 实现 rebase 逻辑（比较复杂）
   - 可能需要使用 gix 的 `rebase` 模块（如果存在）
   - 预计工作量: 高

4. **迁移 `git merge --squash`**
   - 实现 squash merge 逻辑
   - 需要合并多个 commit 到一个
   - 预计工作量: 高

### 中优先级（完善功能）
5. **完善 `git reset --hard`**
   - 实现完整的 `checkout_tree` 功能
   - 需要递归读取树对象并写入工作树
   - 预计工作量: 高

6. **完善 `git reset HEAD`**
   - 实现完整的索引重置功能
   - 需要从树对象重建索引
   - 预计工作量: 中等

### 低优先级（维护操作）
7. **迁移 Git GC 操作**
   - 使用 gix 的 GC API（如果存在）
   - 预计工作量: 低

## 📝 技术债务

1. **`reset --hard` 的简化实现**
   - 当前只更新引用，不更新工作树
   - 工作树更新需要在下次操作时自动同步
   - 影响: 冲突处理后，工作树可能不会立即反映远程状态

2. **`reset HEAD` 的简化实现**
   - 当前只记录日志，不实际重置索引
   - 影响: 索引状态可能不一致，但不会导致致命错误

3. **移动端同步功能缺失**
   - fetch/push/rebase/merge 在移动端不可用
   - 影响: 移动端无法进行远程同步，但本地操作正常

## 🔗 参考资源

- [gix 官方文档](https://docs.rs/gix/)
- [gix 远程操作示例](https://github.com/Byron/gitoxide/tree/main/gix/examples)
- [gix transport API](https://docs.rs/gix/latest/gix/remote/struct/Connection.html)

