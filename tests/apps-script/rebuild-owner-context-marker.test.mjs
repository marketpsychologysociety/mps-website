import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function requireOwnerContext_() {');
const end=source.indexOf('\nfunction ',start+1);
assert.ok(start>=0&&end>start,'owner guard source boundaries must exist');
const guardSource=source.slice(start,end);
function harness({marker='',owner='owner@example.com',actual='owner@example.com'}={}){
  let identityReads=0;
  const ctx={
    prop_:key=>key==='MPS_REBUILD_TEST_LABEL'?marker:key==='MPS_REBUILD_OWNER_EMAIL'?owner:'',
    Session:{getEffectiveUser:()=>({getEmail:()=>{identityReads++;return actual;}})}
  };
  vm.createContext(ctx);vm.runInContext(guardSource,ctx,{timeout:1000});
  return {run:()=>ctx.requireOwnerContext_(),reads:()=>identityReads};
}

test('owner-only actions fail before identity checks when isolated TEST marker is absent',()=>{
  const h=harness({marker:''});
  assert.throws(()=>h.run(),/MPS-ISOLATED-TEST/);
  assert.equal(h.reads(),0);
});

test('correct TEST marker and owner identity allow editor-only action',()=>{
  const h=harness({marker:'MPS-ISOLATED-TEST'});
  assert.equal(h.run(),undefined);
  assert.equal(h.reads(),1);
});

test('correct TEST marker does not bypass owner identity validation',()=>{
  const h=harness({marker:'MPS-ISOLATED-TEST',actual:'intruder@example.com'});
  assert.throws(()=>h.run(),/tidak cocok/);
});

test('owner identity must be explicitly configured',()=>{
  const h=harness({marker:'MPS-ISOLATED-TEST',owner:''});
  assert.throws(()=>h.run(),/belum diatur/);
});

test('webhook, trigger, credential, provisioning, and backup setup paths retain owner guard',()=>{
  const sensitive=['installMpsTelegramWebhook_','runMpsTelegramTestPollingSetup_','runMpsTelegramTestPollingStop_','initializeMpsAdminCredentials_','initializeMpsTotpSecrets_','provisionMpsRebuildStorage_','runMpsBackupSnapshot_','runMpsFullAcceptanceSuite_','installMpsWeeklyBackupTrigger_'];
  for(const name of sensitive){
    const i=source.indexOf('function '+name+'(');
    assert.ok(i>=0,'missing '+name);
    const next=source.indexOf('\nfunction ',i+1);
    const body=source.slice(i,next<0?undefined:next);
    if(name==='runMpsBackupSnapshot_') {
      assert.match(body,/createMpsBackupSnapshot_\s*\(/);
      const coreStart=source.indexOf('function createMpsBackupSnapshot_(');
      const coreEnd=source.indexOf('\nfunction ',coreStart+1);
      assert.match(source.slice(coreStart,coreEnd),/requireOwnerContext_\s*\(/);
    } else {
      assert.match(body,/requireOwnerContext_\s*\(/,name+' must require owner context');
    }
  }
});
