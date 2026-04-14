/**
 * No Visitors - 文档导出功能
 * 支持导出为 PDF 和 DOCX 格式
 * 应用文档的氛围协议主题样式
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { Theme } from './themes';
import { getThemeAccentColor, getThemeBgColor, getThemeBorderColor, getThemeSurfaceColor } from './themeStyles';
import { JSONContent } from '@tiptap/core';
import { invoke } from '@tauri-apps/api/core';
import { getDocumentDocxSizes, getDocumentStyleTokens } from './documentStyles';

interface InlineRunSpec {
  text: string;
  color: string;
  bold?: boolean;
  italics?: boolean;
  underline?: { type: 'single' };
  strike?: boolean;
  font?: string;
  size?: number;
}

/**
 * 从 Tiptap JSON 内容中提取纯文本
 */
function extractTextFromJSON(content: JSONContent): string {
  if (!content) return '';

  let text = '';

  if (content.type === 'text') {
    text += content.text || '';
  }

  if (content.content && Array.isArray(content.content)) {
    for (const child of content.content) {
      text += extractTextFromJSON(child);
    }
  }

  return text;
}

function escapeMarkdownText(text: string): string {
  return text.replace(/([*_`\\])/g, '\\$1');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeTypstText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/#/g, '\\#')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function escapeTypstString(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function escapeTypstCode(text: string): string {
  return text.replace(/```/g, '``\\`');
}

function cssColorToHex(color: string, fallback: string): string {
  const normalized = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  const rgbMatch = normalized.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return `#${[r, g, b]
      .map((value) => Number(value).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`;
  }

  return fallback;
}

function typstColor(color: string, fallback: string): string {
  return `rgb("${cssColorToHex(color, fallback)}")`;
}

function rgbaToRgb(color: string): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbaMatch) {
    return color;
  }

  const [, r, g, b] = rgbaMatch;
  return `rgb(${r}, ${g}, ${b})`;
}

function toDocxHexColor(color: string): string {
  const hex = color.trim().replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return hex.toUpperCase();
  }

  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbMatch) {
    return 'D6D3D1';
  }

  const [, r, g, b] = rgbMatch;
  return [r, g, b]
    .map((value) => Number(value).toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

function convertInlineContentToHTML(content: JSONContent): string {
  if (!content) return '';

  if (content.type === 'text') {
    let text = escapeHtml(content.text || '');

    for (const mark of content.marks || []) {
      if (mark.type === 'bold') {
        text = `<strong>${text}</strong>`;
      } else if (mark.type === 'italic') {
        text = `<em>${text}</em>`;
      } else if (mark.type === 'underline') {
        text = `<u>${text}</u>`;
      } else if (mark.type === 'strike') {
        text = `<s>${text}</s>`;
      } else if (mark.type === 'code') {
        text = `<code>${text}</code>`;
      }
    }

    return text;
  }

  return (content.content || []).map(convertInlineContentToHTML).join('');
}

function renderListItems(list: JSONContent, ordered: boolean): string {
  const tag = ordered ? 'ol' : 'ul';
  const items = (list.content || []).map((item) => {
    const itemHtml = (item.content || [])
      .map((child) => {
        if (child.type === 'paragraph') {
          return convertInlineContentToHTML(child);
        }
        return child.type === 'bulletList' || child.type === 'orderedList'
          ? renderListItems(child, child.type === 'orderedList')
          : convertInlineContentToHTML(child);
      })
      .join('');

    return `<li>${itemHtml || '&nbsp;'}</li>`;
  }).join('');

  return `<${tag}>${items}</${tag}>`;
}

function convertJSONToHTML(content: JSONContent): string {
  if (!content?.content || !Array.isArray(content.content)) {
    return '<p class="empty">文档内容为空</p>';
  }

  const blocks = content.content.map((block) => {
    const align = block.attrs?.textAlign || 'left';
    const alignAttr = ` style="text-align:${align};"`;

    switch (block.type) {
      case 'heading': {
        const level = Math.min(Math.max(Number(block.attrs?.level || 1), 1), 3);
        return `<h${level}${alignAttr}>${convertInlineContentToHTML(block) || '标题'}</h${level}>`;
      }
      case 'blockquote':
        return `<blockquote${alignAttr}>${(block.content || [])
          .map((child) => child.type === 'paragraph' ? convertInlineContentToHTML(child) : convertInlineContentToHTML(child))
          .join('<br />') || '引用内容'}</blockquote>`;
      case 'codeBlock':
        return `<pre><code>${escapeHtml(extractTextFromJSON(block) || '')}</code></pre>`;
      case 'bulletList':
        return renderListItems(block, false);
      case 'orderedList':
        return renderListItems(block, true);
      case 'paragraph':
        return `<p${alignAttr}>${convertInlineContentToHTML(block) || '&nbsp;'}</p>`;
      default: {
        const fallback = convertInlineContentToHTML(block) || escapeHtml(extractTextFromJSON(block));
        return fallback ? `<p${alignAttr}>${fallback}</p>` : '';
      }
    }
  }).join('');

  return blocks.trim() ? blocks : '<p class="empty">文档内容为空</p>';
}

function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForRenderStability(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    const fontDocument = document as unknown as { fonts?: FontFaceSet };
    await fontDocument.fonts?.ready;
  }
  await waitForNextFrame();
  await waitForNextFrame();
}

