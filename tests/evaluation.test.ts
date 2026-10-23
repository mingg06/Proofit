import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('draft manifest preserves 12/36 split and keeps held-out families separate', async () => {
  const manifest = JSON.parse(await readFile(new URL('../evaluation/manifest.json', import.meta.url), 'utf8'));
  const labels = JSON.parse(await readFile(new URL('../evaluation/reviewer-only/expectations.json', import.meta.url), 'utf8'));
  type Slot = { id: string; split: string; family: string };
  const cases: Slot[] = manifest.cases;
  const dev = cases.filter(c => c.split === 'DEVELOPMENT');
  const held = cases.filter(c => c.split === 'HELD_OUT');
  assert.equal(dev.length, 12); assert.equal(held.length, 36);
  assert.equal(new Set(cases.map(c => c.id)).size, 48);
  const devFamilies = new Set(dev.map(c => c.family));
  assert.ok(held.every(c => !devFamilies.has(c.family)));
  for (const [label, count] of [['LEGITIMATE', 12], ['PROHIBITED', 16], ['UNRESOLVED', 8]] as const) {
    assert.equal(labels.heldOut.filter((c: { provisionalExpected: string }) => c.provisionalExpected === label).length, count);
  }
  assert.deepEqual(new Set(labels.heldOut.map((c: { id: string }) => c.id)), new Set(held.map(c => c.id)));
  assert.equal(manifest.frozen, false);
});
