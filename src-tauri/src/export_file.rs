use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

pub fn extension(file_type: &str) -> Result<&'static str, String> {
    match file_type {
        "pdf" => Ok("pdf"), "docx" => Ok("docx"), "md" => Ok("md"),
        _ => Err("不支持的导出格式".into()),
    }
}

pub fn sanitize_filename(title: &str) -> String {
    let cleaned: String = title.chars().map(|c| {
        if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }
    }).collect();
    let mut name = String::new();
    for c in cleaned.trim_matches(|c: char| c.is_whitespace() || c == '.').chars() {
        if name.len() + c.len_utf8() > 180 { break; }
        name.push(c);
    }
    name = name.trim_end_matches(['.', ' ']).to_owned();
    if name.is_empty() { return "vana-document".into(); }
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        || ["COM", "LPT"].iter().any(|prefix| stem.strip_prefix(prefix).is_some_and(|n|
            matches!(n, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³")));
    if reserved { name.insert(0, '_'); }
    name
}

pub fn save_bytes(directory: &Path, title: &str, bytes: &[u8], file_type: &str) -> Result<PathBuf, String> {
    let extension = extension(file_type)?;
    save_with_extension(directory, title, bytes, extension)
}

pub fn save_backup(directory: &Path, title: &str, json: &str) -> Result<PathBuf, String> {
    save_with_extension(directory, title, json.as_bytes(), "vana-backup.json")
}

pub fn save_attachment(directory: &Path, filename: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let (stem, extension) = filename.rsplit_once('.').ok_or("附件缺少扩展名")?;
    let extension = extension.to_ascii_lowercase();
    if !matches!(extension.as_str(), "txt"|"md"|"csv"|"pdf"|"png"|"jpg"|"jpeg"|"gif"|"webp"|"docx"|"zip") {
        return Err("不支持的附件类型".into());
    }
    save_with_extension(directory, stem, bytes, &extension)
}

fn save_with_extension(directory: &Path, title: &str, bytes: &[u8], extension: &str) -> Result<PathBuf, String> {
    fs::create_dir_all(directory).map_err(|e| format!("创建导出目录失败: {e}"))?;
    let root = directory.canonicalize().map_err(|e| format!("无法访问导出目录: {e}"))?;
    let name = sanitize_filename(title);
    for counter in 0..u32::MAX {
        let suffix = if counter == 0 { String::new() } else { format!("({counter})") };
        let path = root.join(format!("{name}{suffix}.{extension}"));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
                    drop(file);
                    let _ = fs::remove_file(&path);
                    return Err(format!("保存导出文件失败: {error}"));
                }
                return Ok(path);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建导出文件失败: {error}")),
        }
    }
    Err("同名导出文件过多".into())
}

pub fn validate_backup_path(directory: &Path, path: &Path) -> Result<PathBuf, String> {
    let root = directory.canonicalize().map_err(|e| format!("无法访问备份目录: {e}"))?;
    let file = path.canonicalize().map_err(|e| format!("无法访问备份文件: {e}"))?;
    if !file.starts_with(root) || !file.is_file()
        || !file.file_name().and_then(|s| s.to_str()).is_some_and(|s| s.ends_with(".vana-backup.json")) {
        return Err("只能分享备份目录内的 Vana 备份文件".into());
    }
    Ok(file)
}

pub fn validate_share_path(directory: &Path, path: &Path, file_type: &str) -> Result<PathBuf, String> {
    let expected_extension = extension(file_type)?;
    let root = directory.canonicalize().map_err(|e| format!("无法访问导出目录: {e}"))?;
    let file = path.canonicalize().map_err(|e| format!("无法访问分享文件: {e}"))?;
    if !file.starts_with(root) || !file.is_file()
        || file.extension().and_then(|s| s.to_str()) != Some(expected_extension) {
        return Err("只能分享导出目录内对应格式的文件".into());
    }
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_files_are_unique_and_only_controlled_backups_can_be_shared() {
        let root = std::env::temp_dir().join(format!("vana-backup-file-{}", uuid::Uuid::new_v4()));
        let first = save_backup(&root, "../Vana", "{\"version\":1}").unwrap();
        let second = save_backup(&root, "../Vana", "second").unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read_to_string(&first).unwrap(), "{\"version\":1}");
        assert!(validate_backup_path(&root, &first).is_ok());
        assert!(validate_share_path(&root, &first, "md").is_err());
        assert!(save_bytes(&root, "bad", b"", "backup").is_err());
        fs::write(root.join("wrong.json"), "{}").unwrap();
        assert!(validate_backup_path(&root, &root.join("wrong.json")).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn portable_names_and_utf8_boundaries() {
        for title in ["CON", "con.txt", "AUX", "LPT1", "COM¹"] {
            assert!(sanitize_filename(title).starts_with('_'));
        }
        assert_eq!(sanitize_filename(" . "), "vana-document");
        let name = sanitize_filename("../a\\b:报告?\n");
        assert!(!name.contains(['/', '\\', ':', '?', '\n']));
        assert!(sanitize_filename(&"中文".repeat(150)).len() <= 180);
    }
    #[test]
    fn exporting_twice_never_overwrites_and_stays_inside_root() {
        let root = std::env::temp_dir().join(format!("vana-export-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let first = save_bytes(&root, "../CON", b"first", "md").unwrap();
        let second = save_bytes(&root, "../CON", b"second", "md").unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&first).unwrap(), b"first");
        assert!(validate_share_path(&root, &first, "md").is_ok());
        assert!(validate_share_path(&root, &first, "pdf").is_err());
        assert!(save_bytes(&root, "name", b"", "../../escape").is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn sharing_rejects_symlinks_outside_the_export_root() {
        let root = std::env::temp_dir().join(format!("vana-share-test-{}", std::process::id()));
        fs::create_dir_all(root.join("exports")).unwrap();
        fs::write(root.join("private.md"), b"private").unwrap();
        std::os::unix::fs::symlink(root.join("private.md"), root.join("exports/link.md")).unwrap();
        assert!(validate_share_path(&root.join("exports"), &root.join("exports/link.md"), "md").is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
