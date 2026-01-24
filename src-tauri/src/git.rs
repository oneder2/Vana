// No Visitors - Git 操作模块
// 使用 git2-rs 库进行 Git 仓库管理（libgit2 的 Rust 绑定）
// 实现自动提交、状态查询和历史管理功能
// 支持 SSH 和 PAT 验证模式
//
// 基于 git2 0.18 API 实现：https://docs.rs/git2/0.18/git2/

use anyhow::{Context, Result};
use std::path::Path;
use git2::{Commit, Repository, Signature};

/// 验证模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)]
pub enum AuthMode {
    None,    // 无验证（仅本地操作）
    Ssh,     // SSH 密钥验证
    Pat,     // Personal Access Token 验证
}

/// 初始化 Git 仓库
pub fn init_repository(path: &Path) -> Result<()> {
    Repository::init(path)
    .context("无法初始化 Git 仓库")?;

    // 配置默认用户信息
    let git_config_path = path.join(".git/config");
    let mut config_content = if git_config_path.exists() {
        std::fs::read_to_string(&git_config_path)?
    } else {
        String::new()
    };

    if !config_content.contains("[user]") {
        config_content.push_str("\n[user]\n");
    }
    if !config_content.contains("name =") {
        config_content.push_str("\tname = No Visitors User\n");
    }
    if !config_content.contains("email =") {
        config_content.push_str("\temail = no-visitors@localhost\n");
    }

    std::fs::write(&git_config_path, config_content)?;

    Ok(())
}

/// 提交所有更改（全局提交）
pub fn commit_changes(repo_path: &Path, message: &str) -> Result<String> {
    eprintln!("[GitOperation] commit_changes: 开始提交（main 单分支）");

    // 如果还未初始化（没有 .git），先初始化仓库
    if !repo_path.join(".git").exists() {
        eprintln!("[GitOperation] commit_changes: 检测到未初始化仓库，先 init_repository");
        init_repository(repo_path)?;
    }
    
    // 打开仓库
    let repo = Repository::open(repo_path).context("无法打开 Git 仓库")?;

    // 确保 HEAD 指向 main（包括 unborn HEAD / detached HEAD 场景）
    // 使用符号引用强制 HEAD -> refs/heads/main（即使 main 分支尚未创建）
    repo.reference_symbolic("HEAD", "refs/heads/main", true, "set HEAD to main")
        .context("无法将 HEAD 指向 main")?;
    
    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    // 获取索引
    let mut index = repo.index()
        .context("无法获取索引")?;
    
    // 优化顺序：先移除已删除的文件，再添加新文件
    // 这样可以确保索引状态更准确，避免已删除的文件在索引中残留
    eprintln!("[GitOperation] commit_changes: 更新索引（移除已删除的文件）");
    index.update_all(&["*"], None)
        .context("无法更新索引（移除已删除）")?;
    
    // 然后添加所有文件到索引（包括新文件和已修改的文件）
    eprintln!("[GitOperation] commit_changes: 添加所有文件到索引");
    index.add_all(&["*"], git2::IndexAddOption::DEFAULT, None)
        .context("无法添加文件到索引")?;

    // 写入索引
    index.write()
        .context("无法写入索引")?;

    let tree_id = index.write_tree()
        .context("无法从索引创建树对象")?;

    // 获取父提交（HEAD）
    let parent_commit = repo.head()
                .ok()
        .and_then(|r| r.peel_to_commit().ok());
    
    // 检查是否有实际更改：比较新树和父提交的树
    let should_commit = if let Some(ref parent) = parent_commit {
        let parent_tree = parent.tree().context("无法获取父提交的树对象")?;
        if parent_tree.id() == tree_id {
            eprintln!("[GitOperation] commit_changes: 检测到没有文件更改，跳过提交");
            // 返回父提交的 OID，表示没有新提交
            return Ok(parent.id().to_string());
        }
        true
        } else {
        // 没有父提交（初始提交），需要提交
        true
    };
    
    if !should_commit {
        // 这种情况不应该发生，但为了安全起见
        return Err(anyhow::anyhow!("无法确定是否需要提交"));
    }
    
    let tree = repo.find_tree(tree_id)
        .context("无法找到树对象")?;
    
    // 获取用户签名
    let sig = repo.signature()
        .unwrap_or_else(|_| {
            // 如果仓库没有配置 user.name 和 user.email，使用默认值
            Signature::now("No Visitors User", "no-visitors@localhost")
                .unwrap_or_else(|_| {
                    // 如果默认签名创建也失败（极不可能），使用当前时间戳
                    Signature::now("User", "user@localhost")
                        .expect("无法创建 Git 签名（这是系统级错误）")
                })
        });
    
    let parents: Vec<&Commit> = parent_commit.iter().collect();
    
    // 创建提交（提交到 HEAD 指向的 main 分支）
    let commit_oid = repo
        .commit(
        Some("HEAD"),
        &sig,
        &sig,
        message,
        &tree,
        &parents,
    )
    .map_err(|e| {
        // 让前端能看到更具体的原因（例如：unborn HEAD / invalid name / config 等）
        anyhow::anyhow!(
            "无法创建提交: git2 error (class={:?}, code={:?}): {}",
            e.class(),
            e.code(),
            e.message()
        )
    })?;

    // 确保 HEAD 指向 main（避免出现 detached HEAD 或落在其它分支）
    // 注意：不要在 commit 后强制 checkout_head(force)，因为：
    // 1. commit 已经更新了索引和工作区状态
    // 2. 强制 checkout 会覆盖用户的工作区，导致"删除/重命名后又恢复"的问题
    // 3. 如果 HEAD 已经是 detached 或指向错误分支，只需要 set_head 即可（不强制 checkout）
    repo.set_head("refs/heads/main")
        .context("无法设置 HEAD 到 main 分支")?;
    // 移除 checkout_head(force)：commit 已经更新了索引，工作区状态应该与索引一致
    // 如果工作区有未暂存的更改，那是用户的工作，不应该被强制覆盖
    
    eprintln!("[GitOperation] commit_changes: 提交成功: {}", commit_oid);
    
    Ok(commit_oid.to_string())
}

