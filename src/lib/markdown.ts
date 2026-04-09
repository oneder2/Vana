import type { JSONContent } from '@tiptap/core';
import { addBlockUUIDs } from '@/lib/smart-slice';

function parseInlineMarks(text: string): JSONContent[] {
  if (!text) return [];

  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return {
        type: 'text',
        text: part.slice(2, -2),
        marks: [{ type: 'bold' }],
      };
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return {
        type: 'text',
        text: part.slice(1, -1),
        marks: [{ type: 'italic' }],
      };
    }

    return {
      type: 'text',
      text: part,
    };
  });
}

function textNode(text: string): JSONContent[] | undefined {
  const nodes = parseInlineMarks(text);
  return nodes.length > 0 ? nodes : undefined;
}

export function markdownToTiptapJSON(markdown: string): JSONContent {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  const lines = normalized.split('\n');
  const blocks: JSONContent[] = [];
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({
        type: 'codeBlock',
        attrs: { language: null },
        content: codeLines.length > 0 ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      });
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: textNode(headingMatch[2]) ?? [],
      });
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      blocks.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: textNode(line.slice(2)) ?? [],
        }],
      });
      index += 1;
      continue;
    }

    const bulletMatch = rawLine.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s*[-*]\s+(.*)$/);
        if (!current) break;
        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: textNode(current[1]) ?? [],
          }],
        });
        index += 1;
      }
      blocks.push({
        type: 'bulletList',
        content: items,
      });
      continue;
    }

    const orderedMatch = rawLine.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      const items: JSONContent[] = [];
      while (index < lines.length) {
        const current = lines[index].match(/^\s*\d+\.\s+(.*)$/);
        if (!current) break;
        items.push({
          type: 'listItem',
          content: [{
            type: 'paragraph',
            content: textNode(current[1]) ?? [],
          }],
        });
        index += 1;
      }
      blocks.push({
        type: 'orderedList',
        content: items,
      });
      continue;
    }

    const paragraphLines = [rawLine];
    index += 1;
    while (index < lines.length && lines[index].trim() !== '') {
      const lookahead = lines[index].trim();
      if (
        lookahead.startsWith('#')
        || lookahead.startsWith('> ')
        || lookahead.startsWith('```')
        || /^\s*[-*]\s+/.test(lines[index])
        || /^\s*\d+\.\s+/.test(lines[index])
      ) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({
      type: 'paragraph',
      content: textNode(paragraphLines.join(' ')) ?? [],
    });
  }

  return addBlockUUIDs({
    type: 'doc',
    content: blocks.length > 0 ? blocks : [{ type: 'paragraph', content: [] }],
  });
}
