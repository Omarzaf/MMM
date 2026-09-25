import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../tools/lib/csv.mjs';

test('parses headers, quoted commas, escaped quotes, and embedded newlines', () => {
  const rows = parseCsv('id,title,note\nS1,"A, B","said ""yes"""\nS2,C,"line one\nline two"\n');
  assert.deepEqual(rows, [
    { id: 'S1', title: 'A, B', note: 'said "yes"' },
    { id: 'S2', title: 'C', note: 'line one\nline two' },
  ]);
});

test('rejects rows with a different field count', () => {
  assert.throws(() => parseCsv('id,title\nS1\n'), /row 2 has 1 fields; expected 2/);
});
