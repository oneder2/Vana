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

function rgbaToRgb(color: string): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!rgbaMatch) {
    return color;
  }

  const [, r, g, b] = rgbaMatch;
  return `rgb(${r}, ${g}, ${b})`;
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
  const background = getThemeBgColor(theme);
  const surface = getThemeSurfaceColor(theme);
  const border = rgbaToRgb(getThemeBorderColor(theme));
  const accent = getThemeAccentColor(theme);
  const text = theme.id === 'vellum' ? '#1c1917' : '#f5f5f4';
  const muted = theme.id === 'vellum' ? '#57534e' : '#a8a29e';
  const exportedAt = new Date().toLocaleString();

  const host = document.createElement('div');
  host.id = 'pdf-export-render-root';
  host.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: 794px;
    padding: 0;
    margin: 0;
    opacity: 1;
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
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
        line-height: 1.7;
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
        font-size: 28px;
        line-height: 1.25;
        color: ${accent};
        word-break: break-word;
      }
      #pdf-export-render-root .nv-pdf-meta {
        color: ${muted};
        font-size: 12px;
        text-align: right;
        white-space: nowrap;
      }
      #pdf-export-render-root .nv-pdf-content h1,
      #pdf-export-render-root .nv-pdf-content h2,
      #pdf-export-render-root .nv-pdf-content h3 {
        color: ${accent};
        margin: 1.1em 0 0.45em;
        line-height: 1.3;
        page-break-after: avoid;
      }
      #pdf-export-render-root .nv-pdf-content h1 { font-size: 24px; }
      #pdf-export-render-root .nv-pdf-content h2 { font-size: 20px; }
      #pdf-export-render-root .nv-pdf-content h3 { font-size: 17px; }
      #pdf-export-render-root .nv-pdf-content p,
      #pdf-export-render-root .nv-pdf-content ul,
      #pdf-export-render-root .nv-pdf-content ol,
      #pdf-export-render-root .nv-pdf-content blockquote,
      #pdf-export-render-root .nv-pdf-content pre {
        margin: 0 0 14px;
        font-size: 14px;
        page-break-inside: avoid;
      }
      #pdf-export-render-root .nv-pdf-content ul,
      #pdf-export-render-root .nv-pdf-content ol {
        padding-left: 24px;
      }
      #pdf-export-render-root .nv-pdf-content li {
        margin-bottom: 6px;
      }
      #pdf-export-render-root .nv-pdf-content blockquote {
        margin-left: 0;
        padding: 12px 16px;
        border-left: 4px solid ${accent};
        background: ${surface};
        color: ${text};
      }
      #pdf-export-render-root .nv-pdf-content pre {
        padding: 14px 16px;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 10px;
        border: 1px solid ${border};
        background: ${surface};
      }
      #pdf-export-render-root .nv-pdf-content code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
        font-size: 0.92em;
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
        font-size: 11px;
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
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).default;

  const pageElement = renderRoot.querySelector('.nv-pdf-page') as HTMLElement | null;
  if (!pageElement) {
    throw new Error('PDF 渲染容器创建失败');
  }

  await waitForRenderStability();

  const canvas = await html2canvas(pageElement, {
    backgroundColor: getThemeBgColor(theme),
    scale: Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 1.5)),
    useCORS: true,
    logging: false,
    windowWidth: pageElement.scrollWidth,
    windowHeight: pageElement.scrollHeight,
  });

  if (canvas.width === 0 || canvas.height === 0) {
    throw new Error('PDF 渲染结果为空');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;
  const pageHeightPx = Math.floor((canvas.width * contentHeight) / contentWidth);
  const background = getThemeBgColor(theme);

  let pageIndex = 0;
  for (let offsetY = 0; offsetY < canvas.height; offsetY += pageHeightPx) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const context = pageCanvas.getContext('2d');
    if (!context) {
      throw new Error('无法创建 PDF 分页画布');
    }

    context.fillStyle = background;
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const renderedHeight = (sliceHeight * contentWidth) / canvas.width;
    const imageData = pageCanvas.toDataURL('image/jpeg', 0.92);

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.setFillColor(background);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.addImage(imageData, 'JPEG', margin, margin, contentWidth, renderedHeight, undefined, 'FAST');
    pageIndex += 1;
  }

  return pdf.output('blob');
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
    const htmlContent = convertJSONToHTML(content);
    renderRoot = createPDFRenderRoot(htmlContent, theme, filename);
    document.body.appendChild(renderRoot);

    const pdfBlob = await renderPDFToBlob(renderRoot, theme);

    if (isTauriEnvironment()) {
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      await invoke<string>('save_export_file', {
        filename,
        content: bytes,
        fileType: 'pdf',
      });
    } else {
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
function convertToTextRuns(content: JSONContent, defaultColor: string): TextRun[] {
  if (!content) return [];

  const runs: TextRun[] = [];

  if (content.type === 'text') {
    const text = content.text || '';

    // 检查文本标记
    const isBold = content.marks?.some(m => m.type === 'bold') || false;
    const isItalic = content.marks?.some(m => m.type === 'italic') || false;
    const isUnderline = content.marks?.some(m => m.type === 'underline') || false;
    const isStrike = content.marks?.some(m => m.type === 'strike') || false;

    runs.push(new TextRun({
      text,
      color: defaultColor,
      bold: isBold,
      italics: isItalic,
      underline: isUnderline ? { type: 'single' } : undefined,
      strike: isStrike,
    }));

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

  // 获取主题颜色（DOCX 使用十六进制颜色，不带 # 号）
  const accentColorHex = theme.id === 'arcane'
    ? '8b5cf6' // violet-500
    : theme.id === 'terminal'
    ? '00ff41' // terminal green
    : theme.id === 'rusty'
    ? 'c2410c' // orange-700
    : '292524'; // stone-800 for vellum

  const textColorHex = theme.id === 'vellum' ? '292524' : 'd6d3d1';

  // 获取背景颜色（DOCX 使用十六进制颜色，不带 # 号）
  const bgColorHex = getThemeBgColor(theme).replace('#', '');

  // 遍历文档内容
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

        // 为标题的所有 TextRun 添加粗体和大小
        const headingRuns = textRuns.map(run => new TextRun({
          ...run,
          bold: true,
          size: level === 1 ? 32 : level === 2 ? 28 : 24,
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
            spacing: { after: 200 },
            shading: {
              fill: bgColorHex,
            },
          })
        );
      } else if (block.type === 'blockquote') {
        const textRuns = convertToTextRuns(block, textColorHex);

        paragraphs.push(
          new Paragraph({
            children: textRuns,
            alignment,
            indent: { left: 720 }, // 0.5 inch
            spacing: { after: 120 },
            border: {
              left: {
                color: accentColorHex,
                space: 1,
                style: BorderStyle.SINGLE,
                size: 24,
              },
            },
            shading: {
              fill: bgColorHex,
            },
          })
        );
      } else if (block.type === 'codeBlock') {
        const codeBgHex = theme.id === 'vellum' ? 'e9e4d9' : '1a1a1a';
        // 代码块不应用文本格式化，使用纯文本
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                font: 'Courier New',
                color: textColorHex,
              }),
            ],
            alignment: AlignmentType.LEFT,
            shading: {
              fill: codeBgHex,
            },
            spacing: { after: 120 },
          })
        );
      } else {
        // 普通段落 - 使用带格式的文本
        const textRuns = convertToTextRuns(block, textColorHex);

        paragraphs.push(
          new Paragraph({
            children: textRuns.length > 0 ? textRuns : [new TextRun({ text: '', color: textColorHex })],
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
