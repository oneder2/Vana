/**
 * No Visitors - 文档导出功能
 * 支持导出为 PDF 和 DOCX 格式
 * 应用文档的氛围协议主题样式
 */

import jsPDF from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { Theme } from './themes';
import { getThemeBgColor, getThemeAccentColor, getThemeSurfaceColor } from './themeStyles';
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
 * 导出文档为 PDF
 * @param content Tiptap JSON 内容
 * @param theme 氛围协议主题
 * @param filename 文件名（不含扩展名）
 */
export async function exportToPDF(
  content: JSONContent,
  theme: Theme,
  filename: string
): Promise<void> {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // 获取主题颜色
  const bgColor = extractRGBFromTheme(getThemeBgColor(theme));
  const textColor = theme.id === 'vellum' 
    ? extractRGBFromTheme('#292524') 
    : extractRGBFromTheme('#d6d3d1');
  const accentColorHex = getThemeAccentColor(theme);
  // 从 Tailwind 类名中提取颜色（例如 'text-violet-500'）
  const accentColor = theme.id === 'arcane' 
    ? extractRGBFromTheme('#8b5cf6') // violet-500
    : theme.id === 'terminal'
    ? extractRGBFromTheme('#00ff41') // terminal green
    : theme.id === 'rusty'
    ? extractRGBFromTheme('#c2410c') // orange-700
    : extractRGBFromTheme('#292524'); // stone-800 for vellum

  // 设置背景颜色
  pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
  pdf.rect(0, 0, 210, 297, 'F'); // A4 尺寸

  // 设置默认文本颜色
  pdf.setTextColor(textColor.r, textColor.g, textColor.b);

  let yPosition = 20; // 起始 Y 位置
  const pageWidth = 210;
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;

  // 遍历文档内容
  if (content.content && Array.isArray(content.content)) {
    for (const block of content.content) {
      // 检查是否需要新页面
      if (yPosition > 270) {
        pdf.addPage();
        pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
        pdf.rect(0, 0, 210, 297, 'F');
        yPosition = 20;
      }

      const text = extractTextFromJSON(block);
      if (!text.trim()) {
        yPosition += 5; // 空行
        continue;
      }

      // 根据块类型设置样式
      if (block.type === 'heading') {
        const level = block.attrs?.level || 1;
        const fontSize = level === 1 ? 24 : level === 2 ? 20 : 16;
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(accentColor.r, accentColor.g, accentColor.b);
        
        // 处理文本对齐
        const align = block.attrs?.textAlign || 'left';
        const xPosition = align === 'center' 
          ? pageWidth / 2 
          : align === 'right' 
          ? pageWidth - margin 
          : margin;
        
        pdf.text(text, xPosition, yPosition, { 
          align: align as 'left' | 'center' | 'right',
          maxWidth 
        });
        yPosition += fontSize * 0.5 + 5;
        pdf.setTextColor(textColor.r, textColor.g, textColor.b);
      } else if (block.type === 'blockquote') {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'italic');
        
        // 绘制引用边框
        pdf.setDrawColor(accentColor.r, accentColor.g, accentColor.b);
        pdf.setLineWidth(1);
        pdf.line(margin, yPosition - 3, margin, yPosition + 10);
        
        const lines = pdf.splitTextToSize(text, maxWidth - 10);
        pdf.text(lines, margin + 5, yPosition, { maxWidth: maxWidth - 10 });
        yPosition += lines.length * 6 + 5;
      } else if (block.type === 'codeBlock') {
        pdf.setFontSize(10);
        pdf.setFont('courier', 'normal');
        
        // 绘制代码块背景
        const codeHeight = text.split('\n').length * 5 + 4;
        pdf.setFillColor(
          theme.id === 'vellum' ? 230 : 20,
          theme.id === 'vellum' ? 228 : 20,
          theme.id === 'vellum' ? 217 : 20
        );
        pdf.rect(margin, yPosition - 3, maxWidth, codeHeight, 'F');
        
        const lines = text.split('\n');
        for (const line of lines) {
          pdf.text(line, margin + 2, yPosition);
          yPosition += 5;
        }
        yPosition += 5;
      } else if (block.type === 'bulletList' || block.type === 'orderedList') {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        
        // 处理列表项
        if (block.content && Array.isArray(block.content)) {
          for (let i = 0; i < block.content.length; i++) {
            const listItem = block.content[i];
            const itemText = extractTextFromJSON(listItem);
            const bullet = block.type === 'bulletList' ? '•' : `${i + 1}.`;
            
            pdf.text(bullet, margin, yPosition);
            const lines = pdf.splitTextToSize(itemText, maxWidth - 10);
            pdf.text(lines, margin + 7, yPosition, { maxWidth: maxWidth - 10 });
            yPosition += lines.length * 6 + 2;
          }
        }
        yPosition += 3;
      } else {
        // 普通段落
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        
        const align = block.attrs?.textAlign || 'left';
        const xPosition = align === 'center' 
          ? pageWidth / 2 
          : align === 'right' 
          ? pageWidth - margin 
          : margin;
        
        const lines = pdf.splitTextToSize(text, maxWidth);
        pdf.text(lines, xPosition, yPosition, { 
          align: align as 'left' | 'center' | 'right',
          maxWidth 
        });
        yPosition += lines.length * 6 + 3;
      }
    }
  }

  // 添加页脚（主题标识）
  const totalPages = (pdf as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(textColor.r, textColor.g, textColor.b);
    pdf.setFont('helvetica', 'italic');
    pdf.text(
      `Created with No Visitors - ${theme.name}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  // 保存 PDF
  pdf.save(`${filename}.pdf`);
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

  // 获取主题颜色（DOCX 使用十六进制颜色）
  const accentColorHex = theme.id === 'arcane' 
    ? '8b5cf6' // violet-500
    : theme.id === 'terminal'
    ? '00ff41' // terminal green
    : theme.id === 'rusty'
    ? 'c2410c' // orange-700
    : '292524'; // stone-800 for vellum

  const textColorHex = theme.id === 'vellum' ? '292524' : 'd6d3d1';

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
            text,
            heading: level === 1 
              ? HeadingLevel.HEADING_1 
              : level === 2 
              ? HeadingLevel.HEADING_2 
              : HeadingLevel.HEADING_3,
            alignment,
            spacing: { after: 200 },
            run: {
              color: accentColorHex,
              bold: true,
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
              }),
            ],
            alignment: AlignmentType.LEFT,
            shading: {
              fill: theme.id === 'vellum' ? 'e9e4d9' : '1a1a1a',
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
          })
        );
      }
    }
  }

  // 创建文档
  const doc = new Document({
    sections: [
      {
        properties: {},
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

