#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const PERIODS = Object.freeze([
  { days: 30, label: '1 Bulan' },
  { days: 60, label: '2 Bulan' },
  { days: 120, label: '4 Bulan' },
]);
const SLOT_COUNT = 24 * 12;

function parseRawHeatmapHtml(source) {
  const text = String(source || '');
  const match = text.match(/const\s+rawData\s*=\s*(\[[\s\S]*?\])\s*;\s*function\s+getDataRange\s*\(/);
  if (!match) throw new Error('Sumber tidak berisi blok rawData heatmap yang dikenali.');
  let rows;
  try { rows = JSON.parse(match[1]); } catch { throw new Error('Blok rawData bukan JSON yang valid.'); }
  if (!Array.isArray(rows) || rows.length < 1) throw new Error('Data candle kosong.');
  let previous = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || Object.keys(row).sort().join(',') !== 'close,open,time' ||
        !Number.isSafeInteger(row.time) || row.time <= previous || row.time % 300000 !== 0 ||
        !Number.isFinite(row.open) || !Number.isFinite(row.close) || row.open <= 0 || row.close <= 0) {
      throw new Error('Candle #' + (i + 1) + ' tidak valid, tidak berurutan, duplikat, atau bukan batas waktu M5.');
    }
    previous = row.time;
  }
  return rows;
}

function toWibIso(timestamp) {
  const d = new Date(timestamp + WIB_OFFSET_MS);
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + '+07:00';
}

function buildDataset(candles, asOf = Date.now()) {
  if (!Array.isArray(candles) || !candles.length) throw new Error('Data candle kosong.');
  const asOfMs = typeof asOf === 'string' ? Date.parse(asOf) : Number(asOf);
  if (!Number.isFinite(asOfMs)) throw new Error('Waktu snapshot tidak valid.');
  const first = candles[0].time, last = candles[candles.length - 1].time;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last > asOfMs) throw new Error('Waktu snapshot lebih awal daripada candle terakhir atau timestamp tidak valid.');
  const counts = PERIODS.map(() => Array.from({ length: SLOT_COUNT }, () => [0, 0]));
  // Rolling windows end at the latest available candle, not the conversion time. This keeps a delayed source honest instead of silently shrinking its historical sample.
  const cutoffs = PERIODS.map(p => last - p.days * 86400000);
  let previous = -Infinity;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c || !Number.isSafeInteger(c.time) || c.time <= previous || c.time % 300000 !== 0 ||
        !Number.isFinite(c.open) || !Number.isFinite(c.close) || c.open <= 0 || c.close <= 0) {
      throw new Error('Candle #' + (i + 1) + ' tidak valid, tidak berurutan, atau bukan batas waktu M5.');
    }
    previous = c.time;
    if (c.close === c.open) continue;
    const wib = new Date(c.time + WIB_OFFSET_MS);
    const slot = wib.getUTCHours() * 12 + Math.floor(wib.getUTCMinutes() / 5);
    const direction = c.close > c.open ? 0 : 1;
    for (let p = 0; p < PERIODS.length; p++) if (c.time >= cutoffs[p]) counts[p][slot][direction]++;
  }
  return {
    instrument: 'XAUUSD',
    timeframe: 'M5',
    timezone: 'Asia/Jakarta',
    dataStart: toWibIso(first),
    dataEnd: toWibIso(last),
    asOf: toWibIso(asOfMs),
    periods: PERIODS.map((p, i) => ({ days: p.days, label: p.label, slots: counts[i] })),
  };
}

function renderDatasetHtml(dataset) {
  const json = JSON.stringify(dataset);
  return '<!doctype html>\n<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MPS MARKET PULSE Data</title></head><body>\n' +
    '<!-- Data-only payload. The backend parses this JSON and never executes this HTML. -->\n<script>\nconst D = ' + json + ', TH = 5;\n</script>\n</body></html>\n';
}

function parseAsOfArg(args) {
  const index = args.indexOf('--as-of');
  if (index < 0) return Date.now();
  const value = args[index + 1];
  if (!value || !Number.isFinite(Date.parse(value))) throw new Error('Gunakan --as-of dengan timestamp ISO-8601 yang valid.');
  return Date.parse(value);
}

function main(argv) {
  const args = argv.filter((v, i) => v !== '--as-of' && argv[i - 1] !== '--as-of');
  const input = args[0];
  const output = args[1] || 'MPS Market Pulse Data.html';
  if (!input) throw new Error('Pemakaian: node build-market-pulse-dataset.mjs heatmap_final.html [output.html] [--as-of ISO-8601]');
  const candles = parseRawHeatmapHtml(fs.readFileSync(input, 'utf8'));
  const dataset = buildDataset(candles, parseAsOfArg(argv));
  const html = renderDatasetHtml(dataset);
  fs.writeFileSync(output, html, 'utf8');
  process.stdout.write(JSON.stringify({ output: path.resolve(output), candles: candles.length, bytes: Buffer.byteLength(html), dataStart: dataset.dataStart, dataEnd: dataset.dataEnd, asOf: dataset.asOf, slots: dataset.periods.length * SLOT_COUNT }) + '\n');
}

export { buildDataset, parseRawHeatmapHtml, renderDatasetHtml, toWibIso };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (err) { process.stderr.write((err && err.message ? err.message : String(err)) + '\n'); process.exitCode = 1; }
}
