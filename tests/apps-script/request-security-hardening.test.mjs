import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
const limiterSource=extract('consumePersistentBucketRateLimit_');
function limiterHarness(shared=new Map()){
  let acquired=0,released=0,writes=0;
  const props={
    getProperty:key=>shared.get(key)||null,
    setProperty:(key,value)=>{writes++;shared.set(key,String(value));},
  };
  const context={
    LockService:{getScriptLock:()=>({waitLock:()=>{acquired++;},releaseLock:()=>{released++;}})},
    PropertiesService:{getScriptProperties:()=>props},
    safeParseJson_:(value,fallback)=>{try{return JSON.parse(value);}catch{return fallback;}},
    console
  };
  vm.createContext(context);vm.runInContext(limiterSource,context,{timeout:1000});
  return{run:(...args)=>context.consumePersistentBucketRateLimit_(...args),shared,stats:()=>({acquired,released,writes})};
}

test('persistent aggregate limiter survives a fresh execution context and CacheService loss',()=>{
  const store=new Map(),first=limiterHarness(store);
  first.run('member_login_global',2,60,'blocked');
  first.run('member_login_global',2,60,'blocked');
  assert.throws(()=>first.run('member_login_global',2,60,'blocked'),/blocked/);
  const second=limiterHarness(store);
  assert.throws(()=>second.run('member_login_global',2,60,'blocked'),/blocked/);
  assert.equal(store.has('MPS_RATE_BUCKET_member_login_global'),true);
  assert.deepEqual(second.stats(),{acquired:1,released:1,writes:0});
});

test('persistent aggregate limiter isolates fixed buckets',()=>{
  const h=limiterHarness();
  h.run('public_submit_register',1,600,'register blocked');
  h.run('public_submit_deposit',1,600,'deposit blocked');
  assert.throws(()=>h.run('public_submit_register',1,600,'register blocked'),/register blocked/);
  assert.throws(()=>h.run('public_submit_deposit',1,600,'deposit blocked'),/deposit blocked/);
  assert.equal(h.shared.size,2);
});

test('persistent aggregate limiter rejects attacker-controlled property names',()=>{
  const h=limiterHarness();
  assert.throws(()=>h.run('public_submit_'+('x'.repeat(1000)),1,60,'blocked'),/bucket tidak dikenal/);
  assert.equal(h.shared.size,0);
  assert.deepEqual(h.stats(),{acquired:0,released:0,writes:0});
});

test('persistent aggregate limiter resets expired windows and fails closed on corrupt state',()=>{
  const h=limiterHarness();
  h.shared.set('MPS_RATE_BUCKET_ad_request_global',JSON.stringify({startedAt:1,count:99}));
  h.run('ad_request_global',1,60,'blocked');
  assert.equal(JSON.parse(h.shared.get('MPS_RATE_BUCKET_ad_request_global')).count,1);
  h.shared.set('MPS_RATE_BUCKET_ad_request_global','not-json');
  assert.throws(()=>h.run('ad_request_global',5,60,'blocked'),/tidak valid/);
});

test('durable request ledger is provisioned only by the Super Admin initialization path',()=>{
  assert.match(source,/const MPS_REQUEST_LEDGER = Object\.freeze\(\{\s*sheet: 'MPS Request Ledger'/);
  const start=source.indexOf('function apiAdminInitializeContent(session)');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  assert.match(body,/requireSuperAdmin_\(session\)/);
  assert.match(body,/MPS_MEMBER_LINKS,MPS_REQUEST_LEDGER/);
  assert.match(source,/function getMpsRequestLedgerSheet_\(\)/);
  assert.match(source,/function findMpsRequestLedgerRow_\(sh,requestId\)/);
});

test('public request status reads only generic completion state from durable ledger',()=>{
  const start=source.indexOf('function doGet(e)');
  const end=source.indexOf('\nfunction doPost(e)',start+1);
  const body=source.slice(start,end);
  assert.match(body,/getMpsRequestLedgerSheet_\(\)/);
  assert.match(body,/findMpsRequestLedgerRow_\(ledger,requestId\)/);
  assert.match(body,/state==='COMPLETED'/);
  assert.doesNotMatch(body,/saved\.result|telegramUrl|memberId/);
});

test('submission reserves request ID under script lock before business writes and persists replay output',()=>{
  const start=source.indexOf('function submitCore_(data)');
  const end=source.indexOf('function registerMember_(',start+1);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  assert.ok(body.indexOf('lock.waitLock(20000)')<body.indexOf('ledger.appendRow('));
  assert.ok(body.indexOf('ledger.appendRow(')<body.indexOf('registerMember_(null, data'));
  assert.ok(body.indexOf('ledger.appendRow(')<body.indexOf('saveDeposit_(sheet, data'));
  assert.match(body,/String\(saved\[2\]\|\|''\)==='COMPLETED'/);
  assert.match(body,/String\(saved\[2\]\|\|''\)==='FAILED'/);
  assert.match(body,/PENDING is fail-closed/);
  assert.match(body,/const requestId=suppliedRequestId\|\|\('mps'\+requestFingerprint\.slice\(0,40\)\)/);
  assert.doesNotMatch(body,/telegramUrl:String\(saved\[/);
  assert.doesNotMatch(body,/telegramExpiresAt:String\(saved\[/);
  assert.doesNotMatch(body,/result\.telegramUrl\|\|''/);
  assert.doesNotMatch(body,/result\.telegramExpiresAt\|\|''/);
  assert.doesNotMatch(body,/cache\.put\('mps_req_/);
});

test('pre-commit validation failures are retryable while uncertain post-commit failures remain fail-closed',()=>{
  const submit=extract('submitCore_');
  assert.match(submit,/if\(ledgerReserved&&ledgerRow&&!businessCommitStarted\)[\s\S]{0,180}setValue\('FAILED'\)/);
  assert.match(submit,/PENDING is fail-closed/);
  assert.match(submit,/businessCommitStarted=true/);
  assert.match(source,/function registerMember_\(sheet, data, onCommitStarted\)/);
  assert.match(source,/function saveDeposit_\(sheet, data, onFileCreated, onProofLinked, onCommitStarted\)/);
  assert.equal((source.match(/if\(typeof onCommitStarted==='function'\)onCommitStarted\(\);/g)||[]).length,2);
  assert.match(source,/function saveDeposit_\(sheet, data, onFileCreated, onProofLinked, onCommitStarted\)/);
});

test('Super Admin read-only configuration diagnostic reports request ledger schema readiness',()=>{
  const body=extract('apiAdminCheckSystemConfiguration');
  assert.match(body,/MPS_REQUEST_LEDGER/);
  assert.match(body,/MPS Request Ledger schema/);
  assert.match(body,/Sheet belum diprovisikan/);
  assert.match(body,/readOnly:true/);
});

test('all aggregate public/login throttles use a fixed persistent allow-listed bucket',()=>{
  assert.match(source,/const allowed=\['member_login_global','public_submit_register','public_submit_deposit','ad_request_global'\]/);
  assert.match(source,/consumePersistentBucketRateLimit_\('member_login_global',600,60/);
  assert.match(source,/consumePersistentBucketRateLimit_\('public_submit_' \+ action/);
  assert.match(source,/consumePersistentBucketRateLimit_\('ad_request_global',30,3600/);
});
