// No Visitors - Git 操作模块
// 使用 git2-rs 库进行 Git 仓库管理（libgit2 的 Rust 绑定）
// 实现自动提交、状态查询和历史管理功能
// 支持 SSH 和 PAT 验证模式
//
// 基于 git2 0.18 API 实现：https://docs.rs/git2/0.18/git2/

use anyhow::{Context, Result};
use std::path::Path;
use git2::{Repository, Signature, Commit, ResetType};

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
    eprintln!("[GitOperation] commit_changes: 开始提交，使用 draft 分支");
    
    // 确保 draft 分支存在并切换到 draft 分支
    ensure_draft_branch(repo_path)
        .context("无法确保 draft 分支存在")?;
    switch_to_branch(repo_path, "draft")
        .context("无法切换到 draft 分支")?;
    
    // 打开仓库
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    // 获取索引
    let mut index = repo.index()
        .context("无法获取索引")?;
    
    // 添加所有文件到索引
    eprintln!("[GitOperation] commit_changes: 添加所有文件到索引");
    index.add_all(&["*"], git2::IndexAddOption::DEFAULT, None)
        .context("无法添加文件到索引")?;
    
    // 移除已删除的文件
    index.update_all(&["*"], None)
        .context("无法更新索引")?;
    
    // 写入索引
    index.write()
        .context("无法写入索引")?;
    
    let tree_id = index.write_tree()
        .context("无法从索引创建树对象")?;
    
    let tree = repo.find_tree(tree_id)
        .context("无法找到树对象")?;
    
    // 获取用户签名
    let sig = repo.signature()
        .unwrap_or_else(|_| {
            Signature::now("No Visitors User", "no-visitors@localhost")
                .expect("无法创建签名")
        });
    
    // 获取父提交（HEAD）
    let parent_commit = repo.head()
        .ok()
        .and_then(|r| r.peel_to_commit().ok());
    
    let parents: Vec<&Commit> = parent_commit.iter().collect();
    
    // 创建提交
    let commit_oid = repo.commit(
        Some("refs/heads/draft"),
        &sig,
        &sig,
        message,
        &tree,
        &parents,
    )
    .context("无法创建提交")?;
    
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

/// 确保 draft 分支存在
pub fn ensure_draft_branch(repo_path: &Path) -> Result<()> {
    eprintln!("[GitOperation] ensure_draft_branch: 检查 draft 分支是否存在");
    
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 检查 draft 分支是否存在
    if repo.find_branch("draft", git2::BranchType::Local).is_ok() {
        eprintln!("[GitOperation] ensure_draft_branch: draft 分支已存在");
        return Ok(());
    }
    
    eprintln!("[GitOperation] ensure_draft_branch: draft 分支不存在，开始创建");
    
    // 尝试从 main 分支创建 draft 分支
    if let Ok(main_branch) = repo.find_branch("main", git2::BranchType::Local) {
        let commit = main_branch.get().peel_to_commit()
            .context("无法获取 main 分支提交")?;
        
        repo.branch("draft", &commit, false)
            .context("无法创建 draft 分支")?;
        
        eprintln!("[GitOperation] ensure_draft_branch: 从 main 分支创建 draft 分支成功");
        return Ok(());
    }
    
    // 如果 main 分支不存在，尝试从 HEAD 创建
    if let Ok(head) = repo.head() {
        let commit = head.peel_to_commit()
            .context("无法获取 HEAD 提交")?;
        
        repo.branch("draft", &commit, false)
            .context("无法创建 draft 分支")?;
        
        eprintln!("[GitOperation] ensure_draft_branch: 从 HEAD 创建 draft 分支成功");
        return Ok(());
    }
    
    // 如果既没有 main 分支也没有 HEAD，说明是空仓库
    // 这种情况下，draft 分支会在首次提交时自动创建
    eprintln!("[GitOperation] ensure_draft_branch: 仓库为空，draft 分支将在首次提交时创建");
    Ok(())
}