function createPDFRenderRoot(
  htmlContent: string,
  theme: Theme,
  filename: string
): HTMLDivElement {
  const tokens = getDocumentStyleTokens(theme);
  const background = tokens.pageBackgroundColor;
  const surface = tokens.surfaceColor;
  const border = tokens.borderColor;
  const accent = tokens.accentColor;
  const text = tokens.textColor;
  const muted = tokens.mutedColor;
  const exportedAt = new Date().toLocaleString();

  const host = document.createElement('div');
  host.id = 'pdf-export-render-root';
  host.style.cssText = `
    position: absolute;
    left: -100000px;
    top: 0;
    width: 794px;
    padding: 0;
    margin: 0;
    opacity: 1;
    visibility: visible;
    pointer-events: none;
    z-index: -1;
  `;

  host.innerHTML = `
    <style>
      #pdf-export-render-root .nv-pdf-page {
        width: 794px;
        background: ${background};
        color: ${text};
        padding: 56px 60px 48px;
        box-sizing: border-box;
        font-size: ${tokens.bodyFontSizePx}px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        line-height: ${tokens.lineHeight};
      }
      #pdf-export-render-root .nv-pdf-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 24px;
        padding-bottom: 18px;
        margin-bottom: 28px;
        border-bottom: 1px solid ${border};
      }
      #pdf-export-render-root .nv-pdf-title {
        margin: 0;
        font-size: ${tokens.titleSizeRem}rem;
        line-height: 1.25;
        color: ${accent};
        word-break: break-word;
      }
      #pdf-export-render-root .nv-pdf-meta {
        color: ${muted};
        font-size: ${tokens.metaFontSizeRem}rem;
        text-align: right;
        white-space: nowrap;
      }
      #pdf-export-render-root .nv-pdf-content h1,
      #pdf-export-render-root .nv-pdf-content h2,
      #pdf-export-render-root .nv-pdf-content h3 {
        color: ${accent};
        margin: ${tokens.headingMarginTopRem}em 0 ${tokens.headingMarginBottomRem}em;
        line-height: 1.3;
        page-break-after: avoid;
      }
      #pdf-export-render-root .nv-pdf-content h1 { font-size: ${tokens.h1SizeRem}rem; }
      #pdf-export-render-root .nv-pdf-content h2 { font-size: ${tokens.h2SizeRem}rem; }
      #pdf-export-render-root .nv-pdf-content h3 { font-size: ${tokens.h3SizeRem}rem; }
      #pdf-export-render-root .nv-pdf-content p,
      #pdf-export-render-root .nv-pdf-content ul,
      #pdf-export-render-root .nv-pdf-content ol,
      #pdf-export-render-root .nv-pdf-content blockquote,
      #pdf-export-render-root .nv-pdf-content pre {
        margin: 0 0 ${tokens.paragraphSpacingRem}rem;
        font-size: ${tokens.bodyFontSizePx}px;
        page-break-inside: avoid;
      }
      #pdf-export-render-root .nv-pdf-content ul,
      #pdf-export-render-root .nv-pdf-content ol {
        padding-left: ${tokens.listPaddingLeftRem}rem;
      }
      #pdf-export-render-root .nv-pdf-content li {
        margin-bottom: ${tokens.listItemSpacingRem}rem;
      }
      #pdf-export-render-root .nv-pdf-content blockquote {
        margin-left: 0;
        padding: ${tokens.blockquotePaddingRem}rem;
        border-left: ${tokens.blockquoteBorderWidthPx}px solid ${tokens.blockquoteBorderColor};
        background: ${tokens.blockquoteBackgroundColor};
        color: ${text};
        border-radius: ${tokens.blockquoteRadiusRem}rem;
      }
      #pdf-export-render-root .nv-pdf-content pre {
        padding: ${tokens.codeBlockPaddingRem}rem;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: ${tokens.codeBlockRadiusRem}rem;
        border: 1px solid ${border};
        background: ${tokens.codeBlockBackgroundColor};
      }
      #pdf-export-render-root .nv-pdf-content code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.92em;
        background: ${tokens.inlineCodeBackgroundColor};
        color: ${tokens.inlineCodeTextColor};
        padding: ${tokens.codeInlinePaddingYRem}rem ${tokens.codeInlinePaddingXRem}rem;
        border-radius: ${tokens.codeInlineRadiusRem}rem;
      }
      #pdf-export-render-root .nv-pdf-content strong { font-weight: 700; }
      #pdf-export-render-root .nv-pdf-content em { font-style: italic; }
      #pdf-export-render-root .nv-pdf-content u { text-decoration: underline; }
      #pdf-export-render-root .nv-pdf-content s { text-decoration: line-through; }
      #pdf-export-render-root .nv-pdf-content .empty {
        color: ${muted};
        text-align: center;
        font-style: italic;
      }
      #pdf-export-render-root .nv-pdf-footer {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        padding-top: 20px;
        margin-top: 36px;
        border-top: 1px solid ${border};
        color: ${muted};
        font-size: ${tokens.metaFontSizeRem}rem;
      }
    </style>
    <div class="nv-pdf-page">
      <div class="nv-pdf-header">
        <h1 class="nv-pdf-title">${escapeHtml(filename)}</h1>
        <div class="nv-pdf-meta">
          <div>${escapeHtml(theme.name)}</div>
          <div>${escapeHtml(exportedAt)}</div>
        </div>
      </div>
      <div class="nv-pdf-content">${htmlContent}</div>
      <div class="nv-pdf-footer">
        <span>Created with No Visitors</span>
        <span>Local-first export</span>
      </div>
    </div>
  `;

  return host;
}