/// 获取仓库状态
pub fn get_repository_status(repo_path: &Path) -> Result<GitStatus> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;

    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;

    // 重新读取索引（确保最新状态）
    let mut index = repo.index()
        .context("无法获取索引")?;
    index.read(false)
        .context("无法读取索引")?;
    
    // 获取状态（检查工作区和索引的差异）
    let statuses = repo.statuses(Some(git2::StatusOptions::new().include_untracked(true)))
        .context("无法获取仓库状态")?;
    
    let has_changes = statuses.len() > 0;

    Ok(GitStatus {
        has_changes,
        is_clean: !has_changes,
    })
}

/// Git 仓库状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub has_changes: bool,
    pub is_clean: bool,
}

/// 清理索引锁文件
fn cleanup_index_lock(repo_path: &Path) -> Result<()> {
    let lock_path = repo_path.join(".git/index.lock");
    if lock_path.exists() {
        eprintln!("[GitOperation] cleanup_index_lock: 检测到锁文件，清理: {:?}", lock_path);
        for attempt in 1..=5 {
            match std::fs::remove_file(&lock_path) {
                Ok(_) => {
                    eprintln!("[GitOperation] cleanup_index_lock: 锁文件已清理（尝试 {}）", attempt);
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    return Ok(());
                }
                Err(e) => {
                    eprintln!("[GitOperation] cleanup_index_lock: 清理锁文件失败（尝试 {}）: {:?}", attempt, e);
                    if attempt < 5 {
                        std::thread::sleep(std::time::Duration::from_millis(100 * attempt));
                    }
                }
            }
        }
    }
    Ok(())
}

/// 为“空远端仓库”的首次 push 准备最小文件集合，避免推送空仓库导致 main 无法建立
fn seed_initial_files(repo_path: &Path) -> Result<()> {
    let gitignore_path = repo_path.join(".gitignore");
    if !gitignore_path.exists() {
        let content = r#"# Vana / No Visitors
.DS_Store
Thumbs.db
.vscode/
.idea/
*.swp
*.tmp
*.log
"#;
        std::fs::write(&gitignore_path, content)
            .with_context(|| format!("无法写入 .gitignore: {}", gitignore_path.display()))?;
    }

    let readme_path = repo_path.join("README.md");
    if !readme_path.exists() {
        let content = "# Workspace\n\nThis repository is managed by Vana (No Visitors).\n";
        std::fs::write(&readme_path, content)
            .with_context(|| format!("无法写入 README.md: {}", readme_path.display()))?;
    }

    Ok(())
}

/// 切换到指定分支
/// 
/// 注意：此函数会强制 checkout，可能覆盖工作区的未提交更改。
/// 调用前应确保工作区干净，或已保存所有重要更改。
pub fn switch_to_branch(repo_path: &Path, branch: &str) -> Result<()> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    let refname = format!("refs/heads/{}", branch);
    
    // 检查是否已经在目标分支上
    if let Ok(head) = repo.head() {
        if let Some(head_name) = head.name() {
            if head_name == refname {
                eprintln!("[GitOperation] switch_to_branch: 已在分支 {} 上，无需切换", branch);
                return Ok(());
            }
        }
    }
    
    let obj = repo.revparse_single(&refname)
        .context(format!("无法找到分支: {}", branch))?;
    
    // 注意：这里使用 force checkout，会覆盖工作区的未提交更改
    // 调用者应确保工作区干净或已保存重要更改
    repo.checkout_tree(&obj, Some(git2::build::CheckoutBuilder::new().force()))
        .context(format!("无法切换到分支: {}", branch))?;
    
    repo.set_head(&refname)
        .context(format!("无法设置 HEAD 到分支: {}", branch))?;
    
    eprintln!("[GitOperation] switch_to_branch: 已切换到分支 {}", branch);
    Ok(())
}

/// 获取当前分支名
pub fn get_current_branch(repo_path: &Path) -> Result<String> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    let head = repo.head()
        .context("无法获取 HEAD")?;
    
    let branch_name = head.shorthand()
        .ok_or_else(|| anyhow::anyhow!("无法获取分支名"))?;
    
    Ok(branch_name.to_string())
}

/// 获取远程 URL
pub fn get_remote_url(repo_path: &Path, name: &str) -> Result<Option<String>> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    let remote = repo.find_remote(name);
    match remote {
        Ok(remote) => Ok(remote.url().map(|s| s.to_string())),
        Err(_) => Ok(None),
    }
}

/// 从远程获取更新
pub fn fetch_from_remote(repo_path: &Path, remote_name: &str, pat_token: Option<&str>) -> Result<()> {
    eprintln!("[GitOperation] fetch_from_remote: 开始执行 fetch（使用 git2-rs API），remote_name: {}, repo_path: {:?}", remote_name, repo_path);

    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;

    let mut remote = repo.find_remote(remote_name)
        .context(format!("无法找到远程仓库: {}", remote_name))?;

    // 如果提供了 PAT token，临时更新远程 URL
    if let Some(pat) = pat_token {
        let url = remote.url()
            .ok_or_else(|| anyhow::anyhow!("远程 URL 为空"))?;

        if url.starts_with("https://") {
            let url_without_protocol = url.strip_prefix("https://").unwrap_or(url);
            let authenticated_url = if let Some(at_pos) = url_without_protocol.find('@') {
                let path_after_at = &url_without_protocol[at_pos + 1..];
                format!("https://{}@{}", pat, path_after_at)
            } else {
                format!("https://{}@{}", pat, url_without_protocol)
            };

            eprintln!("[GitOperation] fetch_from_remote: 临时更新远程 URL 以包含 PAT 认证");
            // 先删除再创建以更新 URL
            // 注意：删除重建会导致 fetch 配置累积，需要在重建后清理
            repo.remote_delete(remote_name)?;
            remote = repo.remote(remote_name, &authenticated_url)?;

            // 重建后，清理可能累积的 fetch 配置，只保留一个
            // 这可以防止 multivar 错误
            if let Ok(mut config) = repo.config() {
                let fetch_key = format!("remote.{}.fetch", remote_name);
                // 删除所有旧的 fetch 配置
                let _ = config.remove_multivar(&fetch_key, ".*");
                // 添加单个 fetch 配置
                let _ = config.set_str(&fetch_key, &format!("+refs/heads/*:refs/remotes/{}/*", remote_name));
                // 重新获取 remote 对象
                remote = repo.find_remote(remote_name)
                    .context(format!("无法重新获取远程仓库: {}", remote_name))?;
            }
        }
    }

    // 执行 fetch
    // 使用 snapshot() 来处理 multivar（重复配置项）问题
    let mut callbacks = git2::RemoteCallbacks::new();

    // Windows 平台：配置证书检查回调以解决 Schannel SSL 证书验证问题
    // 在 Windows 上，libgit2 使用 Schannel 作为 SSL 后端，可能会遇到证书吊销检查失败的问题
    // 参考：https://github.com/libgit2/libgit2/issues/6724
    #[cfg(target_os = "windows")]
    {
        callbacks.certificate_check(|_cert, _host| {
            // 对于 HTTPS 连接，接受所有证书（因为我们使用 PAT 认证）
            // 这解决了 Windows 上 "certificate revocation status could not be verified" 的问题
            eprintln!("[GitOperation] fetch_from_remote: Windows 平台 - 跳过证书吊销检查");
            Ok(git2::CertificateCheckStatus::CertificateOk)
        });
    }

    // 尝试使用 snapshot() 来避免 multivar 错误
    // 如果失败，则跳过 credential helper（依赖 URL 中的 PAT）
    if let Ok(mut config) = repo.config() {
        if let Ok(config_snapshot) = config.snapshot() {
            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                git2::Cred::credential_helper(&config_snapshot, _url, username_from_url)
            });
        } else {
            eprintln!("[GitOperation] fetch_from_remote: 警告 - 无法创建配置快照（可能存在 multivar），将跳过 credential helper");
            eprintln!("[GitOperation] fetch_from_remote: 依赖 URL 中的 PAT 认证");
        }
    } else {
        eprintln!("[GitOperation] fetch_from_remote: 警告 - 无法读取 Git 配置（可能存在 multivar），将跳过 credential helper");
        eprintln!("[GitOperation] fetch_from_remote: 依赖 URL 中的 PAT 认证");
    }

    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    // 将所有远端分支抓取到 refs/remotes/<remote_name>/*
    let refspec = format!("refs/heads/*:refs/remotes/{}/*", remote_name);
    remote.fetch(&[&refspec], Some(&mut fetch_options), None)
        .context("fetch 失败")?;

    eprintln!("[GitOperation] fetch_from_remote: fetch 完成（使用 git2-rs API）");
    Ok(())
}

