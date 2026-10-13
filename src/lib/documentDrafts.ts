import { getCachedAccountScope, saveDocument, type DocumentRecord, type SaveDocumentInput } from './api';

type Draft = { input: SaveDocumentInput; version: number; timer?: ReturnType<typeof setTimeout> };
export type DraftEvent =
  | { type: 'saved'; account_scope: string; id: string; record: DocumentRecord; clean: boolean }
  | { type: 'error'; account_scope: string; id: string; message: string };

/** Owns saves independently of editor mounts. Each document has an immutable snapshot and a serial writer. */
export class DocumentDraftStore {
  private drafts = new Map<string, Draft>();
  private writers = new Map<string, Promise<DocumentRecord | undefined>>();
  private listeners = new Set<(event: DraftEvent) => void>();
  private version = 0;
  private exclusive = new Set<string>();
  private operations = new Map<string, Set<Promise<unknown>>>();

  constructor(private persist: (input: SaveDocumentInput) => Promise<DocumentRecord>, private delay = 600) {}

  subscribe(listener: (event: DraftEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: DraftEvent) { this.listeners.forEach((listener) => listener(event)); }

  private key(id: string, scope = getCachedAccountScope() ?? 'guest') { return JSON.stringify([scope, id]); }

  get(id: string, scope?: string): SaveDocumentInput | undefined {
    const input = this.drafts.get(this.key(id, scope))?.input;
    return input ? { ...input, tags: [...input.tags] } : undefined;
  }

  isDirty(id: string, scope?: string) { const key = this.key(id, scope); return this.drafts.has(key) || this.writers.has(key) || this.operations.has(key); }
  pendingIds(scope: string) { return [...this.drafts.values()].filter(d => d.input.account_scope === scope).map(d => d.input.id); }
  hasPending() { return this.drafts.size > 0 || this.writers.size > 0 || this.operations.size > 0; }

  /** Attachment reads/writes must drain before navigation, logout or normal close. */
  trackOperation<T>(id: string, scope: string, operation: () => Promise<T>): Promise<T> {
    const key = this.key(id, scope);
    if (this.exclusive.has(key)) return Promise.reject(new Error('文档操作正在进行，请稍后再试'));
    const operations = this.operations.get(key) ?? new Set<Promise<unknown>>();
    const writer = Promise.resolve().then(operation).finally(() => {
      operations.delete(writer);
      if (!operations.size && this.operations.get(key) === operations) this.operations.delete(key);
    });
    operations.add(writer); this.operations.set(key, operations);
    return writer;
  }

  queue(input: SaveDocumentInput) {
    const key = this.key(input.id, input.account_scope);
    if (this.exclusive.has(key)) throw new Error('文档正在恢复，请稍后再编辑');
    const previous = this.drafts.get(key);
    if (previous?.timer) clearTimeout(previous.timer);
    const draft: Draft = { input: { ...input, tags: [...input.tags] }, version: ++this.version };
    draft.timer = setTimeout(() => { void this.flushKey(key).catch(() => {}); }, this.delay);
    this.drafts.set(key, draft);
  }

  async flush(id: string, scope?: string): Promise<DocumentRecord | undefined> {
    return this.flushKey(this.key(id, scope));
  }

  /** Drain pending saves and hold the same writer slot through the domain operation.
   * A late editor event must not enqueue a pre-restore snapshot. */
  async withExclusive(id: string, scope: string, operation: () => Promise<DocumentRecord>): Promise<DocumentRecord> {
    const key = this.key(id, scope);
    if (this.exclusive.has(key)) throw new Error('文档操作正在进行');
    this.exclusive.add(key);
    try {
      await this.flushKey(key);
      const writer = Promise.resolve().then(operation);
      this.writers.set(key, writer);
      try { return await writer; }
      finally { if (this.writers.get(key) === writer) this.writers.delete(key); }
    } finally { this.exclusive.delete(key); }
  }

  private async flushKey(id: string): Promise<DocumentRecord | undefined> {
    const operations = this.operations.get(id);
    if (operations?.size) await Promise.all([...operations]);
    const active = this.writers.get(id);
    if (active) {
      const record = await active;
      return this.drafts.has(id) ? this.flushKey(id) : record;
    }
    if (!this.drafts.has(id)) return undefined;
    // Start on the next microtask so the writer is registered before any notifications fire.
    const writer = Promise.resolve().then(async () => {
      let record: DocumentRecord | undefined;
      while (this.drafts.has(id)) {
        const draft = this.drafts.get(id)!;
        if (draft.timer) clearTimeout(draft.timer);
        draft.timer = undefined;
        try {
          record = await this.persist(draft.input);
        } catch (error) {
          this.emit({ type: 'error', account_scope: draft.input.account_scope, id: draft.input.id, message: error instanceof Error ? error.message : String(error) });
          throw error; // Keep the snapshot for retry; failed saves must block navigation.
        }
        const clean = this.drafts.get(id)?.version === draft.version;
        if (clean) this.drafts.delete(id);
        this.emit({ type: 'saved', account_scope: draft.input.account_scope, id: draft.input.id, record, clean });
      }
      return record;
    });
    this.writers.set(id, writer);
    try { return await writer; }
    finally { if (this.writers.get(id) === writer) this.writers.delete(id); }
  }

  async flushAll() {
    while (this.hasPending()) {
      await Promise.all([...new Set([...this.drafts.keys(), ...this.writers.keys(), ...this.operations.keys()])].map((id) => this.flushKey(id)));
    }
  }
}

export const documentDrafts = new DocumentDraftStore(saveDocument);
