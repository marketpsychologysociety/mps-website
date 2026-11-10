import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./mps-readonly-schema-inspector.gs', import.meta.url), 'utf8');
const sandbox = { Date };
vm.runInNewContext(source, sandbox, { filename: 'mps-readonly-schema-inspector.gs' });
const inspect = sandbox.mpsInspectSchemaReadOnly_;

function makeSheet(headers, lastRow = 1) {
  const calls = { writes: 0, reads: 0 };
  return {
    calls,
    getLastRow() { return lastRow; },
    getLastColumn() { return headers.length; },
    getRange(row, col, rows, cols) {
      assert.deepEqual([row, col, rows, cols], [1, 1, 1, headers.length]);
      return { getDisplayValues() { calls.reads++; return [headers.slice()]; } };
    },
    insertSheet() { calls.writes++; throw new Error('MUTATION_ATTEMPT'); },
    setValue() { calls.writes++; throw new Error('MUTATION_ATTEMPT'); },
    setValues() { calls.writes++; throw new Error('MUTATION_ATTEMPT'); }
  };
}
function makeSpreadsheet(map) {
  return {
    getId() { return 'SYNTHETIC-FIXTURE'; },
    getSheetByName(name) { return map[name] || null; }
  };
}
const expected = {
  'Database Member': [
    'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara',
    'Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun',
    'Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit',
    'Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin',
    'Waktu Konfirmasi','Terakhir Diperbarui','Telegram Chat ID','Telegram Link Token',
    'Telegram Linked At','PIN Hash','PIN Updated At','Telegram Link Expires At',
    'Application Ref','VIP Invite Link','VIP Invite Expires At','VIP Joined At',
    'VIP User ID','VIP Status'
  ],
  'MPS Applications': ['Application Ref','Created At','Nickname','Telegram Username','Country','Goal','Note','Status','Member ID','Deposit Submitted At','Telegram Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At'],
  'MPS Deposit Applications': ['Application Ref','Submitted At','Account Name','MT5 Login','Account Type','Deposit Amount IDR','Deposit Date','Proof File ID','Proof URL','Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At'],
  'MPS Member Telegram Links': ['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At']
};
const all = Object.fromEntries(Object.entries(expected).map(([n,h]) => [n, makeSheet(h, 2)]));
let report = inspect(makeSpreadsheet(all));
assert.equal(report.ok, true, 'exact synthetic schemas should match');
assert.equal(report.mode, 'READ_ONLY');
assert.equal(report.sheets.length, 4);
assert.ok(Object.values(all).every(s => s.calls.writes === 0), 'no write method may be called');

const legacy = { ...all, 'Database Member': makeSheet(expected['Database Member'].slice(0,18), 2) };
report = inspect(makeSpreadsheet(legacy));
assert.equal(report.ok, false);
assert.equal(report.sheets.find(s => s.name === 'Database Member').status, 'MISMATCH');
assert.equal(report.sheets.find(s => s.name === 'Database Member').firstMismatchColumn, 19);

const missing = { ...all };
delete missing['MPS Applications'];
report = inspect(makeSpreadsheet(missing));
assert.equal(report.ok, false);
assert.equal(report.sheets.find(s => s.name === 'MPS Applications').status, 'MISSING');

const altered = { ...all, 'MPS Deposit Applications': makeSheet(['Wrong Header'], 2) };
report = inspect(makeSpreadsheet(altered));
assert.equal(report.sheets.find(s => s.name === 'MPS Deposit Applications').firstMismatchColumn, 1);

assert.throws(() => inspect(null), /objek Spreadsheet/);
assert.ok(report.sheets.every(s => !('rows' in s) && !('memberData' in s)), 'report must not expose row contents');
console.log('PASS: 5 read-only inspector scenarios (exact schema, legacy fail-closed, missing sheet, header mismatch, invalid input).');
