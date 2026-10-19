import type { JSONContent } from '@tiptap/core';
import { readLetter } from './document';
import { letterPNG } from './render';
import { FORMATS } from './model';

export interface LetterImage { bytes: Uint8Array; url: string; path: string; width: number; height: number }
export type LetterImages = Map<JSONContent, LetterImage>;

/** Transient export assets; recipes remain the sole persisted source. */
export async function prepareLetterImages(doc: JSONContent): Promise<LetterImages> {
  const images: LetterImages = new Map();
  const walk = async (node: JSONContent): Promise<void> => {
    if (node.type === 'letterpress') {
      const design = readLetter(node), blob = await letterPNG(design);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('无法读取信稿图片')); reader.readAsDataURL(blob);
      });
      const [w, h] = FORMATS[design.format];
      const height = Math.min(650, 480 * h / w), width = height * w / h;
      images.set(node, { bytes, url, path: `letter-${images.size}.png`, width, height });
    }
    for (const child of node.content ?? []) await walk(child);
  };
  await walk(doc); return images;
}

export function letterMarkdown(node: JSONContent): string {
  // JSON escapes line breaks, so user text cannot terminate this fenced block.
  return '```vana-letterpress\n' + JSON.stringify(readLetter(node)) + '\n```';
}
