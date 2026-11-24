import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '@/lib/usePresence';

export const dismissFloatingEvent = 'vana:dismiss-context-menu';
const openFloatingEvent = 'vana:open-floating-panel';
const stack: string[] = [];
type Anchor = { x: number; y: number } | HTMLElement | null;
export function FloatingPanel({ open, anchor, onClose, children, label, role = 'menu', id, className = '', preserveSelection = false, focusFirst = false }: {
  open: boolean; anchor: Anchor; onClose: () => void; children: ReactNode; label: string;
  role?: 'menu' | 'listbox'; id?: string; className?: string; preserveSelection?: boolean; focusFirst?: boolean;
}) {
  const present = usePresence(open, 160), panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const last = useRef({ children, label }); if (open) last.current = { children, label };
  const dismiss = useRef(onClose); dismiss.current = onClose;
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  useLayoutEffect(() => {
    if (!open || !panel.current) return;
    const element = panel.current;
    const update = () => {
      const v = window.visualViewport, x = v?.offsetLeft ?? 0, y = v?.offsetTop ?? 0;
      const right = x + (v?.width ?? innerWidth), bottom = y + (v?.height ?? innerHeight);
      const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : null;
      const ax = rect?.left ?? (anchor && 'x' in anchor ? anchor.x : x + 8);
      const ay = rect?.bottom ?? (anchor && 'y' in anchor ? anchor.y : y + 8);
      const width = Math.max(0, Math.min(256, right - x - 16));
      const below = Math.max(0, bottom - ay - 12), above = Math.max(0, (rect?.top ?? ay) - y - 12);
      // scrollHeight excludes the border; use the full height when aligning above an anchor.
      const borderHeight = element.offsetHeight - element.clientHeight;
      const naturalHeight = element.scrollHeight + borderHeight;
      const opensAbove = below < naturalHeight && above > below;
      const maxHeight = Math.min(opensAbove ? above : below, Math.max(0, bottom - y - 16));
      const height = Math.min(naturalHeight, maxHeight);
      const desiredTop = opensAbove ? (rect?.top ?? ay) - 4 - height : ay + 4;
      const next = { left: Math.max(x + 8, Math.min(ax, right - width - 8)), top: Math.max(y + 8, Math.min(desiredTop, bottom - height - 8)), width, maxHeight, above: opensAbove };
      setPosition(p => p && p.left === next.left && p.top === next.top && p.width === width && p.maxHeight === maxHeight && p.above === opensAbove ? p : next);
    };
    update();
    const observer = new ResizeObserver(update); observer.observe(element);
    if (anchor instanceof HTMLElement) observer.observe(anchor);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update); window.visualViewport?.addEventListener('scroll', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update); };
  }, [open, anchor]);
  useLayoutEffect(() => {
    if (open && position && focusFirst) (panel.current?.querySelector<HTMLElement>('[aria-selected=true]:not(:disabled)') ?? panel.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  }, [open, !!position, focusFirst, anchor]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    window.dispatchEvent(new CustomEvent(openFloatingEvent, { detail: panelId }));
    stack.push(panelId);
    const isTop = () => stack.at(-1) === panelId;
    const other = (event: Event) => { if ((event as CustomEvent).detail !== panelId) dismiss.current(); };
    const outside = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node) && !(anchor instanceof HTMLElement && anchor.contains(event.target as Node))) dismiss.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && isTop()) { event.preventDefault(); event.stopImmediatePropagation(); dismiss.current(); } };
    const back = (event: Event) => { if (!event.defaultPrevented && isTop()) { event.preventDefault(); dismiss.current(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key); window.addEventListener(dismissFloatingEvent, back); window.addEventListener(openFloatingEvent, other);
    return () => {
      const index = stack.indexOf(panelId); if (index >= 0) stack.splice(index, 1);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener(dismissFloatingEvent, back); window.removeEventListener(openFloatingEvent, other);
      if (panel.current?.contains(document.activeElement)) (anchor instanceof HTMLElement ? anchor : previous)?.focus({ preventScroll: true });
    };
  }, [open, anchor]);
  if (!present) return null;
  return createPortal(<div ref={panel} id={id} role={open ? role : undefined} aria-label={last.current.label} aria-hidden={!open} inert={!open}
    data-floating-panel data-open={open} data-above={position?.above} data-letterpress-menu data-tauri-drag-region="false" className={`vana-menu ${className}`}
    style={{ left: position?.left, top: position?.top, width: position?.width, maxHeight: position?.maxHeight, visibility: position ? undefined : 'hidden' }}
    onPointerDown={event => { if (preserveSelection) event.preventDefault(); }} onClick={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      if (event.key === 'Tab') { if (anchor instanceof HTMLElement) anchor.focus({ preventScroll: true }); dismiss.current(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }}>{last.current.children}</div>, document.body);
}
