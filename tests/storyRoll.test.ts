import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStoryRoll, outcomeTable, readStoryRoll, rollStory, storyRollNode, storyRollText } from '../src/lib/storyRoll/model';
import { compareDocumentBodies, parseDocumentBody } from '../src/lib/documentDiff';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/story-roll-v1.json', import.meta.url), 'utf8'));
const body = (node: unknown) => JSON.stringify({ type: 'doc', content: [node] });

test('ranges cover every D100 face once, regardless of the form order', () => {
  const { outcomes } = createStoryRoll();
  assert.deepEqual(outcomeTable([...outcomes].reverse()), outcomes);
  assert.throws(() => outcomeTable([{ ...outcomes[0], to: 22 }, ...outcomes.slice(1)]), /重叠/);
  assert.throws(() => outcomeTable([{ ...outcomes[0], to: 19 }, ...outcomes.slice(1)]), /20 尚未/);
  assert.throws(() => outcomeTable([...outcomes.slice(0, 2), { ...outcomes[2], to: 99 }]), /100 尚未/);
  assert.throws(() => outcomeTable([{ ...outcomes[0], from: 0 }, ...outcomes.slice(1)]), /整数/);
});

test('a recorded outcome survives serialization and history and cannot be rolled again', () => {
  const card = readStoryRoll(fixture);
  const draft = { ...card, result: null };
  assert.throws(() => rollStory(createStoryRoll()), /判定问题/);
  const rolled = rollStory(draft);
  assert.ok(rolled.result);
  const row = draft.outcomes.find(row => rolled.result!.value >= row.from && rolled.result!.value <= row.to);
  assert.equal(rolled.result.text, row?.text);
  assert.throws(() => rollStory(rolled), /已有结果/);
  assert.equal(storyRollText(parseDocumentBody(body(fixture)).content![0]), '她能进入档案室吗？\n1D100 · 掷出 43\n她只能带走一份档案。');
  assert.ok(compareDocumentBodies(body(storyRollNode(draft)), body(fixture)).changes.some(change => change.kind === 'added' && change.text.includes('43')));
  assert.throws(() => readStoryRoll({ ...fixture, attrs: { ...card, result: { value: 43, text: '不同结果' } } }), /不一致/);
});