/// 推送到远程
pub fn push_to_remote(repo_path: &Path, remote_name: &str, branch_name: &str, pat_token: Option<&str>) -> Result<()> {
    eprintln!("[GitOperation] push_to_remote: 开始执行 push，remote_name: {}, branch_name: {}", remote_name, branch_name);
    
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    let mut remote = repo.find_remote(remote_name)
        .context(format!("无法找到远程仓库: {}", remote_name))?;
    
    // 如果提供了 PAT token，临时更新远程 URL
    if let Some(pat) = pat_token {
        let url = remote.url()
            .ok_or_else(|| anyhow::anyhow!("远程 URL 为空"))?;
        
        if url.starts_with("https://") {
            let url_without_protocol = url.strip_prefix("https://").unwrap_or(url);
            let authenticated_url = if let Some(at_pos) = url_without_protocol.find('@') {
                let path_after_at = &url_without_protocol[at_pos + 1..];
                format!("https://{}@{}", pat, path_after_at)
            } else {
                format!("https://{}@{}", pat, url_without_protocol)
            };
            
            eprintln!("[GitOperation] push_to_remote: 临时更新远程 URL 以包含 PAT 认证");
            // 先删除再创建以更新 URL
            // 注意：删除重建会导致 fetch 配置累积，需要在重建后清理
            repo.remote_delete(remote_name)?;
            remote = repo.remote(remote_name, &authenticated_url)?;
            
            // 重建后，清理可能累积的 fetch 配置，只保留一个
            // 这可以防止 multivar 错误
            if let Ok(mut config) = repo.config() {
                let fetch_key = format!("remote.{}.fetch", remote_name);
                // 删除所有旧的 fetch 配置
                let _ = config.remove_multivar(&fetch_key, ".*");
                // 添加单个 fetch 配置
                let _ = config.set_str(&fetch_key, &format!("+refs/heads/*:refs/remotes/{}/*", remote_name));
                // 重新获取 remote 对象
                remote = repo.find_remote(remote_name)
                    .context(format!("无法重新获取远程仓库: {}", remote_name))?;
            }
        }
    }
    
    // 构建 refspec
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);

    // 执行 push
    // 使用 snapshot() 来处理 multivar（重复配置项）问题
    let mut callbacks = git2::RemoteCallbacks::new();

    // Windows 平台：配置证书检查回调以解决 Schannel SSL 证书验证问题
    // 在 Windows 上，libgit2 使用 Schannel 作为 SSL 后端，可能会遇到证书吊销检查失败的问题
    // 参考：https://github.com/libgit2/libgit2/issues/6724
    #[cfg(target_os = "windows")]
    {
        callbacks.certificate_check(|_cert, _host| {
            // 对于 HTTPS 连接，接受所有证书（因为我们使用 PAT 认证）
            // 这解决了 Windows 上 "certificate revocation status could not be verified" 的问题
            eprintln!("[GitOperation] push_to_remote: Windows 平台 - 跳过证书吊销检查");
            Ok(git2::CertificateCheckStatus::CertificateOk)
        });
    }

    // 尝试使用 snapshot() 来避免 multivar 错误
    // 如果失败，则跳过 credential helper（依赖 URL 中的 PAT）
    if let Ok(mut config) = repo.config() {
        if let Ok(config_snapshot) = config.snapshot() {
            callbacks.credentials(move |_url, username_from_url, _allowed_types| {
                git2::Cred::credential_helper(&config_snapshot, _url, username_from_url)
            });
        } else {
            eprintln!("[GitOperation] push_to_remote: 警告 - 无法创建配置快照（可能存在 multivar），将跳过 credential helper");
            eprintln!("[GitOperation] push_to_remote: 依赖 URL 中的 PAT 认证");
        }
    } else {
        eprintln!("[GitOperation] push_to_remote: 警告 - 无法读取 Git 配置（可能存在 multivar），将跳过 credential helper");
        eprintln!("[GitOperation] push_to_remote: 依赖 URL 中的 PAT 认证");
    }

    let mut push_options = git2::PushOptions::new();
    push_options.remote_callbacks(callbacks);

    remote.push(&[&refspec], Some(&mut push_options))
        .context("push 失败")?;

    eprintln!("[GitOperation] push_to_remote: push 完成（使用 git2-rs API）");
    Ok(())
}

/// 同步结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflict_branch: Option<String>,
    pub conflict: Option<SyncConflict>,
}

