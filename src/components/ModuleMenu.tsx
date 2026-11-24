import { useEffect, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
export function ModuleMenu({ host, label, items, onAction }: { host: HTMLElement; label: string; items: ContextMenuItem[]; onAction: (id: string) => void }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let timer = 0, start: { x: number; y: number } | null = null;
    const cancel = () => { clearTimeout(timer); start = null; };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType === 'mouse' || event.button !== 0 || (event.target as Element).closest('input, textarea, select, button, [data-module-editing=true]')) return;
      cancel(); start = { x: event.clientX, y: event.clientY };
      timer = window.setTimeout(() => { setPoint({ x: event.clientX, y: event.clientY }); start = null; }, 520);
    };
    const move = (event: PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) cancel(); };
    const context = (event: MouseEvent) => { if ((event.target as Element).closest('input, textarea, select, [contenteditable=true]')?.closest('[data-module-editing=true]')) return; event.preventDefault(); event.stopPropagation(); cancel(); setPoint({ x: event.clientX, y: event.clientY }); };
    const key = (event: KeyboardEvent) => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const r = host.getBoundingClientRect(); setPoint({ x: r.left + 20, y: r.top + 20 }); } };
    window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', cancel);
    host.addEventListener('pointerdown', down); host.addEventListener('pointermove', move); host.addEventListener('pointerup', cancel); host.addEventListener('pointercancel', cancel); host.addEventListener('contextmenu', context); host.addEventListener('keydown', key);
    return () => { cancel(); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', cancel); host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', cancel); host.removeEventListener('pointercancel', cancel); host.removeEventListener('contextmenu', context); host.removeEventListener('keydown', key); };
  }, [host]);
  return <><button className="module-menu-trigger" type="button" aria-label={`${label}操作`} onClick={event => { const r = event.currentTarget.getBoundingClientRect(); setPoint({ x: r.left, y: r.bottom }); }}><Ellipsis size={18} /></button>
    <ContextMenu open={!!point} x={point?.x ?? 0} y={point?.y ?? 0} items={items} onClose={() => setPoint(null)} onAction={onAction} /></>;
}
