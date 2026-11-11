import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const adapterSource = readFileSync(fileURLToPath(new URL('./gas-effect-ledger-adapter.gs', import.meta.url)), 'utf8');

function makeRuntime() {
  const schemas = {
    audit: {name:'MPS Audit Logs', headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
    ticker: {name:'MPS VIP Ticker Events', headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']}
  };
  const sheets = new Map(Object.values(schemas).map(s => [s.name, [s.headers.slice()]]));
  let lockDepth = 0, lockAcquires = 0, lockReleases = 0;
  const sheetFor = name => {
    const rows = sheets.get(name);
    if (!rows) return null;
    return {
      getLastRow: () => rows.length,
      getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
      getRange(row, col, nr=1, nc=1) {
        return {
          getValues() { return Array.from({length:nr}, (_,r) => Array.from({length:nc}, (_,c) => rows[row-1+r]?.[col-1+c] ?? '')); },
          getDisplayValues() { return this.getValues().map(line => line.map(v => v == null ? '' : String(v))); },
          setNumberFormat() { return this; },
          setValue(value) { while (rows.length < row) rows.push([]); rows[row-1][col-1] = value; return this; },
          setValues(values) {
            values.forEach((line,r) => {
              const target = row-1+r;
              while (rows.length <= target) rows.push([]);
              while (rows[target].length < col-1) rows[target].push('');
              line.forEach((value,c) => { rows[target][col-1+c] = value; });
            });
            return this;
          }
        };
      }
    };
  };
  const context = {
    LockService: {getScriptLock() { return {
      waitLock() { if (lockDepth) throw new Error('MOCK_LOCK_REENTRANT'); lockDepth++; lockAcquires++; },
      releaseLock() { if (!lockDepth) throw new Error('MOCK_LOCK_NOT_HELD'); lockDepth--; lockReleases++; }
    }; }},
    SpreadsheetApp: {
      openById(id) { if (id !== 'isolated-vip-integration') throw new Error('WRONG_SPREADSHEET'); return {getSheetByName: sheetFor}; },
      flush() {}
    }
  };
  vm.runInNewContext(adapterSource + '\nthis.createLedger = createMpsGasEffectLedger_;', context);
  return {
    sheets, context,
    newLedger: () => context.createLedger({spreadsheetId:'isolated-vip-integration'}),
    lockCounts: () => ({acquires:lockAcquires,releases:lockReleases,depth:lockDepth})
  };
}

function activation(runtime, shared, update, crashAt='') {
  const ledger = runtime.newLedger();
  return ledger.runExclusive(tx => {
    tx.migrate('audit');
    tx.migrate('ticker');
    const intentKey = 'telegram:' + update.updateId + ':vip_activation';
    let intent = shared.intents.get(intentKey);
    if (!intent) {
      intent = {state:'INTENT', memberId:update.memberId, updateId:update.updateId, occurredAt:update.occurredAt};
      shared.intents.set(intentKey, intent);
    }
    if (crashAt === 'AFTER_INTENT') throw new Error('SIMULATED_CRASH_AFTER_INTENT');

    shared.memberStatus.set(update.memberId, 'ACTIVE');
    if (crashAt === 'AFTER_STATUS') throw new Error('SIMULATED_CRASH_AFTER_STATUS');

    const timestamp = new Date(update.occurredAt);
    const ticker = tx.appendOnce('ticker', 'telegram:' + update.updateId + ':vip_ticker', [
      'VIP-' + update.updateId, timestamp, update.memberId, update.memberName,
      'telah bergabung ke MPS VIP Community', 'Visible'
    ]);
    if (ticker.outcome === 'REVIEW_KEY_COLLISION') throw new Error('TICKER_KEY_COLLISION');
    if (crashAt === 'AFTER_TICKER') throw new Error('SIMULATED_CRASH_AFTER_TICKER');

    const audit = tx.appendOnce('audit', 'telegram:' + update.updateId + ':vip_audit', [
      timestamp, 'TELEGRAM', update.memberId, 'VIP_JOIN_APPROVED', update.memberId,
      'SUCCESS', 'Join VIP terkonfirmasi dari update Telegram.'
    ]);
    if (audit.outcome === 'REVIEW_KEY_COLLISION') throw new Error('AUDIT_KEY_COLLISION');
    if (crashAt === 'AFTER_AUDIT') throw new Error('SIMULATED_CRASH_AFTER_AUDIT');

    intent.state = 'COMPLETED';
    shared.intents.set(intentKey, intent);
    if (crashAt === 'AFTER_COMPLETE') throw new Error('SIMULATED_CRASH_AFTER_COMPLETE');
    return 'COMPLETED';
  });
}

function effectRows(runtime, sheetName) {
  const rows = runtime.sheets.get(sheetName);
  return rows.slice(1);
}

const update = Object.freeze({
  updateId: 7001, memberId:'MPS-ABCDEF12', memberName:'Test Member',
  occurredAt:1760000000000
});

for (const phase of ['AFTER_INTENT','AFTER_STATUS','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']) {
  test('real GAS adapter + isolated activation contract recovers crash at ' + phase + ' without duplicate rows', () => {
    const runtime = makeRuntime();
    const shared = {intents:new Map(), memberStatus:new Map()};
    assert.throws(() => activation(runtime, shared, update, phase), new RegExp('SIMULATED_CRASH_' + phase));
    assert.equal(activation(runtime, shared, update), 'COMPLETED');
    assert.equal(shared.memberStatus.get(update.memberId), 'ACTIVE');
    assert.equal(shared.intents.get('telegram:7001:vip_activation').state, 'COMPLETED');
    assert.equal(effectRows(runtime,'MPS VIP Ticker Events').length, 1);
    assert.equal(effectRows(runtime,'MPS Audit Logs').length, 1);
    const ticker = effectRows(runtime,'MPS VIP Ticker Events')[0];
    const audit = effectRows(runtime,'MPS Audit Logs')[0];
    assert.equal(ticker[1].getTime(), update.occurredAt);
    assert.equal(audit[0].getTime(), update.occurredAt);
    assert.equal(ticker[6], 'telegram:7001:vip_ticker');
    assert.equal(audit[7], 'telegram:7001:vip_audit');
  });
}

test('each handler critical section uses one ScriptLock across migration and keyed effects', () => {
  const runtime = makeRuntime();
  const shared = {intents:new Map(), memberStatus:new Map()};
  activation(runtime, shared, update);
  assert.deepEqual(runtime.lockCounts(), {acquires:1,releases:1,depth:0});
});

test('replay with same key but changed payload is quarantined as a collision', () => {
  const runtime = makeRuntime();
  const shared = {intents:new Map(), memberStatus:new Map()};
  activation(runtime, shared, update);
  const changed = {...update, memberName:'Different Name'};
  assert.throws(() => activation(runtime, shared, changed), /TICKER_KEY_COLLISION/);
  assert.equal(effectRows(runtime,'MPS VIP Ticker Events').length, 1);
});