/// 同步冲突信息（用于前端弹窗展示）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncConflict {
    pub files: Vec<SyncConflictFile>,
}

/// 冲突文件（最小必要信息：路径 + 是否二进制）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncConflictFile {
    pub path: String,
    pub is_binary: bool,
}

/// 冲突解决策略（ours/theirs/copyBoth）
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum ConflictResolutionChoice {
    Ours,
    Theirs,
    CopyBoth,
}

/// 冲突解决请求（按文件粒度）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ConflictResolutionItem {
    pub path: String,
    pub choice: ConflictResolutionChoice,
}

/// 与远程同步
pub fn sync_with_remote(repo_path: &Path, remote_name: &str, branch_name: &str, pat_token: Option<&str>) -> Result<SyncResult> {
    eprintln!("[GitOperation] sync_with_remote: 开始同步（使用 git2-rs API）");
    
    // Fetch
    fetch_from_remote(repo_path, remote_name, pat_token)
        .context("无法从远程获取更新")?;
    
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    // 检查本地是否有提交（空仓库检测）
    let has_local_commits = repo.head().is_ok();
    let remote_ref = format!("refs/remotes/{}/{}", remote_name, branch_name);
    
    if !has_local_commits {
        eprintln!("[GitOperation] sync_with_remote: 检测到空仓库，尝试从远程拉取内容");
        
        // 检查远程分支是否存在
        match repo.find_reference(&remote_ref) {
            Ok(remote_ref_obj) => {
                let remote_commit = remote_ref_obj.peel_to_commit()
                    .context("无法获取远程提交")?;
                
                eprintln!("[GitOperation] sync_with_remote: 从远程创建本地 {} 分支", branch_name);
                
                // 创建本地 main 分支指向远程提交
                repo.branch(branch_name, &remote_commit, false)
                    .context(format!("无法创建本地 {} 分支", branch_name))?;
                
                // Checkout 远程内容到工作区
                let tree = remote_commit.tree()
                    .context("无法获取远程提交的树对象")?;
                
                eprintln!("[GitOperation] sync_with_remote: 将远程内容 checkout 到工作区");
                repo.checkout_tree(
                    &tree.into_object(),
                    Some(git2::build::CheckoutBuilder::new().force())
                )
                .context("无法 checkout 远程内容到工作区")?;
                
                // 设置 HEAD 指向 main 分支
                repo.set_head(&format!("refs/heads/{}", branch_name))
                    .context(format!("无法设置 HEAD 到 {} 分支", branch_name))?;
                
                eprintln!("[GitOperation] sync_with_remote: 远程内容已拉取到本地");
                
                // 最终清理索引锁文件
                cleanup_index_lock(repo_path)?;
                
                    return Ok(SyncResult {
                        success: true,
                    has_conflict: false,
                    conflict_branch: None,
                    conflict: None,
                });
            }
            Err(_) => {
                eprintln!("[GitOperation] sync_with_remote: 远程分支不存在（可能是空远端仓库），执行本地初始化并尝试 push 建立 main");

                seed_initial_files(repo_path)?;
                let _ = commit_changes(repo_path, "chore: initial commit");

                if let Some(pat) = pat_token {
                    push_to_remote(repo_path, remote_name, branch_name, Some(pat))
                        .context("initial push 失败")?;
                }

                return Ok(SyncResult {
                    success: true,
                    has_conflict: false,
                    conflict_branch: None,
                    conflict: None,
                });
            }
        }
    }
    
    // 本地有提交，执行正常的同步流程
    eprintln!("[GitOperation] sync_with_remote: 本地有提交，执行正常同步流程");
    
    // 确保在 main 分支上
    switch_to_branch(repo_path, branch_name)
        .context(format!("无法切换到 {} 分支", branch_name))?;
    
    // 清理索引锁文件（不执行 hard reset，避免覆盖用户的工作区更改）
    cleanup_index_lock(repo_path)?;

    // === 关键修复：规范化 HEAD/分支指针，避免“本地已提交但 ahead/behind 算出来为 ahead==0” ===
    //
    // 典型触发链条：
    // - 用户/程序在 detached HEAD 上产生了提交（或 main 分支指针未更新到最新提交）
    // - sync 里用 refs/heads/main 的 tip 去算 ahead/behind => 得到 ahead==0, behind>0
    // - 进入 fast-forward + checkout_head(force) => 工作区被覆盖回远端文件树，表现为“删除/重命名恢复原样”
    //
    // 解决：在计算 ahead/behind 前，确保：
    // - HEAD 指向 refs/heads/{branch_name}（或至少把该分支快进到 HEAD commit，如果 HEAD 比分支更新且可快进）
    let local_branch_refname = format!("refs/heads/{}", branch_name);
    {
        let head = repo.head().context("无法获取 HEAD")?;
        // 注意：head.name() 可能为 None（detached / unborn / direct OID）
        let head_name = head.name().unwrap_or("<none>").to_string();
        let head_detached = repo.head_detached().unwrap_or(false);
        let head_commit = head.peel_to_commit().ok();

        // 如果 HEAD 是 detached，但 HEAD commit 比分支 tip 更新（且是分支 tip 的后代），则快进分支到 HEAD
        if head_detached {
            if let (Ok(mut branch_ref), Some(hc)) = (repo.find_reference(&local_branch_refname), head_commit.as_ref()) {
                if let (Some(branch_oid), Some(head_oid)) = (branch_ref.target(), Some(hc.id())) {
                    if branch_oid != head_oid {
                        // 若 head_oid 是 branch_oid 的后代，则可安全 fast-forward 分支
                        if repo
                            .graph_descendant_of(head_oid, branch_oid)
                            .unwrap_or(false)
                        {
                            eprintln!(
                                "[GitOperation] sync_with_remote: HEAD 为 detached 且更新，快进 {} 到 HEAD（{} -> {}）",
                                local_branch_refname,
                                branch_oid,
                                head_oid
                            );
                            branch_ref
                                .set_target(head_oid, "ff branch to detached HEAD")
                                .context("无法快进本地分支到 HEAD")?;
                        } else {
                            eprintln!(
                                "[GitOperation] sync_with_remote: 警告：HEAD 为 detached 且无法快进到 {}（head={}, head_ref={}）",
                                local_branch_refname,
                                hc.id(),
                                head_name
                            );
                        }
                    }
                }
            }
        }

        // 若 HEAD 不是指向目标分支，则把 HEAD 指向目标分支（避免后续操作继续落在别的 ref）
        if head_name != local_branch_refname {
            eprintln!(
                "[GitOperation] sync_with_remote: 规范化 HEAD 指向 {}（原 head_ref={}，detached={}）",
                local_branch_refname,
                head_name,
                head_detached
            );
            // 安全策略：仅设置 HEAD（不强制 checkout 覆盖工作区）
            repo.set_head(&local_branch_refname)
                .context("无法设置 HEAD 到目标分支")?;
        }
    }
    
    // 单分支 rebase 流：判断 ahead/behind
    // 如果远端 main 不存在：若本地有提交则尝试 push；若本地无提交已在上面处理
    let remote_ref_obj = match repo.find_reference(&remote_ref) {
        Ok(r) => r,
        Err(_) => {
            eprintln!("[GitOperation] sync_with_remote: 远端分支不存在，尝试 push 本地分支建立远端基准");
            if let Some(pat) = pat_token {
                push_to_remote(repo_path, remote_name, branch_name, Some(pat))
                    .context("push 建立远端分支失败")?;
            }
            cleanup_index_lock(repo_path)?;
            return Ok(SyncResult {
                success: true,
                has_conflict: false,
                conflict_branch: None,
                conflict: None,
            });
        }
    };
    let remote_oid = remote_ref_obj
        .target()
        .ok_or_else(|| anyhow::anyhow!("远程分支引用没有 target"))?;

    let local_ref_obj = repo
        .find_reference(&local_branch_refname)
        .context(format!("无法找到本地分支引用: {}", local_branch_refname))?;
    let local_oid = local_ref_obj
        .target()
        .ok_or_else(|| anyhow::anyhow!("本地分支引用没有 target"))?;

    let (ahead, behind) = repo
        .graph_ahead_behind(local_oid, remote_oid)
        .context("无法计算 ahead/behind")?;

    eprintln!(
        "[GitOperation] sync_with_remote: 计算 ahead/behind 结果: ahead={}, behind={}, local_oid={:?}, remote_oid={:?}",
        ahead, behind, local_oid, remote_oid
    );

    if ahead == 0 && behind == 0 {
        eprintln!("[GitOperation] sync_with_remote: 已是最新，无需同步");
        cleanup_index_lock(repo_path)?;
        return Ok(SyncResult {
            success: true,
            has_conflict: false,
            conflict_branch: None,
            conflict: None,
        });
    }

    // 仅本地领先：直接 push（不需要 rebase/fast-forward）
    if ahead > 0 && behind == 0 {
        eprintln!(
            "[GitOperation] sync_with_remote: 仅本地领先（ahead={}），直接 push",
            ahead
        );
        if let Some(pat) = pat_token {
            push_to_remote(repo_path, remote_name, branch_name, Some(pat))
                .context("push 失败")?;
            eprintln!("[GitOperation] sync_with_remote: push 成功");
        } else {
            eprintln!("[GitOperation] sync_with_remote: 未提供 PAT token，跳过 push");
        }
        cleanup_index_lock(repo_path)?;
            return Ok(SyncResult {
                success: true,
                has_conflict: false,
                conflict_branch: None,
            conflict: None,
        });
    }

    // 仅落后：fast-forward
    if ahead == 0 && behind > 0 {
        eprintln!(
            "[GitOperation] sync_with_remote: 仅落后（behind={}），执行 fast-forward",
            behind
        );

        // 安全检查：避免在工作区有改动时强制 checkout 覆盖用户内容
        let statuses = repo
            .statuses(Some(git2::StatusOptions::new().include_untracked(true)))
            .context("无法获取仓库状态（fast-forward 前检查）")?;
        if statuses.len() > 0 {
            return Err(anyhow::anyhow!(
                "工作区存在未提交变更（{} 项），为避免覆盖本地内容，已阻止 fast-forward。请先提交/还原后再同步。",
                statuses.len()
            ));
        }

        // 关键修复：在 fast-forward 前，检查 HEAD 是否指向最新的提交
        // 如果 HEAD commit 比 local_oid 更新，说明有未纳入分支的提交，不应该 fast-forward
        let head_commit_oid = repo.head()
            .ok()
            .and_then(|r| r.peel_to_commit().ok())
            .map(|c| c.id());
        
        if let Some(head_oid) = head_commit_oid {
            if head_oid != local_oid {
                // HEAD 指向的提交与分支 tip 不同，可能有未纳入分支的提交
                // 检查 HEAD 是否比 local_oid 更新
                if repo.graph_descendant_of(head_oid, local_oid).unwrap_or(false) {
                    eprintln!(
                        "[GitOperation] sync_with_remote: 警告：HEAD ({:?}) 比分支 tip ({:?}) 更新，可能存在未纳入分支的提交。跳过 fast-forward 以避免覆盖工作区。",
                        head_oid, local_oid
                    );
                    return Err(anyhow::anyhow!(
                        "HEAD 指向的提交比分支 tip 更新，可能存在未纳入分支的提交。为避免覆盖工作区，已阻止 fast-forward。请先确保所有提交都已纳入分支。"
                    ));
                }
            }
        }

        let mut local_ref = repo.find_reference(&local_branch_refname)?;
        local_ref.set_target(remote_oid, "fast-forward")?;
        repo.set_head(&local_branch_refname)?;
        // fast-forward 只移动分支指针，仍需更新工作区；这里可以 force（因为上面已保证工作区干净且 HEAD 与分支一致）
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
        cleanup_index_lock(repo_path)?;
        
        // fast-forward 成功后，如果有本地提交需要推送，执行 push
        // 注意：fast-forward 后 ahead 应该变为 0，但如果之前有未推送的提交，可能需要 push
        // 这里检查 fast-forward 后的 ahead/behind 状态
        let updated_local_oid = repo.find_reference(&local_branch_refname)?
            .target()
            .ok_or_else(|| anyhow::anyhow!("本地分支引用没有 target"))?;
        let (updated_ahead, _) = repo
            .graph_ahead_behind(updated_local_oid, remote_oid)
            .context("无法计算 fast-forward 后的 ahead/behind")?;
        
        if updated_ahead > 0 {
            eprintln!(
                "[GitOperation] sync_with_remote: fast-forward 后仍有 {} 个本地提交未推送，执行 push",
                updated_ahead
            );
            if let Some(pat) = pat_token {
                push_to_remote(repo_path, remote_name, branch_name, Some(pat))
                    .context("fast-forward 后 push 失败")?;
                eprintln!("[GitOperation] sync_with_remote: fast-forward 后 push 成功");
            }
        }
        
        return Ok(SyncResult {
            success: true,
            has_conflict: false,
            conflict_branch: None,
            conflict: None,
        });
    }

    // 有本地提交且远端也更新：rebase
    eprintln!(
        "[GitOperation] sync_with_remote: 分叉（ahead={}, behind={}），开始 rebase",
        ahead, behind
    );
    eprintln!(
        "[GitOperation] sync_with_remote: 本地提交 OID: {:?}, 远端提交 OID: {:?}",
        local_oid, remote_oid
    );

    // 如果上一次 rebase 异常中断（例如进程被杀/commit 失败未清理），这里会导致后续所有操作持续失败。
    // 发现进行中的 rebase 时，先 best-effort abort，恢复到可继续工作的状态。
    if let Ok(mut existing) = repo.open_rebase(None) {
        eprintln!("[GitOperation] sync_with_remote: 检测到未完成的 rebase，先 abort 清理状态");
        let _ = existing.abort();
        cleanup_index_lock(repo_path)?;
    }

    let sig = repo
        .signature()
        .unwrap_or_else(|_| {
            Signature::now("No Visitors User", "no-visitors@localhost")
                .unwrap_or_else(|_| {
                    Signature::now("User", "user@localhost")
                        .expect("无法创建 Git 签名（这是系统级错误）")
                })
        });

    let local_annotated = repo
        .find_annotated_commit(local_oid)
        .context("无法创建本地 annotated commit")?;
    let upstream_annotated = repo
        .find_annotated_commit(remote_oid)
        .context("无法创建远端 annotated commit")?;

    let mut rebase_opts = git2::RebaseOptions::new();
    // 需要开启 in-memory 才能通过 rebase.inmemory_index() 读取冲突索引
    rebase_opts.inmemory(true);
    let mut rebase = repo
        .rebase(
            Some(&local_annotated),
            Some(&upstream_annotated),
            None,
            Some(&mut rebase_opts),
        )
        .context("无法开始 rebase")?;

    let mut rebase_op_count = 0;
    while let Some(op_res) = rebase.next() {
        rebase_op_count += 1;
        let op = op_res.context("rebase next 失败")?;
        eprintln!(
            "[GitOperation] sync_with_remote: rebase operation #{}: {:?}",
            rebase_op_count, op
        );

        // 使用 rebase 的 in-memory index 检查冲突
        // 如果因历史状态/环境导致拿不到 in-memory index，则回退到 repo.index()
        let idx = rebase
            .inmemory_index()
            .or_else(|_| repo.index())
            .context("无法获取 rebase index")?;
        
        let has_conflicts = idx.has_conflicts();
        eprintln!(
            "[GitOperation] sync_with_remote: rebase operation #{} 冲突检查: has_conflicts={}",
            rebase_op_count, has_conflicts
        );
        
        if has_conflicts {
            let mut files: Vec<SyncConflictFile> = Vec::new();
            let mut conflicts = idx.conflicts().context("无法读取冲突列表")?;

            while let Some(conflict_res) = conflicts.next() {
                let c = conflict_res.context("读取冲突项失败")?;
                let path_bytes = c
                    .our
                    .as_ref()
                    .map(|e| e.path.as_ref())
                    .or_else(|| c.their.as_ref().map(|e| e.path.as_ref()))
                    .or_else(|| c.ancestor.as_ref().map(|e| e.path.as_ref()))
                    .ok_or_else(|| anyhow::anyhow!("冲突项缺少 path"))?;

                let path = String::from_utf8_lossy(path_bytes).to_string();

                // 简单二进制判断（后续可升级为基于 blob/内容探测）
                let is_binary = !path.ends_with(".md")
                    && !path.ends_with(".txt")
                    && !path.ends_with(".json")
                    && !path.ends_with(".vnode.json");

                files.push(SyncConflictFile { path, is_binary });
            }

            eprintln!(
                "[GitOperation] sync_with_remote: rebase 冲突，文件数={}",
                files.len()
            );

                return Ok(SyncResult {
                    success: true,
                    has_conflict: true,
                conflict_branch: None,
                conflict: Some(SyncConflict { files }),
            });
        }

        // 无冲突：提交本次 rebase 变更
        if let Err(e) = rebase.commit(None, &sig, None) {
            // libgit2: GIT_EAPPLIED / ErrorCode::Applied
            // 语义：该 patch 已经在当前分支上存在，应当跳过本次 operation，而不是让整个同步失败。
            if e.code() == git2::ErrorCode::Applied {
                // libgit2 语义：该 patch 已经被应用，直接进入下一个 operation 即可
                eprintln!("[GitOperation] sync_with_remote: rebase commit 返回 Applied（patch 已应用），跳过本次并继续");
                continue;
            }

            // 其它错误：commit 失败时必须 abort，否则仓库会一直处于 rebase 状态，后续 delete/rename/sync 都会持续失败
            let _ = rebase.abort();
            cleanup_index_lock(repo_path)?;
            return Err(anyhow::anyhow!("rebase commit 失败: {}", e));
        }
    }

    rebase.finish(Some(&sig)).context("rebase finish 失败")?;
    repo.set_head(&local_branch_refname)?;
    // 不要在 rebase.finish 后强制 checkout_head(force)：
    // - libgit2 的 rebase 流程已经在应用每个操作时更新工作区
    // - 强制 checkout 会把“刚做的删除/重命名/移动”覆盖回旧状态，造成文件“恢复原样”的错觉
    
    // 最终清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    // rebase 成功后，推送本地提交到远端
    if let Some(pat) = pat_token {
        eprintln!("[GitOperation] sync_with_remote: rebase 完成，执行 push");
        push_to_remote(repo_path, remote_name, branch_name, Some(pat))
            .context("rebase 后 push 失败")?;
        eprintln!("[GitOperation] sync_with_remote: rebase 后 push 成功");
    } else {
        eprintln!("[GitOperation] sync_with_remote: rebase 完成，但未提供 PAT token，跳过 push");
    }
    
    Ok(SyncResult {
        success: true,
        has_conflict: false,
        conflict_branch: None,
        conflict: None,
    })
}

