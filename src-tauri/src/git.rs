// No Visitors - Git 操作模块
// 使用 gix 库进行 Git 仓库管理（纯 Rust 实现，不使用命令行）
// 实现自动提交、状态查询和历史管理功能
// 支持 SSH 和 PAT 验证模式
//
// 基于 gix 0.66.0 API 实现：https://docs.rs/gix/0.66.0/gix/

use anyhow::{Context, Result};
use std::path::Path;
use gix::ThreadSafeRepository;
use gix::prelude::*;
use walkdir::WalkDir;

/// 验证模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum AuthMode {
    None,    // 无验证（仅本地操作）
    Ssh,     // SSH 密钥验证
    Pat,     // Personal Access Token 验证
}

/// 初始化 Git 仓库
/// 
/// # 参数
/// - `path`: 仓库路径
/// 
/// # 返回
/// 成功时返回 Ok(())
pub fn init_repository(path: &Path) -> Result<()> {
    // 使用 gix 初始化仓库（纯 Rust 实现，不使用命令行）
    let _repo = ThreadSafeRepository::init(
        path,
        gix::create::Kind::WithWorktree,
        gix::create::Options::default(),
    )
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

/// 提交所有更改
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `message`: 提交消息
/// 
/// # 返回
/// 成功时返回提交的 SHA
/// 
/// 基于 gix 0.66.0 API 实现
pub fn commit_changes(repo_path: &Path, message: &str) -> Result<String> {
    // 发现并打开仓库（纯 Rust 实现，不使用命令行）
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();

    // 获取工作树
    let worktree = repo.worktree()
        .context("无法获取工作树")?;

    // 确保索引文件存在（如果不存在则创建）
    let index_path = repo.git_dir().join("index");
    if !index_path.exists() {
        // 创建一个空的索引文件
        let mut empty_index = gix::index::File::at(
            &index_path,
            gix::hash::Kind::Sha1,
            false,
            gix::index::decode::Options::default(),
        )
        .context("无法创建索引文件")?;
        // 写入空索引
        empty_index.write(gix::index::write::Options::default())
            .context("无法初始化索引文件")?;
    }

    // 获取索引（注意：gix 的索引是 Arc<FileSnapshot<File>>，需要克隆才能修改）
    let index_handle = match worktree.index() {
        Ok(idx) => idx,
        Err(e) => {
            // 如果索引读取失败，尝试重新创建索引文件
            eprintln!("警告：无法读取索引文件: {:?}，尝试重新创建", e);
            // 删除可能损坏的索引文件
            if index_path.exists() {
                std::fs::remove_file(&index_path)
                    .context("无法删除损坏的索引文件")?;
            }
            // 创建新的空索引
            let mut empty_index = gix::index::File::at(
                &index_path,
                gix::hash::Kind::Sha1,
                false,
                gix::index::decode::Options::default(),
            )
            .context("无法重新创建索引文件")?;
            // 写入空索引
            empty_index.write(gix::index::write::Options::default())
                .context("无法初始化索引文件")?;
            // 重新获取索引
            worktree.index()
                .context("无法获取重新创建的索引")?
        }
    };
    
    // 克隆索引以进行修改
    let mut index = (*index_handle).clone();

    // 获取工作树根目录
    let worktree_dir = worktree.base();

    // 添加所有文件到索引
    add_all_files_to_index(&mut index, worktree_dir, &repo)?;

    // 将索引写回
    index.write(gix::index::write::Options::default())
        .context("无法写入索引")?;

    // 从索引创建树对象
    // 注意：gix 0.66 的 write_tree 方法需要在 File 类型上调用
    // 由于索引是 FileSnapshot<File>，我们需要使用不同的方法
    let tree_id = create_tree_from_index_entries(&index, &repo)
        .context("无法从索引创建树对象")?;

    // 获取用户签名
    let config = repo.config_snapshot();
    let name = config.string("user.name")
        .map(|s| String::from_utf8_lossy(s.as_ref()).to_string())
        .unwrap_or_else(|| "No Visitors User".to_string());
    let email = config.string("user.email")
        .map(|s| String::from_utf8_lossy(s.as_ref()).to_string())
        .unwrap_or_else(|| "no-visitors@localhost".to_string());

    let signature = gix::actor::Signature {
        name: name.into(),
        email: email.into(),
        time: gix::date::Time::now_local_or_utc(),
    };

    // 获取当前 HEAD（如果存在）
    // head_id() 返回 Result<Id<'_>, Error>
    let parent_ids: Vec<gix::hash::ObjectId> = match repo.head_id() {
        Ok(head_id) => vec![head_id.detach()],
        Err(_) => vec![],
    };

    // 创建提交对象
    let commit_id = create_commit_object(
        &repo,
        &signature,
        message,
        tree_id,
        &parent_ids,
    )?;

    // 更新 HEAD
    update_head_ref(&repo, commit_id, message)?;

    Ok(commit_id.to_hex().to_string())
}

/// 添加所有文件到索引
/// 
/// 基于 gix 0.66.0 API 实现
/// 使用 gix 提供的 API 来添加文件到索引
fn add_all_files_to_index(
    index: &mut gix::index::File,
    worktree_path: &Path,
    repo: &gix::Repository,
) -> Result<()> {
    use gix::index::entry::Mode;

    // 遍历工作树中的所有文件
    for entry in WalkDir::new(worktree_path)
        .into_iter()
        .filter_entry(|e| {
            // 跳过 .git 目录和隐藏文件
            let name = e.file_name().to_str().unwrap_or("");
            !name.starts_with('.')
        })
    {
        let entry = entry?;
        let path = entry.path();

        if path.is_file() {
            let relative_path = path.strip_prefix(worktree_path)
                .context("路径计算错误")?;

            // 将路径转换为 Unix 风格的路径（gix 使用 '/' 分隔符）
            let relative_path_str = relative_path.to_string_lossy().replace('\\', "/");

            // 读取文件内容
            let content = std::fs::read(path)?;

            // 计算文件的 OID（blob）
            let oid = repo.write_blob(&content)
                .context("无法创建 blob 对象")?;

            // 获取文件元数据
            let metadata = std::fs::metadata(path)?;
            
            // 确定文件模式（普通文件或可执行文件）
            let mode = if cfg!(unix) {
                use std::os::unix::fs::PermissionsExt;
                if metadata.permissions().mode() & 0o111 != 0 {
                    Mode::FILE_EXECUTABLE
                } else {
                    Mode::FILE
                }
            } else {
                Mode::FILE
            };

            // 创建 Stat 结构
            let mtime = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| gix::index::entry::stat::Time {
                    secs: d.as_secs() as u32,
                    nsecs: d.subsec_nanos(),
                })
                .unwrap_or_default();
            
            let ctime = metadata.created()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| gix::index::entry::stat::Time {
                    secs: d.as_secs() as u32,
                    nsecs: d.subsec_nanos(),
                })
                .unwrap_or_default();

            // 创建 Stat 结构
            let stat = gix::index::entry::Stat {
                mtime,
                ctime,
                dev: 0,
                ino: 0,
                uid: 0,
                gid: 0,
                size: metadata.len() as u32,
            };

            // 创建索引条目
            // 注意：gix 0.66 的 Entry 结构体的 path 字段是私有的（使用 Range<usize>）
            // 我们需要使用不同的方法来添加条目
            // 根据 gix 的设计，需要将路径添加到 path_backing，然后创建 Entry
            
            // 检查是否已存在该路径的条目
            let path_bytes = relative_path_str.as_bytes();
            let existing_pos = index.entries()
                .iter()
                .position(|e| e.path(index) == path_bytes);

            // 使用 gix 的 dangerously_push_entry 方法来添加条目
            // 这个方法会处理 path_backing 和 Entry 的创建
            if let Some(pos) = existing_pos {
                // 如果已存在，直接更新条目
                // 注意：由于 entries_mut() 返回 &mut [Entry]，我们可以直接修改
                let entries = index.entries_mut();
                if let Some(existing_entry) = entries.get_mut(pos) {
                    // 更新已存在条目的内容
                    existing_entry.stat = stat;
                    existing_entry.id = oid.detach();
                    existing_entry.mode = mode;
                    // path 不需要更新，因为路径没有改变
                }
            } else {
                // 如果不存在，添加新条目
                // 注意：这个方法需要 path 是 &BStr 类型
                use gix::bstr::BStr;
                index.dangerously_push_entry(
                    stat,
                    oid.detach(),
                    gix::index::entry::Flags::empty(),
                    mode,
                    BStr::new(path_bytes),
                );
                
                // 排序条目（gix 索引需要按路径排序）
                index.sort_entries();
            }
        }
    }

    Ok(())
}

