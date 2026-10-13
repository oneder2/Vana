import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DocumentDraftStore, type DraftEvent } from '../src/lib/documentDrafts';
import type { DocumentRecord, SaveDocumentInput } from '../src/lib/api';

function input(id: string, text = id, tags = [id]): SaveDocumentInput {
  return { content_generation: 0, account_scope: 'guest', id, title: text, content_json: JSON.stringify({ type: 'doc', content: [] }), plain_text: text, tags };
}
function record(value: SaveDocumentInput): DocumentRecord {
  return { ...value, node_kind: 'document', parent_id: null, depth: 0, status: 'active',
    is_favorite: false, is_template: false, created_at: '', updated_at: '', archived_at: null, deleted_at: null };
}

test('switching documents preserves each immutable content and tag snapshot', async () => {
  const writes: SaveDocumentInput[] = [];
  const store = new DocumentDraftStore(async (value) => { writes.push(value); return record(value); }, 60_000);
  const a = input('a', 'draft A', ['tag A']);
  store.queue(a);
  a.tags[0] = 'mutated outside store';
  store.queue(input('b', 'draft B', ['tag B']));
  await store.flushAll();
  assert.deepEqual(writes.map((x) => [x.id, x.plain_text, x.tags]),
    [['a', 'draft A', ['tag A']], ['b', 'draft B', ['tag B']]]);
  assert.equal(store.hasPending(), false);
});

test('edits arriving during a save are serialized and never marked saved by the earlier completion', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const writes: string[] = [], events: DraftEvent[] = [];
  const store = new DocumentDraftStore(async (value) => {
    writes.push(value.plain_text);
    if (writes.length === 1) await gate;
    return record(value);
  }, 60_000);
  store.subscribe((event) => events.push(event));
  store.queue(input('a', 'first'));
  const flush = store.flush('a');
  await Promise.resolve();
  store.queue(input('a', 'second'));
  const concurrentFlush = store.flush('a');
  release();
  await Promise.all([flush, concurrentFlush]);
  assert.deepEqual(writes, ['first', 'second']);
  assert.deepEqual(events.map((event) => event.type === 'saved' && event.clean), [false, true]);
  assert.equal(store.isDirty('a'), false);
});

test('failed saves retain drafts and reject navigation flush until a successful retry', async () => {
  let fails = true;
  const store = new DocumentDraftStore(async (value) => {
    if (fails) throw new Error('disk full');
    return record(value);
  }, 60_000);
  const errors: DraftEvent[] = [];
  store.subscribe((event) => errors.push(event));
  store.queue(input('a', 'keep me'));
  await assert.rejects(store.flushAll(), /disk full/);
  assert.equal(store.get('a')?.plain_text, 'keep me');
  assert.equal(store.isDirty('a'), true);
  assert.deepEqual(errors, [{ type: 'error', account_scope: 'guest', id: 'a', message: 'disk full' }]);
  fails = false;
  await store.flushAll();
  assert.equal(store.hasPending(), false);
});

test('unsubscribing a mounted editor does not cancel a save', async () => {
  const writes: string[] = [];
  const store = new DocumentDraftStore(async (value) => { writes.push(value.id); return record(value); }, 60_000);
  const unsubscribe = store.subscribe(() => {});
  store.queue(input('a'));
  unsubscribe();
  await store.flushAll();
  assert.deepEqual(writes, ['a']);
});


test('identical document IDs in separate account spaces have independent drafts', async () => {
  const writes: SaveDocumentInput[] = [];
  const store = new DocumentDraftStore(async value => { writes.push(value); return record(value); }, 60_000);
  store.queue({ ...input('same', 'A'), account_scope: 'account-A' });
  store.queue({ ...input('same', 'B'), account_scope: 'account-B' });
  assert.equal(store.get('same', 'account-A')?.plain_text, 'A');
  await store.flush('same', 'account-B');
  assert.equal(store.isDirty('same', 'account-A'), true);
  await store.flushAll();
  assert.deepEqual(writes.map(x => [x.account_scope, x.plain_text]), [['account-B', 'B'], ['account-A', 'A']]);
});

test('recovery drains drafts and serializes flush while rejecting stale editor events', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const actions: string[] = [];
  const store = new DocumentDraftStore(async value => { actions.push('save'); return record(value); }, 60_000);
  store.queue(input('a', 'unsaved'));
  const recovery = store.withExclusive('a', 'guest', async () => { actions.push('restore'); await gate; return record(input('a', 'restored')); });
  assert.throws(() => store.queue(input('a', 'late stale edit')), /正在恢复/);
  while (!actions.includes('restore')) await Promise.resolve();
  let flushed = false;
  const flush = store.flush('a', 'guest').then(value => { flushed = true; return value; });
  await Promise.resolve();
  assert.equal(flushed, false);
  release();
  assert.equal((await recovery).plain_text, 'restored');
  assert.equal((await flush)?.plain_text, 'restored');
  assert.deepEqual(actions, ['save', 'restore']);
  store.queue(input('a', 'new edit'));
  await store.flushAll();
});

test('failed draft flush prevents recovery and releases the operation lock', async () => {
  let fails = true, restored = false;
  const store = new DocumentDraftStore(async value => { if (fails) throw new Error('disk full'); return record(value); }, 60_000);
  store.queue(input('a'));
  await assert.rejects(store.withExclusive('a', 'guest', async () => { restored = true; return record(input('a')); }), /disk full/);
  assert.equal(restored, false);
  fails = false;
  store.queue(input('a', 'retry'));
  await store.flushAll();
});