/// 继续进行一个已经开始且暂停的 rebase（通常在冲突解决后调用）
pub fn continue_sync(repo_path: &Path, branch_name: &str) -> Result<SyncResult> {
    let repo = Repository::open(repo_path).context("无法打开 Git 仓库")?;

    let sig = repo
        .signature()
        .unwrap_or_else(|_| {
            Signature::now("No Visitors User", "no-visitors@localhost")
                .unwrap_or_else(|_| {
                    Signature::now("User", "user@localhost")
                        .expect("无法创建 Git 签名（这是系统级错误）")
                })
        });

    let mut rebase = repo
        .open_rebase(None)
        .context("没有进行中的 rebase，无法 continue")?;

    while let Some(op_res) = rebase.next() {
        let _op = op_res.context("rebase next 失败")?;

        // 优先使用 rebase 的 in-memory index（若不可用则回退到 repo.index）
        let idx = rebase
            .inmemory_index()
            .or_else(|_| repo.index())
            .context("无法获取 rebase index")?;
        if idx.has_conflicts() {
            let mut files: Vec<SyncConflictFile> = Vec::new();
            let mut conflicts = idx.conflicts().context("无法读取冲突列表")?;
            while let Some(conflict_res) = conflicts.next() {
                let c = conflict_res.context("读取冲突项失败")?;
                let path_bytes = c
                    .our
                    .as_ref()
                    .map(|e| e.path.as_ref())
                    .or_else(|| c.their.as_ref().map(|e| e.path.as_ref()))
                    .or_else(|| c.ancestor.as_ref().map(|e| e.path.as_ref()))
                    .ok_or_else(|| anyhow::anyhow!("冲突项缺少 path"))?;
                let path = String::from_utf8_lossy(path_bytes).to_string();
                let is_binary = !path.ends_with(".md")
                    && !path.ends_with(".txt")
                    && !path.ends_with(".json")
                    && !path.ends_with(".vnode.json");
                files.push(SyncConflictFile { path, is_binary });
            }

            return Ok(SyncResult {
                success: true,
                has_conflict: true,
                conflict_branch: None,
                conflict: Some(SyncConflict { files }),
            });
        }

        if let Err(e) = rebase.commit(None, &sig, None) {
            if e.code() == git2::ErrorCode::Applied {
                eprintln!("[GitOperation] continue_sync: rebase commit 返回 Applied（patch 已应用），跳过本次并继续");
                continue;
            }

            let _ = rebase.abort();
            cleanup_index_lock(repo_path)?;
            return Err(anyhow::anyhow!("rebase commit 失败: {}", e));
        }
    }

    rebase.finish(Some(&sig)).context("rebase finish 失败")?;

    let local_branch_refname = format!("refs/heads/{}", branch_name);
    repo.set_head(&local_branch_refname)?;
    // 同 sync_with_remote：finish 后不再强制 checkout_head(force)，避免覆盖工作区

    cleanup_index_lock(repo_path)?;

    Ok(SyncResult {
        success: true,
        has_conflict: false,
        conflict_branch: None,
        conflict: None,
    })
}

