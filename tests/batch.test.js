import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodePNG } from '../src/png.js';

const root = path.resolve('.');

test('batch CLI processes nested PNGs, reports invalid files, and writes frames and metadata', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'frame-loom-batch-'));
  try {
    const input = path.join(temp, 'input'), output = path.join(input, 'results');
    mkdirSync(path.join(input, 'nested'), { recursive: true });
    writeFileSync(path.join(input, 'nested', 'sheet.png'), readFileSync(path.join(root, 'fixtures', 'synthetic.png')));
    writeFileSync(path.join(input, 'bad.png'), 'not a png');
    const run = spawnSync(process.execPath, [
      path.join(root, 'scripts', 'batch.js'), input, output,
      '--grid-rows', '1', '--grid-cols', '3', '--mode', 'none'
    ], { encoding: 'utf8' });

    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /1 riuscite, 1 non riuscite/);
    assert.match(run.stderr, /ERRORE bad\.png/);
    const result = path.join(output, 'nested', 'sheet');
    const metadata = JSON.parse(readFileSync(path.join(result, 'sheet-metadata.json'), 'utf8'));
    assert.equal(metadata.frameCount, 3);
    assert.equal(decodePNG(readFileSync(path.join(result, 'sheet-aligned.png'))).width, 96);
    assert.equal(decodePNG(readFileSync(path.join(result, 'frames', 'frame-0003.png'))).width, 32);
    const repeated = spawnSync(process.execPath, [
      path.join(root, 'scripts', 'batch.js'), input, output,
      '--grid-rows', '1', '--grid-cols', '3', '--mode', 'none'
    ], { encoding: 'utf8' });
    assert.match(repeated.stdout, /1 riuscite, 1 non riuscite, 2 totali/);
    assert.equal(repeated.status, 1);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
