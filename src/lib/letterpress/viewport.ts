export type Point = { x: number; y: number };
export type CanvasView = { zoom: number; pan: Point };
export const MIN_ZOOM = 1, MAX_ZOOM = 2;
export function fitArtboard(width: number, height: number, ratio: number) {
  const w = Math.max(1, width - 32), h = Math.max(1, height - 32);
  const fittedWidth = Math.min(w, h * ratio);
  return { width: fittedWidth, height: fittedWidth / ratio };
}
export function constrainView(view: CanvasView, board: { width: number; height: number }, viewport: { width: number; height: number }): CanvasView {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom));
  const x = Math.max(0, (board.width * zoom - viewport.width + 32) / 2);
  const y = Math.max(0, (board.height * zoom - viewport.height + 32) / 2);
  return { zoom, pan: { x: x ? Math.max(-x, Math.min(x, view.pan.x)) : 0, y: y ? Math.max(-y, Math.min(y, view.pan.y)) : 0 } };
}
export function zoomAt(view: CanvasView, zoom: number, point: Point): CanvasView {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)), ratio = next / view.zoom;
  return { zoom: next, pan: { x: point.x - (point.x - view.pan.x) * ratio, y: point.y - (point.y - view.pan.y) * ratio } };
}