async function renderPDFToBlob(renderRoot: HTMLElement, theme: Theme): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;

  const pageElement = renderRoot.querySelector('.nv-pdf-page') as HTMLElement | null;
  if (!pageElement) {
    throw new Error('PDF 渲染容器创建失败');
  }

  await waitForRenderStability();
  const pdfOptions: Record<string, unknown> = {
    margin: [12, 12, 12, 12],
    filename: 'export.pdf',
    pagebreak: {
      mode: ['css', 'legacy', 'avoid-all'],
      avoid: ['blockquote', 'pre', 'h1', 'h2', 'h3', 'li'],
    },
    image: {
      type: 'png',
      quality: 1,
    },
    html2canvas: {
      backgroundColor: getThemeBgColor(theme),
      scale: Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 1.5)),
      useCORS: true,
      logging: false,
      windowWidth: pageElement.scrollWidth,
      windowHeight: pageElement.scrollHeight,
      scrollX: 0,
      scrollY: 0,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    },
  };

  const pdfInstance = html2pdf().set(pdfOptions as any).from(pageElement);

  const pdfBlob = await pdfInstance.outputPdf('blob');

  if (!pdfBlob || pdfBlob.size === 0) {
    throw new Error('PDF 渲染结果为空');
  }

  return pdfBlob;
}

