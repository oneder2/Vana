import { useEffect, useRef, type RefObject } from 'react';

export function useDialogFocus(dialog: RefObject<HTMLElement | null>, initial: RefObject<HTMLElement | null>, onEscape: () => void) {
  const dismiss = useRef(onEscape);
  dismiss.current = onEscape;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    initial.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dismiss.current(); return; }
      if (event.key !== 'Tab') return;
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])];
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, [dialog, initial]);
}