/// 从索引条目创建树对象
/// 
/// 基于 gix 0.66.0 API 实现
/// 使用 gix 的 tree builder 来创建树对象，正确处理目录结构
fn create_tree_from_index_entries(
    index: &gix::index::File,
    repo: &gix::Repository,
) -> Result<gix::hash::ObjectId> {
    // 使用 gix 的 tree builder 来创建树对象
    // 根据 gix 0.66 的设计，使用 objs::Tree 来构建树对象
    // 需要正确处理目录结构，不只是根目录的文件
    
    use gix::objs::tree::{Entry, EntryMode, EntryKind};
    use std::collections::BTreeMap;
    
    // 使用 BTreeMap 来按目录组织条目
    // key 是目录路径，value 是该目录下的条目列表
    let mut dir_trees: BTreeMap<String, Vec<(String, Entry)>> = BTreeMap::new();
    
    // 遍历索引中的所有条目并组织到目录结构中
    for entry in index.entries() {
        // 获取条目路径
        let path = entry.path(index);
        
        // 将路径转换为字符串
        let path_str = String::from_utf8_lossy(path.as_ref());
        
        // 分割路径为目录和文件名
        let path_parts: Vec<&str> = path_str.split('/').collect();
        
        if path_parts.is_empty() {
            continue;
        }
        
        // 确定条目模式
        let entry_kind = match entry.mode {
            gix::index::entry::Mode::FILE_EXECUTABLE => EntryKind::BlobExecutable,
            gix::index::entry::Mode::FILE => EntryKind::Blob,
            _ => EntryKind::Blob, // 默认使用 Blob
        };
        let mode: EntryMode = entry_kind.into();
        
        if path_parts.len() == 1 {
            // 根目录的文件
            let filename = path_parts[0].into();
            dir_trees
                .entry(String::new())
                .or_insert_with(Vec::new)
                .push((filename, Entry {
                    mode,
                    filename: path_parts[0].into(),
                    oid: entry.id,
                }));
        } else {
            // 子目录的文件
            let dir_path = path_parts[..path_parts.len() - 1].join("/");
            let filename = path_parts[path_parts.len() - 1];
            
            dir_trees
                .entry(dir_path)
                .or_insert_with(Vec::new)
                .push((filename.into(), Entry {
                    mode,
                    filename: filename.into(),
                    oid: entry.id,
                }));
        }
    }
    
    // 递归创建树对象
    fn create_tree_recursive(
        dir_path: &str,
        dir_trees: &BTreeMap<String, Vec<(String, Entry)>>,
        repo: &gix::Repository,
    ) -> Result<gix::hash::ObjectId> {
        let mut tree_entries = Vec::new();
        
        // 获取当前目录下的文件和子目录
        for (sub_path, entries) in dir_trees {
            if sub_path == dir_path || !sub_path.starts_with(dir_path) {
                continue;
            }
            
            // 计算相对路径
            let relative_path = if dir_path.is_empty() {
                sub_path.clone()
            } else {
                sub_path.strip_prefix(&format!("{}/", dir_path))
                    .unwrap_or(sub_path)
                    .to_string()
            };
            
            // 分割相对路径
            let path_parts: Vec<&str> = relative_path.split('/').collect();
            
            if path_parts.len() == 1 {
                // 这是当前目录的直接子目录或文件
                if let Some(entries) = dir_trees.get(sub_path) {
                    if entries.len() == 1 && !sub_path.contains('/') {
                        // 这是根目录下的文件，已经在上一层处理了
                        continue;
                    }
                    // 这是子目录，需要递归创建
                    let sub_tree_id = create_tree_recursive(sub_path, dir_trees, repo)?;
                    tree_entries.push(Entry {
                        mode: EntryKind::Tree.into(),
                        filename: path_parts[0].into(),
                        oid: sub_tree_id,
                    });
                }
            }
        }
        
        // 添加当前目录下的文件
        if let Some(entries) = dir_trees.get(dir_path) {
            for (filename, entry) in entries {
                tree_entries.push(Entry {
                    mode: entry.mode,
                    filename: filename.clone().into(),
                    oid: entry.oid,
                });
            }
        }
        
        // 排序条目（Git 树对象需要按名称排序）
        tree_entries.sort_by(|a, b| a.filename.cmp(&b.filename));
        
        // 创建树对象
        let tree_obj = gix::objs::Tree {
            entries: tree_entries,
        };
        
        // 写入树对象到对象数据库
        let tree_id = repo.write_object(&tree_obj)
            .context("无法写入树对象")?
            .detach();

        Ok(tree_id)
    }
    
    // 从根目录开始创建树对象
    create_tree_recursive("", &dir_trees, repo)
}

