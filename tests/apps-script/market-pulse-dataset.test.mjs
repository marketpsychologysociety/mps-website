import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildDataset, parseRawHeatmapHtml, renderDatasetHtml } from '../../scripts/build-market-pulse-dataset.mjs';

const repoRoot = new URL('../../', import.meta.url);
const code = fs.readFileSync(new URL('../../candidates/Code.gs', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('../../candidates/Index.html', import.meta.url), 'utf8');
const validatorStart = code.indexOf('function validateMarketPulseSource_(source) {');
const validatorEnd = code.indexOf('\nfunction getMarketPulseData_()', validatorStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart, 'Market Pulse validator must exist');
const validatorSource = code.slice(validatorStart, validatorEnd);
const validatorContext = { MPS: { maxPulseDataBytes: 1024 * 1024 } };
vm.createContext(validatorContext);
vm.runInContext(validatorSource, validatorContext, { timeout: 1000 });
const validate = html => validatorContext.validateMarketPulseSource_(html);
const asOf = '2026-11-16T11:29:03+07:00';
const candles = [
  { time: Date.parse('2026-08-01T00:00:00Z'), open: 100, close: 101 },
  { time: Date.parse('2026-10-01T00:00:00Z'), open: 100, close: 99 },
  { time: Date.parse('2026-10-20T00:00:00Z'), open: 99, close: 100 },
  { time: Date.parse('2026-11-16T00:00:00Z'), open: 100, close: 101 },
  { time: Date.parse('2026-11-16T00:05:00Z'), open: 101, close: 100 },
  { time: Date.parse('2026-11-16T00:10:00Z'), open: 100, close: 100 },
];
const dataset = buildDataset(candles, asOf);
const html = renderDatasetHtml(dataset);
const mutate = fn => {
  const copy = JSON.parse(JSON.stringify(dataset));
  fn(copy);
  return renderDatasetHtml(copy);
};

test('raw heatmap reader parses data only and rejects malformed candle sequences', () => {
  const source = 'const rawData = ' + JSON.stringify(candles) + '; function getDataRange(daysAgo) {}';
  assert.deepEqual(parseRawHeatmapHtml(source), candles);
  assert.throws(() => parseRawHeatmapHtml('const rawData = [];'), /tidak berisi blok rawData/);
  const duplicate = candles.concat([{ ...candles.at(-1) }]);
  assert.throws(() => parseRawHeatmapHtml('const rawData = ' + JSON.stringify(duplicate) + '; function getDataRange() {}'), /tidak valid/);
  const outOfOrder = [candles[1], candles[0]];
  assert.throws(() => parseRawHeatmapHtml('const rawData = ' + JSON.stringify(outOfOrder) + '; function getDataRange() {}'), /tidak valid/);
});

test('converter builds exactly XAUUSD M5, WIB and three rolling windows with 288 slots each', () => {
  assert.equal(dataset.instrument, 'XAUUSD');
  assert.equal(dataset.timeframe, 'M5');
  assert.equal(dataset.timezone, 'Asia/Jakarta');
  assert.equal(dataset.dataStart, '2026-08-01T07:00:00+07:00');
  assert.equal(dataset.dataEnd, '2026-11-16T07:10:00+07:00');
  assert.equal(dataset.asOf, asOf);
  assert.deepEqual(dataset.periods.map(p => [p.days, p.label, p.slots.length]), [
    [30, '1 Bulan', 288], [60, '2 Bulan', 288], [120, '4 Bulan', 288]
  ]);
  const slot07 = 7 * 12;
  assert.deepEqual(dataset.periods[0].slots[slot07], [2, 1]);
  assert.deepEqual(dataset.periods[1].slots[slot07], [2, 1]);
  assert.deepEqual(dataset.periods[2].slots[slot07], [2, 2]);
  assert.ok(Buffer.byteLength(html) < 1024 * 1024);
  assert.match(html, /const D = /);
  assert.match(html, /TH = 5;/);
  assert.doesNotMatch(html, /rawData|<script\s+src=/i);
});

test('backend validator accepts the converted compact dataset', () => {
  const result = validate(html);
  assert.equal(result.ok, true);
  assert.equal(result.threshold, 5);
  assert.equal(result.endDate, dataset.dataEnd);
  assert.equal(result.asOf, dataset.asOf);
  assert.equal(result.stats.totalSlots, 864);
  assert.equal(result.stats.groups, 1);
  assert.equal(result.groups[0].pair, 'XAUUSD');
  assert.equal(result.groups[0].timeframe, 'M5');
});

test('backend validator rejects legacy or cross-instrument dataset shapes', () => {
  assert.throws(() => validate(html.replace('TH = 5;', 'TH = 55;')), /Struktur MPS MARKET PULSE/);
  assert.throws(() => validate(mutate(d => { d.instrument = 'EURUSD'; })), /wajib XAUUSD M5/);
  assert.throws(() => validate(mutate(d => { d.timeframe = 'M15'; })), /wajib XAUUSD M5/);
  assert.throws(() => validate(mutate(d => { d.timezone = 'UTC'; })), /zona waktu WIB/);
  assert.throws(() => validate(mutate(d => { d.extra = true; })), /properti dataset/);
});

test('backend validator enforces timestamp validity, chronology and M5 boundaries', () => {
  assert.throws(() => validate(mutate(d => { d.dataEnd = '2026-02-30T03:20:00+07:00'; })), /Rentang waktu/);
  assert.throws(() => validate(mutate(d => { d.dataStart = '2026-08-01T07:01:00+07:00'; })), /Rentang waktu/);
  assert.throws(() => validate(mutate(d => { d.dataStart = '2026-12-01T07:00:00+07:00'; })), /Urutan waktu/);
  assert.throws(() => validate(mutate(d => { d.asOf = '2026-11-15T11:29:03+07:00'; })), /Urutan waktu/);
});

test('backend validator enforces period order, 288 slots, safe nonnegative counts and per-day bounds', () => {
  assert.throws(() => validate(mutate(d => { d.periods.reverse(); })), /Urutan atau label periode/);
  assert.throws(() => validate(mutate(d => { d.periods[0].slots.pop(); })), /288 slot/);
  assert.throws(() => validate(mutate(d => { d.periods[0].slots[0] = [-1, 0]; })), /Jumlah candle/);
  assert.throws(() => validate(mutate(d => { d.periods[0].slots[0] = [1.5, 0]; })), /Jumlah candle/);
  assert.throws(() => validate(mutate(d => { d.periods[0].slots[0] = [31, 0]; })), /Jumlah candle/);
  assert.throws(() => validate(html + 'x'.repeat(1024 * 1024)), /melebihi batas 1 MB/);
});

test('legacy Heatmap menu and old multi-market Pulse selectors are removed', () => {
  assert.doesNotMatch(indexHtml, /data-page="heatmap"|id="page-heatmap"|loadHeatmap|refreshHeat|heatPublicPreview/);
  assert.doesNotMatch(indexHtml, /data-pair=|data-tf=|pulsePair|pulseTf|pulseSlot|pulseChips/);
  assert.match(indexHtml, /data-page="pulse">Market Pulse/);
  assert.match(indexHtml, /MPS MARKET PULSE · XAUUSD M5/);
  assert.match(indexHtml, /MEMBER ONLY/);
  assert.match(indexHtml, /api\('apiGetMarketPulse',state\.memberSession\)/);
  assert.match(indexHtml, /api\('apiAdminGetMarketPulse',state\.adminSession\)/);
  assert.doesNotMatch(code.slice(code.indexOf('function doGet(e)'), code.indexOf('function doPost(e)')), /'heatmap'/);
});

test('Market Pulse data API remains session-authorized and stored file remains private', () => {
  const memberStart = code.indexOf('function apiGetMarketPulse(session)');
  const adminStart = code.indexOf('function apiAdminGetMarketPulse(session)');
  const dataStart = code.indexOf('function getMarketPulseData_()');
  assert.ok(memberStart >= 0 && adminStart > memberStart && dataStart > adminStart);
  assert.match(code.slice(memberStart, adminStart), /requireMember_\(session\)/);
  assert.match(code.slice(adminStart, dataStart), /requireAdmin_\(session\)/);
  assert.match(code.slice(dataStart, code.indexOf('function buildMpsDashboard_()', dataStart)), /folder\.getSharingAccess\(\).*DriveApp\.Access\.PRIVATE/);
  assert.match(code.slice(dataStart, code.indexOf('function buildMpsDashboard_()', dataStart)), /file\.getSharingAccess\(\).*DriveApp\.Access\.PRIVATE/);
});
