use anyhow::{anyhow, Result};
use typst_as_lib::{typst_kit_options::TypstKitFontOptions, TypstEngine};

pub fn compile_typst_source_to_pdf(source: &str, images: Vec<Vec<u8>>) -> Result<Vec<u8>> {
    anyhow::ensure!(images.len() <= 256 && images.iter().map(Vec::len).sum::<usize>() <= 64 * 1024 * 1024, "信稿导出图片过多或过大");
    anyhow::ensure!(images.iter().all(|b| b.starts_with(b"\x89PNG\r\n\x1a\n")), "信稿导出图片格式无效");
    let files: Vec<_> = images.into_iter().enumerate().map(|(i, bytes)| (format!("letter-{i}.png"), bytes)).collect();
    let engine = TypstEngine::builder()
        .main_file(source)
        .with_static_file_resolver(files.iter().map(|(name, bytes)| (name.as_str(), bytes.as_slice())))
        .search_fonts_with(TypstKitFontOptions::default())
        .build();

    let compile_result = engine.compile();
    let document = compile_result
        .output
        .map_err(|errors| anyhow!("Typst 编译失败: {errors}"))?;

    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|error| anyhow!("Typst PDF 生成失败: {error:?}"))
}
