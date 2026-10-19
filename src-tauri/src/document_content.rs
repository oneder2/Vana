//! The supported Tiptap schema is the input boundary for saves, sync, history and backups.
use anyhow::{Context, Result};
use serde_json::Value;

pub fn validate(content: &str) -> Result<()> {
    anyhow::ensure!(content.len() <= 512 * 1024, "文档正文超过 512 KiB 上限");
    let value: Value = serde_json::from_str(content).context("正文不是有效 JSON")?;
    anyhow::ensure!(
        value["type"] == "doc" && value["content"].is_array(),
        "正文必须是 Tiptap doc 对象"
    );
    let mut stack = vec![(&value, 0usize, "")];
    let mut count = 0;
    while let Some((node, depth, parent)) = stack.pop() {
        count += 1;
        anyhow::ensure!(depth <= 32 && count <= 50_000, "正文层级或节点数超过上限");
        let object = node.as_object().context("正文节点无效")?;
        anyhow::ensure!(
            object.keys().all(|key| matches!(
                key.as_str(),
                "type" | "attrs" | "content" | "text" | "marks"
            )),
            "正文包含不支持的节点字段"
        );
        let kind = node["type"].as_str().context("正文节点缺少类型")?;
        anyhow::ensure!(
            matches!(
                kind,
                "doc"
                    | "paragraph"
                    | "heading"
                    | "codeBlock"
                    | "blockquote"
                    | "bulletList"
                    | "orderedList"
                    | "listItem"
                    | "meta"
                    | "horizontalRule"
                    | "letterpress"
                    | "text"
                    | "hardBreak"
            ),
            "正文包含不支持的节点类型"
        );
        let valid_child = match parent {
            "" => kind == "doc",
            "paragraph" | "heading" | "meta" => matches!(kind, "text" | "hardBreak"),
            "codeBlock" => kind == "text",
            "bulletList" | "orderedList" => kind == "listItem",
            _ => !matches!(kind, "doc" | "text" | "hardBreak" | "listItem"),
        };
        anyhow::ensure!(valid_child, "正文节点层级不符合编辑器结构");
        if kind == "text" {
            anyhow::ensure!(node["text"].is_string(), "文字节点无效");
        } else {
            anyhow::ensure!(node.get("text").is_none(), "非文字节点包含 text 字段");
        }
        if kind == "letterpress" {
            anyhow::ensure!(node.get("marks").is_none(), "信稿不能带文字标记");
            anyhow::ensure!(node.get("content").is_none_or(|v| v.as_array().is_some_and(|a| a.is_empty())), "信稿不能有子节点");
            let attrs = node["attrs"].as_object().context("信稿属性无效")?;
            anyhow::ensure!(attrs.len() == 2 && attrs.contains_key("id") && attrs.contains_key("design"), "信稿属性无效");
            anyhow::ensure!(attrs["id"].as_str().is_some_and(|s| !s.is_empty() && s.encode_utf16().count() <= 80), "信稿标识无效");
            validate_letter(&attrs["design"])?;
            continue;
        }
        if let Some(attrs) = node.get("attrs").filter(|v| !v.is_null()) {
            for (name, value) in attrs.as_object().context("正文属性无效")? {
                let valid = if value.is_null() {
                    matches!(
                        name.as_str(),
                        "uuid"
                            | "createdAt"
                            | "updatedAt"
                            | "textAlign"
                            | "language"
                            | "class"
                            | "type"
                    )
                } else {
                    match name.as_str() {
                        "uuid" => value.as_str().map(|s| s.len() <= 128).unwrap_or(false),
                        "createdAt" | "updatedAt" => {
                            value.as_i64().map(|n| n >= 0).unwrap_or(false)
                        }
                        "textAlign" => matches!(
                            value.as_str(),
                            Some("left" | "center" | "right" | "justify")
                        ),
                        "level" => {
                            kind == "heading"
                                && value
                                    .as_i64()
                                    .map(|n| (1..=6).contains(&n))
                                    .unwrap_or(false)
                        }
                        "start" => {
                            kind == "orderedList"
                                && value
                                    .as_i64()
                                    .map(|n| (1..=1_000_000_000).contains(&n))
                                    .unwrap_or(false)
                        }
                        "type" => {
                            kind == "orderedList"
                                && matches!(value.as_str(), Some("1" | "a" | "A" | "i" | "I"))
                        }
                        "language" => {
                            kind == "codeBlock"
                                && value
                                    .as_str()
                                    .map(|s| {
                                        s.len() <= 64
                                            && s.bytes().all(|c| {
                                                c.is_ascii_alphanumeric() || b"+-_#".contains(&c)
                                            })
                                    })
                                    .unwrap_or(false)
                        }
                        "class" => kind == "meta" && value == "meta-block",
                        _ => false,
                    }
                };
                anyhow::ensure!(valid, "正文包含不支持或不安全的属性");
            }
        }
        if let Some(marks) = node.get("marks") {
            anyhow::ensure!(matches!(kind, "text" | "hardBreak"), "块节点不能带文字标记");
            for mark in marks.as_array().context("文字标记无效")? {
                let kind = mark["type"].as_str().context("文字标记缺少类型")?;
                anyhow::ensure!(
                    matches!(
                        kind,
                        "bold" | "italic" | "underline" | "strike" | "code" | "link"
                    ),
                    "不支持的文字标记"
                );
                if let Some(attrs) = mark.get("attrs").filter(|v| !v.is_null()) {
                    for (name, value) in attrs.as_object().context("文字标记属性无效")? {
                        let valid = kind == "link"
                            && match name.as_str() {
                                "href" => value.as_str().map(safe_link).unwrap_or(false),
                                "target" => {
                                    value.is_null()
                                        || matches!(value.as_str(), Some("_blank" | "_self"))
                                }
                                "rel" => {
                                    value.is_null()
                                        || value
                                            .as_str()
                                            .map(|s| {
                                                s.split_whitespace().all(|t| {
                                                    matches!(
                                                        t,
                                                        "noopener"
                                                            | "noreferrer"
                                                            | "nofollow"
                                                            | "ugc"
                                                            | "sponsored"
                                                    )
                                                })
                                            })
                                            .unwrap_or(false)
                                }
                                "class" => value.is_null(),
                                _ => false,
                            };
                        anyhow::ensure!(valid, "文字标记包含不安全的属性或链接");
                    }
                }
            }
        }
        if let Some(children) = node.get("content") {
            let children = children.as_array().context("正文 content 必须是数组")?;
            anyhow::ensure!(
                !matches!(kind, "text" | "hardBreak" | "horizontalRule") || children.is_empty(),
                "叶节点不能有子节点"
            );
            stack.extend(children.iter().rev().map(|child| (child, depth + 1, kind)));
        }
    }
    Ok(())
}
fn safe_link(href: &str) -> bool {
    href.len() <= 4096
        && !href.chars().any(char::is_control)
        && (href.starts_with('#')
            || url::Url::parse(href)
                .map(|url| matches!(url.scheme(), "https" | "http" | "mailto" | "tel"))
                .unwrap_or(false))
}

