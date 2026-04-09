/**
 * No Visitors - 文档导出功能
 * 支持导出为 PDF 和 DOCX 格式
 * 应用文档的氛围协议主题样式
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { Theme } from './themes';
import { getThemeBgColor } from './themeStyles';
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

/**
 * 将 Tiptap JSON 内容转换为带格式的 HTML
 * 简化版本，确保文字可见性
 */
function convertTextToHTML(content: JSONContent): string {
  if (!content) return '';

  if (content.type === 'text') {
    let text = content.text || '';
    
    // 简单的HTML转义
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // 简化的文本标记处理
    if (content.marks && Array.isArray(content.marks)) {
      for (const mark of content.marks) {
        if (mark.type === 'bold') {
          text = `<b>${text}</b>`;
        } else if (mark.type === 'italic') {
          text = `<i>${text}</i>`;
        } else if (mark.type === 'underline') {
          text = `<u>${text}</u>`;
        } else if (mark.type === 'strike') {
          text = `<strike>${text}</strike>`;
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
 * 用于 PDF 导出 - 使用简化的颜色方案确保可见性
 */
function convertJSONToHTML(content: JSONContent, theme: Theme): string {
  if (!content || !content.content) {
    console.warn('内容为空或格式不正确:', content);
    return '<p style="color: #000000; font-size: 16px; font-weight: bold;">文档内容为空</p>';
  }

  // 使用对比度极高的颜色确保可见性
  let textColor: string;
  let accentColor: string;
  
  if (theme.id === 'vellum') {
    // 浅色主题：深色文字
    textColor = '#000000'; // 纯黑色
    accentColor = '#000000'; // 纯黑色
  } else {
    // 深色主题：白色文字
    textColor = '#FFFFFF'; // 纯白色
    accentColor = '#FFFFFF'; // 纯白色
  }

  let html = '';
  let hasContent = false;

  console.log('PDF导出 - 使用高对比度颜色:', { 
    theme: theme.id, 
    textColor, 
    accentColor,
    bgColor: getThemeBgColor(theme)
  });

  for (const block of content.content) {
    if (!block) continue;

    const text = convertTextToHTML(block);
    const plainText = extractTextFromJSON(block);
    
    // 检查是否有实际内容
    if (plainText.trim() || block.type === 'paragraph') {
      hasContent = true;
    }

    const align = block.attrs?.textAlign || 'left';
    const alignStyle = `text-align: ${align};`;
    
    // 基础样式 - 确保文字可见
    const baseStyle = `color: ${textColor}; font-family: Arial, sans-serif; line-height: 1.6;`;

    if (block.type === 'heading') {
      const level = block.attrs?.level || 1;
      const fontSize = level === 1 ? '24px' : level === 2 ? '20px' : '16px';
      html += `<h${level} style="${baseStyle} ${alignStyle} font-size: ${fontSize}; font-weight: bold; margin: 20px 0 10px 0;">${text || '标题'}</h${level}>`;
    } else if (block.type === 'blockquote') {
      html += `<div style="${baseStyle} ${alignStyle} margin: 16px 0; padding: 12px; border-left: 4px solid ${textColor}; background-color: rgba(128,128,128,0.1);">${text || '引用内容'}</div>`;
    } else if (block.type === 'codeBlock') {
      const codeBg = theme.id === 'vellum' ? '#f0f0f0' : '#333333';
      const codeColor = theme.id === 'vellum' ? '#000000' : '#ffffff';
      html += `<pre style="background-color: ${codeBg}; color: ${codeColor}; padding: 12px; margin: 16px 0; font-family: 'Courier New', monospace; font-size: 14px; border-radius: 4px; white-space: pre-wrap;"><code>${plainText || '代码内容'}</code></pre>`;
    } else if (block.type === 'bulletList') {
      html += `<ul style="${baseStyle} margin: 12px 0; padding-left: 20px;">`;
      if (block.content && block.content.length > 0) {
        for (const item of block.content) {
          if (item.type === 'listItem' && item.content) {
            let itemText = '';
            for (const itemChild of item.content) {
              itemText += convertTextToHTML(itemChild);
            }
            html += `<li style="${baseStyle} margin: 4px 0;">${itemText || '列表项'}</li>`;
          }
        }
      } else {
        html += `<li style="${baseStyle} margin: 4px 0;">列表项</li>`;
      }
      html += '</ul>';
    } else if (block.type === 'orderedList') {
      html += `<ol style="${baseStyle} margin: 12px 0; padding-left: 20px;">`;
      if (block.content && block.content.length > 0) {
        for (const item of block.content) {
          if (item.type === 'listItem' && item.content) {
            let itemText = '';
            for (const itemChild of item.content) {
              itemText += convertTextToHTML(itemChild);
            }
            html += `<li style="${baseStyle} margin: 4px 0;">${itemText || '列表项'}</li>`;
          }
        }
      } else {
        html += `<li style="${baseStyle} margin: 4px 0;">列表项</li>`;
      }
      html += '</ol>';
    } else if (block.type === 'paragraph') {
      // 普通段落
      const paragraphText = text || '&nbsp;';
      html += `<p style="${baseStyle} ${alignStyle} margin: 10px 0;">${paragraphText}</p>`;
    } else {
      // 其他未知类型
      if (plainText.trim()) {
        html += `<p style="${baseStyle} ${alignStyle} margin: 10px 0;">${text}</p>`;
      }
    }
  }

  // 如果没有任何内容，返回默认内容
  if (!hasContent || !html.trim()) {
    const baseStyle = `color: ${textColor}; font-family: Arial, sans-serif; line-height: 1.6;`;
    html = `<p style="${baseStyle} text-align: center; font-style: italic; margin: 20px 0;">文档内容为空</p>`;
  }

  console.log('生成的HTML内容长度:', html.length);
  console.log('HTML内容预览:', html.substring(0, 500) + '...');

  return html;
}

/**
 * 检测是否在 Tauri 环境中运行
 */
function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * 创建用于PDF导出的HTML模板
 */
function createPDFTemplate(htmlContent: string, theme: Theme): string {
  const bgColor = getThemeBgColor(theme);
  const textColor = theme.id === 'vellum' ? '#1c1917' : '#ffffff'; // 修复文字颜色

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>PDF Export</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: ${textColor} !important;
          background-color: ${bgColor};
          padding: 20mm;
          width: 210mm;
          min-height: 297mm;
        }
        
        .content {
          width: 100%;
          max-width: none;
          color: ${textColor} !important;
        }
        
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 10px;
          font-style: italic;
          opacity: 0.6;
          page-break-inside: avoid;
          color: ${textColor} !important;
        }
        
        /* 确保所有文本元素都有正确的颜色 */
        h1, h2, h3, h4, h5, h6 {
          margin: 16px 0 8px 0;
          font-weight: bold;
        }
        
        p {
          margin: 8px 0;
          color: ${textColor} !important;
        }
        
        blockquote {
          margin: 12px 0;
          padding-left: 16px;
          font-style: italic;
          color: ${textColor} !important;
        }
        
        pre, code {
          margin: 12px 0;
          padding: 12px;
          border-radius: 4px;
          font-family: 'Courier New', monospace;
          overflow-x: auto;
        }
        
        ul, ol {
          margin: 8px 0;
          padding-left: 24px;
          color: ${textColor} !important;
        }
        
        li {
          margin: 4px 0;
          color: ${textColor} !important;
        }
        
        strong {
          font-weight: bold;
          color: inherit !important;
        }
        
        em {
          font-style: italic;
          color: inherit !important;
        }
        
        u {
          text-decoration: underline;
          color: inherit !important;
        }
        
        s {
          text-decoration: line-through;
          color: inherit !important;
        }
        
        /* 分页控制 */
        @media print {
          body {
            margin: 0;
            padding: 20mm;
            color: ${textColor} !important;
          }
          
          .page-break {
            page-break-before: always;
          }
          
          .avoid-break {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="content">
        ${htmlContent}
      </div>
      <div class="footer">
        Created with No Visitors - ${theme.name}
      </div>
    </body>
    </html>
  `;
}

/**
 * 导出文档为 PDF
 * 修复html2canvas高度塌陷问题，使用专业建议的解决方案
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  try {
    console.log('=== PDF导出开始 ===');
    console.log('主题:', theme.id, theme.name);
    console.log('文件名:', filename);
    
    // 动态导入 html2canvas 和 jsPDF
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).default;

    const bgColor = getThemeBgColor(theme);
    console.log('背景色:', bgColor);
    
    // 生成 HTML 内容
    const htmlContent = convertJSONToHTML(content, theme);
    
    // 检查内容是否为空
    if (!htmlContent.trim()) {
      throw new Error('文档内容为空，无法生成PDF');
    }

    // 确定文字颜色
    const textColor = theme.id === 'vellum' ? '#000000' : '#FFFFFF';
    console.log('文字颜色:', textColor);

    // 创建PDF导出容器 - 使用专业建议的方法
    const container = document.createElement('div');
    container.id = 'pdf-export-container';
    container.style.cssText = `
      position: fixed;
      top: -2000px;
      left: 0;
      width: 800px;
      min-height: 600px;
      padding: 40px;
      background-color: ${bgColor};
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      font-size: 16px;
      line-height: 1.6;
      box-sizing: border-box;
      z-index: -1;
      overflow: visible;
      display: block;
    `;
    
    container.innerHTML = `
      <div style="
        width: 100%;
        min-height: 500px;
        background-color: ${bgColor};
        color: ${textColor};
        padding: 20px;
        display: block;
      ">
        <div style="color: ${textColor}; min-height: 400px;">
          ${htmlContent}
        </div>
        <div style="margin-top: 40px; text-align: center; font-size: 12px; color: ${textColor};">
          Created with No Visitors - ${theme.name}
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // 等待DOM渲染和字体加载 - 专业建议的等待时间
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 获取容器真实尺寸
    const rect = container.getBoundingClientRect();
    console.log('容器实际尺寸:', {
      width: rect.width,
      height: rect.height,
      offsetWidth: container.offsetWidth,
      offsetHeight: container.offsetHeight,
      scrollWidth: container.scrollWidth,
      scrollHeight: container.scrollHeight
    });

    // 检查高度塌陷问题
    if (container.offsetHeight === 0 || rect.height === 0) {
      console.warn('检测到高度塌陷，强制设置高度');
      const innerDiv = container.firstElementChild as HTMLElement;
      if (innerDiv) {
        innerDiv.style.minHeight = '600px';
        innerDiv.style.height = 'auto';
        innerDiv.style.display = 'block';
      }
      // 再次等待布局
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('开始生成PDF...');

    // 使用专业建议的html2canvas配置
    const canvas = await html2canvas(container, {
      width: rect.width || container.offsetWidth,
      height: rect.height || container.offsetHeight || 600,
      scale: 2, // 专业建议：提高清晰度
      useCORS: true,
      backgroundColor: bgColor,
      logging: true,
      onclone: (clonedDoc) => {
        // 专业建议：预克隆钩子处理样式
        const clonedElement = clonedDoc.getElementById('pdf-export-container');
        if (clonedElement) {
          clonedElement.style.height = 'auto';
          clonedElement.style.overflow = 'visible';
          clonedElement.style.display = 'block';
          // 确保内部元素也有正确的样式
          const innerDiv = clonedElement.firstElementChild as HTMLElement;
          if (innerDiv) {
            innerDiv.style.minHeight = '600px';
            innerDiv.style.display = 'block';
          }
        }
      }
    });

    console.log('Canvas生成完成，尺寸:', canvas.width, 'x', canvas.height);

    // 创建PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/jpeg', 0.9);
    
    // 计算PDF尺寸
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

    console.log('PDF配置:', { pdfWidth, pdfHeight });

    // 根据环境选择不同的处理方式
    if (isTauriEnvironment()) {
      console.log('Tauri环境，保存到文件...');
      const pdfBlob = pdf.output('blob');
      const arrayBuffer = await pdfBlob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(arrayBuffer));

      const savedPath = await invoke<string>('save_export_file', {
        filename,
        content: bytes,
        fileType: 'pdf',
      });

      console.log('✅ PDF已保存到:', savedPath);
    } else {
      console.log('浏览器环境，直接下载...');
      pdf.save(`${filename}.pdf`);
      console.log('✅ PDF已下载:', `${filename}.pdf`);
    }

  } catch (error) {
    console.error('❌ 生成 PDF 失败:', error);
    throw new Error(`生成 PDF 失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // 清理临时容器
    const container = document.getElementById('pdf-export-container');
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    console.log('=== PDF导出结束 ===');
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
