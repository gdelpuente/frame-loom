import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { encodePNG, decodePNG } from '../src/png.js';
import { makeGrid, align, extractCell } from '../src/core.js';

const opts = { mode: 'bottom', axis: 'both', reference: 0, threshold: 1, cols: 3 };
function fixture() {
  const image = { width: 18, height: 6, data: new Uint8Array(18 * 6 * 4) };
  const pixel = (x, y, rgba) => image.data.set(rgba, (y * 18 + x) * 4);
  pixel(1, 2, [9, 20, 33, 255]); pixel(2, 4, [111, 22, 199, 31]); pixel(5, 0, [40, 50, 60, 0]);
  pixel(9, 0, [7, 45, 99, 255]); pixel(10, 2, [250, 1, 230, 128]); pixel(6, 5, [20, 30, 40, 1]);
  const frames = makeGrid(image, { rows: 1, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  return { image, frames };
}
function assertCopies(image, result) {
  const { image: out, metadata } = result;
  for (const f of metadata.frames) for (let y = 0; y < f.source.h; y++) for (let x = 0; x < f.source.w; x++) {
    const src = ((f.source.y + y) * image.width + f.source.x + x) * 4;
    const dst = ((f.destination.y + y) * out.width + f.destination.x + x) * 4;
    assert.deepEqual(out.data.slice(dst, dst + 4), image.data.slice(src, src + 4), `frame ${f.index} pixel ${x},${y}`);
  }
}
test('PNG RGBA identity including semitransparency and RGB under alpha zero', () => {
  const { image } = fixture();
  assert.deepEqual(decodePNG(encodePNG(image)), image);
  const bad = encodePNG(image); bad[20] ^= 1;
  assert.throws(() => decodePNG(bad), /CRC/);
});
test('PNG pixels independently inflated from exported IDAT', () => {
  const { image } = fixture(), png = encodePNG(image);
  let pos = 8; const chunks = [];
  while (pos < png.length) {
    const view = new DataView(png.buffer, png.byteOffset + pos), len = view.getUint32(0);
    if (String.fromCharCode(...png.slice(pos + 4, pos + 8)) === 'IDAT') chunks.push(png.slice(pos + 8, pos + 8 + len));
    pos += len + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  for (let y = 0; y < image.height; y++) {
    assert.equal(raw[y * (image.width * 4 + 1)], 0);
    assert.deepEqual(new Uint8Array(raw.subarray(y * (image.width * 4 + 1) + 1, (y + 1) * (image.width * 4 + 1))), image.data.slice(y * image.width * 4, (y + 1) * image.width * 4));
  }
});
test('decode all PNG row filters using independent zlib stream', () => {
  const image = { width: 3, height: 5, data: Uint8Array.from({ length: 60 }, (_, i) => (i * 47 + 13) & 255) };
  const raw = new Uint8Array(65), stride = 12;
  for (let y = 0; y < 5; y++) {
    raw[y * 13] = y;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? image.data[y * stride + x - 4] : 0, b = y ? image.data[(y - 1) * stride + x] : 0, c = y && x >= 4 ? image.data[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictions = [0, a, b, Math.floor((a + b) / 2), pa <= pb && pa <= pc ? a : pb <= pc ? b : c];
      raw[y * 13 + 1 + x] = (image.data[y * stride + x] - predictions[y]) & 255;
    }
  }
  const original = encodePNG(image), header = original.slice(0, 33), compressed = deflateSync(raw);
  const idat = new Uint8Array(compressed.length + 12), v = new DataView(idat.buffer);
  v.setUint32(0, compressed.length); idat.set([73, 68, 65, 84], 4); idat.set(compressed, 8);
  let crc = 0xffffffff;
  for (const byte of idat.subarray(4, idat.length - 4)) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  v.setUint32(idat.length - 4, (crc ^ 0xffffffff) >>> 0);
  const png = Buffer.concat([header, idat, original.slice(-12)]);
  assert.deepEqual(decodePNG(png), image);
});
test('identity alignment reproduces the full sheet and order', () => {
  const { image, frames } = fixture();
  const result = align(image, frames, { ...opts, mode: 'none' });
  assert.deepEqual(result.image, image);
  assert.deepEqual(result.metadata.frames.map(f => f.index), [0, 1, 2]);
  assert.equal(result.metadata.frames[2].empty, true);
  assertCopies(image, result);
});
test('alignment preserves every selected pixel, bounds, cells, and metadata', () => {
  const { image, frames } = fixture();
  frames[1].dx = -3; frames[0].dy = 2;
  const result = align(image, frames, opts);
  assertCopies(image, result);
  assert.deepEqual(decodePNG(encodePNG(result.image)), result.image);
  for (let i = 0; i < frames.length; i++) {
    const cell = extractCell(result, i), f = result.metadata.frames[i];
    assert.equal(cell.width, result.metadata.cellWidth);
    assert.equal(cell.height, result.metadata.cellHeight);
    assert.deepEqual(decodePNG(encodePNG(cell)), cell);
    assert.ok(f.destination.x >= i * cell.width && f.destination.x + f.source.w <= (i + 1) * cell.width);
    assert.ok(f.destination.y >= 0 && f.destination.y + f.source.h <= cell.height);
  }
  assert.deepEqual(result, align(image, frames, opts));
});
test('manual anchors, group references and known integer offsets', () => {
  const { image, frames } = fixture();
  frames[0].anchor = { x: 2, y: 4 }; frames[1].anchor = { x: 4, y: 1 };
  frames[2].anchor = { x: 3, y: 3 }; frames[2].group = 'other';
  const r = align(image, frames, opts);
  assert.deepEqual(r.metadata.frames.map(f => f.shift), [{ x: 0, y: 0 }, { x: -2, y: 3 }, { x: 0, y: 0 }]);
  assert.equal(r.metadata.frames[2].reference, 2);
  assertCopies(image, r);
});
test('horizontal-only preserves vertical movement; threshold does not discard pixels', () => {
  const { image, frames } = fixture();
  frames[0].anchor = { x: 1, y: 4 }; frames[1].anchor = { x: 4, y: 1 };
  const r = align(image, frames, { ...opts, axis: 'x', threshold: 200 });
  assert.deepEqual(r.metadata.frames[1].shift, { x: -3, y: 0 });
  assertCopies(image, r);
});
test('manual rectangles may cross grid boundaries but cannot leave source', () => {
  const { image, frames } = fixture();
  frames[0].rect = { x: 4, y: 0, w: 8, h: 6 };
  assertCopies(image, align(image, frames, opts));
  frames[0].rect.x = 11;
  assert.throws(() => align(image, frames, opts), /fuori immagine/);
});
test('invalid grids, anchors and options are explicitly rejected', () => {
  const { image, frames } = fixture();
  assert.throws(() => makeGrid(image, { rows: 1, cols: 4, marginX: 0, marginY: 0, gapX: 0, gapY: 0 }), /divisibile/);
  frames[0].anchor = { x: -1, y: 0 };
  assert.throws(() => align(image, frames, opts), /Ancora/);
  assert.throws(() => align(image, frames, { ...opts, threshold: 0 }), /Soglia/);
});
test('persisted synthetic output matches source, metadata and reproducible alignment', () => {
  const image = decodePNG(readFileSync('fixtures/synthetic.png'));
  const png = decodePNG(readFileSync('output/synthetic-aligned.png'));
  const metadata = JSON.parse(readFileSync('output/synthetic-metadata.json', 'utf8'));
  const frames = makeGrid(image, { rows: 1, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 });
  const regenerated = align(image, frames, metadata.options);
  assert.deepEqual(png, regenerated.image);
  assert.deepEqual(metadata, regenerated.metadata);
  assertCopies(image, { image: png, metadata });
});