/// 放弃当前进行中的 rebase（恢复到 rebase 之前状态）
pub fn abort_sync(repo_path: &Path) -> Result<()> {
    let repo = Repository::open(repo_path).context("无法打开 Git 仓库")?;
    let mut rebase = repo
        .open_rebase(None)
        .context("没有进行中的 rebase，无法 abort")?;
    rebase.abort().context("rebase abort 失败")?;
    cleanup_index_lock(repo_path)?;
    Ok(())
}

fn conflict_copy_filename(original: &str) -> String {
    let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S").to_string();
    if let Some(dot) = original.rfind('.') {
        format!("{}_conflict_{}.{}", &original[..dot], ts, &original[dot + 1..])
    } else {
        format!("{}_conflict_{}", original, ts)
    }
}

fn write_blob_to_workdir(repo: &Repository, repo_path: &Path, rel_path: &str, oid: git2::Oid) -> Result<()> {
    let blob = repo.find_blob(oid).context("无法读取 blob")?;
    let abs = repo_path.join(rel_path);
    if let Some(parent) = abs.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&abs, blob.content()).with_context(|| format!("无法写入文件: {}", abs.display()))?;
    Ok(())
}

/// 解决冲突：根据用户选择将 ours/theirs 写入工作区并 stage
pub fn resolve_conflict(repo_path: &Path, items: Vec<ConflictResolutionItem>) -> Result<()> {
    let repo = Repository::open(repo_path).context("无法打开 Git 仓库")?;

    // index 中应包含 conflict entries
    let mut index = repo.index().context("无法获取索引")?;
    if !index.has_conflicts() {
        return Ok(());
    }

    for item in items {
        let (ours_oid, theirs_oid) = {
            let mut conflicts = index.conflicts().context("无法读取冲突列表")?;
            let mut ours_oid: Option<git2::Oid> = None;
            let mut theirs_oid: Option<git2::Oid> = None;

            while let Some(conflict_res) = conflicts.next() {
                let c = conflict_res.context("读取冲突项失败")?;
                let path_bytes = c
                    .our
                    .as_ref()
                    .map(|e| e.path.as_ref())
                    .or_else(|| c.their.as_ref().map(|e| e.path.as_ref()))
                    .or_else(|| c.ancestor.as_ref().map(|e| e.path.as_ref()))
                    .ok_or_else(|| anyhow::anyhow!("冲突项缺少 path"))?;
                let path = String::from_utf8_lossy(path_bytes).to_string();

                if path != item.path {
                    continue;
                }

                ours_oid = c.our.as_ref().map(|e| e.id);
                theirs_oid = c.their.as_ref().map(|e| e.id);
                break;
            }

            (ours_oid, theirs_oid)
        };

        match item.choice {
            ConflictResolutionChoice::Ours => {
                let oid = ours_oid.ok_or_else(|| anyhow::anyhow!("ours 版本不存在: {}", item.path))?;
                write_blob_to_workdir(&repo, repo_path, &item.path, oid)?;
                index.add_path(Path::new(&item.path))?;
            }
            ConflictResolutionChoice::Theirs => {
                let oid = theirs_oid.ok_or_else(|| anyhow::anyhow!("theirs 版本不存在: {}", item.path))?;
                write_blob_to_workdir(&repo, repo_path, &item.path, oid)?;
                index.add_path(Path::new(&item.path))?;
            }
            ConflictResolutionChoice::CopyBoth => {
                let ours = ours_oid.ok_or_else(|| anyhow::anyhow!("ours 版本不存在: {}", item.path))?;
                let theirs = theirs_oid.ok_or_else(|| anyhow::anyhow!("theirs 版本不存在: {}", item.path))?;

                let copy_path = conflict_copy_filename(&item.path);
                write_blob_to_workdir(&repo, repo_path, &copy_path, ours)?;
                write_blob_to_workdir(&repo, repo_path, &item.path, theirs)?;

                index.add_path(Path::new(&copy_path))?;
                index.add_path(Path::new(&item.path))?;
            }
        }
    }

    index.write().context("无法写入索引")?;
    Ok(())
}

