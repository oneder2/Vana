import test from 'node:test';
import assert from 'node:assert/strict';
import { createLetter, createMark, documentToLetterText, markLabel, MATERIALS, parseLetter, seededRandom, MAX_MARKS } from '../src/lib/letterpress/model';
import { wrapLetterText } from '../src/lib/letterpress/render';

test('letter extraction preserves paragraph, list and hard-break boundaries without HTML', () => {
  const text = documentToLetterText({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '<雨夜>' }, { type: 'hardBreak' }, { type: 'text', text: '来信' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第一句' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二句' }] }] },
    ] },
  ] });
  assert.equal(text, '<雨夜>\n来信\n第一句\n第二句');
});

test('portable letter roundtrip preserves composition across every material', () => {
  for (const material of Object.keys(MATERIALS)) {
    const d = { ...createLetter('未寄出的信', '末班车已经离开。\n我们明天再见。'), material,
      marks: (['blood', 'burn', 'tear', 'stain'] as const).map(k => createMark(k, .4, .6)) };
    assert.deepEqual(parseLetter(JSON.stringify(d)), d);
  }
  assert.equal(markLabel('tear', 'letter'), '撕裂');
  assert.equal(markLabel('tear', 'stone'), '崩裂');
  assert.equal(markLabel('tear', 'terminal'), '碎屏');
});

test('untrusted recipes reject invalid dimensions, scripts, excessive effects and duplicate ids', () => {
  const good = createLetter('标题', '正文');
  for (const change of [{ version: 2 }, { font: 'url(https://example.com)' }, { material: '__proto__' }, { format: 'giant' },
    { fontSize: 1000000 }, { inset: -1 }, { seed: .3 }, { text: 'a'.repeat(12001) }, { lineHeight: '2' }]) {
    assert.throws(() => parseLetter(JSON.stringify({ ...good, ...change })));
  }
  const mark = createMark('blood', .3, .5);
  for (const change of [{ x: 2 }, { kind: 'script' }, { pattern: 'external-image' }, { seed: -1 }, { strength: 0 }]) {
    assert.throws(() => parseLetter(JSON.stringify({ ...good, marks: [{ ...mark, ...change }] })));
  }
  assert.throws(() => parseLetter(JSON.stringify({ ...good, marks: [mark, mark] })));
  assert.throws(() => parseLetter(JSON.stringify({ ...good, marks: Array(MAX_MARKS + 1).fill(mark) })));
  assert.throws(() => parseLetter('['));
  assert.throws(() => parseLetter(' '.repeat(100001)));
});

test('randomized marks and material grain remain reproducible after export and reopening', () => {
  const a = seededRandom(123), b = seededRandom(123), other = seededRandom(124);
  const expected = Array.from({ length: 100 }, a);
  assert.deepEqual(Array.from({ length: 100 }, b), expected);
  assert.notDeepEqual(Array.from({ length: 100 }, other), expected);
  assert.ok(expected.every(value => value >= 0 && value < 1));
});

test('text wrapping retains blank lines, CJK and complete emoji graphemes', () => {
  const measure = (s: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].length;
  assert.deepEqual(wrapLetterText('一二三四\n\n五六', 2, measure), ['一二', '三四', '', '五六']);
  assert.deepEqual(wrapLetterText('ab👨‍👩‍👧‍👦cd', 2, measure), ['ab', '👨‍👩‍👧‍👦', 'cd']);
  assert.equal(wrapLetterText('superlongword', 4, measure).join(''), 'superlongword');
  assert.deepEqual(wrapLetterText('中文\r\nEnglish', 20, measure), ['中文', 'English']);
});

import { readFileSync } from 'node:fs';
import { markPosition } from '../src/lib/letterpress/gesture';
import { letterNode, readLetter, letterText } from '../src/lib/letterpress/document';
import { letterMarkdown } from '../src/lib/letterpress/exportDocument';
import { compareDocumentBodies } from '../src/lib/documentDiff';

test('embedded recipes preserve editable composition, searchable text and Markdown across history changes', () => {
  const design = parseLetter(readFileSync(new URL('./fixtures/letterpress-v1.json', import.meta.url), 'utf8'));
  const node = letterNode(design, 'letter-qa');
  assert.deepEqual(readLetter(JSON.parse(JSON.stringify(node))), design);
  assert.equal(documentToLetterText(node), letterText(design));
  const markdown = letterMarkdown(node);
  assert.deepEqual(parseLetter(markdown.split('\n')[1]), design);
  const before = { type: 'doc', content: [node] };
  const changed = { type: 'doc', content: [letterNode({ ...design, material: 'stone' }, 'letter-qa')] };
  assert.equal(compareDocumentBodies(JSON.stringify(before), JSON.stringify(changed)).formattingOnly, true);
  const textChanged = { type: 'doc', content: [letterNode({ ...design, text: '明天见。' }, 'letter-qa')] };
  assert.equal(compareDocumentBodies(JSON.stringify(before), JSON.stringify(textChanged)).formattingOnly, false);
});

test('painting coordinates stay valid over damage and clamp releases outside the artboard', () => {
  const rect = { left: 10, top: 20, width: 200, height: 400 };
  assert.deepEqual(markPosition(110, 220, rect), { x: .5, y: .5 });
  assert.deepEqual(markPosition(-20, 700, rect), { x: 0, y: 1 });
  assert.deepEqual(markPosition(400, -20, rect), { x: 1, y: 0 });
  assert.equal(markPosition(NaN, 20, rect), null);
  assert.equal(markPosition(20, 20, { ...rect, width: 0 }), null);
});