function convertInlineContentToTypst(node: JSONContent): string {
  if (!node) return '';

  if (node.type === 'text') {
    let result = escapeTypstText(node.text || '');

    for (const mark of node.marks || []) {
      if (mark.type === 'bold') {
        result = `#strong[${result}]`;
      } else if (mark.type === 'italic') {
        result = `#emph[${result}]`;
      } else if (mark.type === 'underline') {
        result = `#underline[${result}]`;
      } else if (mark.type === 'strike') {
        result = `#strike[${result}]`;
      } else if (mark.type === 'code') {
        result = `#raw("${escapeTypstString(node.text || '')}")`;
      }
    }

    return result;
  }

  return (node.content || []).map(convertInlineContentToTypst).join('');
}

function convertListItemToTypst(item: JSONContent, ordered: boolean, depth = 0): string {
  const marker = ordered ? '+' : '-';
  const indent = '  '.repeat(depth);
  const parts: string[] = [];

  for (const child of item.content || []) {
    if (child.type === 'paragraph') {
      const inline = convertInlineContentToTypst(child).trim() || escapeTypstText(extractTextFromJSON(child) || ' ');
      parts.push(`${indent}${marker} ${inline}`);
      continue;
    }

    if (child.type === 'bulletList' || child.type === 'orderedList') {
      for (const nested of child.content || []) {
        parts.push(convertListItemToTypst(nested, child.type === 'orderedList', depth + 1));
      }
      continue;
    }

    const fallback = convertInlineContentToTypst(child).trim() || escapeTypstText(extractTextFromJSON(child));
    if (fallback) {
      parts.push(`${indent}${marker} ${fallback}`);
    }
  }

  return parts.join('\n');
}

