import type { JSONContent } from '@tiptap/core';
import { TEXT_FONTS, type TextFont } from '../textFonts';

export const DIALOGUE_LAYOUTS = { chat: '聊天气泡', script: '剧本', transcript: '访谈记录' } as const;
export const MAX_DIALOGUE_LINES = 64;
export interface DialogueStyle { layout: keyof typeof DIALOGUE_LAYOUTS; font: TextFont; density: 'compact' | 'relaxed' }
export const DEFAULT_DIALOGUE_STYLE: DialogueStyle = { layout: 'chat', font: 'sans', density: 'relaxed' };

export function parseDialogueStyle(value: unknown): DialogueStyle {
  const d = value as DialogueStyle;
  if (!d || !Object.hasOwn(DIALOGUE_LAYOUTS, d.layout) || !Object.hasOwn(TEXT_FONTS, d.font) || !['compact', 'relaxed'].includes(d.density)) throw new Error('对话样式无效');
  return { layout: d.layout, font: d.font, density: d.density };
}

export function readDialogue(node: JSONContent): JSONContent {
  const a = node.attrs;
  if (node.type !== 'dialogue' || !a || typeof a.id !== 'string' || !a.id || a.id.length > 80 || typeof a.title !== 'string' || a.title.length > 120) throw new Error('对话卡格式无效');
  parseDialogueStyle(a);
  if (!node.content?.length || node.content.length > MAX_DIALOGUE_LINES) throw new Error(`对话卡需要 1–${MAX_DIALOGUE_LINES} 条台词`);
  for (const line of node.content) {
    if (line.type !== 'dialogueLine' || typeof line.attrs?.speaker !== 'string' || line.attrs.speaker.length > 80 || !['left', 'right'].includes(line.attrs.side)
      || !line.content?.length || line.content.some(p => p.type !== 'paragraph' || (p.content ?? []).some(n => !['text', 'hardBreak'].includes(n.type ?? '') || (n.type === 'text' && typeof n.text !== 'string')))) throw new Error('对话台词格式无效');
  }
  return node;
}

export function dialogueLine(speaker: string, text = '', side: 'left' | 'right' = 'left'): JSONContent {
  return { type: 'dialogueLine', attrs: { speaker, side }, content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] };
}

/** Only interpret an explicit name + colon. Otherwise keep the complete text. */
export function createDialogue(source = ''): JSONContent {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').filter(s => s.trim());
  if (lines.length > MAX_DIALOGUE_LINES) throw new Error(`请选择不超过 ${MAX_DIALOGUE_LINES} 行文字制作对话`);
  const speakers: string[] = [];
  const content = lines.map((text, i) => {
    const match = /^([^:：\n]{1,40})(?:：|:\s+)(.*)$/.exec(text);
    const speaker = match ? match[1].trim() : `角色 ${i % 2 ? '乙' : '甲'}`;
    if (!speakers.includes(speaker)) speakers.push(speaker);
    return dialogueLine(speaker, match ? match[2] : text, speakers.indexOf(speaker) % 2 ? 'right' : 'left');
  });
  return { type: 'dialogue', attrs: { id: crypto.randomUUID(), title: '', ...DEFAULT_DIALOGUE_STYLE }, content: content.length ? content : [dialogueLine('角色甲'), dialogueLine('角色乙', '', 'right')] };
}

/** The same readable text feeds search, history, clipboard and plain-text exports. */
export function dialogueText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const text = (node.content ?? []).map(dialogueText).join(node.type === 'paragraph' ? '' : '\n');
  if (node.type === 'dialogueLine') return `${node.attrs?.speaker ? `${node.attrs.speaker}：` : ''}${text}`;
  if (node.type === 'dialogue') return [node.attrs?.title, text].filter(Boolean).join('\n\n');
  return text;
}

export function dialogueToParagraphs(node: JSONContent): JSONContent[] {
  readDialogue(node);
  const result: JSONContent[] = node.attrs?.title ? [{ type: 'paragraph', content: [{ type: 'text', text: node.attrs.title }] }] : [];
  for (const line of node.content!) {
    line.content!.forEach((p, index) => result.push({ ...p, content: [
      ...(index === 0 && line.attrs?.speaker ? [{ type: 'text', text: `${line.attrs.speaker}：` }] : []), ...(p.content ?? []),
    ] }));
  }
  return result;
}
