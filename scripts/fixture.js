import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePNG } from '../src/png.js';
import { makeGrid, align, extractCell } from '../src/core.js';

const image = { width: 96, height: 32, data: new Uint8Array(96 * 32 * 4) };
const put = (x, y, rgba) => image.data.set(rgba, (y * image.width + x) * 4);
for (let frame = 0; frame < 3; frame++) {
  const x = frame * 32 + [7, 11, 5][frame], y = [7, 3, 10][frame];
  for (let yy = 0; yy < 18; yy++) for (let xx = 0; xx < 14; xx++) {
    if ((xx - 6.5) ** 2 / 49 + (yy - 8.5) ** 2 / 81 <= 1) put(x + xx, y + yy, [40 + xx * 8, 95 + yy * 5, 205 - xx * 5, xx === 0 || yy === 0 ? 96 : 255]);
  }
  put(x + 2, y + 3, [255, 255, 255, 100]);
  put(x + 13, y - 2, [255, 180, 40, 55]);
}
const grid = { rows: 1, cols: 3, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
const frames = makeGrid(image, grid);
const result = align(image, frames, { mode: 'bottom', axis: 'both', reference: 0, threshold: 1, cols: 3 });
mkdirSync('fixtures', { recursive: true }); mkdirSync('output', { recursive: true });
writeFileSync('fixtures/synthetic.png', encodePNG(image));
writeFileSync('output/synthetic-aligned.png', encodePNG(result.image));
writeFileSync('output/synthetic-metadata.json', JSON.stringify(result.metadata, null, 2));
const uri = img => `data:image/png;base64,${Buffer.from(encodePNG(img)).toString('base64')}`;
const before = align(image, frames, { mode: 'none', axis: 'both', reference: 0, threshold: 1, cols: 3 });
const arrays = [frames.map((_, i) => uri(extractCell(before, i))), frames.map((_, i) => uri(extractCell(result, i)))];
const html = `<!doctype html><meta charset="utf-8"><title>Confronto sintetico Frame Loom</title><style>body{font-family:system-ui;background:#1b2537;color:white}main{display:flex;gap:30px}.checker{background-color:#ddd;background-image:conic-gradient(#aaa 25%,#ddd 0 50%,#aaa 0 75%,#ddd 0);background-size:16px 16px}img{image-rendering:pixelated;display:block}</style><h1>Fixture sintetica — animazione prima / dopo</h1><p>Zoom visivo 6×, senza interpolazione. Le immagini non sono lo sprite sheet allegato.</p><main><div><h2>Prima</h2><div class="checker"><img id="a"></div></div><div><h2>Dopo</h2><div class="checker"><img id="b"></div></div></main><p id="frame"></p><button id="toggle">Pausa</button><script>const images=${JSON.stringify(arrays)};let i=0,play=true;for(const img of [a,b])img.onload=()=>{img.style.width=img.naturalWidth*6+'px';img.style.height=img.naturalHeight*6+'px'};function draw(){a.src=images[0][i];b.src=images[1][i];frame.textContent='Fotogramma '+(i+1)}toggle.onclick=()=>{play=!play;toggle.textContent=play?'Pausa':'Riprendi'};draw();setInterval(()=>{if(play){i=(i+1)%images[0].length;draw()}},250)</script>`;
writeFileSync('output/synthetic-comparison.html', html);
