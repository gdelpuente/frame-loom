import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePNG, encodePNG } from '../src/png.js';
import { align, makeGrid } from '../src/core.js';

const image = decodePNG(readFileSync('fixtures/coro-alpino.png'));
const grid = { rows: 2, cols: 2, marginX: 0, marginY: 0, gapX: 0, gapY: 0 };
const frames = makeGrid(image, grid);
const result = align(image, frames, { mode: 'match', axis: 'both', reference: 0, threshold: 1, cols: 2 });
mkdirSync('output', { recursive: true });
writeFileSync('output/coro-alpino-allineato.png', encodePNG(result.image));
writeFileSync('output/coro-alpino-metadati.json', JSON.stringify(result.metadata, null, 2));
const html = `<!doctype html>
<html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Coro alpino: prima e dopo</title>
<style>body{font-family:system-ui;background:#1b2537;color:#fff;margin:24px}main{display:flex;gap:16px;flex-wrap:wrap}.frame{position:relative;overflow:hidden;background-color:#ddd;background-image:conic-gradient(#aaa 25%,#ddd 0 50%,#aaa 0 75%,#ddd 0);background-size:16px 16px}.crop{position:absolute;overflow:hidden;left:0;top:0}.crop img{position:absolute;max-width:none;image-rendering:pixelated}button{padding:8px;margin:12px 8px 0 0}</style>
<h1>Coro alpino: prima e dopo</h1><p>Stessa scala visiva; il PNG esportato mantiene i pixel originali. Sono possibili movimenti interni ai disegni non correggibili con una traslazione.</p>
<main><div><h2>Prima</h2><div class="frame"><div class="crop" id="before"><img src="../fixtures/coro-alpino.png" alt=""></div></div></div><div><h2>Dopo</h2><div class="frame"><div class="crop" id="after"><img src="coro-alpino-allineato.png" alt=""></div></div></div></main>
<button id="play">Pausa</button><button id="next">Fotogramma successivo</button><span id="label"></span>
<script>
const m=${JSON.stringify(result.metadata)}, source={width:${image.width},height:${image.height}}, output={width:${result.image.width},height:${result.image.height}};
let index=0, playing=true;
function render(){const s=Math.min(1,(innerWidth<700?innerWidth-60:(innerWidth-90)/2)/m.cellWidth,350/m.cellHeight);document.querySelectorAll('.frame').forEach(e=>{e.style.width=m.cellWidth*s+'px';e.style.height=m.cellHeight*s+'px'});const f=m.frames[index], before=document.querySelector('#before'), after=document.querySelector('#after');before.style.width=f.source.w*s+'px';before.style.height=f.source.h*s+'px';after.style.width=m.cellWidth*s+'px';after.style.height=m.cellHeight*s+'px';const a=before.firstElementChild,b=after.firstElementChild;a.style.width=source.width*s+'px';a.style.height=source.height*s+'px';a.style.left=-f.source.x*s+'px';a.style.top=-f.source.y*s+'px';b.style.width=output.width*s+'px';b.style.height=output.height*s+'px';b.style.left=-(index%m.columns)*m.cellWidth*s+'px';b.style.top=-Math.floor(index/m.columns)*m.cellHeight*s+'px';document.querySelector('#label').textContent='Fotogramma '+(index+1)+' / '+m.frameCount+' · scala '+Math.round(s*100)+'%'}
document.querySelector('#play').onclick=()=>{playing=!playing;document.querySelector('#play').textContent=playing?'Pausa':'Riproduci'};document.querySelector('#next').onclick=()=>{playing=false;document.querySelector('#play').textContent='Riproduci';index=(index+1)%m.frameCount;render()};addEventListener('resize',render);render();setInterval(()=>{if(playing){index=(index+1)%m.frameCount;render()}},250);
</script></html>`;
writeFileSync('output/coro-alpino-confronto.html', html);
