import { invoke, isTauri } from '@tauri-apps/api/core';
import { shareExportFile } from '../export';
import { parseLetter, type LetterDesign } from './model';
import { letterPNG } from './render';

async function save(blob: Blob, title: string, type: 'png' | 'json'): Promise<string | null> {
  if (isTauri()) {
    return invoke<string>('save_export_file', { filename: title, fileType: type, content: Array.from(new Uint8Array(await blob.arrayBuffer())) });
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url;
  anchor.download = `${title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'vana-letter'}.${type}`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  // WebViews may consume downloads asynchronously.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return null;
}

export async function exportLetter(design: LetterDesign, share = false): Promise<string | null> {
  // Validate before allocating or exporting, including restored portable recipes.
  const checked = parseLetter(JSON.stringify(design));
  const blob = await letterPNG(checked);
  const title = checked.title.trim() || 'Vana 信稿';
  const path = await save(blob, title, 'png');
  if (share && path) await shareExportFile(path, 'png', title);
  return path;
}

export async function saveLetterRecipe(design: LetterDesign, share = false): Promise<string | null> {
  const checked = parseLetter(JSON.stringify(design));
  const title = `${checked.title || 'Vana'}-信稿`;
  const path = await save(new Blob([JSON.stringify(checked, null, 2)], { type: 'application/json' }), title, 'json');
  if (share && path) await shareExportFile(path, 'json', title);
  return path;
}
