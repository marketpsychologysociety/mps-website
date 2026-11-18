import assert from 'node:assert/strict';

const legacy = [
  'ID Member',
  'Waktu Daftar',
  'Nama Panggilan',
  'Username Telegram',
  'Negara',
  'Tujuan Bergabung',
  'Catatan Member',
  'Status Pendaftaran',
  'Nama Sesuai Akun',
  'Login MT5',
  'Jenis Akun',
  'Deposit Pertama (IDR)',
  'Tanggal Deposit',
  'Link Bukti Deposit',
  'Status Verifikasi Deposit',
  'Catatan Admin',
  'Waktu Konfirmasi',
  'Terakhir Diperbarui'
];

const additions = [
  'Telegram Chat ID',
  'Telegram Link Token',
  'Telegram Linked At',
  'PIN Hash',
  'PIN Updated At',
  'Telegram Link Expires At',
  'Application Ref',
  'VIP Invite Link',
  'VIP Invite Expires At',
  'VIP Joined At',
  'VIP User ID',
  'VIP Status'
];

const target = [...legacy, ...additions];
const clone = value => structuredClone(value);
const nonEmpty = value => value !== '' && value !== null && value !== undefined;

/*
 * Synthetic policy harness only. This models the documented append-only
 * migration guard. It does not import or execute Apps Script production code.
 */
function migrateSyntheticSheet(sheet) {
  if (!Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) {
    throw new Error('Invalid synthetic sheet fixture');
  }

  if (sheet.headers.length === target.length &&
      target.every((header, i) => sheet.headers[i] === header)) {
    return { changed: false, version: '30-column', sheet };
  }

  if (sheet.headers.length !== legacy.length ||
      !legacy.every((header, i) => sheet.headers[i] === header)) {
    throw new Error('Unknown, reordered, or unsupported header schema; stop without changes');
  }

  const hasUnexpectedTrailingData = sheet.rows.some(row =>
    row.slice(legacy.length).some(nonEmpty)
  );
  if (hasUnexpectedTrailingData) {
    throw new Error('Unexpected data beyond legacy column 18; stop without changes');
  }

  const beforeLegacy = sheet.rows.map(row => row.slice(0, legacy.length));
  sheet.headers = [...sheet.headers, ...additions];
  sheet.rows = sheet.rows.map(row => [
    ...row.slice(0, legacy.length),
    ...Array(additions.length).fill('')
  ]);

  assert.deepEqual(
    sheet.rows.map(row => row.slice(0, legacy.length)),
    beforeLegacy,
    'Legacy cell values must remain byte/value-identical'
  );

  return { changed: true, version: '30-column', sheet };
}

function fixture() {
  return {
    headers: [...legacy],
    rows: [
      [
        'MPS-0123456789', new Date('2026-01-02T03:04:05Z').toISOString(),
        'Member A', '@member_a', 'ID', 'Learning', 'Catatan',
        'Berhasil', 'Member A Legal', '12345678', 'Standard',
        1500000, '2026-01-01', 'private-proof-ref', 'Terverifikasi',
        'Reviewed', '2026-01-03T00:00:00Z', '2026-01-03T00:00:00Z'
      ],
      [
        'MPS-ABCDEF12', new Date('2026-02-03T03:04:05Z').toISOString(),
        'Member B', '@member_b', 'MY', 'Community', '', 'Pending',
        '', '', '', '', '', '', 'Menunggu', '', '', ''
      ]
    ]
  };
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write('PASS ' + name + '\\n');
  } catch (error) {
    process.stderr.write('FAIL ' + name + ': ' + error.message + '\\n');
    process.exitCode = 1;
  }
}

test('legacy schema has exactly 18 documented headers', () => {
  assert.equal(legacy.length, 18);
  assert.equal(new Set(legacy).size, 18);
});

test('candidate schema appends exactly 12 fields (30 total)', () => {
  assert.equal(additions.length, 12);
  assert.equal(target.length, 30);
  assert.deepEqual(target.slice(0, 18), legacy);
});

test('append-only migration preserves every legacy cell and row', () => {
  const sheet = fixture();
  const before = clone(sheet.rows.map(row => row.slice(0, 18)));
  const result = migrateSyntheticSheet(sheet);
  assert.equal(result.changed, true);
  assert.deepEqual(sheet.headers, target);
  assert.equal(sheet.rows.length, 2);
  assert.deepEqual(sheet.rows.map(row => row.slice(0, 18)), before);
  assert.ok(sheet.rows.every(row => row.length === 30));
  assert.ok(sheet.rows.every(row => row.slice(18).every(value => value === '')));
});

test('second migration is idempotent and does not add duplicate columns', () => {
  const sheet = fixture();
  migrateSyntheticSheet(sheet);
  const afterFirst = clone(sheet);
  const result = migrateSyntheticSheet(sheet);
  assert.equal(result.changed, false);
  assert.deepEqual(sheet, afterFirst);
  assert.equal(sheet.headers.length, 30);
});

test('reordered or renamed legacy header fails closed without mutation', () => {
  const sheet = fixture();
  sheet.headers[2] = 'Renamed Name';
  const before = clone(sheet);
  assert.throws(() => migrateSyntheticSheet(sheet), /Unknown, reordered/);
  assert.deepEqual(sheet, before);
});

test('unexpected non-empty data beyond column 18 fails closed', () => {
  const sheet = fixture();
  sheet.rows[0].push('', '', 'unexpected');
  const before = clone(sheet);
  assert.throws(() => migrateSyntheticSheet(sheet), /Unexpected data/);
  assert.deepEqual(sheet, before);
});

test('already migrated exact 30-column schema is unchanged', () => {
  const sheet = fixture();
  migrateSyntheticSheet(sheet);
  const before = clone(sheet);
  const result = migrateSyntheticSheet(sheet);
  assert.equal(result.changed, false);
  assert.deepEqual(sheet, before);
});

test('both legacy 8-hex and 10-hex member ID formats are preserved', () => {
  const sheet = fixture();
  const ids = sheet.rows.map(row => row[0]);
  assert.match(ids[0], /^MPS-[A-F0-9]{10}$/);
  assert.match(ids[1], /^MPS-[A-F0-9]{8}$/);
  migrateSyntheticSheet(sheet);
  assert.deepEqual(sheet.rows.map(row => row[0]), ids);
});

test('short, empty, or partial header rows fail closed', () => {
  for (const headers of [[], legacy.slice(0, 17), legacy.slice(0, 5)]) {
    const sheet = { headers: [...headers], rows: [] };
    const before = clone(sheet);
    assert.throws(() => migrateSyntheticSheet(sheet));
    assert.deepEqual(sheet, before);
  }
});

process.stdout.write('\\n' + passed + '/9 synthetic schema tests passed.\\n');
if (process.exitCode) process.exit(process.exitCode);
