use anyhow::{anyhow, Result};
use typst_as_lib::{typst_kit_options::TypstKitFontOptions, TypstEngine};

pub fn compile_typst_source_to_pdf(source: &str) -> Result<Vec<u8>> {
    let engine = TypstEngine::builder()
        .main_file(source)
        .search_fonts_with(TypstKitFontOptions::default())
        .build();

    let compile_result = engine.compile();
    let document = compile_result
        .output
        .map_err(|errors| anyhow!("Typst 编译失败: {errors}"))?;

    typst_pdf::pdf(&document, &typst_pdf::PdfOptions::default())
        .map_err(|error| anyhow!("Typst PDF 生成失败: {error:?}"))
}
