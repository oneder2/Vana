import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { usePresence } from '@/lib/usePresence';

export function StudioInspector({ open, onOpenChange, children }: { open: boolean; onOpenChange: (value: boolean) => void; children: ReactNode }) {
  const present = usePresence(open), host = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), panel = useRef<HTMLElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null), [dragging, setDragging] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null), suppressClick = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver(() => setPoint(p => p ? { x: Math.max(8, Math.min(host.current!.clientWidth - 56, p.x)), y: Math.max(8, Math.min(host.current!.clientHeight - 56, p.y)) } : p));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { if (open) panel.current?.focus({ preventScroll: true }); }, [open]);
  const move = (x: number, y: number) => setPoint({ x: Math.max(8, Math.min((host.current?.clientWidth ?? 64) - 56, x)), y: Math.max(8, Math.min((host.current?.clientHeight ?? 64) - 56, y)) });
  return <div ref={host} className="lp-inspector-layer">
    <button ref={button} type="button" className="lp-inspector-orb" data-dragging={dragging} aria-label="精细调整" aria-expanded={open} aria-controls="lp-inspector" title="精细调整 · 可拖动"
      style={point ? { left: point.x, top: point.y, right: 'auto', bottom: 'auto' } : undefined}
      onPointerDown={event => {
        if (event.button !== 0) return;
        const r = event.currentTarget.getBoundingClientRect(), h = host.current!.getBoundingClientRect();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: r.left - h.left, top: r.top - h.top, moved: false };
        suppressClick.current = false; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event => {
        const g = gesture.current; if (!g || event.pointerId !== g.id) return;
        const dx = event.clientX - g.x, dy = event.clientY - g.y;
        if (Math.hypot(dx, dy) > 6) g.moved = true;
        if (g.moved) { event.preventDefault(); setDragging(true); move(g.left + dx, g.top + dy); }
      }} onPointerUp={event => {
        const g = gesture.current; if (!g || event.pointerId !== g.id) return;
        suppressClick.current = g.moved; gesture.current = null; setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={() => { suppressClick.current = true; gesture.current = null; setDragging(false); }} onLostPointerCapture={() => { gesture.current = null; setDragging(false); }}
      onClick={() => { if (!suppressClick.current) onOpenChange(!open); suppressClick.current = false; }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); const r = event.currentTarget.getBoundingClientRect(), h = host.current!.getBoundingClientRect();
        move(r.left - h.left + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), r.top - h.top + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0));
      }}><SlidersHorizontal size={20} /></button>
    {present && <section ref={panel} id="lp-inspector" role={open ? 'region' : undefined} aria-label="信稿精细调整" tabIndex={-1} className="lp-inspector" data-open={open} inert={!open}>
      <header><span>精细调整</span><button type="button" aria-label="收起精细调整" onClick={() => { onOpenChange(false); button.current?.focus({ preventScroll: true }); }}><X size={17} /></button></header>
      {children}
    </section>}
  </div>;
}
