import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/** Native touch selection remains owned by the WebView; this only follows it. */
export function useEditorSelection(editor: Editor | null, enabled: boolean) {
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    if (!editor || !enabled) { setSelected(false); return; }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        const selection = editor.state.selection;
        const dom = window.getSelection();
        const active = document.activeElement;
        const nativeField = active instanceof HTMLElement && active.matches('input, textarea, select');
        const inEditor = !!dom?.anchorNode && editor.view.dom.contains(dom.anchorNode);
        setSelected(editor.isEditable && !nativeField && inEditor && selection instanceof TextSelection && !selection.empty);
      });
    };
    editor.on('selectionUpdate', update); editor.on('transaction', update);
    document.addEventListener('selectionchange', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      editor.off('selectionUpdate', update); editor.off('transaction', update);
      document.removeEventListener('selectionchange', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [editor, enabled]);
  return enabled && selected;
}
