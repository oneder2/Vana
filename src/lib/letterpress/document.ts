import type { JSONContent, Editor } from '@tiptap/core';
import { parseLetter, type LetterDesign } from './model';

export interface TextExcerpt { text: string; from: number; to: number }
export interface LetterpressRequest {
  purpose: 'embed' | 'share';
  excerpt?: TextExcerpt;
  design?: LetterDesign;
  blockId?: string;
}

export function letterText(design: LetterDesign): string {
  return [design.title, design.text, design.signature].filter(Boolean).join('\n\n');
}
export function readLetter(node: JSONContent): LetterDesign {
  return parseLetter(JSON.stringify(node.attrs?.design));
}
export function letterNode(design: LetterDesign, id: string = crypto.randomUUID()): JSONContent {
  return { type: 'letterpress', attrs: { id, design: parseLetter(JSON.stringify(design)) } };
}
/** Capture DOM ranges before a menu takes focus, including read-only selections. */
export function selectedExcerpt(editor: Editor): TextExcerpt | undefined {
  if (editor.isDestroyed) return;
  const s = window.getSelection(), root = editor.view.dom;
  if (s && !s.isCollapsed && s.rangeCount && s.anchorNode && s.focusNode && root.contains(s.anchorNode) && root.contains(s.focusNode)) {
    const r = s.getRangeAt(0);
    try {
      return { text: s.toString(), from: editor.view.posAtDOM(r.startContainer, r.startOffset), to: editor.view.posAtDOM(r.endContainer, r.endOffset) };
    } catch { return; }
  }
  if (editor.isEditable && !editor.state.selection.empty) {
    const { from, to } = editor.state.selection;
    return { from, to, text: editor.state.doc.textBetween(from, to, '\n', node => node.type.name === 'letterpress' ? letterText(readLetter(node.toJSON())) : '') };
  }
}
