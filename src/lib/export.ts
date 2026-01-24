/**
 * No Visitors - 文档导出功能
 * 支持导出为 PDF 和 DOCX 格式
 * 应用文档的氛围协议主题样式
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { Theme } from './themes';
import { getThemeBgColor, getThemeAccentColor } from './themeStyles';
import { JSONContent } from '@tiptap/core';
import { invoke } from '@tauri-apps/api/core';

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
 * 将 Tiptap JSON 内容转换为带格式的 HTML
 * 支持粗体、斜体、下划线、删除线
 */
function convertTextToHTML(content: JSONContent): string {
  if (!content) return '';

  if (content.type === 'text') {
    let text = content.text || '';

    // 应用文本标记（粗体、斜体、下划线、删除线）
    if (content.marks && Array.isArray(content.marks)) {
      for (const mark of content.marks) {
        if (mark.type === 'bold') {
          text = `<strong>${text}</strong>`;
        } else if (mark.type === 'italic') {
          text = `<em>${text}</em>`;
        } else if (mark.type === 'underline') {
          text = `<u>${text}</u>`;
        } else if (mark.type === 'strike') {
          text = `<s>${text}</s>`;
        }
      }
    }

    return text;
  }

  if (content.content && Array.isArray(content.content)) {
    let html = '';
    for (const child of content.content) {
      html += convertTextToHTML(child);
    }
    return html;
  }

  return '';
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
    const text = convertTextToHTML(block); // 使用带格式的文本转换
    const plainText = extractTextFromJSON(block);
    if (!plainText.trim() && block.type !== 'paragraph') continue;

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
      html += `<pre style="background-color: ${codeBg}; color: ${textColor}; padding: 12px; border-radius: 4px; font-family: 'Courier New', monospace; overflow-x: auto; margin: 12px 0;"><code>${plainText}</code></pre>`;
    } else if (block.type === 'bulletList') {
      html += '<ul style="margin: 8px 0; padding-left: 24px;">';
      if (block.content) {
        for (const item of block.content) {
          const itemText = convertTextToHTML(item);
          html += `<li style="color: ${textColor}; margin: 4px 0;">${itemText}</li>`;
        }
      }
      html += '</ul>';
    } else if (block.type === 'orderedList') {
      html += '<ol style="margin: 8px 0; padding-left: 24px;">';
      if (block.content) {
        for (const item of block.content) {
          const itemText = convertTextToHTML(item);
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
 * 使用 html2pdf.js 生成 PDF 并保存到 Documents/vana
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  // 动态导入 html2pdf.js（仅在浏览器端运行）
  const html2pdf = (await import('html2pdf.js')).default;

  const bgColor = getThemeBgColor(theme);
  const textColor = theme.id === 'vellum' ? '#292524' : '#d6d3d1';

  // 生成 HTML 内容
  const htmlContent = convertJSONToHTML(content, theme);

  // 创建临时容器
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm'; // A4 宽度
  container.style.padding = '20mm';
  container.style.backgroundColor = bgColor;
  container.style.color = textColor;
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  container.style.fontSize = '14px';
  container.style.lineHeight = '1.6';

  container.innerHTML = `
    ${htmlContent}
    <div style="margin-top: 40px; text-align: center; font-size: 10px; font-style: italic; opacity: 0.6;">
      Created with No Visitors - ${theme.name}
    </div>
  `;

  document.body.appendChild(container);

  try {
    // 配置 html2pdf 选项
    const opt = {
      margin: 0, // 我们已经在 HTML 中添加了 padding
      filename: `${filename}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: bgColor,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    // 生成 PDF blob
    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');

    // 转换为字节数组
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const bytes = Array.from(new Uint8Array(arrayBuffer));

    // 保存到 Documents/vana
    const savedPath = await invoke<string>('save_export_file', {
      filename,
      content: bytes,
      fileType: 'pdf',
    });

    console.log('PDF 已保存到:', savedPath);
  } catch (error) {
    console.error('生成 PDF 失败:', error);
    throw new Error(`生成 PDF 失败: ${error}`);
  } finally {
    // 清理临时容器
    document.body.removeChild(container);
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

