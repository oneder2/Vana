import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialogue, dialogueText, dialogueToParagraphs, readDialogue } from '../src/lib/dialogue/model';
import { createLetter, createMark, parseLetter, documentToLetterText } from '../src/lib/letterpress/model';
import { compareDocumentBodies } from '../src/lib/documentDiff';
import { deletePreset, letterStyle, loadPresets, savePreset } from '../src/lib/textPlugins/styles';
import { rollDialogue, rollLetter, LETTER_LOCKS } from '../src/lib/textPlugins/dice';
import { exportToMarkdown } from '../src/lib/export';

test('dialogue is text with speakers, rich marks and a lossless plain paragraph exit', () => {
  const node = createDialogue('旅人：灯还亮着吗？\n守塔人: 我一直在等你。\nhttps://example.com');
  node.attrs!.title = '旧港来信';
  node.content![1].content![0].content![0].marks = [{ type: 'bold' }];
  assert.equal(readDialogue(node), node);
  assert.equal(node.content![1].attrs!.side, 'right');
  assert.ok(dialogueText(node).includes('守塔人：我一直在等你。'));
  assert.ok(dialogueText(node).includes('https://example.com'));
  assert.equal(documentToLetterText(node), dialogueText(node));
  const paragraphs = dialogueToParagraphs(node);
  assert.deepEqual(paragraphs[2].content![1].marks, [{ type: 'bold' }]);
  const markdown = exportToMarkdown({ type: 'doc', content: [node] });
  assert.ok(markdown.includes('守塔人：**我一直在等你。**'));
  assert.ok(markdown.includes('旧港来信'));
  const styled = structuredClone(node); styled.attrs!.layout = 'script';
  assert.equal(compareDocumentBodies(JSON.stringify({ type: 'doc', content: [node] }), JSON.stringify({ type: 'doc', content: [styled] })).formattingOnly, true);
  styled.content![0].attrs!.speaker = '新角色';
  assert.equal(compareDocumentBodies(JSON.stringify({ type: 'doc', content: [node] }), JSON.stringify({ type: 'doc', content: [styled] })).formattingOnly, false);
});

test('dialogue rejects unknown styles, nested blocks and excessive lines', () => {
  const node = createDialogue('甲：你好');
  for (const attrs of [{ font: 'url(https://bad.test)' }, { layout: '__proto__' }, { title: 'x'.repeat(121) }, { id: '' }]) {
    assert.throws(() => readDialogue({ ...node, attrs: { ...node.attrs, ...attrs } }));
  }
  assert.throws(() => createDialogue(Array(65).fill('甲：台词').join('\n')));
  assert.throws(() => readDialogue({ ...node, content: [{ type: 'paragraph' }] }));
});

test('personal styles never store content, isolate spaces and leave applied documents independent', () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
  const letter = { ...createLetter('私人标题', '私人正文'), signature: '私人落款', marks: [createMark('stain', .8, .2)] };
  const items = savePreset('guest', 'letterpress', '旧港', letterStyle(letter), storage);
  assert.ok(![...map.values()].join('').includes('私人'));
  assert.deepEqual(letterStyle({ ...letter, text: 'x'.repeat(12001) }), letterStyle(letter));
  assert.deepEqual(loadPresets('guest', storage), items);
  assert.deepEqual(loadPresets('account:another', storage), []);
  const other = createLetter('另一封信', '另一段文字');
  const applied = { ...other, ...loadPresets('guest', storage)[0].style };
  assert.equal(applied.text, other.text);
  deletePreset('guest', items[0].id, storage);
  assert.equal(applied.marks.length, 1);
  assert.deepEqual(loadPresets('guest', storage), []);
  assert.throws(() => savePreset('guest', 'letterpress', '新预设', letterStyle(letter), { ...storage, setItem: () => { throw new Error('quota'); } }), /quota/);
  assert.deepEqual(loadPresets('guest', storage), []);
  const key = [...map.keys()][0]; storage.setItem(key, '{broken');
  assert.throws(() => loadPresets('guest', storage));
  assert.throws(() => savePreset('guest', 'dialogue', '不要覆盖损坏的库', { layout: 'chat', font: 'sans', density: 'compact' }, storage));
  assert.equal(storage.getItem(key), '{broken');
});

test('dice changes only presentation, respects every lock and yields portable deterministic recipes', () => {
  const letter = { ...createLetter('标题', '不能被改变的台词👨‍👩‍👧‍👦'), signature: '落款', marks: [createMark('blood', .4, .5)] };
  const allLocked = Object.fromEntries(Object.keys(LETTER_LOCKS).map(key => [key, true]));
  assert.deepEqual(rollLetter(letter, 42, allLocked), letter);
  assert.deepEqual(rollLetter(letter, 42), rollLetter(letter, 42));
  for (let seed = 0; seed < 200; seed++) {
    const rolled = rollLetter(letter, seed, { font: true, marks: true });
    assert.equal(rolled.title, letter.title); assert.equal(rolled.text, letter.text); assert.equal(rolled.signature, letter.signature);
    assert.equal(rolled.font, letter.font); assert.deepEqual(rolled.marks, letter.marks);
    assert.deepEqual(parseLetter(JSON.stringify(rolled)), rolled);
    assert.deepEqual(parseLetter(JSON.stringify(rollLetter(letter, seed))), rollLetter(letter, seed));
    assert.equal(rollLetter(letter, seed, { font: true }).material, rollLetter(letter, seed).material);
  }
  const style = { layout: 'chat', font: 'sans', density: 'relaxed' } as const;
  assert.deepEqual(rollDialogue(style, 12, { layout: true, font: true, density: true }), style);
  assert.deepEqual(rollDialogue(style, 12), rollDialogue(style, 12));
});
