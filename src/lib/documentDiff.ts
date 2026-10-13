import type { JSONContent } from '@tiptap/core';

export type TextChange = { kind: 'same' | 'added' | 'removed'; text: string };
export type DocumentDifference = { changes: TextChange[]; formattingOnly: boolean; identical: boolean; coarse: boolean };

export function parseDocumentBody(json: string): JSONContent {
  const node = JSON.parse(json) as JSONContent;
  if (!node || node.type !== 'doc' || !Array.isArray(node.content)) throw new Error('此版本正文格式无效');
  return node;
}

function text(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const separator = ['doc', 'blockquote', 'bulletList', 'orderedList', 'listItem'].includes(node.type ?? '') ? '\n' : '';
  return (node.content ?? []).map(text).join(separator);
}

// Property order in JSON isn't a document change; marks/attributes and block order are.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** Unicode-safe bounded LCS. Large replacements keep their exact removed/added
 * text, with a coarser boundary, instead of blocking the editor on quadratic work. */
export function compareDocumentBodies(previous: string, current: string): DocumentDifference {
  const before = parseDocumentBody(previous), after = parseDocumentBody(current);
  const identical = canonical(before) === canonical(after);
  const a = Array.from(text(before)), b = Array.from(text(after));
  const changes: TextChange[] = [];
  function append(kind: TextChange['kind'], value: string) {
    if (!value) return;
    const last = changes.at(-1);
    if (last?.kind === kind) last.text += value;
    else changes.push({ kind, text: value });
  }
  let start = 0, end = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  append('same', a.slice(0, start).join(''));
  const left = a.slice(start, a.length - end), right = b.slice(start, b.length - end);
  const coarse = left.length * right.length > 250_000;
  if (coarse) {
    append('removed', left.join(''));
    append('added', right.join(''));
  } else {
    const width = right.length + 1;
    const table = new Uint32Array((left.length + 1) * width);
    for (let i = left.length - 1; i >= 0; i--) for (let j = right.length - 1; j >= 0; j--) {
      table[i * width + j] = left[i] === right[j] ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j]) { append('same', left[i++]); j++; }
      else if (i < left.length && (j === right.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) append('removed', left[i++]);
      else append('added', right[j++]);
    }
  }
  append('same', end ? a.slice(-end).join('') : '');
  return { changes, identical, formattingOnly: !identical && a.join('') === b.join(''), coarse };
}