/// 切换到指定分支
pub fn switch_to_branch(repo_path: &Path, branch: &str) -> Result<()> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    let refname = format!("refs/heads/{}", branch);
    let obj = repo.revparse_single(&refname)
        .context(format!("无法找到分支: {}", branch))?;
    
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
            repo.remote_delete(remote_name)?;
            remote = repo.remote(remote_name, &authenticated_url)?;
        }
    }
    
    // 执行 fetch
    let mut callbacks = git2::RemoteCallbacks::new();
    {
        let config = repo.config()?;
        callbacks.credentials(move |_url, username_from_url, _allowed_types| {
            git2::Cred::credential_helper(&config, _url, username_from_url)
        });
    }
    
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);
    
    remote.fetch(&["refs/heads/*:refs/remotes/origin/*"], Some(&mut fetch_options), None)
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
            repo.remote_delete(remote_name)?;
            remote = repo.remote(remote_name, &authenticated_url)?;
        }
    }
    
    // 构建 refspec
    let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
    
    // 执行 push
    let mut callbacks = git2::RemoteCallbacks::new();
    let config = repo.config()?;
    callbacks.credentials(move |_url, username_from_url, _allowed_types| {
        git2::Cred::credential_helper(&config, _url, username_from_url)
    });
    
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
                
                // 创建 draft 分支
                ensure_draft_branch(repo_path)
                    .context("无法创建 draft 分支")?;
                
                // 最终清理索引锁文件
                cleanup_index_lock(repo_path)?;
                
                return Ok(SyncResult {
                    success: true,
                    has_conflict: false,
                    conflict_branch: None,
                });
            }
            Err(_) => {
                eprintln!("[GitOperation] sync_with_remote: 远程分支不存在，保持空仓库状态");
                // 远程分支不存在，保持空仓库状态
                return Ok(SyncResult {
                    success: true,
                    has_conflict: false,
                    conflict_branch: None,
                });
            }
        }
    }
    
    // 本地有提交，执行正常的同步流程
    eprintln!("[GitOperation] sync_with_remote: 本地有提交，执行正常同步流程");
    
    // 确保在 main 分支上
    switch_to_branch(repo_path, branch_name)
        .context(format!("无法切换到 {} 分支", branch_name))?;
    
    // 清理索引和工作区（确保干净状态）
    let head = repo.head()
        .context("无法获取 HEAD")?;
    let head_oid = head.target()
        .context("无法获取 HEAD OID")?;
    let head_commit = repo.find_commit(head_oid)
        .context("无法获取 HEAD 提交")?;
    
    repo.reset(&head_commit.as_object(), ResetType::Hard, None)
        .context("无法重置到 HEAD")?;
    
    // 清理索引锁文件（reset 后可能留下锁文件）
    cleanup_index_lock(repo_path)?;
    
    // Rebase 或 merge
    let remote_commit = repo.find_reference(&remote_ref);
    
    if let Ok(remote_ref) = remote_commit {
        let remote_commit_obj = remote_ref.peel_to_commit()
            .context("无法获取远程提交")?;
        
        // 重新获取 HEAD commit（因为之前的 reset 可能改变了状态）
        let head_commit_for_merge = repo.find_commit(head_oid)
            .context("无法获取 HEAD 提交用于合并")?;
        
        // 尝试 rebase
        // 注意：git2-rs 不直接支持 rebase，需要使用命令行或实现 rebase 逻辑
        // 这里简化处理：直接 merge
        let mut index = repo.merge_commits(&head_commit_for_merge, &remote_commit_obj, None)
            .context("无法合并提交")?;
        
        if index.has_conflicts() {
            // 有冲突，创建冲突分支
            let conflict_branch = format!("conflict_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
            
            // 切换到远程状态
            repo.reset(&remote_commit_obj.as_object(), ResetType::Hard, None)
                .context("无法重置到远程状态")?;
            
            return Ok(SyncResult {
                success: true,
                has_conflict: true,
                conflict_branch: Some(conflict_branch),
            });
        }
        
        // 提交 merge
        let tree_id = repo.find_tree(index.write_tree_to(&repo)?)?
            .id();
        let tree = repo.find_tree(tree_id)?;
        let sig = repo.signature()
            .unwrap_or_else(|_| Signature::now("No Visitors User", "no-visitors@localhost").unwrap());
        
        let head_commit_for_commit = repo.find_commit(head_oid)
            .context("无法获取 HEAD 提交用于提交")?;
        repo.commit(
            Some(&format!("refs/heads/{}", branch_name)),
            &sig,
            &sig,
            &format!("Merge {}/{}", remote_name, branch_name),
            &tree,
            &[&head_commit_for_commit, &remote_commit_obj],
        )
        .context("无法创建 merge 提交")?;
    }
    
    // 确保 draft 分支重置到 main
    switch_to_branch(repo_path, "draft")
        .context("无法切换到 draft 分支")?;
    
    let main_commit = repo.find_branch(branch_name, git2::BranchType::Local)?
        .get()
        .peel_to_commit()
        .context("无法获取 main 提交")?;
    
    repo.reset(&main_commit.as_object(), ResetType::Hard, None)
        .context("无法重置 draft 到 main")?;
    
    // 最终清理索引锁文件
    cleanup_index_lock(repo_path)?;
    
    Ok(SyncResult {
        success: true,
        has_conflict: false,
        conflict_branch: None,
    })
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
    
    // 检查远程是否已存在，如果存在则先删除
    if repo.find_remote(name).is_ok() {
        repo.remote_delete(name)?;
    }
    // 创建新远程
    repo.remote(name, url)?;
    
    Ok(())
}