/// Portable, finite recipes only: never persisted HTML, external images or font URLs.
fn validate_letter(d: &Value) -> Result<()> {
    fn keys(v: &Value, names: &[&str]) -> bool {
        v.as_object().is_some_and(|o| o.len() == names.len() && o.keys().all(|k| names.contains(&k.as_str())))
    }
    fn choice(v: &Value, allowed: &[&str]) -> bool { v.as_str().is_some_and(|s| allowed.contains(&s)) }
    fn text(v: &Value, max: usize) -> bool { v.as_str().is_some_and(|s| s.encode_utf16().count() <= max) }
    fn number(v: &Value, min: f64, max: f64) -> bool { v.as_f64().is_some_and(|n| n.is_finite() && (min..=max).contains(&n)) }
    fn seed(v: &Value) -> bool { v.as_f64().is_some_and(|n| n.fract() == 0.0 && (0.0..=4294967295.0).contains(&n)) }
    anyhow::ensure!(keys(d, &["version","material","format","font","title","text","signature","fontSize","lineHeight","inset","align","seed","marks"])
        && d["version"] == 1 && choice(&d["material"], &["card","letter","stone","arcane","terminal"])
        && choice(&d["format"], &["portrait","square","tall"]) && choice(&d["font"], &["song","brush","sans","mono"])
        && choice(&d["align"], &["left","center","right"]) && text(&d["title"],120) && text(&d["text"],12000) && text(&d["signature"],120)
        && number(&d["fontSize"],22.0,60.0) && number(&d["lineHeight"],1.3,2.4) && number(&d["inset"],60.0,160.0)
        && seed(&d["seed"]) && d.to_string().encode_utf16().count() <= 100000, "信稿格式或参数无效");
    let marks = d["marks"].as_array().context("信稿痕迹无效")?;
    anyhow::ensure!(marks.len() <= 24, "信稿痕迹过多");
    let mut ids = std::collections::HashSet::new();
    for m in marks {
        anyhow::ensure!(keys(m, &["id","kind","pattern","x","y","size","angle","strength","seed"])
            && text(&m["id"],80) && m["id"].as_str().is_some_and(|id| !id.is_empty() && ids.insert(id))
            && choice(&m["kind"], &["blood","burn","tear","stain"]) && choice(&m["pattern"], &["spray","drops","smear"])
            && number(&m["x"],0.0,1.0) && number(&m["y"],0.0,1.0) && number(&m["size"],0.04,0.65)
            && number(&m["angle"],-180.0,180.0) && number(&m["strength"],0.1,1.0) && seed(&m["seed"]), "信稿痕迹参数无效");
    }
    Ok(())
}
