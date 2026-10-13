import { saveDocument, type DocumentRecord, type SaveDocumentInput } from './api';

type Draft = { input: SaveDocumentInput; version: number; timer?: ReturnType<typeof setTimeout> };
export type DraftEvent =
  | { type: 'saved'; id: string; record: DocumentRecord; clean: boolean }
  | { type: 'error'; id: string; message: string };

/** Owns saves independently of editor mounts. Each document has an immutable snapshot and a serial writer. */
export class DocumentDraftStore {
  private drafts = new Map<string, Draft>();
  private writers = new Map<string, Promise<DocumentRecord | undefined>>();
  private listeners = new Set<(event: DraftEvent) => void>();
  private version = 0;

  constructor(private persist: (input: SaveDocumentInput) => Promise<DocumentRecord>, private delay = 600) {}

  subscribe(listener: (event: DraftEvent) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private emit(event: DraftEvent) { this.listeners.forEach((listener) => listener(event)); }

  get(id: string): SaveDocumentInput | undefined {
    const input = this.drafts.get(id)?.input;
    return input ? { ...input, tags: [...input.tags] } : undefined;
  }

  isDirty(id: string) { return this.drafts.has(id) || this.writers.has(id); }
  hasPending() { return this.drafts.size > 0 || this.writers.size > 0; }

  queue(input: SaveDocumentInput) {
    const previous = this.drafts.get(input.id);
    if (previous?.timer) clearTimeout(previous.timer);
    const draft: Draft = { input: { ...input, tags: [...input.tags] }, version: ++this.version };
    draft.timer = setTimeout(() => { void this.flush(input.id).catch(() => {}); }, this.delay);
    this.drafts.set(input.id, draft);
  }

  async flush(id: string): Promise<DocumentRecord | undefined> {
    const active = this.writers.get(id);
    if (active) {
      const record = await active;
      return this.drafts.has(id) ? this.flush(id) : record;
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
          this.emit({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
          throw error; // Keep the snapshot for retry; failed saves must block navigation.
        }
        const clean = this.drafts.get(id)?.version === draft.version;
        if (clean) this.drafts.delete(id);
        this.emit({ type: 'saved', id, record, clean });
      }
      return record;
    });
    this.writers.set(id, writer);
    try { return await writer; }
    finally { if (this.writers.get(id) === writer) this.writers.delete(id); }
  }

  async flushAll() {
    while (this.hasPending()) {
      await Promise.all([...new Set([...this.drafts.keys(), ...this.writers.keys()])].map((id) => this.flush(id)));
    }
  }
}

export const documentDrafts = new DocumentDraftStore(saveDocument);
