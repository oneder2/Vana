import { createLetter, parseLetter, type LetterDesign } from '../letterpress/model';
import { parseDialogueStyle, type DialogueStyle } from '../dialogue/model';

export type LetterStyle = Omit<LetterDesign, 'version' | 'title' | 'text' | 'signature'>;
export interface StyleMap { letterpress: LetterStyle; dialogue: DialogueStyle }
export type PresetKind = keyof StyleMap;

export function letterStyle(design: LetterDesign): LetterStyle {
  const { version: _v, title: _t, text: _body, signature: _s, ...style } = parseLetter(JSON.stringify({ ...design, title: '', text: '', signature: '' }));
  return style;
}
export function parseStyle<K extends PresetKind>(kind: K, value: unknown): StyleMap[K] {
  const keys = kind === 'dialogue' ? ['layout', 'font', 'density'] : ['material', 'format', 'font', 'fontSize', 'lineHeight', 'inset', 'align', 'seed', 'marks'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || keys.some(key => !Object.hasOwn(value, key))) throw new Error('预设样式不完整');
  if (kind === 'dialogue') return parseDialogueStyle(value) as StyleMap[K];
  const d = parseLetter(JSON.stringify({ ...createLetter('', ''), ...(value as object), version: 1, title: '', text: '', signature: '' }));
  return letterStyle(d) as StyleMap[K];
}

export interface StylePreset<K extends PresetKind = PresetKind> { id: string; name: string; kind: K; style: StyleMap[K] }
export interface PresetStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const MAX_PRESETS = 40;
const keyFor = (scope: string) => `vana-text-presets-v1:${encodeURIComponent(scope)}`;

export function loadPresets(scope: string, storage: PresetStorage): StylePreset[] {
  const raw = storage.getItem(keyFor(scope));
  if (!raw) return [];
  if (raw.length > 600000) throw new Error('预设库过大，请先备份本机数据');
  const data = JSON.parse(raw);
  if (data.version !== 1 || !Array.isArray(data.items) || data.items.length > MAX_PRESETS) throw new Error('预设库格式无法读取');
  const ids = new Set<string>();
  return data.items.map((p: StylePreset) => {
    if (!p || !['letterpress', 'dialogue'].includes(p.kind) || typeof p.id !== 'string' || !p.id || p.id.length > 80 || ids.has(p.id)
      || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40) throw new Error('预设库内容无法读取');
    ids.add(p.id);
    return { id: p.id, name: p.name, kind: p.kind, style: parseStyle(p.kind, p.style) };
  });
}

export function savePreset<K extends PresetKind>(scope: string, kind: K, name: string, style: StyleMap[K], storage: PresetStorage): StylePreset[] {
  name = name.trim();
  if (!name || name.length > 40) throw new Error('预设名称需为 1–40 个字符');
  const items = loadPresets(scope, storage);
  if (items.length >= MAX_PRESETS) throw new Error(`最多保存 ${MAX_PRESETS} 个预设，请先删除不再使用的预设`);
  const next = [...items, { id: crypto.randomUUID(), name, kind, style: parseStyle(kind, style) }];
  storage.setItem(keyFor(scope), JSON.stringify({ version: 1, items: next }));
  return next;
}
export function deletePreset(scope: string, id: string, storage: PresetStorage): StylePreset[] {
  const next = loadPresets(scope, storage).filter(p => p.id !== id);
  storage.setItem(keyFor(scope), JSON.stringify({ version: 1, items: next }));
  return next;
}
