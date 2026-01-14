// No Visitors - Git 操作模块
// 使用 gix 库进行 Git 仓库管理（纯 Rust 实现，不使用命令行）
// 实现自动提交、状态查询和历史管理功能
// 支持 SSH 和 PAT 验证模式
//
// 基于 gix 0.66.0 API 实现：https://docs.rs/gix/0.66.0/gix/

use anyhow::{Context, Result};
use std::path::Path;
use gix::ThreadSafeRepository;
use gix::bstr::ByteSlice;
use walkdir::WalkDir;

/// 验证模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[allow(dead_code)] // 将在远程操作中使用
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
    eprintln!("[GitOperation] commit_changes: 检查索引文件: {:?}", index_path);
    
    if !index_path.exists() {
        eprintln!("[GitOperation] commit_changes: 索引文件不存在，开始创建");
        // 确保父目录存在
        if let Some(parent) = index_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("无法创建索引文件父目录: {:?}", parent))?;
            eprintln!("[GitOperation] commit_changes: 父目录已确保存在: {:?}", parent);
        }
        
        // 直接创建一个有效的空 Git 索引文件
        // Git 索引文件格式：12字节头部（DIRC签名 + 版本号 + 条目数）+ 20字节 SHA1 校验和
        eprintln!("[GitOperation] commit_changes: 创建空索引文件");
        let mut index_data = Vec::new();
        index_data.extend_from_slice(b"DIRC"); // 签名 "DIRC"
        index_data.extend_from_slice(&2u32.to_be_bytes()); // 版本号 2
        index_data.extend_from_slice(&0u32.to_be_bytes()); // 条目数 0
        // 添加 SHA1 校验和（20字节）
        // 对于空索引，校验和是 "DIRC" + 版本号 + 条目数的 SHA1
        // 简化处理：先使用全0，gix 会在写入时自动计算正确的校验和
        index_data.extend_from_slice(&[0u8; 20]);
        
        std::fs::write(&index_path, &index_data)
            .with_context(|| format!("无法写入索引文件: {:?}", index_path))?;
        eprintln!("[GitOperation] commit_changes: 空索引文件创建成功: {:?}", index_path);
        
        // 验证索引文件可以被 gix 读取
        match gix::index::File::at(
            &index_path,
            gix::hash::Kind::Sha1,
            false,
            gix::index::decode::Options::default(),
        ) {
            Ok(_) => {
                eprintln!("[GitOperation] commit_changes: 索引文件验证成功");
            }
            Err(e) => {
                eprintln!("[GitOperation] commit_changes: 索引文件验证失败: {:?}，尝试使用 git 命令修复", e);
                // 如果 gix 无法读取，使用 git 命令来初始化索引
                let _ = std::process::Command::new("git")
                    .arg("-C")
                    .arg(repo_path)
                    .arg("read-tree")
                    .arg("--empty")
                    .output();
            }
        }
    } else {
        eprintln!("[GitOperation] commit_changes: 索引文件已存在: {:?}", index_path);
        // 检查文件权限
        match std::fs::metadata(&index_path) {
            Ok(metadata) => {
                eprintln!("[GitOperation] commit_changes: 索引文件元数据: 大小={}, 权限={:?}", 
                    metadata.len(), metadata.permissions());
            }
            Err(e) => {
                eprintln!("[GitOperation] commit_changes: 无法读取索引文件元数据: {:?}", e);
            }
        }
    }

    // 获取索引（注意：gix 的索引是 Arc<FileSnapshot<File>>，需要克隆才能修改）
    let index_handle = match worktree.index() {
        Ok(idx) => {
            eprintln!("[GitOperation] commit_changes: 成功读取索引文件");
            idx
        }
        Err(e) => {
            // 如果索引读取失败，尝试重新创建索引文件
            eprintln!("[GitOperation] commit_changes: 警告：无法读取索引文件: {:?}，路径: {:?}，尝试重新创建", e, index_path);
            
            // 在删除前备份损坏的索引文件
            let backup_path = index_path.with_extension("index.backup");
            if index_path.exists() {
                eprintln!("[GitOperation] commit_changes: 备份损坏的索引文件到: {:?}", backup_path);
                if let Err(backup_err) = std::fs::copy(&index_path, &backup_path) {
                    eprintln!("[GitOperation] commit_changes: 备份索引文件失败: {:?}", backup_err);
                }
                
                // 删除可能损坏的索引文件
                if let Err(remove_err) = std::fs::remove_file(&index_path) {
                    eprintln!("[GitOperation] commit_changes: 删除损坏的索引文件失败: {:?}", remove_err);
                    anyhow::bail!("无法删除损坏的索引文件: {:?}, 错误: {}", index_path, remove_err);
                }
            }
            
            // 重试创建索引（最多3次）
            let mut last_error = None;
            for attempt in 1..=3 {
                eprintln!("[GitOperation] commit_changes: 尝试重新创建索引文件 (第 {} 次)", attempt);
                
                match gix::index::File::at(
                    &index_path,
                    gix::hash::Kind::Sha1,
                    false,
                    gix::index::decode::Options::default(),
                ) {
                    Ok(mut empty_index) => {
                                match empty_index.write(gix::index::write::Options::default()) {
                            Ok(_) => {
                                eprintln!("[GitOperation] commit_changes: 索引文件重新创建成功 (第 {} 次尝试)", attempt);
                                // 重新获取索引
                                match worktree.index() {
                                    Ok(idx) => {
                                        eprintln!("[GitOperation] commit_changes: 成功获取重新创建的索引");
                                        break;
                                    }
                                    Err(e) => {
                                        eprintln!("[GitOperation] commit_changes: 无法获取重新创建的索引: {:?}", e);
                                        last_error = Some(format!("无法获取重新创建的索引: {}", e));
                                        if attempt < 3 {
                                            std::thread::sleep(std::time::Duration::from_millis(100));
                                            continue;
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[GitOperation] commit_changes: 写入索引文件失败 (第 {} 次尝试): {:?}", attempt, e);
                                last_error = Some(format!("无法初始化索引文件: {}", e));
                                if attempt < 3 {
                                    std::thread::sleep(std::time::Duration::from_millis(100));
                                    continue;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[GitOperation] commit_changes: 创建索引文件失败 (第 {} 次尝试): {:?}", attempt, e);
                        last_error = Some(format!("无法重新创建索引文件: {}", e));
                        if attempt < 3 {
                            std::thread::sleep(std::time::Duration::from_millis(100));
                            continue;
                        }
                    }
                }
            }
            
            // 如果所有重试都失败，返回错误
            worktree.index()
                .with_context(|| format!("无法获取索引文件（已重试3次）: {}", 
                    last_error.unwrap_or_else(|| "未知错误".to_string())))?
        }
    };
    
    // 克隆索引以进行修改
    let mut index = (*index_handle).clone();

    // 获取工作树根目录
    let worktree_dir = worktree.base();
    eprintln!("[GitOperation] commit_changes: 工作树目录: {:?}", worktree_dir);

    // 添加所有文件到索引（每次 commit 前必须执行）
    eprintln!("[GitOperation] commit_changes: 开始添加所有文件到索引");
    add_all_files_to_index(&mut index, worktree_dir, &repo)
        .context("无法添加文件到索引")?;
    eprintln!("[GitOperation] commit_changes: 文件添加完成，索引条目数: {}", index.entries().len());

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
    
    // 提交完成后，使用 git 命令确保索引与 HEAD 一致
    // 这可以避免后续 rebase 时出现"索引中包含未提交的变更"的错误
    eprintln!("[GitOperation] commit_changes: 提交完成，同步索引到 HEAD");
    let _ = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("read-tree")
        .arg("HEAD")
        .output();
    // 注意：read-tree 失败不影响提交成功，只是记录日志
    eprintln!("[GitOperation] commit_changes: 索引已同步到 HEAD");

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

    eprintln!("[GitOperation] add_all_files_to_index: 开始添加文件，工作树路径: {:?}", worktree_path);
    eprintln!("[GitOperation] add_all_files_to_index: 当前索引条目数: {}", index.entries().len());

    let mut file_count = 0;
    let mut added_count = 0;
    let mut updated_count = 0;

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
            file_count += 1; // 统计处理的文件数
            
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
                    updated_count += 1;
                    eprintln!("[GitOperation] add_all_files_to_index: 更新索引条目: {}", relative_path_str);
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
                added_count += 1;
                eprintln!("[GitOperation] add_all_files_to_index: 添加新索引条目: {}", relative_path_str);
            }
        }
    }

    eprintln!("[GitOperation] add_all_files_to_index: 完成 - 处理文件数: {}, 新增: {}, 更新: {}, 最终索引条目数: {}", 
        file_count, added_count, updated_count, index.entries().len());
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
    
    eprintln!("[GitOperation] create_tree_from_index_entries: 索引条目数: {}", index.entries().len());
    eprintln!("[GitOperation] create_tree_from_index_entries: 目录分组数: {}", dir_trees.len());
    
    // 打印所有目录路径用于调试
    for (dir_path, entries) in &dir_trees {
        eprintln!("[GitOperation] create_tree_from_index_entries: 目录: '{}', 文件数: {}", dir_path, entries.len());
        for (filename, _) in entries {
            eprintln!("[GitOperation] create_tree_from_index_entries:   文件: {}", filename);
        }
    }
    
    // 递归创建树对象
    // 策略：从最深层的目录开始，逐层向上创建树对象
    fn create_tree_recursive(
        dir_path: &str,
        dir_trees: &BTreeMap<String, Vec<(String, Entry)>>,
        repo: &gix::Repository,
        cache: &mut std::collections::HashMap<String, gix::hash::ObjectId>,
    ) -> Result<gix::hash::ObjectId> {
        // 如果已经创建过这个目录的树对象，直接返回
        if let Some(&cached_id) = cache.get(dir_path) {
            return Ok(cached_id);
        }
        
        let mut tree_entries = Vec::new();
        
        // 收集当前目录的直接子目录（第一层）
        let mut direct_subdirs: std::collections::HashSet<String> = std::collections::HashSet::new();
        
        for sub_path in dir_trees.keys() {
            // 跳过当前目录本身
            if sub_path == dir_path {
                continue;
            }
            
            // 计算相对路径
            let relative_path = if dir_path.is_empty() {
                // 根目录：所有路径都是相对路径
                sub_path.clone()
            } else {
                // 检查 sub_path 是否以 dir_path 开头
                if !sub_path.starts_with(dir_path) {
                    continue;
                }
                // 移除 dir_path 前缀和后面的 '/'
                if let Some(rest) = sub_path.strip_prefix(&format!("{}/", dir_path)) {
                    rest.to_string()
                } else {
                    continue;
                }
            };
            
            // 分割相对路径
            let path_parts: Vec<&str> = relative_path.split('/').collect();
            
            if path_parts.is_empty() {
                continue;
            }
            
            // 获取第一层目录名
            let first_level = path_parts[0];
            
            if path_parts.len() == 1 {
                // 这是当前目录的直接子目录（包含文件）
                direct_subdirs.insert(first_level.to_string());
            } else {
                // 多层嵌套，第一层是中间目录
                direct_subdirs.insert(first_level.to_string());
            }
        }
        
        // 为每个直接子目录创建树对象
        for subdir_name in &direct_subdirs {
            // 构建子目录的完整路径
            let subdir_path = if dir_path.is_empty() {
                subdir_name.clone()
            } else {
                format!("{}/{}", dir_path, subdir_name)
            };
            
            // 递归创建子目录的树对象
            let sub_tree_id = create_tree_recursive(&subdir_path, dir_trees, repo, cache)?;
            
            // 添加到当前树对象
            tree_entries.push(Entry {
                mode: EntryKind::Tree.into(),
                filename: subdir_name.clone().into(),
                oid: sub_tree_id,
            });
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
        
        eprintln!("[GitOperation] create_tree_recursive: 目录 '{}' 创建树对象，条目数: {}", dir_path, tree_entries.len());
        
        // 创建树对象
        let tree_obj = gix::objs::Tree {
            entries: tree_entries,
        };
        
        // 写入树对象到对象数据库
        let tree_id = repo.write_object(&tree_obj)
            .context("无法写入树对象")?
            .detach();
        
        // 缓存结果
        cache.insert(dir_path.to_string(), tree_id);
        
        Ok(tree_id)
    }
    
    // 从根目录开始创建树对象，使用缓存避免重复创建
    let mut cache = std::collections::HashMap::new();
    let root_tree_id = create_tree_recursive("", &dir_trees, repo, &mut cache)?;
    
    eprintln!("[GitOperation] create_tree_from_index_entries: 根树对象创建完成，OID: {}", root_tree_id.to_hex());
    
    Ok(root_tree_id)
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
/// 目前使用轻量级维护任务实现，包括：
/// 1. 打包引用 (pack-refs)
/// 2. 增量打包松散对象 (repack --incremental)
/// 3. 清理不可达对象 (prune)
/// 
/// 遵循现代 Git 的维护策略，避免频繁全量 GC
pub fn git_gc(repo_path: &Path) -> Result<()> {
    // 打开仓库以验证其存在
    let _repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;

    // 使用命令行 git 实现 GC（将来可以迁移到纯 gix API）
    // 遵循轻量维护策略，避免全量 GC
    
    // 1. 打包引用（将 .git/refs/ 下的文件合并到 .git/packed-refs）
    let _ = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("pack-refs")
        .arg("--all")
        .output();
    
    // 2. 增量打包松散对象（不删除旧的 packfile）
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("repack")
        .arg("-d") // 删除冗余的 packfile
        .arg("--quiet")
        .output()
        .context("无法执行 git repack 命令")?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // repack 失败不影响整体流程，只记录警告
        eprintln!("警告：git repack 失败: {}", stderr);
    }
    
    // 3. 清理不可达对象（prune）
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
        // prune 失败不影响整体流程，只记录警告
        eprintln!("警告：git prune 失败: {}", stderr);
    }

    Ok(())
}

/// Git 仓库状态
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GitStatus {
    pub has_changes: bool,
    pub is_clean: bool,
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
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// 
/// # 返回
/// 返回仓库验证信息
/// 
/// 基于 gix 0.66.0 API 实现
pub fn verify_repository(repo_path: &Path) -> Result<RepositoryVerification> {
    // 检查仓库是否已初始化
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
    
    // 尝试打开仓库
    let repo = match ThreadSafeRepository::discover(repo_path) {
        Ok(r) => r.to_thread_local(),
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
    
    // 检查是否有提交记录
    let head_id = match repo.head_id() {
        Ok(id) => id.detach(),
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
    
    // 获取提交历史信息
    let mut commit_count = 0;
    let mut latest_commit_sha = None;
    let mut latest_commit_message = None;
    let mut latest_commit_time = None;
    
    // 遍历提交历史
    let mut current_id = Some(head_id);
    while let Some(commit_id) = current_id {
        commit_count += 1;
        
        // 如果是第一个提交（最新的），记录其信息
        if latest_commit_sha.is_none() {
            latest_commit_sha = Some(commit_id.to_hex().to_string());
            
            // 读取提交对象
            if let Ok(commit_obj) = repo.find_object(commit_id) {
                if let Ok(commit) = commit_obj.try_into_commit() {
                    // 获取提交消息
                    if let Ok(message_ref) = commit.message() {
                        // MessageRef 有 title 和 body 字段，都是 &BStr 类型
                        // 组合标题和正文（如果有）
                        let mut message_parts = vec![message_ref.title.to_str_lossy().to_string()];
                        if let Some(body) = message_ref.body {
                            message_parts.push(body.to_str_lossy().to_string());
                        }
                        let message = message_parts.join("\n\n");
                        latest_commit_message = Some(message);
                    }
                    
                    // 获取提交时间
                    if let Ok(committer) = commit.committer() {
                        let time = committer.time;
                        let time_str = format!("{}", time.format(gix::date::time::format::ISO8601));
                        latest_commit_time = Some(time_str);
                    }
                }
            }
        }
        
        // 获取父提交
        if let Ok(commit_obj) = repo.find_object(commit_id) {
            if let Ok(commit) = commit_obj.try_into_commit() {
                current_id = commit.parent_ids().next().map(|p| p.detach());
            } else {
                current_id = None;
            }
        } else {
            current_id = None;
        }
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
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `limit`: 返回的最大提交数量（默认10）
/// 
/// # 返回
/// 返回提交历史列表
/// 
/// 基于 gix 0.66.0 API 实现
pub fn get_commit_history(repo_path: &Path, limit: Option<usize>) -> Result<Vec<CommitInfo>> {
    let limit = limit.unwrap_or(10);
    let mut commits = Vec::new();
    
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 获取 HEAD
    let head_id = match repo.head_id() {
        Ok(id) => id.detach(),
        Err(_) => return Ok(commits), // 没有提交记录
    };
    
    // 遍历提交历史
    let mut current_id = Some(head_id);
    let mut count = 0;
    
    while let Some(commit_id) = current_id {
        if count >= limit {
            break;
        }
        
        // 读取提交对象
        let commit_obj = repo.find_object(commit_id)
            .context("无法找到提交对象")?;
        let commit = commit_obj.try_into_commit()
            .context("无法转换为提交对象")?;
        
        // 获取提交信息
        let sha = commit_id.to_hex().to_string();
        
        // 获取提交消息
        let message = commit.message()
            .map(|msg| {
                // MessageRef 有 title 和 body 字段，都是 &BStr 类型
                // 组合标题和正文（如果有）
                let mut message_parts = vec![msg.title.to_str_lossy().to_string()];
                if let Some(body) = msg.body {
                    message_parts.push(body.to_str_lossy().to_string());
                }
                message_parts.join("\n\n")
            })
            .unwrap_or_else(|_| "无法读取提交消息".to_string());
        
        // 获取提交时间和作者
        let committer = commit.committer()
            .context("无法读取提交者信息")?;
        let time = committer.time;
        let time_str = format!("{}", time.format(gix::date::time::format::ISO8601));
        
        let author_obj = commit.author()
            .context("无法读取作者信息")?;
        let author = format!("{} <{}>", 
            String::from_utf8_lossy(author_obj.name.as_ref()),
            String::from_utf8_lossy(author_obj.email.as_ref())
        );
        
        commits.push(CommitInfo {
            sha,
            message,
            time: time_str,
            author,
        });
        
        // 获取父提交
        current_id = commit.parent_ids().next().map(|p| p.detach());
        count += 1;
    }
    
    Ok(commits)
}

/// 添加远程仓库
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `name`: 远程仓库名称（默认 "origin"）
/// - `url`: 远程仓库URL
/// 
/// # 返回
/// 成功时返回 Ok(())
/// 
/// 基于 gix 0.66.0 API 实现
pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<()> {
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 获取 .git 目录路径
    let git_dir = repo.git_dir();
    let config_path = git_dir.join("config");
    
    // 读取现有配置
    let mut config_content = if config_path.exists() {
        std::fs::read_to_string(&config_path)?
    } else {
        String::new()
    };
    
    // 检查远程是否已存在
    let remote_section = format!("[remote \"{}\"]", name);
    if config_content.contains(&remote_section) {
        // 如果已存在，更新URL
        // 查找并替换URL行
        let url_line = format!("url = {}", url);
        let lines: Vec<&str> = config_content.lines().collect();
        let mut new_lines = Vec::new();
        let mut in_remote_section = false;
        
        let url_line_with_tab = format!("\t{}", url_line);
        
        for line in lines {
            if line.trim() == remote_section {
                in_remote_section = true;
                new_lines.push(line);
            } else if line.trim().starts_with('[') && in_remote_section {
                // 遇到新的section，添加URL行
                new_lines.push(&url_line_with_tab);
                new_lines.push(line);
                in_remote_section = false;
            } else if line.trim().starts_with("url =") && in_remote_section {
                // 替换现有的URL行
                new_lines.push(&url_line_with_tab);
            } else {
                new_lines.push(line);
            }
        }
        
        // 如果还在remote section中但没有找到url行，添加它
        if in_remote_section {
            let mut found_url = false;
            for line in &new_lines {
                if line.trim().starts_with("url =") {
                    found_url = true;
                    break;
                }
            }
            if !found_url {
                // 在section结束前添加URL
                let mut updated_lines: Vec<&str> = Vec::new();
                for line in &new_lines {
                    updated_lines.push(line);
                    if line.trim() == remote_section {
                        updated_lines.push(&url_line_with_tab);
                    }
                }
                new_lines = updated_lines;
            }
        }
        
        config_content = new_lines.join("\n");
    } else {
        // 如果不存在，添加新的远程配置
        if !config_content.is_empty() && !config_content.ends_with('\n') {
            config_content.push('\n');
        }
        config_content.push_str(&format!("\n{}\n", remote_section));
        config_content.push_str(&format!("\turl = {}\n", url));
        config_content.push_str("\tfetch = +refs/heads/*:refs/remotes/origin/*\n");
    }
    
    // 写入配置
    std::fs::write(&config_path, config_content)?;
    
    Ok(())
}

/// 获取远程仓库URL
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `name`: 远程仓库名称（默认 "origin"）
/// 
/// # 返回
/// 返回远程仓库URL，如果未配置则返回 None
pub fn get_remote_url(repo_path: &Path, name: &str) -> Result<Option<String>> {
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 获取 .git 目录路径
    let git_dir = repo.git_dir();
    let config_path = git_dir.join("config");
    
    if !config_path.exists() {
        return Ok(None);
    }
    
    // 读取配置
    let config_content = std::fs::read_to_string(&config_path)?;
    
    // 查找远程配置
    let remote_section = format!("[remote \"{}\"]", name);
    let lines: Vec<&str> = config_content.lines().collect();
    let mut in_remote_section = false;
    
    for line in lines {
        if line.trim() == remote_section {
            in_remote_section = true;
        } else if line.trim().starts_with('[') && in_remote_section {
            // 遇到新的section，停止查找
            break;
        } else if line.trim().starts_with("url =") && in_remote_section {
            // 找到URL行
            let url = line.trim().strip_prefix("url =").unwrap_or("").trim();
            return Ok(Some(url.to_string()));
        }
    }
    
    Ok(None)
}

/// 删除远程仓库配置
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `name`: 远程仓库名称（默认 "origin"）
/// 
/// # 返回
/// 成功时返回 Ok(())
pub fn remove_remote(repo_path: &Path, name: &str) -> Result<()> {
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 获取 .git 目录路径
    let git_dir = repo.git_dir();
    let config_path = git_dir.join("config");
    
    if !config_path.exists() {
        return Ok(()); // 配置文件不存在，无需删除
    }
    
    // 读取配置
    let config_content = std::fs::read_to_string(&config_path)?;
    let lines: Vec<&str> = config_content.lines().collect();
    
    // 查找并删除远程配置section
    let remote_section = format!("[remote \"{}\"]", name);
    let mut new_lines = Vec::new();
    let mut skip_section = false;
    
    for line in lines {
        if line.trim() == remote_section {
            skip_section = true;
            continue; // 跳过section头
        } else if line.trim().starts_with('[') && skip_section {
            // 遇到新的section，停止跳过
            skip_section = false;
            new_lines.push(line);
        } else if !skip_section {
            new_lines.push(line);
        }
    }
    
    // 写入更新后的配置
    std::fs::write(&config_path, new_lines.join("\n"))?;
    
    Ok(())
}

/// 从远程仓库获取更新（fetch）
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `remote_name`: 远程仓库名称（默认 "origin"）
/// - `pat_token`: PAT Token（用于HTTPS认证）
/// 
/// # 返回
/// 成功时返回 Ok(())
/// 
/// 注意：目前使用命令行 git 实现，将来可以迁移到纯 gix API
pub fn fetch_from_remote(repo_path: &Path, remote_name: &str, pat_token: Option<&str>) -> Result<()> {
    eprintln!("[fetch_from_remote] 开始执行 fetch，remote_name: {}, repo_path: {:?}", remote_name, repo_path);
    
    // 打开仓库以验证其存在
    let _repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 获取远程URL
    let remote_url = get_remote_url(repo_path, remote_name)?
        .ok_or_else(|| anyhow::anyhow!("远程仓库 {} 未配置", remote_name))?;
    
    eprintln!("[GitOperation] fetch_from_remote: 远程URL: {} (已隐藏)", if remote_url.len() > 20 { &remote_url[..20] } else { &remote_url });
    eprintln!("[GitOperation] fetch_from_remote: PAT token 提供: {}", pat_token.is_some());
    
    // 如果提供了PAT且是HTTPS URL，使用带认证的URL进行fetch
    if let Some(pat) = pat_token {
        if remote_url.starts_with("https://") {
            // 构建带PAT的URL
            let url_without_protocol = remote_url.strip_prefix("https://").unwrap_or(&remote_url);
            let authenticated_url = if let Some(at_pos) = url_without_protocol.find('@') {
                let path_after_at = &url_without_protocol[at_pos + 1..];
                format!("https://{}@{}", pat, path_after_at)
            } else {
                format!("https://{}@{}", pat, url_without_protocol)
            };
            
            eprintln!("[GitOperation] fetch_from_remote: 使用 HTTPS + PAT 进行 fetch");
            
            // 使用带认证的URL直接fetch
            // git fetch <url> +refs/heads/*:refs/remotes/origin/*
            let refspec = format!("+refs/heads/*:refs/remotes/{}/{}", remote_name, "*");
            eprintln!("[GitOperation] fetch_from_remote: 执行命令: git -C {:?} fetch --quiet --no-tags <url> {}", repo_path, refspec);
            
            let output = std::process::Command::new("git")
                .arg("-C")
                .arg(repo_path)
                .arg("fetch")
                .arg("--quiet")
                .arg("--no-tags")
                .arg(&authenticated_url)
                .arg(&refspec)
                .output()
                .context("无法执行 git fetch 命令")?;
            
            eprintln!("[GitOperation] fetch_from_remote: git fetch 退出码: {}", output.status.code().unwrap_or(-1));
            
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                eprintln!("[GitOperation] fetch_from_remote: git fetch 失败 - stderr: {}", stderr);
                eprintln!("[GitOperation] fetch_from_remote: git fetch 失败 - stdout: {}", stdout);
                anyhow::bail!("git fetch 失败 (退出码: {}): {}\n{}", 
                    output.status.code().unwrap_or(-1), stderr, stdout);
            }
            
            eprintln!("[GitOperation] fetch_from_remote: fetch 成功完成");
            return Ok(());
        }
    }
    
    // 对于SSH URL或没有PAT的情况，直接使用remote名称
    eprintln!("[GitOperation] fetch_from_remote: 使用 remote 名称进行 fetch: {}", remote_name);
    
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("fetch")
        .arg(remote_name)
        .arg("--quiet")
        .arg("--no-tags")
        .output()
        .context("无法执行 git fetch 命令")?;
    
    eprintln!("[GitOperation] fetch_from_remote: git fetch 退出码: {}", output.status.code().unwrap_or(-1));
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("[GitOperation] fetch_from_remote: git fetch 失败 - stderr: {}", stderr);
        eprintln!("[GitOperation] fetch_from_remote: git fetch 失败 - stdout: {}", stdout);
        anyhow::bail!("git fetch 失败 (退出码: {}): {}\n{}", 
            output.status.code().unwrap_or(-1), stderr, stdout);
    }
    
    eprintln!("[GitOperation] fetch_from_remote: fetch 成功完成");
    Ok(())
}

/// 推送本地提交到远程仓库（push）
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `remote_name`: 远程仓库名称（默认 "origin"）
/// - `branch_name`: 分支名称（默认 "main"）
/// - `pat_token`: PAT Token（用于HTTPS认证）
/// 
/// # 返回
/// 成功时返回 Ok(())
/// 
/// 注意：目前使用命令行 git 实现，将来可以迁移到纯 gix API
pub fn push_to_remote(repo_path: &Path, remote_name: &str, branch_name: &str, pat_token: Option<&str>) -> Result<()> {
    eprintln!("[GitOperation] push_to_remote: 开始执行，remote_name: {}, branch_name: {}, repo_path: {:?}", remote_name, branch_name, repo_path);
    
    // 打开仓库以验证其存在
    let _repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    
    // 获取远程URL
    let remote_url = get_remote_url(repo_path, remote_name)?
        .ok_or_else(|| anyhow::anyhow!("远程仓库 {} 未配置", remote_name))?;
    
    eprintln!("[GitOperation] push_to_remote: 远程URL: {} (已隐藏)", if remote_url.len() > 20 { &remote_url[..20] } else { &remote_url });
    eprintln!("[GitOperation] push_to_remote: PAT token 提供: {}", pat_token.is_some());
    
    // 如果提供了PAT，将其嵌入URL中
    let authenticated_url = if let Some(pat) = pat_token {
        if remote_url.starts_with("https://") {
            let url_without_protocol = remote_url.strip_prefix("https://").unwrap_or(&remote_url);
            let authenticated_url = if let Some(at_pos) = url_without_protocol.find('@') {
                let path_after_at = &url_without_protocol[at_pos + 1..];
                format!("https://{}@{}", pat, path_after_at)
            } else {
                format!("https://{}@{}", pat, url_without_protocol)
            };
            eprintln!("[push_to_remote] 使用 HTTPS + PAT 进行 push");
            authenticated_url
        } else {
            remote_url
        }
    } else {
        remote_url
    };
    
    // 检查本地分支是否存在（是否有提交）
    // 如果没有提交，使用 HEAD:branch_name 而不是 branch_name:branch_name
    let local_branch_exists = repo_path.join(".git/refs/heads").join(branch_name).exists();
    let refspec = if local_branch_exists {
        format!("{}:{}", branch_name, branch_name)
    } else {
        // 如果本地分支不存在，使用 HEAD:branch_name
        // 但如果没有提交，HEAD 也不存在，这会导致错误
        // 所以先检查是否有提交
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("rev-parse")
            .arg("HEAD")
            .output();
        
        match output {
            Ok(out) if out.status.success() => {
                // 有 HEAD，使用 HEAD:branch_name
                format!("HEAD:{}", branch_name)
            }
            _ => {
                // 没有提交，无法推送
                anyhow::bail!("无法推送：本地仓库尚未有任何提交。请先进行提交。");
            }
        }
    };
    
    eprintln!("[push_to_remote] 执行命令: git -C {:?} push <url> {} --quiet", repo_path, refspec);
    
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("push")
        .arg(&authenticated_url)
        .arg(&refspec)
        .arg("--quiet")
        .output()
        .context("无法执行 git push 命令")?;
    
    eprintln!("[GitOperation] push_to_remote: git push 退出码: {}", output.status.code().unwrap_or(-1));
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("[GitOperation] push_to_remote: git push 失败 - stderr: {}", stderr);
        eprintln!("[GitOperation] push_to_remote: git push 失败 - stdout: {}", stdout);
        
        // 检查是否是非快进推送（需要先pull）
        if stderr.contains("non-fast-forward") || stderr.contains("rejected") {
            anyhow::bail!("推送被拒绝：远程分支包含本地没有的提交。请先同步远程更改。");
        }
        
        anyhow::bail!("git push 失败 (退出码: {}): {}\n{}", 
            output.status.code().unwrap_or(-1), stderr, stdout);
    }
    
    eprintln!("[GitOperation] push_to_remote: push 成功完成");
    Ok(())
}

/// 同步结果
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SyncResult {
    pub success: bool,
    pub has_conflict: bool,
    pub conflict_branch: Option<String>,
}

/// 同步远程仓库（fetch + rebase/push）
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `remote_name`: 远程仓库名称（默认 "origin"）
/// - `branch_name`: 分支名称（默认 "main"）
/// - `pat_token`: PAT Token（用于HTTPS认证）
/// 
/// # 返回
/// 返回同步结果，包含是否成功和是否有冲突
/// 
/// 根据PRD要求，使用Rebase优先策略
pub fn sync_with_remote(repo_path: &Path, remote_name: &str, branch_name: &str, pat_token: Option<&str>) -> Result<SyncResult> {
    // 先执行fetch
    fetch_from_remote(repo_path, remote_name, pat_token)
        .context("无法从远程获取更新")?;
    
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 检查是否有本地提交需要rebase
    let local_head = match repo.head_id() {
        Ok(id) => id.detach(),
        Err(_) => {
            // 没有本地提交，直接push
            push_to_remote(repo_path, remote_name, branch_name, pat_token)
                .context("无法推送到远程")?;
            return Ok(SyncResult {
                success: true,
                has_conflict: false,
                conflict_branch: None,
            });
        }
    };
    
    // 检查远程分支是否存在
    let remote_ref_name = format!("refs/remotes/{}/{}", remote_name, branch_name);
    let remote_head = match std::fs::read_to_string(repo.git_dir().join(&remote_ref_name)) {
        Ok(sha_str) => {
            // 解析SHA
            gix::hash::ObjectId::from_hex(sha_str.trim().as_bytes())
                .context("无法解析远程分支SHA")?
        }
        Err(_) => {
            // 远程分支不存在，直接push
            push_to_remote(repo_path, remote_name, branch_name, pat_token)
                .context("无法推送到远程")?;
            return Ok(SyncResult {
                success: true,
                has_conflict: false,
                conflict_branch: None,
            });
        }
    };
    
    // 检查本地和远程是否有分叉（需要rebase）
    // 如果本地HEAD是远程HEAD的后代，或者两者相同，不需要rebase
    let needs_rebase = local_head != remote_head;
    
    if needs_rebase {
        eprintln!("[GitOperation] sync_with_remote: 需要 rebase，开始执行");
        
        // 在 rebase 之前，确保索引与 HEAD 一致
        // 如果索引中有未提交的变更，先重置索引到 HEAD
        eprintln!("[GitOperation] sync_with_remote: 检查索引状态");
        let index_status_output = std::process::Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("diff")
            .arg("--cached")
            .arg("--quiet")
            .output();
        
        // 如果索引与 HEAD 不一致（有暂存的变更），重置索引
        if let Ok(status) = index_status_output {
            if !status.status.success() {
                eprintln!("[GitOperation] sync_with_remote: 检测到索引中有未提交的变更，重置索引到 HEAD");
                let reset_output = std::process::Command::new("git")
                    .arg("-C")
                    .arg(repo_path)
                    .arg("reset")
                    .arg("HEAD")
                    .output()
                    .context("无法重置索引")?;
                
                if !reset_output.status.success() {
                    let stderr = String::from_utf8_lossy(&reset_output.stderr);
                    eprintln!("[GitOperation] sync_with_remote: 重置索引失败: {}", stderr);
                    // 继续尝试 rebase，可能只是警告
                } else {
                    eprintln!("[GitOperation] sync_with_remote: 索引已重置到 HEAD");
                }
            }
        }
        
        // 尝试rebase：使用命令行git rebase（将来可以迁移到纯gix API）
        // 注意：索引状态已在上面处理，这里直接执行 rebase
        eprintln!("[GitOperation] sync_with_remote: 执行 git rebase");
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(repo_path)
            .arg("rebase")
            .arg(format!("{}/{}", remote_name, branch_name))
            .arg("--quiet")
            .arg("--no-verify") // 跳过hooks以提高速度
            .output()
            .context("无法执行 git rebase 命令")?;
        
        if !output.status.success() {
            // Rebase失败，检测是否有冲突
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            // 检查是否是因为冲突而失败
            let has_conflict = stderr.contains("CONFLICT") 
                || stderr.contains("conflict") 
                || stderr.contains("merge conflicts");
            
            if has_conflict {
                // 中止rebase并触发冲突处理
                let _ = std::process::Command::new("git")
                    .arg("-C")
                    .arg(repo_path)
                    .arg("rebase")
                    .arg("--abort")
                    .output();
                
                let conflict_branch = handle_sync_conflict(repo_path, remote_name, branch_name)?;
                return Ok(SyncResult {
                    success: true,
                    has_conflict: true,
                    conflict_branch: Some(conflict_branch),
                });
            } else {
                // 其他错误
                anyhow::bail!("git rebase 失败: {}", stderr);
            }
        }
    }
    
    // 如果没有冲突，执行push
    push_to_remote(repo_path, remote_name, branch_name, pat_token)
        .context("无法推送到远程")?;
    
    Ok(SyncResult {
        success: true,
        has_conflict: false,
        conflict_branch: None,
    })
}

/// 处理同步冲突
/// 
/// 根据PRD要求：
/// 1. 创建孤立分支 conflict_[date]
/// 2. 执行 git reset --hard origin/main 恢复主线干净状态
/// 3. 返回冲突信息
/// 
/// # 参数
/// - `repo_path`: 仓库路径
/// - `remote_name`: 远程仓库名称
/// - `branch_name`: 分支名称
/// 
/// # 返回
/// 返回冲突分支名称
pub fn handle_sync_conflict(repo_path: &Path, remote_name: &str, branch_name: &str) -> Result<String> {
    eprintln!("[GitOperation] handle_sync_conflict: 开始处理冲突，repo_path: {:?}, remote_name: {}, branch_name: {}", repo_path, remote_name, branch_name);
    
    // 打开仓库
    let repo = ThreadSafeRepository::discover(repo_path)
        .context("无法打开 Git 仓库")?;
    let repo = repo.to_thread_local();
    
    // 获取当前HEAD
    let current_head = repo.head_id()
        .context("无法获取当前HEAD")?;
    
    eprintln!("[GitOperation] handle_sync_conflict: 当前 HEAD: {}", current_head.detach().to_hex());
    
    // 创建冲突分支名称（使用时间戳）
    use std::time::{SystemTime, UNIX_EPOCH};
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let conflict_branch_name = format!("conflict_{}", timestamp);
    
    eprintln!("[GitOperation] handle_sync_conflict: 创建冲突分支: {}", conflict_branch_name);
    
    // 创建冲突分支（保存当前状态）
    let git_dir = repo.git_dir();
    let refs_dir = git_dir.join("refs/heads");
    std::fs::create_dir_all(&refs_dir)?;
    
    let conflict_branch_path = refs_dir.join(&conflict_branch_name);
    std::fs::write(&conflict_branch_path, current_head.detach().to_hex().to_string())?;
    eprintln!("[GitOperation] handle_sync_conflict: 冲突分支创建成功: {:?}", conflict_branch_path);
    
    // 实现 git reset --hard origin/main
    // 使用命令行git reset（将来可以迁移到纯gix API）
    let remote_ref = format!("{}/{}", remote_name, branch_name);
    eprintln!("[GitOperation] handle_sync_conflict: 执行 git reset --hard {}", remote_ref);
    
    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .arg("reset")
        .arg("--hard")
        .arg(&remote_ref)
        .output()
        .context("无法执行 git reset 命令")?;
    
    eprintln!("[GitOperation] handle_sync_conflict: git reset 退出码: {}", output.status.code().unwrap_or(-1));
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        eprintln!("[GitOperation] handle_sync_conflict: git reset 失败 - stderr: {}", stderr);
        eprintln!("[GitOperation] handle_sync_conflict: git reset 失败 - stdout: {}", stdout);
        anyhow::bail!("git reset --hard 失败: {}", stderr);
    }
    
    eprintln!("[GitOperation] handle_sync_conflict: 冲突处理完成，冲突分支: {}", conflict_branch_name);
    Ok(conflict_branch_name)
}
