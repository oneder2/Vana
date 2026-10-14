import { useEffect, useRef } from 'react';
import { ReadingClickTracker } from '@/lib/readingClick';

/** Verify a text glyph was hit, rather than the nearest caret in blank space. */
function isTextHit(root: HTMLElement, x: number, y: number) {
  const doc = root.ownerDocument;
  const caret = doc.caretRangeFromPoint?.(x, y);
  const position = !caret ? doc.caretPositionFromPoint?.(x, y) : undefined;
  const node = caret?.startContainer ?? position?.offsetNode;
  const offset = caret?.startOffset ?? position?.offset;
  if (!node || node.nodeType !== Node.TEXT_NODE || offset === undefined || !root.contains(node)) return false;
  const text = node.textContent ?? '';
  for (const index of [offset, offset - 1]) {
    if (index < 0 || index >= text.length || !text[index].trim()) continue;
    const range = doc.createRange();
    range.setStart(node, index); range.setEnd(node, index + 1);
    if (Array.from(range.getClientRects()).some(rect =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) return true;
  }
  return false;
}

export function useReadingClick(enabled: boolean, onReadingClick?: () => void) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!enabled || !onReadingClick || !element) return;
    const doc = element.ownerDocument;
    const tracker = new ReadingClickTracker();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const clearPending = () => { clearTimeout(pending); pending = undefined; };
    const cancel = () => { tracker.cancel(); clearPending(); };
    const selectionExists = () => {
      const selection = doc.getSelection();
      return selection !== null && !selection.isCollapsed;
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) { cancel(); return; }
      clearPending();
      const target = event.target instanceof Element ? event.target : null;
      const editor = target?.closest('.tiptap-editor');
      const nonEditable = target?.closest('[contenteditable="false"]');
      if (!target || !element.contains(target) || !editor ||
          target.closest('a, button, input, textarea, select, [role="button"]') ||
          (nonEditable && nonEditable !== editor) ||
          !isTextHit(element, event.clientX, event.clientY)) { tracker.cancel(); return; }
      tracker.begin(event, event.isPrimary, event.button);
    };
    const move = (event: PointerEvent) => tracker.move(event);
    const up = (event: PointerEvent) => {
      const click = tracker.finish(event);
      if (!click || selectionExists() || !isTextHit(element, event.clientX, event.clientY)) return;
      // Allow a second click or text selection to cancel the cue first.
      pending = setTimeout(() => {
        pending = undefined;
        if (!selectionExists()) onReadingClick();
      }, 300);
    };
    const click = (event: MouseEvent) => { if (event.detail > 1) cancel(); };
    const selectionChanged = () => { if (selectionExists()) cancel(); };
    doc.addEventListener('pointerdown', down, true);
    doc.addEventListener('pointermove', move, true);
    doc.addEventListener('pointerup', up, true);
    doc.addEventListener('pointercancel', cancel, true);
    doc.addEventListener('selectionchange', selectionChanged);
    element.addEventListener('scroll', cancel, true);
    element.addEventListener('wheel', cancel, { passive: true });
    element.addEventListener('contextmenu', cancel);
    element.addEventListener('click', click);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      doc.removeEventListener('pointerdown', down, true);
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', up, true);
      doc.removeEventListener('pointercancel', cancel, true);
      doc.removeEventListener('selectionchange', selectionChanged);
      element.removeEventListener('scroll', cancel, true);
      element.removeEventListener('wheel', cancel);
      element.removeEventListener('contextmenu', cancel);
      element.removeEventListener('click', click);
      window.removeEventListener('blur', cancel);
    };
  }, [enabled, onReadingClick]);
  return root;
}