function convertJSONToTypst(content: JSONContent, theme: Theme, filename: string): string {
  const tokens = getDocumentStyleTokens(theme);
  const background = typstColor(tokens.pageBackgroundColor, '#05040A');
  const surface = typstColor(tokens.surfaceColor, '#13111C');
  const border = typstColor(tokens.borderColor, '#2E2842');
  const accent = typstColor(tokens.accentColor, '#A855F7');
  const text = typstColor(tokens.textColor, '#D6D3D1');
  const muted = typstColor(tokens.mutedColor, '#A8A29E');
  const exportedAt = escapeTypstText(new Date().toLocaleString());
  const title = escapeTypstText(filename);
  const serifFonts = `(${tokens.typstSerifFonts.map((font) => `"${font}"`).join(', ')})`;
  const sansFonts = `(${tokens.typstSansFonts.map((font) => `"${font}"`).join(', ')})`;
  const monoFonts = `(${tokens.typstMonoFonts.map((font) => `"${font}"`).join(', ')})`;
  const bodyFonts = theme.id === 'terminal' ? monoFonts : serifFonts;
  const headingFonts = theme.id === 'terminal' ? monoFonts : serifFonts;

  const blocks = (content.content || []).map((block) => {
    const align = block.attrs?.textAlign;
    const alignPrefix = align === 'center'
      ? '#align(center)['
      : align === 'right'
      ? '#align(right)['
      : '';
    const alignSuffix = alignPrefix ? ']' : '';

    switch (block.type) {
      case 'heading': {
        const level = Math.min(Math.max(Number(block.attrs?.level || 1), 1), 3);
        const size = level === 1
          ? `${tokens.h1SizeRem}em`
          : level === 2
          ? `${tokens.h2SizeRem}em`
          : `${tokens.h3SizeRem}em`;
        const body = convertInlineContentToTypst(block).trim() || 'Untitled';
        return `${alignPrefix}#block(above: ${tokens.headingMarginTopRem}em, below: ${tokens.headingMarginBottomRem}em)[#text(font: ${headingFonts}, size: ${size}, weight: "bold", tracking: ${tokens.headingLetterSpacingEm}em, fill: ${accent})[${body}]]${alignSuffix}`;
      }
      case 'blockquote': {
        const body = (block.content || [])
          .map((child) => convertInlineContentToTypst(child).trim() || escapeTypstText(extractTextFromJSON(child)))
          .filter(Boolean)
          .join('\n\n');
        return `#block(inset: ${tokens.blockquotePaddingRem}em, fill: ${typstColor(tokens.blockquoteBackgroundColor, tokens.surfaceColor)}, stroke: (${border}), radius: ${tokens.blockquoteRadiusRem}em, above: ${tokens.blockquoteMarginYRem * 0.55}em, below: ${tokens.blockquoteMarginYRem * 0.7}em)[${body || ' '}]`;
      }
      case 'codeBlock': {
        const raw = escapeTypstCode(extractTextFromJSON(block) || '');
        return `#block(inset: ${tokens.codeBlockPaddingRem}em, fill: ${typstColor(tokens.codeBlockBackgroundColor, tokens.surfaceColor)}, stroke: (${border}), radius: ${tokens.codeBlockRadiusRem}em, above: ${tokens.codeBlockMarginYRem * 0.6}em, below: ${tokens.codeBlockMarginYRem * 0.8}em)[\n\`\`\`text\n${raw}\n\`\`\`\n]`;
      }
      case 'bulletList':
        return (block.content || []).map((item) => convertListItemToTypst(item, false)).join('\n');
      case 'orderedList':
        return (block.content || []).map((item) => convertListItemToTypst(item, true)).join('\n');
      case 'paragraph':
      default: {
        const body = convertInlineContentToTypst(block).trim() || escapeTypstText(extractTextFromJSON(block) || ' ');
        return `${alignPrefix}${body}${alignSuffix}`;
      }
    }
  }).filter(Boolean).join('\n\n');

  const body = blocks || '#text(fill: rgb("#A8A29E"), style: "italic")[文档内容为空]';

  return `
#set document(title: [${title}])
#set page(
  paper: "a4",
  margin: (top: 18mm, bottom: 18mm, left: 20mm, right: 20mm),
  fill: ${background},
  numbering: "1",
  number-align: center,
)
#set text(lang: "zh", region: "cn", font: ${bodyFonts}, fallback: true, size: ${tokens.bodyFontSizePx / 16}em, fill: ${text})
#set par(justify: false, leading: ${Math.max(tokens.lineHeight - 1, 0.6)}em)
#show emph: set text(font: ${sansFonts})
#show strong: set text(font: ${sansFonts})
#show raw: set text(font: ${monoFonts}, size: ${Math.max(tokens.bodyFontSizePx * 0.82, 12) / 16}em, fill: ${text})

#block(below: ${tokens.headingMarginTopRem}em)[
  #text(font: ${headingFonts}, size: ${tokens.titleSizeRem}em, weight: "bold", tracking: ${tokens.titleLetterSpacingEm}em, fill: ${accent})[${title}]
  #linebreak()
  #text(size: ${tokens.metaFontSizeRem}em, fill: ${muted})[${escapeTypstText(theme.name)} · ${exportedAt}]
]

${body}
`.trim();
}