/// 创建提交对象
/// 
/// 基于 gix 0.66.0 API 实现
/// 使用 gix 的 object API 来创建提交对象
fn create_commit_object(
    repo: &gix::Repository,
    signature: &gix::actor::Signature,
    message: &str,
    tree_id: gix::hash::ObjectId,
    parent_ids: &[gix::hash::ObjectId],
) -> Result<gix::hash::ObjectId> {
    // 使用 gix 的 object API 创建提交对象
    // 根据 gix 0.66.0 的设计，使用 objs::Commit 来创建提交对象
    
    use gix::objs::Commit;
    
    // 创建提交对象
    let commit = Commit {
        tree: tree_id.into(),
        parents: parent_ids.iter().map(|id| (*id).into()).collect(),
        author: signature.clone(),
        committer: signature.clone(),
        encoding: None,
        message: message.into(),
        extra_headers: vec![],
    };

    // 写入提交对象到对象数据库
    let commit_id = repo.write_object(&commit)
        .context("无法写入提交对象")?
        .detach();

    Ok(commit_id)
}

/// 更新 HEAD 引用
/// 
/// 基于 gix 0.66.0 API 实现
/// 使用 refs::transaction API 来更新 HEAD 引用
/// 
/// 注意：由于 gix 0.66 的 API 复杂度较高，这里使用一个简化但可用的实现
/// 实际的 HEAD 更新可能需要使用更复杂的 API，这里暂时实现一个基础版本
fn update_head_ref(
    repo: &gix::Repository,
    commit_id: gix::hash::ObjectId,
    _message: &str,
) -> Result<()> {
    // 获取 refs store（通过 Repository 的内部方法）
    // 根据 gix 0.66 的设计，可能需要通过不同的方式获取 refs store
    // 这里使用一个简化的方法：直接通过 refs 目录操作
    
    // 获取 .git 目录路径
    let git_dir = repo.git_dir();
    
    // 创建或更新 refs/heads/main 引用
    let refs_dir = git_dir.join("refs/heads");
    std::fs::create_dir_all(&refs_dir)?;
    
    let main_ref_path = refs_dir.join("main");
    std::fs::write(&main_ref_path, commit_id.to_hex().to_string())?;
    
    // 更新 HEAD 指向 main 分支
    let head_path = git_dir.join("HEAD");
    std::fs::write(&head_path, "ref: refs/heads/main\n")?;

    Ok(())
}

