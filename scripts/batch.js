import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from '../src/png.js';
import { align, makeGrid, extractCell } from '../src/core.js';

const defaults = {
  rows: 1, cols: 1, marginX: 0, marginY: 0, gapX: 0, gapY: 0,
  mode: 'match', axis: 'both', reference: 1, threshold: 1, outputCols: null
};
const flagNames = new Map([
  ['--grid-rows', 'rows'], ['--grid-cols', 'cols'],
  ['--margin-x', 'marginX'], ['--margin-y', 'marginY'],
  ['--gap-x', 'gapX'], ['--gap-y', 'gapY'],
  ['--mode', 'mode'], ['--axis', 'axis'], ['--reference', 'reference'],
  ['--threshold', 'threshold'], ['--output-cols', 'outputCols']
]);

function usage() {
  return `Uso: node scripts/batch.js <cartella-input> <cartella-output> [opzioni]

Opzioni:
  --grid-rows N       Righe della griglia sorgente (default: 1)
  --grid-cols N       Colonne della griglia sorgente (default: 1)
  --margin-x N        Margine orizzontale simmetrico (default: 0)
  --margin-y N        Margine verticale simmetrico (default: 0)
  --gap-x N           Spaziatura orizzontale (default: 0)
  --gap-y N           Spaziatura verticale (default: 0)
  --mode MODE         match, bottom, center oppure none (default: match)
  --axis AXIS         both oppure x (default: both)
  --reference N       Fotogramma di riferimento, numerazione da 1 (default: 1)
  --threshold N       Soglia alpha, da 1 a 255 (default: 1)
  --output-cols N     Colonne dello sheet esportato (default: griglia sorgente)
  --help              Mostra questo messaggio

Ogni PNG viene elaborato con la stessa griglia e le stesse opzioni. Per ogni
immagine crea una cartella con sheet allineato, metadati e PNG dei fotogrammi.
`;
}

function parseArgs(args) {
  const positional = [], values = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') return { help: true };
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const [flag, inlineValue] = arg.split('=', 2), key = flagNames.get(flag);
    if (!key) throw Error(`Opzione sconosciuta: ${flag}`);
    const raw = inlineValue ?? args[++i];
    if (raw === undefined || raw.startsWith('--')) throw Error(`Valore mancante per ${flag}`);
    values[key] = key === 'mode' || key === 'axis' ? raw : Number(raw);
  }
  if (positional.length !== 2) throw Error('Specificare la cartella di input e quella di output');
  values.reference -= 1;
  return { input: path.resolve(positional[0]), output: path.resolve(positional[1]), values };
}

function collectPNGFiles(directory, outputDirectory, relative = '') {
  const results = [];
  for (const entry of readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    const absolute = path.resolve(directory, child);
    const relativeToOutput = path.relative(outputDirectory, absolute);
    if (!relativeToOutput || (relativeToOutput !== '..' && !relativeToOutput.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToOutput))) continue;
    if (entry.isDirectory()) results.push(...collectPNGFiles(directory, outputDirectory, child));
    else if (entry.isFile() && /\.png$/i.test(entry.name)) results.push(child);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

export function runBatch(args) {
  const parsed = parseArgs(args);
  if (parsed.help) { console.log(usage()); return 0; }
  const { input, output, values } = parsed;
  if (input === output) throw Error('Le cartelle di input e output devono essere diverse');
  const grid = {
    rows: values.rows, cols: values.cols, marginX: values.marginX, marginY: values.marginY,
    gapX: values.gapX, gapY: values.gapY
  };
  const options = {
    mode: values.mode, axis: values.axis, reference: values.reference,
    threshold: values.threshold, cols: values.outputCols ?? grid.cols
  };
  const files = collectPNGFiles(input, output);
  if (!files.length) throw Error(`Nessun PNG trovato in ${input}`);
  mkdirSync(output, { recursive: true });
  let succeeded = 0, failed = 0;
  for (const relative of files) {
    try {
      const source = decodePNG(readFileSync(path.join(input, relative)));
      const result = align(source, makeGrid(source, grid), options);
      const relativeFolder = relative.replace(/\.png$/i, '');
      const destination = path.join(output, relativeFolder);
      const stem = path.basename(relativeFolder);
      mkdirSync(path.join(destination, 'frames'), { recursive: true });
      writeFileSync(path.join(destination, `${stem}-aligned.png`), encodePNG(result.image));
      writeFileSync(path.join(destination, `${stem}-metadata.json`), JSON.stringify(result.metadata, null, 2));
      result.metadata.frames.forEach((_, i) => {
        const name = `frame-${String(i + 1).padStart(4, '0')}.png`;
        writeFileSync(path.join(destination, 'frames', name), encodePNG(extractCell(result, i)));
      });
      succeeded++;
      console.log(`OK ${relative} (${result.metadata.frameCount} fotogrammi)`);
    } catch (error) {
      failed++;
      console.error(`ERRORE ${relative}: ${error.message}`);
    }
  }
  console.log(`Batch completato: ${succeeded} riuscite, ${failed} non riuscite, ${files.length} totali.`);
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runBatch(process.argv.slice(2)); }
  catch (error) { console.error(`Errore: ${error.message}`); console.error(usage()); process.exitCode = 1; }
}
