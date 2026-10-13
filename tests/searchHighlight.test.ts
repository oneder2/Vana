import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLiteralMatches } from '../src/lib/searchHighlight';

test('search treats regex operators and SQL wildcards as literal text', () => {
  for (const query of ['[', '(', '.*', 'a+b', '$', '\\', '%', '_', '<script>', '中文']) {
    assert.deepEqual(splitLiteralMatches(`before ${query} after`, query), ['before ', query, ' after']);
  }
  assert.deepEqual(splitLiteralMatches('Alpha ALPHA', 'alpha'), ['', 'Alpha', ' ', 'ALPHA', '']);
  assert.deepEqual(splitLiteralMatches('abc', ''), ['abc']);
});
