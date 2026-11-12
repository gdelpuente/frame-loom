import { zipSync, strToU8 } from 'fflate';
import { decodePNG, encodePNG } from './png.js';
import { makeGrid, align, extractCell } from './core.js';
import './style.css';

document.querySelector('#app').innerHTML = `
<header><div><h1>Frame Loom</h1><p>Allineamento senza trasformare i pixel · tutto in locale</p></div><label class="upload">Apri PNG<input id="file" type="file" accept=".png,image/png"></label><label class="upload">Apri batch<input id="batchFiles" type="file" accept=".png,image/png" multiple></label><label class="upload">Apri cartella<input id="batchFolder" type="file" accept=".png,image/png" webkitdirectory multiple></label><label class="upload secondary">Apri progetto<input id="project" type="file" accept=".json,application/json"></label></header>
<main>
<section class="panel drop" id="drop"><strong>Trascina qui uno sprite sheet PNG</strong><span>RGBA 8 bit, non interlacciato e senza profili colore incorporati.</span><p id="status" role="status">Nessuna immagine caricata.</p></section>
<div class="workspace">
<aside>
<section class="panel"><h2>1. Griglia sorgente</h2><div class="fields">
<label>Righe<input id="rows" type="number" min="1" value="1"></label><label>Colonne<input id="cols" type="number" min="1" value="1"></label>
<label>Margine X<input id="marginX" type="number" min="0" value="0"></label><label>Margine Y<input id="marginY" type="number" min="0" value="0"></label>
<label>Spazio X<input id="gapX" type="number" min="0" value="0"></label><label>Spazio Y<input id="gapY" type="number" min="0" value="0"></label></div>
<button id="grid">Applica griglia</button><small>Ricrea i fotogrammi e cancella le correzioni manuali.</small></section>
<section class="panel"><h2>2. Allineamento</h2><label>Metodo<select id="mode"><option value="match">Stabilizzazione visiva (confronto col riferimento)</option><option value="bottom">Centro inferiore</option><option value="center">Centro</option><option value="none">Nessuno</option></select></label>
<label>Assi<select id="axis"><option value="both">Orizzontale e verticale</option><option value="x">Solo orizzontale (salti)</option></select></label>
<div class="fields"><label>Riferimento (1-based)<input id="reference" type="number" min="1" value="1"></label><label>Soglia alpha<input id="threshold" type="number" min="1" max="255" value="1"></label><label>Colonne output<input id="outCols" type="number" min="1" value="1"></label></div>
<small>La soglia influenza il rilevamento, mai i pixel esportati. Nella stabilizzazione visiva un'ancora manuale sostituisce il confronto per quel fotogramma. Ogni gruppo usa il riferimento scelto se ne fa parte, altrimenti il primo fotogramma con ancora.</small><button id="reset" class="secondary">Ripristina allineamento</button></section>
<section class="panel" id="editor"><h2>3. Fotogramma <span id="currentLabel">—</span></h2>
<label>Gruppo<input id="group" value="1"></label><h3>Rettangolo sorgente</h3><div class="fields">
<label>X<input id="rx" type="number" min="0"></label><label>Y<input id="ry" type="number" min="0"></label><label>Larghezza<input id="rw" type="number" min="1"></label><label>Altezza<input id="rh" type="number" min="1"></label></div>
<h3>Ancora relativa al rettangolo</h3><label class="check"><input id="manual" type="checkbox"> Usa ancora manuale</label><div class="fields"><label>X<input id="ax" type="number" min="0"></label><label>Y<input id="ay" type="number" min="0"></label><label>Offset X<input id="dx" type="number" step="1"></label><label>Offset Y<input id="dy" type="number" step="1"></label></div>
<small>Coordinate intere. Rettangoli sovrapposti sono ammessi; non ricostruiscono contenuti mancanti.</small></section>
<section class="panel"><h2>4. Esporta</h2><div class="buttons"><button id="sheet">Sprite sheet PNG</button><button id="frames">Fotogrammi ZIP</button><button id="json">Metadati JSON</button><button id="save">Progetto JSON</button><button id="batch" class="batch-button" disabled>Elabora batch selezionato</button></div><small>Il batch applica griglia e opzioni correnti a ogni PNG e scarica un unico ZIP con sheet, fotogrammi e metadati per immagine. I download non modificano gli originali.</small></section>
</aside>
<div class="content">
<section class="panel"><div class="section-title"><h2>Confronto sheet</h2><div class="zoom-controls"><label class="check"><input id="fit" type="checkbox" checked> Adatta alle viste</label><label>Zoom manuale <input id="zoom" type="range" min="10" max="800" step="10" value="100"> <span id="zoomValue">100%</span></label></div></div><p>Ogni coppia usa la stessa scala. Zoom solo visivo, senza smoothing; verde: rettangolo selezionato, azzurro: altri rettangoli, giallo: contenuto, rosso: ancora.</p><p>Clicca un rettangolo per selezionarlo; trascina un bordo o una maniglia per ridimensionarlo. Puoi continuare a usare i campi numerici. Il ridimensionamento modifica solo il fotogramma selezionato.</p><p id="fitScales"></p><div class="compare"><div><h3>Originale</h3><div class="viewport checker source-viewport"><div class="source-stage"><canvas id="source"></canvas><canvas id="sourceOverlay" aria-label="Riquadri sorgente interattivi"></canvas></div></div></div><div><h3>Allineato</h3><div class="viewport checker"><canvas id="output"></canvas></div></div></div></section>
<section class="panel"><div class="section-title"><h2>Anteprima animata</h2><div class="controls"><button id="play">Pausa</button><button id="prev">◀</button><button id="next">▶</button><label>FPS <input id="fps" type="number" min="1" max="60" value="6"></label></div></div><div class="compare"><div><h3>Prima</h3><div class="viewport checker preview"><canvas id="before"></canvas></div></div><div><h3>Dopo</h3><div class="viewport checker preview"><canvas id="after"></canvas></div></div></div><p id="details"></p></section>
<section class="panel"><h2>Fotogrammi in ordine</h2><div id="thumbnails" class="thumbnails"></div></section>
</div></div></main>`;

