import { zlibSync, unzlibSync } from 'fflate';

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const text = new TextEncoder();
const read32 = (a, i) => new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(i);
const write32 = (a, i, v) => new DataView(a.buffer, a.byteOffset, a.byteLength).setUint32(i, v);
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const out = new Uint8Array(data.length + 12);
  write32(out, 0, data.length);
  out.set(text.encode(name), 4);
  out.set(data, 8);
  write32(out, out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const part of parts) { out.set(part, i); i += part.length; }
  return out;
}
export function encodePNG({ width, height, data }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) throw Error('Dimensioni RGBA non valide');
  const header = new Uint8Array(13);
  write32(header, 0, width); write32(header, 4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return concat([new Uint8Array(signature), chunk('IHDR', header), chunk('IDAT', zlibSync(rows)), chunk('IEND', new Uint8Array())]);
}
export function decodePNG(bytes) {
  if (bytes.length < 8 || !signature.every((b, i) => b === bytes[i])) throw Error('Non è un PNG');
  let pos = 8, header, ended = false, seenIDAT = false, closedIDAT = false;
  const idat = [];
  while (pos + 12 <= bytes.length) {
    const len = read32(bytes, pos), end = pos + 12 + len;
    if (end > bytes.length) throw Error('PNG troncato');
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    if (crc32(bytes.subarray(pos + 4, pos + 8 + len)) !== read32(bytes, pos + 8 + len)) throw Error('CRC PNG non valido');
    if (!header && type !== 'IHDR') throw Error('IHDR mancante');
    if (type === 'IHDR') {
      if (header || len !== 13) throw Error('IHDR non valido');
      header = data;
    } else if (type === 'IDAT') {
      if (closedIDAT) throw Error('IDAT non contigui');
      seenIDAT = true; idat.push(data);
    } else if (type === 'IEND') {
      if (len !== 0 || !seenIDAT || end !== bytes.length) throw Error('IEND non valido');
      ended = true; break;
    } else {
      if (seenIDAT) closedIDAT = true;
      if (['iCCP', 'sRGB', 'gAMA', 'cHRM', 'cICP', 'mDCV', 'cLLI'].includes(type)) throw Error(`Profilo o metadati colore ${type} non supportati: nessuna conversione effettuata`);
      if (type[0] === type[0].toUpperCase()) throw Error(`Chunk PNG critico ${type} non supportato`);
    }
    pos = end;
  }
  if (!ended || !header) throw Error('PNG incompleto');
  const width = read32(header, 0), height = read32(header, 4);
  if (!width || !height || width * height > 16777216) throw Error('Dimensioni PNG non supportate (massimo 16 megapixel)');
  if (header[8] !== 8 || header[9] !== 6 || header[10] !== 0 || header[11] !== 0 || header[12] !== 0) throw Error('Supportati solo PNG RGBA 8 bit non interlacciati');
  const stride = width * 4, raw = unzlibSync(concat(idat));
  if (raw.length !== (stride + 1) * height) throw Error('Dati PNG di dimensione inattesa');
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw Error('Filtro PNG non valido');
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = y && x >= 4 ? out[(y - 1) * stride + x - 4] : 0;
      let predict = 0;
      if (filter === 1) predict = a;
      if (filter === 2) predict = b;
      if (filter === 3) predict = Math.floor((a + b) / 2);
      if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        predict = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predict) & 255;
    }
  }
  return { width, height, data: out };
}
