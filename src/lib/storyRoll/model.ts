import type { JSONContent } from '@tiptap/core';

export const DIE_SIDES = 100;
export const MAX_OUTCOMES = 12;
export const MAX_QUESTION = 200;
export const MAX_OUTCOME = 300;

export type Outcome = { from: number; to: number; text: string };
export type StoryRoll = {
  id: string;
  question: string;
  outcomes: Outcome[];
  result: { value: number; text: string } | null;
};

export function createStoryRoll(question = ''): StoryRoll {
  return {
    id: crypto.randomUUID(),
    question: question.trim().slice(0, MAX_QUESTION),
    outcomes: [
      { from: 1, to: 20, text: '行动失败，情况恶化。' },
      { from: 21, to: 65, text: '行动成功，但必须付出代价。' },
      { from: 66, to: 100, text: '行动顺利，还得到额外收获。' },
    ],
    result: null,
  };
}

export function outcomeTable(outcomes: Outcome[]): Outcome[] {
  if (outcomes.length < 2 || outcomes.length > MAX_OUTCOMES) throw new Error('请设置 2 至 12 个结果区间');
  for (const row of outcomes) {
    if (!Number.isInteger(row.from) || !Number.isInteger(row.to) || row.from < 1 || row.to > DIE_SIDES || row.from > row.to) {
      throw new Error('每个区间需要两个 1 至 100 的整数，起点不能大于终点');
    }
    if (!row.text.trim() || row.text.length > MAX_OUTCOME) throw new Error('请填写每个区间的结果，最多 300 字');
  }
  const sorted = [...outcomes].sort((a, b) => a.from - b.from);
  let next = 1;
  for (const row of sorted) {
    if (row.from < next) throw new Error(`点数 ${row.from} 所在区间重叠`);
    if (row.from > next) throw new Error(`点数 ${next} 尚未分配结果`);
    next = row.to + 1;
  }
  if (next <= DIE_SIDES) throw new Error(`点数 ${next} 尚未分配结果`);
  return sorted;
}

function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function readStoryRoll(node: JSONContent): StoryRoll {
  const attrs: unknown = node.attrs;
  if (node.type !== 'storyRoll' || node.text !== undefined ||
    (node.content !== undefined && (!Array.isArray(node.content) || node.content.length > 0)) || node.marks !== undefined ||
    !hasKeys(attrs, ['id', 'question', 'outcomes', 'result']) ||
    typeof attrs.id !== 'string' || !attrs.id || attrs.id.length > 80 ||
    typeof attrs.question !== 'string' || attrs.question.length > MAX_QUESTION ||
    !Array.isArray(attrs.outcomes)) {
    throw new Error('剧情判定格式无效');
  }
  const outcomes = outcomeTable(attrs.outcomes.map(row => {
    if (!hasKeys(row, ['from', 'to', 'text']) || typeof row.from !== 'number' ||
      typeof row.to !== 'number' || typeof row.text !== 'string') throw new Error('判定区间格式无效');
    return { from: row.from, to: row.to, text: row.text };
  }));
  const result = attrs.result;
  if (result === null) return { id: attrs.id, question: attrs.question, outcomes, result };
  if (!attrs.question.trim() || !hasKeys(result, ['value', 'text']) ||
    typeof result.value !== 'number' || !Number.isInteger(result.value) ||
    typeof result.text !== 'string' ||
    !outcomes.some(row => Number(result.value) >= row.from && Number(result.value) <= row.to && row.text === result.text)) {
    throw new Error('掷骰记录与判定表不一致');
  }
  return { id: attrs.id, question: attrs.question, outcomes, result: { value: result.value, text: result.text } };
}

export function storyRollNode(card: StoryRoll): JSONContent {
  return { type: 'storyRoll', attrs: card };
}

export function rollStory(card: StoryRoll): StoryRoll {
  const current = readStoryRoll(storyRollNode(card));
  if (current.result) throw new Error('这张卡已有结果；可复制为新判定');
  if (!current.question.trim()) throw new Error('请先填写判定问题');
  const sample = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % DIE_SIDES);
  do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
  const value = (sample[0] % DIE_SIDES) + 1;
  const outcome = current.outcomes.find(row => value >= row.from && value <= row.to)!;
  return { ...current, result: { value, text: outcome.text } };
}

export function rangeText({ from, to }: Outcome): string {
  return from === to ? String(from) : `${from}–${to}`;
}

export function storyRollLines(card: StoryRoll): string[] {
  const question = card.question.trim() || '剧情判定';
  if (card.result) return [question, `1D100 · 掷出 ${card.result.value}`, card.result.text];
  return [question, '1D100 · 待判定', ...card.outcomes.map(row => `${rangeText(row)}　${row.text}`)];
}

export function storyRollText(node: JSONContent): string {
  return storyRollLines(readStoryRoll(node)).join('\n');
}