const $ = id => document.getElementById(id);
let image = null, sourceBytes = null, frames = [], result = null, current = 0, playing = true, last = 0, appliedGrid = null, drag = null;
const gridKeys = ['rows', 'cols', 'marginX', 'marginY', 'gapX', 'gapY'];
const number = id => $(id).value === '' ? NaN : Number($(id).value);
const gridValues = () => Object.fromEntries(gridKeys.map(k => [k, number(k)]));
const options = () => ({ mode: $('mode').value, axis: $('axis').value, reference: number('reference') - 1, threshold: number('threshold'), cols: number('outCols') });
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const download = (name, bytes, type) => {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
const jsonBytes = value => new TextEncoder().encode(JSON.stringify(value, null, 2));
function display(canvas, img) {
  canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
}
function scaleViews() {
  if (!image || !result) return;
  const scales = [];
  for (const ids of [['source', 'output'], ['before', 'after']]) {
    const canvases = ids.map($);
    const zoom = $('fit').checked
      ? Math.min(4, ...canvases.flatMap(canvas => [(canvas.parentElement.clientWidth - 2) / canvas.width, (canvas.parentElement.clientHeight - 2) / canvas.height]))
      : number('zoom') / 100;
    for (const canvas of canvases) {
      canvas.style.width = `${canvas.width * zoom}px`; canvas.style.height = `${canvas.height * zoom}px`;
    }
    scales.push(Math.round(zoom * 100));
  }
  const overlay = $('sourceOverlay'), source = $('source');
  overlay.style.width = source.style.width; overlay.style.height = source.style.height;
  $('fitScales').textContent = `Scala visuale: sheet ${scales[0]}% · animazione ${scales[1]}%`;
}
function drawOutline() {
  const c = $('sourceOverlay'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  if (!result) return;
  const scale = c.getBoundingClientRect().width / c.width || 1;
  const line = Math.max(1 / scale, 0.5);
  for (let i = 0; i < frames.length; i++) {
    if (i === current) continue;
    const r = frames[i].rect;
    ctx.strokeStyle = '#71b3d4'; ctx.lineWidth = line;
    ctx.strokeRect(r.x + line / 2, r.y + line / 2, Math.max(0, r.w - line), Math.max(0, r.h - line));
  }
  const f = frames[current], info = result.metadata.frames[current];
  if (!f) return;
  const r = f.rect;
  ctx.lineWidth = line * 2; ctx.strokeStyle = '#24e294';
  ctx.strokeRect(r.x + line, r.y + line, Math.max(0, r.w - line * 2), Math.max(0, r.h - line * 2));
  if (!drag && info.contentBounds) {
    const b = info.contentBounds; ctx.lineWidth = line; ctx.strokeStyle = '#ffd25b';
    ctx.strokeRect(r.x + b.x + line / 2, r.y + b.y + line / 2, Math.max(0, b.w - line), Math.max(0, b.h - line));
  }
  if (!drag && info.anchor) {
    const size = Math.max(3, 6 / scale);
    ctx.fillStyle = '#ff4b66'; ctx.fillRect(r.x + info.anchor.x - size / 2, r.y + info.anchor.y - size / 2, size, size);
  }
  const handle = Math.max(5, 8 / scale), half = handle / 2;
  ctx.fillStyle = '#10271f'; ctx.strokeStyle = '#24e294'; ctx.lineWidth = line;
  for (const [x, y] of handlePoints(r)) {
    ctx.fillRect(x - half, y - half, handle, handle);
    ctx.strokeRect(x - half, y - half, handle, handle);
  }
}
function handlePoints(r) {
  const x2 = r.x + r.w, y2 = r.y + r.h, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  return [[r.x, r.y], [cx, r.y], [x2, r.y], [x2, cy], [x2, y2], [cx, y2], [r.x, y2], [r.x, cy]];
}
function canvasPoint(event) {
  const canvas = $('sourceOverlay'), bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height
  };
}
function edgesAt(rect, x, y, tolerance) {
  if (x < rect.x - tolerance || x > rect.x + rect.w + tolerance || y < rect.y - tolerance || y > rect.y + rect.h + tolerance) return null;
  const horizontalTolerance = Math.min(tolerance, rect.w * 0.4);
  const verticalTolerance = Math.min(tolerance, rect.h * 0.4);
  const edges = [];
  if (Math.abs(x - rect.x) <= horizontalTolerance) edges.push('left');
  if (Math.abs(x - (rect.x + rect.w)) <= horizontalTolerance) edges.push('right');
  if (Math.abs(y - rect.y) <= verticalTolerance) edges.push('top');
  if (Math.abs(y - (rect.y + rect.h)) <= verticalTolerance) edges.push('bottom');
  return edges.length ? edges : null;
}
function hitAt(x, y) {
  const canvas = $('sourceOverlay'), tolerance = 9 * canvas.width / canvas.getBoundingClientRect().width;
  const order = [current, ...frames.map((_, i) => i).filter(i => i !== current)];
  for (const index of order) {
    const edges = edgesAt(frames[index].rect, x, y, tolerance);
    if (edges) return { index, edges };
  }
  for (const index of order) {
    const r = frames[index].rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { index, edges: null };
  }
  return null;
}
function resizeRect(rect, edges, x, y) {
  const r = { ...rect };
  if (edges.includes('left')) { const right = rect.x + rect.w; r.x = Math.max(0, Math.min(right - 1, Math.round(x))); r.w = right - r.x; }
  if (edges.includes('right')) r.w = Math.max(1, Math.min(image.width - r.x, Math.round(x) - r.x));
  if (edges.includes('top')) { const bottom = rect.y + rect.h; r.y = Math.max(0, Math.min(bottom - 1, Math.round(y))); r.h = bottom - r.y; }
  if (edges.includes('bottom')) r.h = Math.max(1, Math.min(image.height - r.y, Math.round(y) - r.y));
  return r;
}
function cursorFor(edges) {
  if (!edges) return 'pointer';
  const horizontal = edges.includes('left') || edges.includes('right');
  const vertical = edges.includes('top') || edges.includes('bottom');
  if (horizontal && vertical) return edges.includes('left') === edges.includes('top') ? 'nwse-resize' : 'nesw-resize';
  return horizontal ? 'ew-resize' : 'ns-resize';
}
function frameImage(f) {
  const m = result.metadata, data = new Uint8Array(m.cellWidth * m.cellHeight * 4);
  for (let y = 0; y < f.rect.h; y++) {
    const start = ((f.rect.y + y) * image.width + f.rect.x) * 4;
    data.set(image.data.subarray(start, start + f.rect.w * 4), y * m.cellWidth * 4);
  }
  return { width: m.cellWidth, height: m.cellHeight, data };
}
function updateSelection() {
  if (!result) return;
  const f = frames[current], meta = result.metadata.frames[current];
  $('currentLabel').textContent = `${current + 1} / ${frames.length}${meta.empty ? ' · vuoto alla soglia' : ''}`;
  for (const [id, value] of Object.entries({ rx: f.rect.x, ry: f.rect.y, rw: f.rect.w, rh: f.rect.h, ax: f.anchor?.x ?? meta.anchor?.x ?? 0, ay: f.anchor?.y ?? meta.anchor?.y ?? 0, dx: f.dx, dy: f.dy, group: f.group })) $(id).value = value;
  $('manual').checked = !!f.anchor;
  $('ax').disabled = $('ay').disabled = !f.anchor;
  $('details').textContent = `Fotogramma ${current + 1} · gruppo ${f.group} · offset complessivo (${meta.shift.x}, ${meta.shift.y}) · cella ${result.metadata.cellWidth} × ${result.metadata.cellHeight} px${meta.empty ? ' · nessun pixel sopra soglia' : ''}`;
  display($('source'), image);
  const overlay = $('sourceOverlay');
  if (overlay.width !== image.width || overlay.height !== image.height) { overlay.width = image.width; overlay.height = image.height; }
  display($('before'), frameImage(f)); display($('after'), extractCell(result, current));
  scaleViews();
  drawOutline();
  document.querySelectorAll('.thumb').forEach((el, i) => el.classList.toggle('selected', i === current));
}
function thumbnails() {
  const container = $('thumbnails'); container.replaceChildren();
  frames.forEach((f, i) => {
    const button = document.createElement('button'); button.className = 'thumb'; button.title = `Seleziona fotogramma ${i + 1}`;
    const canvas = document.createElement('canvas'), cell = extractCell(result, i);
    canvas.width = cell.width; canvas.height = cell.height;
    canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(cell.data), cell.width, cell.height), 0, 0);
    const caption = document.createElement('span'); caption.textContent = `${i + 1}${result.metadata.frames[i].empty ? ' · vuoto' : ''}`;
    button.append(canvas, caption); button.onclick = () => { playing = false; $('play').textContent = 'Riproduci'; current = i; updateSelection(); };
    container.append(button);
  });
}
function refresh() {
  if (!image) return;
  try {
    result = align(image, frames, options());
    for (const id of ['sheet', 'frames', 'json', 'save']) $(id).disabled = false;
    display($('output'), result.image); thumbnails(); updateSelection();
    const opaque = image.data.every((v, i) => i % 4 !== 3 || v === 255);
    status(`${image.width} × ${image.height} px · ${frames.length} fotogrammi · output ${result.image.width} × ${result.image.height} px${opaque ? ' · Immagine completamente opaca: i limiti alpha coincidono con i rettangoli; usa rettangoli e ancore manuali.' : ''}`);
  } catch (error) {
    result = null; for (const id of ['sheet', 'frames', 'json', 'save']) $(id).disabled = true;
    $('sourceOverlay').getContext('2d').clearRect(0, 0, $('sourceOverlay').width, $('sourceOverlay').height);
    status(error.message, true);
  }
}
function loadImage(bytes) {
  const decoded = decodePNG(bytes);
  image = decoded; sourceBytes = bytes; current = 0;
  for (const k of gridKeys) $(k).value = k === 'rows' || k === 'cols' ? 1 : 0;
  $('reference').value = 1; $('outCols').value = 1;
  appliedGrid = gridValues(); frames = makeGrid(image, appliedGrid); refresh();
}
async function openFile(file, project = false) {
  if (!file) return;
  try {
    if (!project) loadImage(new Uint8Array(await file.arrayBuffer()));
    else {
      const p = JSON.parse(await file.text());
      if (p.format !== 'frame-loom-project' || p.version !== 1 || typeof p.sourcePNG !== 'string' || !Array.isArray(p.frames) || !p.grid || !p.options) throw Error('Progetto non valido o versione non supportata');
      const bytes = Uint8Array.from(atob(p.sourcePNG), c => c.charCodeAt(0)), img = decodePNG(bytes);
      makeGrid(img, p.grid); align(img, p.frames, p.options);
      image = img; sourceBytes = bytes; frames = p.frames; current = 0; appliedGrid = p.grid;
      gridKeys.forEach(k => $(k).value = p.grid[k]);
      for (const [id, value] of Object.entries({ mode: p.options.mode, axis: p.options.axis, reference: p.options.reference + 1, threshold: p.options.threshold, outCols: p.options.cols })) $(id).value = value;
      refresh();
    }
  } catch (error) { status(`Importazione non riuscita: ${error.message}`, true); }
}
function batchFiles() {
  return [...($('batchFiles').files ?? []), ...($('batchFolder').files ?? [])];
}
$('batchFiles').onchange = () => { $('batchFolder').value = ''; $('batch').disabled = batchFiles().length === 0; };
$('batchFolder').onchange = () => { $('batchFiles').value = ''; $('batch').disabled = batchFiles().length === 0; };
$('batch').onclick = async () => {
  const files = batchFiles();
  if (!files.length) return;
  const entries = {}, usedPrefixes = new Set(), report = { processed: [], failed: [] };
  const grid = gridValues(), opts = options();
  $('batch').disabled = true;
  status(`Batch in corso: ${files.length} immagini…`);
  for (const file of files) {
    try {
      if (!file.name.toLowerCase().endsWith('.png')) throw Error('Estensione non supportata: seleziona PNG');
      const source = decodePNG(new Uint8Array(await file.arrayBuffer()));
      const result = align(source, makeGrid(source, grid), opts);
      const parts = (file.webkitRelativePath || file.name).replaceAll('\\', '/').split('/').filter(part => part && part !== '.' && part !== '..');
      const filename = parts.pop() || file.name;
      const originalStem = filename.replace(/\.png$/i, '');
      let stem = originalStem, suffix = 2, prefix = [...parts, stem].join('/');
      while (usedPrefixes.has(prefix)) {
        stem = `${originalStem}-${suffix++}`;
        prefix = [...parts, stem].join('/');
      }
      const fileEntries = {
        [`${prefix}/${stem}-aligned.png`]: encodePNG(result.image),
        [`${prefix}/${stem}-metadata.json`]: jsonBytes(result.metadata)
      };
      result.metadata.frames.forEach((_, i) => {
        fileEntries[`${prefix}/frames/frame-${String(i + 1).padStart(4, '0')}.png`] = encodePNG(extractCell(result, i));
      });
      Object.assign(entries, fileEntries);
      usedPrefixes.add(prefix);
      report.processed.push({ file: file.webkitRelativePath || file.name, frameCount: result.metadata.frameCount });
    } catch (error) {
      report.failed.push({ file: file.webkitRelativePath || file.name, error: error.message });
    }
  }
  entries['batch-report.json'] = jsonBytes(report);
  if (report.processed.length) download('frame-loom-batch.zip', zipSync(entries), 'application/zip');
  const message = `Batch completato: ${report.processed.length}/${files.length} immagini esportate${report.failed.length ? ` · errori: ${report.failed.map(item => `${item.file}: ${item.error}`).join('; ')}` : ''}`;
  status(message, report.failed.length > 0);
  $('batch').disabled = batchFiles().length === 0;
};
$('file').onchange = e => openFile(e.target.files[0]);
$('project').onchange = e => openFile(e.target.files[0], true);
for (const name of ['dragenter', 'dragover']) $('drop').addEventListener(name, e => { e.preventDefault(); $('drop').classList.add('drag'); });
for (const name of ['dragleave', 'drop']) $('drop').addEventListener(name, e => { e.preventDefault(); $('drop').classList.remove('drag'); });
$('drop').addEventListener('drop', e => openFile(e.dataTransfer.files[0]));
$('sourceOverlay').addEventListener('pointerdown', event => {
  if (!result) return;
  const point = canvasPoint(event), hit = hitAt(point.x, point.y);
  if (!hit) return;
  playing = false; $('play').textContent = 'Riproduci';
  if (hit.index !== current) { current = hit.index; updateSelection(); }
  if (!hit.edges) return;
  event.preventDefault();
  drag = { pointerId: event.pointerId, edges: hit.edges, rect: { ...frames[current].rect } };
  $('sourceOverlay').setPointerCapture(event.pointerId);
  $('sourceOverlay').style.cursor = cursorFor(hit.edges);
});
$('sourceOverlay').addEventListener('pointermove', event => {
  const point = canvasPoint(event), canvas = $('sourceOverlay');
  if (drag && drag.pointerId === event.pointerId) {
    frames[current].rect = resizeRect(drag.rect, drag.edges, point.x, point.y);
    for (const [id, value] of Object.entries({ rx: frames[current].rect.x, ry: frames[current].rect.y, rw: frames[current].rect.w, rh: frames[current].rect.h })) $(id).value = value;
    drawOutline();
    return;
  }
  const hit = hitAt(point.x, point.y);
  canvas.style.cursor = hit ? cursorFor(hit.edges) : 'crosshair';
});
function finishDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag = null;
  refresh();
}
$('sourceOverlay').addEventListener('pointerup', finishDrag);
$('sourceOverlay').addEventListener('pointercancel', finishDrag);
$('grid').onclick = () => { if (!image) return; try { const grid = gridValues(), next = makeGrid(image, grid); appliedGrid = grid; frames = next; current = 0; $('reference').value = 1; $('outCols').value = grid.cols; refresh(); } catch (e) { status(e.message, true); } };
$('editor').addEventListener('focusin', () => { playing = false; $('play').textContent = 'Riproduci'; });
for (const id of ['mode', 'axis', 'reference', 'threshold', 'outCols']) $(id).onchange = refresh;
for (const id of ['rx', 'ry', 'rw', 'rh', 'ax', 'ay', 'dx', 'dy', 'group', 'manual']) $(id).onchange = () => {
  if (!image || !frames[current]) return;
  const f = frames[current];
  f.rect = { x: number('rx'), y: number('ry'), w: number('rw'), h: number('rh') };
  f.anchor = $('manual').checked ? { x: number('ax'), y: number('ay') } : null;
  f.dx = number('dx'); f.dy = number('dy'); f.group = $('group').value;
  refresh();
};
$('reset').onclick = () => { if (!image) return; frames.forEach(f => { f.anchor = null; f.dx = f.dy = 0; f.group = '1'; }); $('mode').value = 'match'; $('axis').value = 'both'; $('reference').value = 1; $('threshold').value = 1; refresh(); };
$('zoom').oninput = () => { $('fit').checked = false; $('zoomValue').textContent = `${number('zoom')}%`; scaleViews(); };
$('fit').onchange = scaleViews;
window.addEventListener('resize', scaleViews);
$('play').onclick = () => { playing = !playing; $('play').textContent = playing ? 'Pausa' : 'Riproduci'; };
function step(delta) { if (!result) return; playing = false; $('play').textContent = 'Riproduci'; current = (current + delta + frames.length) % frames.length; updateSelection(); }
$('prev').onclick = () => step(-1); $('next').onclick = () => step(1);
function tick(time) {
  const fps = number('fps');
  if (playing && result && fps >= 1 && fps <= 60 && time - last >= 1000 / fps) { current = (current + 1) % frames.length; updateSelection(); last = time; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
$('sheet').onclick = () => { if (result) download('frame-loom-sheet.png', encodePNG(result.image), 'image/png'); };
$('frames').onclick = () => { if (!result) return; const entries = {}; frames.forEach((_, i) => { entries[`frame-${String(i + 1).padStart(4, '0')}.png`] = encodePNG(extractCell(result, i)); }); entries['metadata.json'] = strToU8(JSON.stringify(result.metadata, null, 2)); download('frame-loom-frames.zip', zipSync(entries), 'application/zip'); };
$('json').onclick = () => { if (result) download('frame-loom-metadata.json', jsonBytes(result.metadata), 'application/json'); };
$('save').onclick = () => {
  if (!result) return;
  let binary = ''; for (const b of sourceBytes) binary += String.fromCharCode(b);
  download('frame-loom-project.json', jsonBytes({ format: 'frame-loom-project', version: 1, sourcePNG: btoa(binary), grid: appliedGrid, options: options(), frames }), 'application/json');
};
for (const id of ['sheet', 'frames', 'json', 'save']) $(id).disabled = true;