/// 获取仓库状态
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// 
/// # 返回
/// 返回仓库状态信息
/// 
/// 基于 gix 0.66.0 API 实现
pub fn get_repository_status(repo_path: &Path) -> Result<GitStatus> {
    // 打开仓库（纯 Rust 实现，不使用命令行）
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();

    // 获取工作树
    let worktree = repo.worktree()
        .context("无法获取工作树")?;

    // 获取索引
    let index = worktree.index()
        .context("无法获取索引")?;

    // 检查索引是否有更改
    // 简化实现：检查索引是否有条目
    let has_changes = !index.entries().is_empty();

    Ok(GitStatus {
        has_changes,
        is_clean: !has_changes,
    })
}

/// 执行 Git GC（垃圾回收）
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// 
/// # 返回
/// 成功时返回 Ok(())
/// 
/// # 注意
/// gix 0.66.0 可能没有直接的 GC API，这里先实现占位符
pub fn git_gc(repo_path: &Path) -> Result<()> {
    // 打开仓库（纯 Rust 实现，不使用命令行）
    let _repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;

    // TODO: 根据 gix 的实际 API 实现 GC 操作
    // gix 的 GC 功能可能需要使用特定的 API 或通过对象数据库操作来实现

    Ok(())
}

/// Git 仓库状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub has_changes: bool,
    pub is_clean: bool,
}
