import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePNG } from '../src/png.js';
import { makeGrid, align, extractCell } from '../src/core.js';

const grid = { rows: 1, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
const options = { mode: 'match', axis: 'both', reference: 0, threshold: 1, cols: 3 };
function translatedFixture() {
  const image = { width: 144, height: 48, data: new Uint8Array(144 * 48 * 4) };
  function put(frame, x, y, rgba) { image.data.set(rgba, (y * image.width + frame * 48 + x) * 4); }
  for (let y = 12; y < 32; y++) for (let x = 10; x < 30; x++) {
    const color = [(x * 47 + y * 31) % 256, (x * 13 + y * 19) % 256, (x * 29 + y * 7) % 256, 255];
    put(0, x, y, color); put(1, x + 5, y - 4, color);
  }
  put(1, 46, 46, [255, 40, 30, 2]);
  return { image, frames: makeGrid(image, grid) };
}
test('visual matching recovers known translation despite a low-alpha outlier', () => {
  const { image, frames } = translatedFixture();
  const result = align(image, frames, options);
  assert.deepEqual(result.metadata.frames.map(f => f.shift), [{ x: 0, y: 0 }, { x: -5, y: 4 }, { x: 0, y: 0 }]);
  assert.equal(result.metadata.frames[2].empty, true);
  assert.deepEqual(result, align(image, frames, options));
});
test('visual matching respects axis restriction, manual anchors, offsets and groups', () => {
  const { image, frames } = translatedFixture();
  let result = align(image, frames, { ...options, axis: 'x' });
  assert.deepEqual(result.metadata.frames[1].shift, { x: -5, y: 0 });
  frames[0].anchor = { x: 15, y: 20 };
  frames[1].anchor = { x: 18, y: 16 };
  frames[1].dx = 1; frames[1].dy = -1;
  result = align(image, frames, options);
  assert.deepEqual(result.metadata.frames[1].shift, { x: -2, y: 3 });
  frames[1].anchor = null; frames[1].group = 'other';
  result = align(image, frames, options);
  assert.deepEqual(result.metadata.frames[1].shift, { x: 1, y: -1 });
  assert.equal(result.metadata.frames[1].reference, 1);
});
function mismatch(result, cycle = false) {
  const cells = result.metadata.frames.map((_, i) => extractCell(result, i).data);
  let total = 0;
  for (let frame = cycle ? 0 : 1; frame < cells.length; frame++) {
    const reference = cycle ? cells[frame] : cells[0];
    const data = cycle ? cells[(frame + 1) % cells.length] : cells[frame];
    for (let i = 0; i < reference.length; i += 4) {
      const a = reference[i + 3], b = data[i + 3];
      total += Math.abs(a - b) * 255;
      for (let c = 0; c < 3; c++) total += Math.abs(reference[i + c] * a - data[i + c] * b);
    }
  }
  return total;
}
test('real choir fixture reduces RGB/alpha mismatch and preserves all source pixels', () => {
  const image = decodePNG(readFileSync('fixtures/coro-alpino.png'));
  const frames = makeGrid(image, { ...grid, rows: 2, cols: 2 });
  const opts = { ...options, cols: 2 };
  const baseline = align(image, frames, { ...opts, mode: 'bottom' });
  const result = align(image, frames, opts);
  assert.ok(mismatch(result) < mismatch(baseline) * 0.4);
  assert.ok(mismatch(result, true) < mismatch(baseline, true) * 0.4);
  assert.deepEqual(result.metadata.frames.map(f => f.shift), [{ x: 0, y: 0 }, { x: 22, y: 1 }, { x: 0, y: -7 }, { x: 21, y: -7 }]);
  assert.deepEqual(decodePNG(readFileSync('output/coro-alpino-allineato.png')), result.image);
  assert.deepEqual(JSON.parse(readFileSync('output/coro-alpino-metadati.json', 'utf8')), result.metadata);
  for (const f of result.metadata.frames) for (let y = 0; y < f.source.h; y++) {
    const src = ((f.source.y + y) * image.width + f.source.x) * 4;
    const dst = ((f.destination.y + y) * result.image.width + f.destination.x) * 4;
    assert.deepEqual(result.image.data.subarray(dst, dst + f.source.w * 4), image.data.subarray(src, src + f.source.w * 4));
  }
});
test('empty manual reference uses anchors rather than matching against a blank image', () => {
  const { image, frames } = translatedFixture();
  frames[2].anchor = { x: 10, y: 10 };
  const result = align(image, frames, { ...options, reference: 2 });
  assert.equal(result.metadata.frames[0].shift.x, 10 - result.metadata.frames[0].anchor.x);
  assert.equal(result.metadata.frames[0].shift.y, 10 - result.metadata.frames[0].anchor.y);
});