/// 移除远程仓库
pub fn remove_remote(repo_path: &Path, name: &str) -> Result<()> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    repo.remote_delete(name)?;
    
    Ok(())
}

/// 获取 draft 分支相对于 main 分支的 commit 数量
#[allow(dead_code)]
pub fn get_draft_commits_count(repo_path: &Path) -> Result<usize> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    let draft_branch = repo.find_branch("draft", git2::BranchType::Local)?;
    let main_branch = repo.find_branch("main", git2::BranchType::Local)?;
    
    let draft_commit = draft_branch.get().peel_to_commit()?;
    let main_commit = main_branch.get().peel_to_commit()?;
    
    if draft_commit.id() == main_commit.id() {
        return Ok(0);
    }
    
    let mut count = 0;
    let mut current = Some(draft_commit.id());
    
    while let Some(commit_id) = current {
        if commit_id == main_commit.id() {
            break;
        }
        
        count += 1;
        
        let commit_obj = repo.find_commit(commit_id)?;
        current = commit_obj.parent(0).ok().map(|c| c.id());
        
        if count > 10000 {
            eprintln!("警告：提交数量超过 10000");
            break;
        }
    }
    
    Ok(count)
}

/// 处理同步冲突
pub fn handle_sync_conflict(repo_path: &Path, remote_name: &str, branch_name: &str) -> Result<String> {
    let repo = Repository::open(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 创建冲突分支
    let conflict_branch = format!("conflict_{}", chrono::Utc::now().format("%Y%m%d_%H%M%S"));
    
    let head = repo.head()?;
    let commit = head.peel_to_commit()?;
    
    repo.branch(&conflict_branch, &commit, false)
        .context("无法创建冲突分支")?;
    
    // 重置到远程 main
    let remote_ref = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let remote_ref_obj = repo.find_reference(&remote_ref)?;
    let remote_commit = remote_ref_obj.peel_to_commit()?;
    
    repo.reset(&remote_commit.as_object(), ResetType::Hard, None)
        .context("无法重置到远程状态")?;
    
    Ok(conflict_branch)
}

