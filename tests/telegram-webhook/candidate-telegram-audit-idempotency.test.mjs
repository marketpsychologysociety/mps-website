import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function recordMpsAudit_(');
const end=source.indexOf('function apiAdminCheckSystemConfiguration(',start);
assert.ok(start>=0&&end>start,'audit writer and Telegram audit helper boundaries must exist');
const helpers=source.slice(start,end);

function harness(outcome='APPENDED'){
  const calls={ledger:[],legacy:[],errors:[]};
  const sheet={appendRow:row=>calls.legacy.push(row),getLastRow:()=>1,getLastColumn:()=>7};
  const context={
    MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-test-spreadsheet':''})},
    createMpsGasEffectLedger_:({spreadsheetId})=>({appendOnce:(kind,key,row)=>{calls.ledger.push({spreadsheetId,kind,key,row});return {outcome};}}),
    getMpsContentSheet_:()=>sheet,
    clean_:(value,max)=>String(value??'').slice(0,max),
    sheetText_:value=>String(value??''),
    cleanNewsText_:value=>String(value??'').slice(0,240),
    sha256_:value=>'h'+String(value).length.toString(16).padStart(63,'0'),
    safeErrorMessage_:error=>String(error&&error.message||error),
    console:{error:value=>calls.errors.push(String(value))}
  };
  vm.createContext(context);
  vm.runInContext(helpers+'\nthis.audit=recordMpsAudit_;this.auditOnce=recordMpsTelegramAuditOnce_;',context,{timeout:1000});
  return {audit:context.audit,auditOnce:context.auditOnce,calls};
}

test('Telegram audit events use the durable audit effect ledger with stable event time',()=>{
  const h=harness('APPENDED'),when=new Date('2026-11-16T05:00:00.000Z');
  assert.equal(h.auditOnce('update:123456','bot-permission:-100123','2026-11-16T05:00:00.000Z','TELEGRAM','BOT','BOT_GROUP_PERMISSION_CHANGED','-100123','WARNING','Permission changed'),true);
  assert.equal(h.calls.ledger.length,1);
  assert.equal(h.calls.ledger[0].spreadsheetId,'isolated-test-spreadsheet');
  assert.equal(h.calls.ledger[0].kind,'audit');
  assert.match(h.calls.ledger[0].key,/^telegram:audit:h/);
  assert.equal(h.calls.ledger[0].row[0].toISOString(),when.toISOString());
  assert.equal(h.calls.legacy.length,0);
});

test('same Telegram audit source/effect produces the same durable key and payload on replay',()=>{
  const h=harness('ALREADY_APPENDED'),at=new Date('2026-11-16T05:00:00.000Z');
  const args=['join-request:-100123:987654321:1760000000','already-declined',at,'TELEGRAM','987654321','VIP_JOIN_ALREADY_DECLINED','987654321','SUCCESS','Request already closed'];
  assert.equal(h.auditOnce(...args),true);
  assert.equal(h.auditOnce(...args),true);
  assert.equal(h.calls.ledger.length,2);
  assert.equal(h.calls.ledger[0].key,h.calls.ledger[1].key);
  assert.deepEqual(h.calls.ledger[0].row,h.calls.ledger[1].row);
});

test('effect-key payload collision fails closed instead of appending a duplicate audit row',()=>{
  const h=harness('REVIEW_KEY_COLLISION');
  assert.throws(()=>h.auditOnce('update:123','bot-permission','2026-11-16T05:00:00.000Z','TELEGRAM','BOT','BOT_GROUP_PERMISSION_CHANGED','-100123','WARNING','Changed'),
    /TELEGRAM_AUDIT_EFFECT_NOT_DURABLE/);
  assert.equal(h.calls.legacy.length,0);
  assert.equal(h.calls.errors.length,1);
});

test('invalid event timestamp is rejected before a durable audit write',()=>{
  const h=harness();
  assert.throws(()=>h.auditOnce('update:123','bot-permission','not-a-date','TELEGRAM','BOT','BOT_GROUP_PERMISSION_CHANGED','-100123','WARNING','Changed'),
    /TELEGRAM_AUDIT_EFFECT_IDENTITY_INVALID/);
  assert.equal(h.calls.ledger.length,0);
});

test('non-webhook audit calls retain the legacy append behavior',()=>{
  const h=harness();
  assert.equal(h.audit('ADMIN','SUPER_ADMIN','SETTING_CHANGED','SYSTEM','SUCCESS','Updated'),true);
  assert.equal(h.calls.legacy.length,1);
  assert.equal(h.calls.ledger.length,0);
});

test('Telegram webhook audit call sites use stable update and join-request effect keys',()=>{
  assert.ok(source.includes("recordMpsTelegramAuditOnce_('update:'+String(updateId),'bot-permission:"));
  assert.ok(source.includes("recordMpsTelegramAuditOnce_('join-request:'+chatId+':'+userId"));
});
