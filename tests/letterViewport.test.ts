import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constrainView, fitArtboard, zoomAt } from '../src/lib/letterpress/viewport';
test('portrait, tall and square canvases fit short and narrow viewports without scrolling', () => {
  for (const viewport of [{ width: 320, height: 500 }, { width: 768, height: 180 }, { width: 1200, height: 700 }]) {
    for (const ratio of [3 / 4, 9 / 16, 1]) {
      const board = fitArtboard(viewport.width, viewport.height, ratio);
      assert.ok(board.width <= viewport.width - 32 && board.height <= viewport.height - 32 + 1e-8);
      assert.ok(Math.abs(board.width / board.height - ratio) < 1e-8);
    }
  }
});
test('bounded zoom preserves the touched point and panning cannot lose the artwork', () => {
  const next = zoomAt({ zoom: 1, pan: { x: 0, y: 0 } }, 1.5, { x: 50, y: 30 });
  assert.deepEqual(next, { zoom: 1.5, pan: { x: -25, y: -15 } });
  assert.equal(zoomAt(next, 10, { x: 0, y: 0 }).zoom, 2);
  const viewport = { width: 390, height: 600 }, board = fitArtboard(390, 600, .75);
  assert.deepEqual(constrainView({ zoom: -1, pan: { x: 10000, y: -10000 } }, board, viewport), { zoom: 1, pan: { x: 0, y: 0 } });
  const bounded = constrainView({ zoom: 9, pan: { x: 10000, y: -10000 } }, board, viewport);
  assert.equal(bounded.zoom, 2); assert.ok(bounded.pan.x < 300 && bounded.pan.y > -300);
});
