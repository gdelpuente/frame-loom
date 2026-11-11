const integer = (n, name, min = 0) => {
  if (!Number.isInteger(n) || n < min) throw Error(`${name}: valore intero non valido`);
  return n;
};
export function makeGrid(image, grid) {
  const { rows, cols, marginX, marginY, gapX, gapY } = grid;
  integer(rows, 'Righe', 1); integer(cols, 'Colonne', 1);
  for (const [k, v] of Object.entries({ marginX, marginY, gapX, gapY })) integer(v, k);
  if (rows * cols > 1024) throw Error('Massimo 1024 fotogrammi');
  const availableW = image.width - 2 * marginX - (cols - 1) * gapX;
  const availableH = image.height - 2 * marginY - (rows - 1) * gapY;
  if (availableW <= 0 || availableH <= 0 || availableW % cols || availableH % rows) throw Error('Griglia non divisibile esattamente: controlla margini e spaziatura');
  const w = availableW / cols, h = availableH / rows;
  return Array.from({ length: rows * cols }, (_, i) => ({
    rect: { x: marginX + (i % cols) * (w + gapX), y: marginY + Math.floor(i / cols) * (h + gapY), w, h },
    anchor: null, dx: 0, dy: 0, group: '1'
  }));
}
export function bounds(image, rect, threshold = 1) {
  let minX = rect.w, minY = rect.h, maxX = -1, maxY = -1;
  for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) {
    if (image.data[((rect.y + y) * image.width + rect.x + x) * 4 + 3] >= threshold) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
export function align(image, frames, options) {
  const { mode, axis, reference, threshold, cols } = options;
  if (!['none', 'center', 'bottom', 'match'].includes(mode) || !['both', 'x'].includes(axis)) throw Error('Modalità di allineamento non valida');
  integer(threshold, 'Soglia alpha', 1);
  if (threshold > 255) throw Error('Soglia alpha massima: 255');
  integer(cols, 'Colonne output', 1);
  if (!frames.length || frames.length > 1024) throw Error('Numero di fotogrammi non valido');
  integer(reference, 'Riferimento');
  if (reference >= frames.length) throw Error('Riferimento fuori intervallo');
  const info = frames.map((f, index) => {
    const r = f.rect;
    for (const k of ['x', 'y']) integer(r[k], `Rettangolo ${k}`);
    for (const k of ['w', 'h']) integer(r[k], `Rettangolo ${k}`, 1);
    if (r.x + r.w > image.width || r.y + r.h > image.height) throw Error(`Rettangolo ${index + 1} fuori immagine`);
    if (!Number.isInteger(f.dx) || !Number.isInteger(f.dy)) throw Error('Offset non intero');
    if (typeof f.group !== 'string' || !f.group.trim()) throw Error('Gruppo non valido');
    const box = bounds(image, r, threshold);
    if (f.anchor && (!Number.isInteger(f.anchor.x) || !Number.isInteger(f.anchor.y) || f.anchor.x < 0 || f.anchor.y < 0 || f.anchor.x >= r.w || f.anchor.y >= r.h)) throw Error(`Ancora ${index + 1} fuori rettangolo`);
    const anchor = f.anchor || (box ? { x: box.x + Math.floor((box.w - 1) / 2), y: mode === 'bottom' || mode === 'match' ? box.y + box.h - 1 : box.y + Math.floor((box.h - 1) / 2) } : null);
    return { box, anchor };
  });
  const refs = new Map();
  frames.forEach((f, i) => { if (!refs.has(f.group) && info[i].anchor) refs.set(f.group, i); });
  if (info[reference].anchor) refs.set(frames[reference].group, reference);
  const referenceFeatures = new Map();
  const shifts = frames.map((f, i) => {
    const referenceIndex = refs.get(f.group);
    const target = info[referenceIndex]?.anchor, a = info[i].anchor;
    let automatic = { x: 0, y: 0 };
    if (mode === 'match' && a && target && i !== referenceIndex && !f.anchor && info[referenceIndex].box && info[i].box) {
      if (!referenceFeatures.has(referenceIndex)) referenceFeatures.set(referenceIndex, new Map());
      automatic = matchTranslation(image, frames[referenceIndex].rect, f.rect, axis, threshold, referenceFeatures.get(referenceIndex));
    } else if (mode !== 'none' && a && target && (mode !== 'match' || f.anchor || !info[referenceIndex].box)) {
      automatic = { x: target.x - a.x, y: axis === 'both' ? target.y - a.y : 0 };
    }
    return {
      x: f.dx + automatic.x,
      y: f.dy + automatic.y
    };
  });
  const minX = Math.min(...shifts.map(s => s.x)), minY = Math.min(...shifts.map(s => s.y));
  const maxX = Math.max(...shifts.map((s, i) => s.x + frames[i].rect.w));
  const maxY = Math.max(...shifts.map((s, i) => s.y + frames[i].rect.h));
  const cellWidth = maxX - minX, cellHeight = maxY - minY;
  const outCols = Math.min(cols, frames.length), rows = Math.ceil(frames.length / outCols);
  const width = cellWidth * outCols, height = cellHeight * rows;
  if (width * height > 16777216) throw Error('Output troppo grande (massimo 16 megapixel)');
  const data = new Uint8Array(width * height * 4);
  const metadata = frames.map((f, i) => {
    const x = (i % outCols) * cellWidth + shifts[i].x - minX;
    const y = Math.floor(i / outCols) * cellHeight + shifts[i].y - minY;
    for (let row = 0; row < f.rect.h; row++) {
      const source = ((f.rect.y + row) * image.width + f.rect.x) * 4;
      data.set(image.data.subarray(source, source + f.rect.w * 4), ((y + row) * width + x) * 4);
    }
    return { index: i, source: { ...f.rect }, contentBounds: info[i].box, anchor: info[i].anchor, manualAnchor: f.anchor, group: f.group, correction: { x: f.dx, y: f.dy }, shift: shifts[i], destination: { x, y }, empty: !info[i].box, reference: refs.get(f.group) ?? null };
  });
  return { image: { width, height, data }, metadata: { version: 1, coordinateSystem: 'pixel integers; origin top-left; source and destination absolute; anchor and contentBounds relative to source rectangle; shift relative to source rectangle origin', cellWidth, cellHeight, columns: outCols, rows, frameCount: frames.length, options: { ...options }, frames: metadata } };
}
export function extractCell(result, index) {
  const { image, metadata: m } = result;
  integer(index, 'Fotogramma');
  if (index >= m.frameCount) throw Error('Fotogramma fuori intervallo');
  const data = new Uint8Array(m.cellWidth * m.cellHeight * 4);
  const x = (index % m.columns) * m.cellWidth, y = Math.floor(index / m.columns) * m.cellHeight;
  for (let row = 0; row < m.cellHeight; row++) {
    const start = ((y + row) * image.width + x) * 4;
    data.set(image.data.subarray(start, start + m.cellWidth * 4), row * m.cellWidth * 4);
  }
  return { width: m.cellWidth, height: m.cellHeight, data };
}
import { matchTranslation } from './registration.js';

