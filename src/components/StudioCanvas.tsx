import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { constrainView, fitArtboard, zoomAt, type CanvasView, type Point } from '@/lib/letterpress/viewport';

const initialView: CanvasView = { zoom: 1, pan: { x: 0, y: 0 } };
export function StudioCanvas({ ratio, drawing, cancelDrawing, children, label }: {
  ratio: number; drawing: boolean; cancelDrawing: () => void; children: ReactNode; label: string;
}) {
  const viewport = useRef<HTMLDivElement>(null), [size, setSize] = useState({ width: 1, height: 1 });
  const [view, setView] = useState(initialView), current = useRef(view); current.current = view;
  const [dragging, setDragging] = useState(false);
  const points = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: CanvasView; start: Point; distance: number } | null>(null);
  const board = fitArtboard(size.width, size.height, ratio);
  const constrain = (value: CanvasView) => constrainView(value, board, size);
  const resize = useRef(constrain); resize.current = constrain;
  const changeZoom = (zoom: number, point: Point = { x: 0, y: 0 }) => setView(previous => resize.current(zoomAt(previous, zoom, point)));
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update(); const observer = new ResizeObserver(update); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setView(initialView); points.current.clear(); gesture.current = null; setDragging(false); cancelDrawing(); }, [ratio, cancelDrawing]);
  useEffect(() => { setView(previous => resize.current(previous)); }, [size]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); cancelDrawing();
      const rect = element.getBoundingClientRect();
      setView(previous => resize.current(zoomAt(previous, previous.zoom - event.deltaY * .005, { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 })));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [cancelDrawing]);
  const local = (x: number, y: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
  };
  const midpoint = () => {
    const [a, b] = [...points.current.values()];
    return { point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(b.x - a.x, b.y - a.y) };
  };
  const stop = (id: number) => {
    const navigating = !!gesture.current;
    points.current.delete(id);
    if (points.current.size < 2) { gesture.current = null; setDragging(false); }
    if (viewport.current?.hasPointerCapture(id)) viewport.current.releasePointerCapture(id);
    return navigating;
  };
  return <section className="lp-stage" aria-label="信稿预览">
    <div className="lp-stage-toolbar"><span>{label}</span><div className="lp-zoom-controls" aria-label="画布缩放">
      <button type="button" aria-label="缩小画布" disabled={view.zoom <= 1} onClick={() => changeZoom(view.zoom - .25)}><Minus size={16} /></button>
      <button type="button" aria-label="画布适应窗口" onClick={() => setView(initialView)}><Maximize size={14} /><output>{Math.round(view.zoom * 100)}%</output></button>
      <button type="button" aria-label="放大画布" disabled={view.zoom >= 2} onClick={() => changeZoom(view.zoom + .25)}><Plus size={16} /></button>
    </div></div>
    <div ref={viewport} className="lp-canvas-viewport" data-dragging={dragging} data-zoomed={view.zoom > 1} data-drawing={drawing}
      onPointerDownCapture={event => {
        if (event.button !== 0) return;
        const point = local(event.clientX, event.clientY); points.current.set(event.pointerId, point);
        if (points.current.size >= 2) {
          cancelDrawing(); const mid = midpoint(); gesture.current = { view: current.current, start: mid.point, distance: Math.max(1, mid.distance) };
          for (const id of points.current.keys()) event.currentTarget.setPointerCapture(id);
          setDragging(true); event.preventDefault(); event.stopPropagation();
        } else if (!drawing && current.current.zoom > 1) {
          gesture.current = { view: current.current, start: point, distance: 0 };
          event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); event.preventDefault(); event.stopPropagation();
        }
      }}
      onPointerMoveCapture={event => {
        if (!points.current.has(event.pointerId)) return;
        const point = local(event.clientX, event.clientY); points.current.set(event.pointerId, point);
        const start = gesture.current;
        if (!start) return;
        event.preventDefault(); event.stopPropagation();
        if (points.current.size >= 2) {
          const mid = midpoint(), next = zoomAt(start.view, start.view.zoom * mid.distance / Math.max(1, start.distance), start.start);
          next.pan.x += mid.point.x - start.start.x; next.pan.y += mid.point.y - start.start.y;
          setView(resize.current(next));
        } else if (!start.distance) setView(resize.current({ ...start.view, pan: { x: start.view.pan.x + point.x - start.start.x, y: start.view.pan.y + point.y - start.start.y } }));
      }}
      onPointerUpCapture={event => { if (stop(event.pointerId)) event.stopPropagation(); }}
      onPointerCancel={event => { stop(event.pointerId); cancelDrawing(); }} onLostPointerCapture={event => { if (event.target !== event.currentTarget) return; points.current.delete(event.pointerId); if (!points.current.size) { gesture.current = null; setDragging(false); } }}>
      <div className="lp-artboard" style={{ width: board.width, height: board.height, transform: `translate(-50%, -50%) translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})` }}>{children}</div>
    </div>
  </section>;
}
