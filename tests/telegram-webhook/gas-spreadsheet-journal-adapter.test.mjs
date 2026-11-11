import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const headers = [
  'Update ID', 'Update Type', 'Payload SHA-256', 'State',
  'First Seen At', 'Last Attempt At', 'Attempt Count',
  'Lease Expires At', 'Claim Token', 'Completed At',
  'Effect Keys JSON', 'Last Error Code'
];
const source = readFileSync(fileURLToPath(new URL('./gas-spreadsheet-journal-adapter.gs', import.meta.url)), 'utf8');

function makeHarness(options = {}) {
  const rows = [options.badHeaders ? ['wrong'] : headers.slice()];
  let lockDepth = 0;
  let lockAcquisitions = 0;
  let uuidCounter = 0;
  const sheet = {
    getLastRow() { return rows.length; },
    getRange(row, column, numRows, numColumns) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const sourceRow = rows[row - 1 + r] || [];
            out.push(Array.from({ length: numColumns }, (_, c) => sourceRow[column - 1 + c] ?? ''));
          }
          return out;
        },
        getDisplayValues() {
          return this.getValues().map(line => line.map(value => value == null ? '' : String(value)));
        },
        setNumberFormat(_format) {},
        setValues(values) {
          for (let r = 0; r < values.length; r++) {
            const target = row - 1 + r;
            while (rows.length <= target) rows.push([]);
            const current = rows[target] || [];
            for (let c = 0; c < values[r].length; c++) current[column - 1 + c] = values[r][c];
            rows[target] = current;
          }
        }
      };
    }
  };
  const context = {
    SpreadsheetApp: {
      openById(id) {
        if (id !== 'isolated-test-spreadsheet') throw new Error('UNEXPECTED_SPREADSHEET_ID');
        return { getSheetByName(name) {
          if (options.missingSheet || name !== 'MPS Telegram Update Journal') return null;
          return sheet;
        } };
      },
      flush() {}
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock(ms) {
            lockAcquisitions++;
            if (lockDepth) throw new Error('LOCK_REENTRANT');
            if (!(ms > 0)) throw new Error('INVALID_LOCK_WAIT');
            lockDepth++;
          },
          releaseLock() { lockDepth--; }
        };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      computeDigest(_algorithm, value) {
        return Array.from(createHash('sha256').update(value, 'utf8').digest(), byte => byte > 127 ? byte - 256 : byte);
      },
      getUuid() { uuidCounter++; return 'isolated-claim-' + uuidCounter; }
    }
  };
  vm.runInNewContext(source, context, { timeout: 1000 });
  const create = config => context.createMpsTelegramGasJournal_(Object.assign({
    spreadsheetId: 'isolated-test-spreadsheet',
    sheetName: 'MPS Telegram Update Journal',
    leaseMs: 60000
  }, config || {}));
  return { create, rows, get lockAcquisitions() { return lockAcquisitions; } };
}

const update = (id = 7001) => ({
  update_id: id,
  message: { chat: { id: 99 }, text: 'sensitive message text' }
});

test('Apps Script adapter persists a minimal journal row without raw message content', () => {
  const h = makeHarness();
  const journal = h.create();
  const claim = journal.claim(update(), 1000);
  assert.equal(claim.outcome, 'CLAIMED');
  assert.equal(claim.row.state, 'PROCESSING');
  assert.equal(h.rows.length, 2);
  assert.equal(typeof h.rows[1][0], 'string');
  assert.equal(JSON.stringify(h.rows).includes('sensitive message text'), false);
  assert.match(String(h.rows[1][2]), /^[a-f0-9]{64}$/);
});

test('completed update remains deduplicated after adapter recreation', () => {
  const h = makeHarness();
  const first = h.create();
  const claim = first.claim(update(), 1000);
  first.finish(7001, claim.row.claimToken, 1050, ['vip:welcome']);
  assert.equal(h.create().claim(update(), 1100).outcome, 'DUPLICATE_DONE');
});

test('serialized claims prevent a second delivery from acquiring an active lease', () => {
  const h = makeHarness();
  const journal = h.create();
  assert.equal(journal.claim(update(), 1000).outcome, 'CLAIMED');
  assert.equal(journal.claim(update(), 1050).outcome, 'BUSY');
  assert.ok(h.lockAcquisitions >= 2);
});

test('payload hashing is stable across JSON object key order', () => {
  const h = makeHarness();
  const journal = h.create();
  const first = { update_id: 7002, message: { chat: { id: 99, type: 'private' }, text: '/start' } };
  const reordered = { message: { text: '/start', chat: { type: 'private', id: 99 } }, update_id: 7002 };
  assert.equal(journal.claim(first, 1000).outcome, 'CLAIMED');
  assert.equal(journal.claim(reordered, 1010).outcome, 'BUSY');
});

