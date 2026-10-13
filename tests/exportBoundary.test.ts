import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportAlignment, exportHeadingLevel } from '../src/lib/exportBoundary';

test('HTML style and heading boundaries reject injected markup and invalid numbers', () => {
  assert.equal(exportAlignment('left; background:url(https://attacker.test)'), 'left');
  assert.equal(exportAlignment('" onload="alert(1)'), 'left');
  assert.equal(exportAlignment('justify'), 'justify');
  for (const level of ['1><script>', NaN, Infinity, {}, 1.5]) assert.equal(exportHeadingLevel(level), 1);
  assert.equal(exportHeadingLevel(6), 3);
});
