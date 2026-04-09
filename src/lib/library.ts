import {
  type LibraryEntry,
  type LibraryMetadata,
  readLibraryMetadata,
  writeLibraryMetadata,
} from '@/lib/api';

export const LIBRARY_CONFIG_PATH = '.config/library.json';
export const TRASH_DIR_NAME = '.trash';

export function createEmptyLibraryEntry(): LibraryEntry {
  return {
    favorite: false,
    archived_at: null,
    last_opened_at: null,
    trashed_at: null,
    original_path: null,
    title_override: null,
  };
}

export async function loadLibraryMetadata(): Promise<LibraryMetadata> {
  const metadata = await readLibraryMetadata();
  return {
    entries: metadata.entries ?? {},
  };
}

export async function saveLibraryMetadata(metadata: LibraryMetadata): Promise<void> {
  await writeLibraryMetadata({
    entries: metadata.entries ?? {},
  });
}

export function toRelativeWorkspacePath(workspacePath: string, targetPath: string): string {
  const normalizedWorkspace = normalizePath(workspacePath);
  const normalizedTarget = normalizePath(targetPath);
  if (normalizedTarget === normalizedWorkspace) {
    return '';
  }
  if (normalizedTarget.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedTarget.slice(normalizedWorkspace.length + 1);
  }
  return normalizedTarget;
}

export function fromRelativeWorkspacePath(workspacePath: string, relativePath: string): string {
  const normalizedWorkspace = normalizePath(workspacePath);
  const normalizedRelative = normalizePath(relativePath);
  if (!normalizedRelative) {
    return normalizedWorkspace;
  }
  return `${normalizedWorkspace}/${normalizedRelative}`;
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function isTrashPath(workspacePath: string, path: string): boolean {
  const relativePath = toRelativeWorkspacePath(workspacePath, path);
  return relativePath === TRASH_DIR_NAME || relativePath.startsWith(`${TRASH_DIR_NAME}/`);
}

export function isLibraryConfigPath(relativePath: string): boolean {
  return normalizePath(relativePath) === LIBRARY_CONFIG_PATH;
}

export function getLibraryEntry(
  metadata: LibraryMetadata,
  relativePath: string
): LibraryEntry {
  return metadata.entries[relativePath] ?? createEmptyLibraryEntry();
}

export function upsertLibraryEntry(
  metadata: LibraryMetadata,
  relativePath: string,
  patch: Partial<LibraryEntry>
): LibraryMetadata {
  const current = getLibraryEntry(metadata, relativePath);
  metadata.entries[relativePath] = {
    ...current,
    ...patch,
  };
  pruneEmptyLibraryEntries(metadata);
  return metadata;
}

export function deleteLibraryEntry(metadata: LibraryMetadata, relativePath: string): LibraryMetadata {
  delete metadata.entries[relativePath];
  return metadata;
}

export function renameLibraryEntries(
  metadata: LibraryMetadata,
  oldRelativePath: string,
  newRelativePath: string
): LibraryMetadata {
  const normalizedOld = normalizePath(oldRelativePath);
  const normalizedNew = normalizePath(newRelativePath);
  const nextEntries: Record<string, LibraryEntry> = {};

  Object.entries(metadata.entries).forEach(([key, value]) => {
    if (key === normalizedOld || key.startsWith(`${normalizedOld}/`)) {
      const suffix = key.slice(normalizedOld.length);
      nextEntries[`${normalizedNew}${suffix}`] = value;
      return;
    }

    if (value.original_path === normalizedOld || value.original_path?.startsWith(`${normalizedOld}/`)) {
      const suffix = value.original_path.slice(normalizedOld.length);
      nextEntries[key] = {
        ...value,
        original_path: `${normalizedNew}${suffix}`,
      };
      return;
    }

    nextEntries[key] = value;
  });

  metadata.entries = nextEntries;
  pruneEmptyLibraryEntries(metadata);
  return metadata;
}

export function markFileOpened(
  metadata: LibraryMetadata,
  relativePath: string,
  openedAt: string
): LibraryMetadata {
  return upsertLibraryEntry(metadata, relativePath, {
    last_opened_at: openedAt,
  });
}

export function listRecentEntries(metadata: LibraryMetadata, limit: number): string[] {
  return Object.entries(metadata.entries)
    .filter(([, entry]) => !!entry.last_opened_at && !entry.trashed_at)
    .sort((a, b) => (b[1].last_opened_at ?? '').localeCompare(a[1].last_opened_at ?? ''))
    .slice(0, limit)
    .map(([path]) => path);
}

export function listFavoriteEntries(metadata: LibraryMetadata): string[] {
  return Object.entries(metadata.entries)
    .filter(([, entry]) => entry.favorite && !entry.trashed_at)
    .map(([path]) => path)
    .sort();
}

export function listArchivedEntries(metadata: LibraryMetadata): string[] {
  return Object.entries(metadata.entries)
    .filter(([, entry]) => !!entry.archived_at && !entry.trashed_at)
    .sort((a, b) => (b[1].archived_at ?? '').localeCompare(a[1].archived_at ?? ''))
    .map(([path]) => path);
}

export function listTrashEntries(metadata: LibraryMetadata): Array<[string, LibraryEntry]> {
  return Object.entries(metadata.entries)
    .filter(([, entry]) => !!entry.trashed_at)
    .sort((a, b) => (b[1].trashed_at ?? '').localeCompare(a[1].trashed_at ?? ''));
}

export function pruneEmptyLibraryEntries(metadata: LibraryMetadata): LibraryMetadata {
  Object.entries(metadata.entries).forEach(([key, entry]) => {
    const isEmpty = !entry.favorite
      && !entry.archived_at
      && !entry.last_opened_at
      && !entry.trashed_at
      && !entry.original_path
      && !entry.title_override;
    if (isEmpty) {
      delete metadata.entries[key];
    }
  });
  return metadata;
}

export function createTrashTargetPath(workspacePath: string, sourcePath: string, timestamp: string): string {
  const sourceName = normalizePath(sourcePath).split('/').pop() ?? 'item';
  return `${normalizePath(workspacePath)}/${TRASH_DIR_NAME}/${timestamp}__${sourceName}`;
}

export function createRestoreTargetPath(originalPath: string, fallbackTimestamp: string): string {
  const normalizedOriginal = normalizePath(originalPath);
  const lastSlashIndex = normalizedOriginal.lastIndexOf('/');
  const parent = lastSlashIndex >= 0 ? normalizedOriginal.slice(0, lastSlashIndex) : '';
  const name = lastSlashIndex >= 0 ? normalizedOriginal.slice(lastSlashIndex + 1) : normalizedOriginal;

  if (!parent) {
    return `${name}_restored_${fallbackTimestamp}`;
  }

  return `${parent}/${name}_restored_${fallbackTimestamp}`;
}
