import type { JSONContent } from '@tiptap/core';

export const MATERIALS = {
  card: { name: '分享卡片', note: '让几句话，独立成篇。', color: '#e1e9ed', ink: '#243b4a' },
  letter: { name: '书信', note: '纸纤维会记住墨水，也会记住伤痕。', color: '#e8d5ad', ink: '#493a30' },
  stone: { name: '石碑', note: '刻下的话，比说话的人留得更久。', color: '#535c63', ink: '#e4ded0' },
  arcane: { name: '奥术', note: '一份尚有余温的禁书残页。', color: '#352f53', ink: '#e0cdf5' },
  terminal: { name: '终端', note: '信号消失前，留下最后一条消息。', color: '#102e32', ink: '#9ce5d6' },
} as const;
export type Material = keyof typeof MATERIALS;
export type MarkKind = 'blood' | 'burn' | 'tear' | 'stain';
export type LetterFont = 'song' | 'brush' | 'sans' | 'mono';
export const FONTS: Record<LetterFont, { name: string; family: string }> = {
  song: { name: '书刻', family: '"Vana Book", "Noto Serif CJK SC", serif' },
  brush: { name: '笔迹', family: '"Vana Brush", "KaiTi", cursive' },
  sans: { name: '清晰', family: '"Noto Sans CJK SC", "Microsoft YaHei", sans-serif' },
  mono: { name: '电码', family: '"Liberation Mono", "Noto Sans CJK SC", monospace' },
};
export const FORMATS = { portrait: [1080, 1440], square: [1080, 1080], tall: [1080, 1920] } as const;
export type LetterFormat = keyof typeof FORMATS;
export const MAX_MARKS = 24;
export const MAX_TEXT = 12000;
export interface LetterMark {
  id: string;
  kind: MarkKind;
  pattern: 'spray' | 'drops' | 'smear';
  x: number;
  y: number;
  size: number;
  angle: number;
  strength: number;
  seed: number;
}
export interface LetterDesign {
  version: 1;
  material: Material;
  format: LetterFormat;
  font: LetterFont;
  title: string;
  text: string;
  signature: string;
  fontSize: number;
  lineHeight: number;
  inset: number;
  align: 'left' | 'center' | 'right';
  seed: number;
  marks: LetterMark[];
}

// Effects describe physical marks. Each substrate resolves its own appearance.
export function markLabel(kind: MarkKind, material: Material): string {
  if (kind === 'blood') return '血迹';
  if (kind === 'stain') return material === 'terminal' ? '玻璃污渍' : '污渍';
  if (kind === 'burn') return material === 'stone' ? '烟熏' : material === 'terminal' ? '灼痕' : '烧焦';
  return material === 'stone' ? '崩裂' : material === 'terminal' ? '碎屏' : material === 'arcane' ? '裂隙' : '撕裂';
}

export function createLetter(title: string, text: string): LetterDesign {
  return { version: 1, material: 'card', format: 'portrait', font: 'song', title: title.slice(0, 120), text,
    signature: '', fontSize: 34, lineHeight: 1.85, inset: 100, align: 'left', seed: 2718, marks: [] };
}

export function documentToLetterText(node: JSONContent): string {
  if (node.type === 'letterpress') {
    const d = parseLetter(JSON.stringify(node.attrs?.design));
    return [d.title, d.text, d.signature].filter(Boolean).join('\n\n');
  }
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const children = node.content ?? [];
  const separator = ['doc', 'bulletList', 'orderedList', 'listItem', 'blockquote'].includes(node.type ?? '') ? '\n' : '';
  return children.map(documentToLetterText).join(separator);
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function createMark(kind: MarkKind, x: number, y: number, angle = 35, size = .22): LetterMark {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  return { id: crypto.randomUUID(), kind, pattern: 'spray', x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)),
    angle, size, strength: .65, seed };
}

/** Strict portable recipe boundary: no URLs, HTML, scripts or arbitrary font names. */
export function parseLetter(source: string): LetterDesign {
  if (source.length > 100000) throw new Error('信稿文件过大');
  const value: unknown = JSON.parse(source);
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('信稿格式无效');
    return v as Record<string, unknown>;
  };
  const d = object(value);
  const number = (v: unknown, min: number, max: number) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('信稿参数超出范围');
    return v;
  };
  const string = (v: unknown, max: number) => {
    if (typeof v !== 'string' || v.length > max) throw new Error('信稿文字无效或过长');
    return v;
  };
  const choice = <T extends string>(v: unknown, choices: readonly T[]): T => {
    if (typeof v !== 'string' || !choices.includes(v as T)) throw new Error('信稿选项不受支持');
    return v as T;
  };
  const seed = (v: unknown) => {
    const n = number(v, 0, 4294967295);
    if (!Number.isInteger(n)) throw new Error('信稿纹理种子无效');
    return n;
  };
  if (d.version !== 1 || !Array.isArray(d.marks) || d.marks.length > MAX_MARKS) throw new Error('不支持的信稿版本或痕迹过多');
  const ids = new Set<string>();
  const marks = d.marks.map((v: unknown): LetterMark => {
    const m = object(v), id = string(m.id, 80);
    if (!id || ids.has(id)) throw new Error('信稿痕迹标识重复');
    ids.add(id);
    return { id, kind: choice(m.kind, ['blood', 'burn', 'tear', 'stain']), pattern: choice(m.pattern, ['spray', 'drops', 'smear']), x: number(m.x, 0, 1), y: number(m.y, 0, 1),
      size: number(m.size, .04, .65), angle: number(m.angle, -180, 180), strength: number(m.strength, .1, 1), seed: seed(m.seed) };
  });
  return { version: 1, material: choice(d.material, Object.keys(MATERIALS) as Material[]),
    format: choice(d.format, ['portrait', 'square', 'tall']), font: choice(d.font, Object.keys(FONTS) as LetterFont[]),
    title: string(d.title, 120), text: string(d.text, MAX_TEXT), signature: string(d.signature, 120),
    fontSize: number(d.fontSize, 22, 60), lineHeight: number(d.lineHeight, 1.3, 2.4), inset: number(d.inset, 60, 160),
    align: choice(d.align, ['left', 'center', 'right']), seed: seed(d.seed), marks };
}