/**
 * 导出文档为 PDF
 * 使用稳定的离屏渲染和自动分页切片，优先保证跨平台可分享性
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  let renderRoot: HTMLDivElement | null = null;

  try {
    if (isTauriEnvironment()) {
      const typstSource = convertJSONToTypst(content, theme, filename);
      await invoke<string>('export_pdf_with_typst', {
        filename,
        typstSource,
      });
    } else {
      const htmlContent = convertJSONToHTML(content);
      renderRoot = createPDFRenderRoot(htmlContent, theme, filename);
      document.body.appendChild(renderRoot);

      const pdfBlob = await renderPDFToBlob(renderRoot, theme);
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `${filename}.pdf`;
      anchor.click();
      URL.revokeObjectURL(downloadUrl);
    }
  } catch (error) {
    throw new Error(`生成 PDF 失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (renderRoot?.parentNode) {
      renderRoot.parentNode.removeChild(renderRoot);
    }
  }
}
/**
 * 将 Tiptap JSON 内容转换为 DOCX TextRun 数组
 * 支持粗体、斜体、下划线、删除线
 */
function convertToTextRuns(content: JSONContent, defaultColor: string): InlineRunSpec[] {
  if (!content) return [];

  const runs: InlineRunSpec[] = [];

  if (content.type === 'text') {
    const text = content.text || '';

    // 检查文本标记
    const isBold = content.marks?.some(m => m.type === 'bold') || false;
    const isItalic = content.marks?.some(m => m.type === 'italic') || false;
    const isUnderline = content.marks?.some(m => m.type === 'underline') || false;
    const isStrike = content.marks?.some(m => m.type === 'strike') || false;

    runs.push({
      text,
      color: defaultColor,
      bold: isBold,
      italics: isItalic,
      underline: isUnderline ? { type: 'single' } : undefined,
      strike: isStrike,
    });

    return runs;
  }

  if (content.content && Array.isArray(content.content)) {
    for (const child of content.content) {
      runs.push(...convertToTextRuns(child, defaultColor));
    }
  }

  return runs;
}

