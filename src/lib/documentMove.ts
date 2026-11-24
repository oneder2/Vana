import type { DocumentSummary } from './api';
import { documentPath } from './documentNavigation';

/** Mirror the native tree boundary; the database still validates every move. */
export function moveDestinations(documents: DocumentSummary[], source: DocumentSummary) {
  const descendants = new Map<string, number>([[source.id, 0]]);
  const queue = [source.id];
  for (let index = 0; index < queue.length; index++) {
    const parent = queue[index];
    for (const node of documents) {
      if (node.parent_id === parent && !descendants.has(node.id)) {
        descendants.set(node.id, descendants.get(parent)! + 1);
        queue.push(node.id);
      }
    }
  }
  const height = Math.max(...descendants.values());
  return documents.filter(node => {
    if (node.account_scope !== source.account_scope || node.node_kind !== 'folder' || node.status !== source.status || descendants.has(node.id)) return false;
    const path = documentPath(node, documents);
    // Disconnected or cyclic legacy folders cannot be a safe destination.
    if (path[0]?.parent_id !== null || path.length !== node.depth + 1) return false;
    return node.depth + 1 + height <= 7;
  }).sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
}
