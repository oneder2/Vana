import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentPath } from '../src/lib/documentNavigation';
import type { DocumentSummary } from '../src/lib/api';

const node = (id: string, parent_id: string | null, title = id): DocumentSummary => ({
  account_scope: 'guest', id, title, parent_id, node_kind: 'folder', depth: 0,
  status: 'active', is_favorite: false, is_template: false, created_at: '', updated_at: '',
  archived_at: null, deleted_at: null, tags: [],
});

test('a deeply nested document keeps every ancestor and its immediate return destination', () => {
  const a = node('a', null), b = node('b', 'a'), c = node('c', 'b');
  const d: DocumentSummary = { ...node('d', 'c'), node_kind: 'document' };
  const path = documentPath(d, [a, b, c, d]);
  assert.deepEqual(path.map(item => item.id), ['a', 'b', 'c', 'd']);
  assert.equal(path.at(-1)?.parent_id, 'c');
  assert.equal(path.at(-2)?.parent_id, 'b');
});

test('missing parents and malformed legacy cycles do not hang navigation', () => {
  assert.deepEqual(documentPath(node('a', 'missing'), []).map(item => item.id), ['a']);
  const a = node('a', 'b'), b = node('b', 'a');
  assert.equal(documentPath(a, [a, b]).length, 2);
  assert.deepEqual(documentPath(null, []), []);
});