/**
 * 导出文档为 DOCX
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToDOCX(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  const paragraphs: Paragraph[] = [];
  const tokens = getDocumentStyleTokens(theme);
  const docxSizes = getDocumentDocxSizes(theme);

  const accentColorHex = toDocxHexColor(tokens.accentColor);
  const textColorHex = toDocxHexColor(tokens.textColor);
  const bgColorHex = toDocxHexColor(tokens.pageBackgroundColor);
  const blockquoteBgHex = toDocxHexColor(tokens.blockquoteBackgroundColor);
  const codeBgHex = toDocxHexColor(tokens.codeBlockBackgroundColor);

  if (content.content && Array.isArray(content.content)) {
    for (const block of content.content) {
      const text = extractTextFromJSON(block);
      if (!text.trim()) {
        paragraphs.push(new Paragraph({ text: '' }));
        continue;
      }

      const align = block.attrs?.textAlign || 'left';
      const alignment = align === 'center' 
        ? AlignmentType.CENTER 
        : align === 'right' 
        ? AlignmentType.RIGHT 
        : AlignmentType.LEFT;

      if (block.type === 'heading') {
        const level = block.attrs?.level || 1;
        const textRuns = convertToTextRuns(block, accentColorHex);
        const headingRuns = textRuns.map((run) => new TextRun({
          text: run.text,
          color: run.color,
          italics: run.italics,
          underline: run.underline,
          strike: run.strike,
          bold: true,
          font: run.font,
          size: level === 1 ? docxSizes.h1 : level === 2 ? docxSizes.h2 : docxSizes.h3,
        }));

        paragraphs.push(
          new Paragraph({
            children: headingRuns,
            heading: level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3,
            alignment,
            spacing: { after: 180, before: level === 1 ? 240 : 200 },
            shading: {
              fill: bgColorHex,
            },
          })
        );
      } else if (block.type === 'blockquote') {
        const textRuns = convertToTextRuns(block, textColorHex);

        paragraphs.push(
          new Paragraph({
            children: textRuns.map((run) => new TextRun(run)),
            alignment,
            indent: { left: 720 }, // 0.5 inch
            spacing: { after: 160 },
            border: {
              left: {
                color: accentColorHex,
                space: 1,
                style: BorderStyle.SINGLE,
                size: Math.max(tokens.blockquoteBorderWidthPx * 8, 18),
              },
            },
            shading: {
              fill: blockquoteBgHex,
            },
          })
        );
      } else if (block.type === 'codeBlock') {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                font: 'Courier New',
                color: textColorHex,
                size: docxSizes.body - 2,
              }),
            ],
            alignment: AlignmentType.LEFT,
            shading: {
              fill: codeBgHex,
            },
            spacing: { after: 160 },
          })
        );
      } else {
        const textRuns = convertToTextRuns(block, textColorHex);

        paragraphs.push(
          new Paragraph({
            children: textRuns.length > 0
              ? textRuns.map((run) => new TextRun({
                  ...run,
                  size: docxSizes.body,
                }))
              : [new TextRun({ text: '', color: textColorHex, size: docxSizes.body })],
            alignment,
            spacing: { after: 120 },
            shading: {
              fill: bgColorHex,
            },
          })
        );
      }
    }
  }

  // 创建文档
  const doc = new Document({
    background: {
      color: bgColorHex,
    },
    sections: [
      {
        properties: {
          page: {
            pageNumbers: {
              start: 1,
              formatType: 'decimal',
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  // 生成 DOCX 并保存到 Documents/vana
  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = Array.from(new Uint8Array(arrayBuffer));

  try {
    const savedPath = await invoke<string>('save_export_file', {
      filename,
      content: bytes,
      fileType: 'docx',
    });
    console.log('DOCX 已保存到:', savedPath);
  } catch (error) {
    console.error('保存 DOCX 失败:', error);
    throw new Error(`保存 DOCX 失败: ${error}`);
  }
}

function convertInlineMarkdown(node: JSONContent): string {
  if (node.type === 'text') {
    const text = escapeMarkdownText(node.text || '');
    const isBold = node.marks?.some((mark) => mark.type === 'bold');
    const isItalic = node.marks?.some((mark) => mark.type === 'italic');
    let result = text;

    if (isBold) {
      result = `**${result}**`;
    }
    if (isItalic) {
      result = `*${result}*`;
    }
    return result;
  }

  return (node.content || []).map(convertInlineMarkdown).join('');
}

export function exportToMarkdown(content: JSONContent): string {
  if (!content.content || !Array.isArray(content.content)) {
    return '';
  }

  const blocks = content.content.map((block) => {
    const inline = convertInlineMarkdown(block);
    const plainText = extractTextFromJSON(block);

    switch (block.type) {
      case 'heading': {
        const level = Math.min(Math.max(Number(block.attrs?.level || 1), 1), 3);
        return `${'#'.repeat(level)} ${inline || plainText}`;
      }
      case 'blockquote':
        return `> ${inline || plainText}`;
      case 'codeBlock':
        return `\`\`\`\n${plainText}\n\`\`\``;
      case 'bulletList':
        return (block.content || [])
          .map((item) => `- ${extractTextFromJSON(item)}`)
          .join('\n');
      case 'orderedList':
        return (block.content || [])
          .map((item, index) => `${index + 1}. ${extractTextFromJSON(item)}`)
          .join('\n');
      case 'paragraph':
      default:
        return inline || plainText;
    }
  });

  return blocks.join('\n\n').trim();
}

export async function saveMarkdownExport(filename: string, markdown: string): Promise<string> {
  const bytes = Array.from(new TextEncoder().encode(markdown));
  return invoke<string>('save_export_file', {
    filename,
    content: bytes,
    fileType: 'md',
  });
}
