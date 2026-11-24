import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveDestinations } from '../src/lib/documentMove';
import type { DocumentSummary } from '../src/lib/api';
const node = (id: string, parent_id: string | null = null, depth = 0, overrides: Partial<DocumentSummary> = {}): DocumentSummary => ({
  account_scope: 'guest', id, title: id, parent_id, depth, node_kind: 'folder', status: 'active', is_favorite: false, is_template: false,
  created_at: '', updated_at: '', archived_at: null, deleted_at: null, tags: [], ...overrides,
});
test('move destinations exclude the subtree, other spaces and incompatible states', () => {
  const source = node('a'), child = node('b', 'a', 1), sibling = node('c');
  const docs = [source, child, sibling, node('d', null, 0, { status: 'trashed' }), node('foreign', null, 0, { account_scope: 'another' }), node('text', null, 0, { node_kind: 'document' })];
  assert.deepEqual(moveDestinations(docs, source).map(x => x.id), ['c']);
});
test('moving a folder reserves depth for its deepest descendant and rejects broken ancestry', () => {
  const source = node('a'), child = node('b', 'a', 1), leaf = node('leaf', 'b', 2, { node_kind: 'document' });
  const chain = Array.from({ length: 7 }, (_, i) => node(`f${i}`, i ? `f${i - 1}` : null, i));
  const docs = [source, child, leaf, ...chain, node('broken', 'missing', 1), node('cycle', 'cycle', 1)];
  assert.deepEqual(moveDestinations(docs, source).map(x => x.id), ['f0', 'f1', 'f2', 'f3', 'f4']);
  assert.ok(moveDestinations(docs, leaf).some(x => x.id === 'f6'));
});
