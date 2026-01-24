/**
 * No Visitors - 文档导出功能
 * 支持导出为 PDF 和 DOCX 格式
 * 应用文档的氛围协议主题样式
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { Theme } from './themes';
import { getThemeBgColor, getThemeAccentColor } from './themeStyles';
import { JSONContent } from '@tiptap/core';

/**
 * 从 Tailwind 类名中提取颜色的 RGB 值
 */
function extractRGBFromTheme(colorHex: string): { r: number; g: number; b: number } {
  const hex = colorHex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16),
  };
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

/**
 * 将 Tiptap JSON 内容转换为 HTML
 * 用于 PDF 导出（通过浏览器打印）
 */
function convertJSONToHTML(content: JSONContent, theme: Theme): string {
  if (!content.content) return '';

  const bgColor = getThemeBgColor(theme);
  const textColor = theme.id === 'vellum' ? '#292524' : '#d6d3d1';
  const accentColor = theme.id === 'arcane'
    ? '#8b5cf6'
    : theme.id === 'terminal'
    ? '#00ff41'
    : theme.id === 'rusty'
    ? '#c2410c'
    : '#292524';

  let html = '';

  for (const block of content.content) {
    const text = extractTextFromJSON(block);
    if (!text.trim() && block.type !== 'paragraph') continue;

    const align = block.attrs?.textAlign || 'left';
    const alignStyle = `text-align: ${align};`;

    if (block.type === 'heading') {
      const level = block.attrs?.level || 1;
      const fontSize = level === 1 ? '32px' : level === 2 ? '24px' : '20px';
      html += `<h${level} style="color: ${accentColor}; ${alignStyle} font-size: ${fontSize}; font-weight: bold; margin: 16px 0 8px 0;">${text}</h${level}>`;
    } else if (block.type === 'blockquote') {
      html += `<blockquote style="border-left: 4px solid ${accentColor}; padding-left: 16px; margin: 12px 0; font-style: italic; color: ${textColor}; ${alignStyle}">${text}</blockquote>`;
    } else if (block.type === 'codeBlock') {
      const codeBg = theme.id === 'vellum' ? '#e9e4d9' : '#1a1a1a';
      html += `<pre style="background-color: ${codeBg}; color: ${textColor}; padding: 12px; border-radius: 4px; font-family: 'Courier New', monospace; overflow-x: auto; margin: 12px 0;"><code>${text}</code></pre>`;
    } else if (block.type === 'bulletList') {
      html += '<ul style="margin: 8px 0; padding-left: 24px;">';
      if (block.content) {
        for (const item of block.content) {
          const itemText = extractTextFromJSON(item);
          html += `<li style="color: ${textColor}; margin: 4px 0;">${itemText}</li>`;
        }
      }
      html += '</ul>';
    } else if (block.type === 'orderedList') {
      html += '<ol style="margin: 8px 0; padding-left: 24px;">';
      if (block.content) {
        for (const item of block.content) {
          const itemText = extractTextFromJSON(item);
          html += `<li style="color: ${textColor}; margin: 4px 0;">${itemText}</li>`;
        }
      }
      html += '</ol>';
    } else {
      // 普通段落
      html += `<p style="color: ${textColor}; ${alignStyle} margin: 8px 0; line-height: 1.6;">${text || '&nbsp;'}</p>`;
    }
  }

  return html;
}

/**
 * 导出文档为 PDF
 * 在 Tauri 环境中使用当前窗口打印，完美支持中文和所有样式
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  const bgColor = getThemeBgColor(theme);
  const textColor = theme.id === 'vellum' ? '#292524' : '#d6d3d1';

  // 生成 HTML 内容
  const htmlContent = convertJSONToHTML(content, theme);

  // 创建隐藏的打印容器
  const printContainer = document.createElement('div');
  printContainer.id = 'print-container';
  printContainer.style.position = 'fixed';
  printContainer.style.top = '0';
  printContainer.style.left = '0';
  printContainer.style.width = '100%';
  printContainer.style.height = '100%';
  printContainer.style.zIndex = '9999';
  printContainer.style.backgroundColor = bgColor;
  printContainer.style.overflow = 'auto';
  printContainer.style.display = 'none'; // 默认隐藏

  // 创建打印样式
  const printStyle = document.createElement('style');
  printStyle.id = 'print-style';
  printStyle.textContent = `
    @media print {
      body > *:not(#print-container) {
        display: none !important;
      }

      #print-container {
        display: block !important;
        position: static !important;
        width: 100% !important;
        height: auto !important;
        background-color: ${bgColor} !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      @page {
        size: A4;
        margin: 20mm;
      }
    }

    #print-container {
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 20px;
    }

    #print-container h1,
    #print-container h2,
    #print-container h3,
    #print-container h4,
    #print-container h5,
    #print-container h6 {
      margin: 16px 0 8px 0;
      font-weight: bold;
    }

    #print-container p {
      margin: 8px 0;
    }

    #print-container blockquote {
      margin: 12px 0;
      padding-left: 16px;
    }

    #print-container pre {
      margin: 12px 0;
      white-space: pre-wrap;
      word-wrap: break-word;
    }

    #print-container ul,
    #print-container ol {
      margin: 8px 0;
      padding-left: 24px;
    }

    #print-container li {
      margin: 4px 0;
    }

    .print-footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      font-style: italic;
      opacity: 0.6;
    }
  `;

  // 添加内容
  printContainer.innerHTML = `
    ${htmlContent}
    <div class="print-footer">Created with No Visitors - ${theme.name}</div>
  `;

  // 添加到 DOM
  document.head.appendChild(printStyle);
  document.body.appendChild(printContainer);

  // 触发打印
  try {
    // 等待 DOM 更新
    await new Promise(resolve => setTimeout(resolve, 100));

    // 调用打印
    window.print();

    // 打印完成后清理（延迟清理，确保打印对话框已打开）
    setTimeout(() => {
      document.head.removeChild(printStyle);
      document.body.removeChild(printContainer);
    }, 1000);
  } catch (error) {
    // 清理
    if (printStyle.parentNode) {
      document.head.removeChild(printStyle);
    }
    if (printContainer.parentNode) {
      document.body.removeChild(printContainer);
    }
    throw error;
  }
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
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                color: accentColorHex,
                bold: true,
                size: level === 1 ? 32 : level === 2 ? 28 : 24,
              }),
            ],
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
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                italics: true,
                color: textColorHex,
              }),
            ],
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
        // 普通段落
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text,
                color: textColorHex,
              }),
            ],
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

  // 生成并下载 DOCX
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}

