import type { Editor } from '@tiptap/core';
const active = new WeakMap<Editor, string>();
export function isModuleEditing(editor: Editor, id: string) { return editor.isEditable && active.get(editor) === id; }
export function setModuleEditing(editor: Editor, id?: string) {
  if (id) active.set(editor, id); else active.delete(editor);
  if (!editor.isDestroyed) editor.commands.setMeta('vana:module-editing', id ?? null);
}
export function lineIsEditing(editor: Editor, position: number | undefined) {
  if (typeof position !== 'number' || !editor.isEditable) return false;
  const resolved = editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size));
  for (let depth = resolved.depth; depth > 0; depth--) { const node = resolved.node(depth); if (node.type.name === 'dialogue') return isModuleEditing(editor, node.attrs.id); }
  return false;
}
