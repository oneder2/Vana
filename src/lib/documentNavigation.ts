import type { DocumentRecord, DocumentSummary } from './api';

export type DocumentPathItem = { id: string; title: string; parent_id: string | null };

/** Resolve every ancestor; stop safely at missing parents or cycles in legacy data. */
export function documentPath(
  document: DocumentSummary | DocumentRecord | null,
  documents: DocumentSummary[],
): DocumentPathItem[] {
  const byId = new Map(documents.map(item => [item.id, item]));
  const path: DocumentPathItem[] = [];
  const seen = new Set<string>();
  let cursor: DocumentPathItem | undefined = document ?? undefined;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift({ id: cursor.id, title: cursor.title || '未命名', parent_id: cursor.parent_id });
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : undefined;
  }
  return path;
}