/// 仓库验证信息
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RepositoryVerification {
    pub is_initialized: bool,
    pub has_commits: bool,
    pub commit_count: usize,
    pub latest_commit_sha: Option<String>,
    pub latest_commit_message: Option<String>,
    pub latest_commit_time: Option<String>,
}

/// 提交历史条目
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommitInfo {
    pub sha: String,
    pub message: String,
    pub time: String,
    pub author: String,
}

/// 验证 Git 仓库状态
pub fn verify_repository(repo_path: &Path) -> Result<RepositoryVerification> {
    let git_dir = repo_path.join(".git");
    let is_initialized = git_dir.exists();
    
    if !is_initialized {
        return Ok(RepositoryVerification {
            is_initialized: false,
            has_commits: false,
            commit_count: 0,
            latest_commit_sha: None,
            latest_commit_message: None,
            latest_commit_time: None,
        });
    }
    
    let repo = match Repository::open(repo_path) {
        Ok(r) => r,
        Err(_) => {
            return Ok(RepositoryVerification {
                is_initialized: true,
                has_commits: false,
                commit_count: 0,
                latest_commit_sha: None,
                latest_commit_message: None,
                latest_commit_time: None,
            });
        }
    };
    
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => {
            return Ok(RepositoryVerification {
                is_initialized: true,
                has_commits: false,
                commit_count: 0,
                latest_commit_sha: None,
                latest_commit_message: None,
                latest_commit_time: None,
            });
        }
    };
    
    let commit = match head.peel_to_commit() {
        Ok(c) => c,
        Err(_) => {
            return Ok(RepositoryVerification {
                is_initialized: true,
                has_commits: false,
                commit_count: 0,
                latest_commit_sha: None,
                latest_commit_message: None,
                latest_commit_time: None,
            });
        }
    };
    
    // 遍历提交历史
    let mut commit_count = 0;
    let mut latest_commit_sha = None;
    let mut latest_commit_message = None;
    let mut latest_commit_time = None;
    
    let mut current = Some(commit.id());
    while let Some(commit_id) = current {
        commit_count += 1;
        
        if latest_commit_sha.is_none() {
            latest_commit_sha = Some(commit_id.to_string());
            
            let commit_obj = repo.find_commit(commit_id)?;
            latest_commit_message = Some(commit_obj.message().unwrap_or("").to_string());
            
            let time = commit_obj.time();
            let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(time.seconds(), 0)
                .unwrap_or_else(|| chrono::Utc::now());
            latest_commit_time = Some(datetime.to_rfc3339());
        }
        
        let commit_obj = repo.find_commit(commit_id)?;
        current = commit_obj.parent(0).ok().map(|c| c.id());
    }
    
    Ok(RepositoryVerification {
        is_initialized: true,
        has_commits: commit_count > 0,
        commit_count,
        latest_commit_sha,
        latest_commit_message,
        latest_commit_time,
    })
}

