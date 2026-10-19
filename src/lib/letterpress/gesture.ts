/** Coordinates remain valid over holes: the input surface is the whole artboard. */
export function markPosition(x: number, y: number, rect: { left: number; top: number; width: number; height: number }) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || rect.width <= 0 || rect.height <= 0) return null;
  return { x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (y - rect.top) / rect.height)) };
}