test('same update ID with a different payload is quarantined', () => {
  const h = makeHarness();
  const journal = h.create();
  journal.claim(update(), 1000);
  const collision = journal.claim({ update_id: 7001, message: { text: 'changed payload' } }, 1010);
  assert.equal(collision.outcome, 'MANUAL_REVIEW');
  assert.equal(h.rows[1][3], 'REVIEW');
  assert.equal(h.rows[1][11], 'PAYLOAD_HASH_MISMATCH');
});

test('payload collision after DONE enters a valid manual-review state', () => {
  const h = makeHarness();
  const journal = h.create();
  const first = journal.claim(update(), 1000);
  journal.finish(7001, first.row.claimToken, 1050);
  const collision = journal.claim({ update_id: 7001, message: { text: 'changed after completion' } }, 1100);
  assert.equal(collision.outcome, 'MANUAL_REVIEW');
  assert.equal(h.rows[1][3], 'REVIEW');
  assert.equal(h.rows[1][9], '');
  assert.equal(journal.claim(update(), 1200).outcome, 'MANUAL_REVIEW');
});

test('expired lease can be reclaimed and stale worker is fenced out', () => {
  const h = makeHarness();
  const oldWorker = h.create();
  const first = oldWorker.claim(update(), 1000);
  const newWorker = h.create();
  const second = newWorker.claim(update(), 62000);
  assert.equal(second.outcome, 'CLAIMED');
  assert.throws(() => oldWorker.finish(7001, first.row.claimToken, 62100), /STALE_OR_INVALID_CLAIM/);
  newWorker.finish(7001, second.row.claimToken, 62120);
  assert.equal(h.rows[1][3], 'DONE');
});

test('lease expiry blocks a late transition even before another claim arrives', () => {
  const h = makeHarness();
  const journal = h.create();
  const claim = journal.claim(update(), 1000);
  assert.throws(() => journal.finish(7001, claim.row.claimToken, 61000), /STALE_OR_INVALID_CLAIM/);
  assert.equal(h.rows[1][3], 'PROCESSING');
});

test('initial RECEIVED rows with zero attempts can be claimed safely', () => {
  const h = makeHarness();
  const journal = h.create();
  journal.claim(update(), 1000);
  h.rows[1][3] = 'RECEIVED';
  h.rows[1][5] = 0;
  h.rows[1][6] = 0;
  h.rows[1][7] = 0;
  h.rows[1][8] = '';
  h.rows[1][9] = '';
  const claimed = journal.claim(update(), 1100);
  assert.equal(claimed.outcome, 'CLAIMED');
  assert.equal(claimed.row.attemptCount, 1);
});

test('transient failure is retryable and increments attempt count on reclaim', () => {
  const h = makeHarness();
  const journal = h.create();
  const first = journal.claim(update(), 1000);
  journal.retry(7001, first.row.claimToken, 1050, 'network_timeout');
  const second = journal.claim(update(), 1100);
  assert.equal(second.outcome, 'CLAIMED');
  assert.equal(second.recovered, true);
  assert.equal(second.row.attemptCount, 2);
});

test('missing journal tab fails closed', () => {
  const h = makeHarness({ missingSheet: true });
  assert.throws(() => h.create().claim(update(), 1000), /JOURNAL_SHEET_MISSING/);
});

test('schema mismatch fails closed without creating or repairing a tab', () => {
  const h = makeHarness({ badHeaders: true });
  assert.throws(() => h.create().claim(update(), 1000), /JOURNAL_SCHEMA_MISMATCH/);
  assert.equal(h.rows.length, 1);
});

test('malformed journal row metadata fails closed', () => {
  const h = makeHarness();
  const journal = h.create();
  journal.claim(update(), 1000);
  h.rows[1][1] = 'UNTRUSTED_UPDATE_TYPE';
  assert.throws(() => journal.claim(update(), 1010), /JOURNAL_ROW_CORRUPT/);
});

test('duplicate update ID rows are treated as journal corruption', () => {
  const h = makeHarness();
  const journal = h.create();
  const claim = journal.claim(update(), 1000);
  h.rows.push(h.rows[1].slice());
  assert.throws(() => journal.finish(7001, claim.row.claimToken, 1010), /JOURNAL_DUPLICATE_UPDATE_ID/);
});

test('unsafe numeric update IDs and malformed string IDs fail closed', () => {
  const h = makeHarness();
  const journal = h.create();
  assert.throws(() => journal.claim(update(Number.MAX_SAFE_INTEGER + 1), 1000), /INVALID_UPDATE_ID/);
  assert.throws(() => journal.claim(update('7001;bad'), 1000), /INVALID_UPDATE_ID/);
});

test('effect keys are bounded and validated before journal write', () => {
  const h = makeHarness();
  const journal = h.create();
  const claim = journal.claim(update(), 1000);
  assert.throws(() => journal.finish(7001, claim.row.claimToken, 1010, ['member phone 0812']), /INVALID_EFFECT_KEY/);
  assert.equal(h.rows[1][3], 'PROCESSING');
});