/// 获取提交历史
pub fn get_commit_history(repo_path: &Path, limit: Option<usize>) -> Result<Vec<CommitInfo>> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    let head = repo.head()
        .context("无法获取 HEAD")?;
    
    let mut commit = head.peel_to_commit()
        .context("无法获取 HEAD 提交")?;
    
    let mut history = Vec::new();
    let limit = limit.unwrap_or(100);
    
    for _ in 0..limit {
        let time = commit.time();
        let datetime = chrono::DateTime::<chrono::Utc>::from_timestamp(time.seconds(), 0)
            .unwrap_or_else(|| chrono::Utc::now());
        let time_str = datetime.to_rfc3339();
        
        history.push(CommitInfo {
            sha: commit.id().to_string(),
            message: commit.message().unwrap_or("").to_string(),
            time: time_str,
            author: format!("{} <{}>", commit.author().name().unwrap_or(""), commit.author().email().unwrap_or("")),
        });
        
        if let Ok(parent) = commit.parent(0) {
            commit = parent;
        } else {
            break;
        }
    }
    
    Ok(history)
}

/// 执行 Git GC（垃圾回收）
pub fn git_gc(repo_path: &Path) -> Result<()> {
    // git2-rs 不直接支持 GC，使用命令行
    let _ = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("pack-refs")
        .arg("--all")
        .output();
    
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("repack")
        .arg("-d")
        .arg("--quiet")
        .output()
        .context("无法执行 git repack 命令")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("警告：git repack 失败: {}", stderr);
    }
    
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("prune")
        .arg("--expire")
        .arg("now")
        .output()
        .context("无法执行 git prune 命令")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("警告：git prune 失败: {}", stderr);
    }
    
    Ok(())
}

/// 添加远程仓库
pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<()> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 检查远程是否已存在
    if let Ok(existing_remote) = repo.find_remote(name) {
        // 如果 URL 相同，无需更新
        if existing_remote.url().map(|u| u == url).unwrap_or(false) {
            eprintln!("[GitOperation] add_remote: 远程 {} 已存在且 URL 相同，跳过更新", name);
            return Ok(());
        }
        // URL 不同，先删除
        repo.remote_delete(name)?;
    }
    // 创建新远程
    repo.remote(name, url)?;
    
    // 确保 fetch 配置只有一个，避免累积
    let mut config = repo.config()?;
    let fetch_key = format!("remote.{}.fetch", name);
    // 删除所有旧的 fetch 配置
    let _ = config.remove_multivar(&fetch_key, ".*");
    // 添加单个 fetch 配置
    config.set_str(&fetch_key, &format!("+refs/heads/*:refs/remotes/{}/*", name))?;
    
    Ok(())
}

/// 移除远程仓库
pub fn remove_remote(repo_path: &Path, name: &str) -> Result<()> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    repo.remote_delete(name)?;
    
    Ok(())
}

// NOTE:
// 旧的 `handle_sync_conflict`（自动创建冲突分支 + hard reset）已废弃。
// 当前冲突处理走 begin/resolve/continue 的交互式 rebase 流程（返回结构化冲突文件列表给前端弹窗）。

