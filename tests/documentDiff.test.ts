import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareDocumentBodies } from '../src/lib/documentDiff';

function body(text: string, marks?: unknown[]) {
  return JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] }] });
}
test('Chinese and emoji differences reconstruct both bodies without splitting code points', () => {
  const diff = compareDocumentBodies(body('原文🙂共同结尾'), body('新文📝共同结尾'));
  assert.equal(diff.changes.filter(x => x.kind !== 'added').map(x => x.text).join(''), '原文🙂共同结尾');
  assert.equal(diff.changes.filter(x => x.kind !== 'removed').map(x => x.text).join(''), '新文📝共同结尾');
  assert.equal(diff.coarse, false);
  assert.ok(diff.changes.some(x => x.kind === 'added' && x.text.includes('📝')));
});
test('format and block structure changes are distinguished from identical JSON', () => {
  assert.equal(compareDocumentBodies(body('text'), body('text', [{ type: 'bold' }])).formattingOnly, true);
  const paragraph = JSON.parse(body('text'));
  const reordered = JSON.stringify({ content: paragraph.content, type: 'doc' });
  assert.equal(compareDocumentBodies(body('text'), reordered).identical, true);
  const heading = body('text').replace('paragraph', 'heading');
  assert.equal(compareDocumentBodies(body('text'), heading).formattingOnly, true);
});
test('large replacements have bounded work and preserve full removed and added text', () => {
  const a = '甲'.repeat(100_000), b = '乙'.repeat(100_000);
  const diff = compareDocumentBodies(body(a), body(b));
  assert.equal(diff.coarse, true);
  assert.deepEqual(diff.changes, [{ kind: 'removed', text: a }, { kind: 'added', text: b }]);
  assert.throws(() => compareDocumentBodies('{bad', body(b)));
});
