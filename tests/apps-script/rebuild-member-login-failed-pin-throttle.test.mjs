import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'rebuild/v4.8.1/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
function harness(){
  const cache=new Map(),stats={lock:0,release:0,failures:0,sessions:0,busy:false,audits:0};
  const props=new Map([['MPS_PIN_HASH_MPS-ABCDEF12','digest:salt123456'],['MPS_PIN_SALT_MPS-ABCDEF12','salt']]);
  const context={
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,String(v))})},
    LockService:{getScriptLock:()=>({tryLock:ms=>{stats.lock++;stats.waitMs=ms;return !stats.busy;},releaseLock:()=>{stats.release++;}})},
    sha256_:v=>'digest:'+String(v),
    clean_:(v,n)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,n),
    legacySheet_:()=>({getRange:(row,col)=>({getDisplayValue:()=>col===8?'Berhasil':''})}),
    findRow_:(sh,col,id)=>id==='MPS-ABCDEF12'?2:0,
    assertMembershipEntitlement_:()=>true,
    memberRenewalAccessState_:()=>({eligible:true,expired:false}),
    prop_:k=>props.get(k)||'',
    constantTimeEquals_:(a,b)=>String(a)===String(b),
    createSession_:(role,id)=>{stats.sessions++;return{ok:true,role,actorId:id};},
    audit_:()=>{stats.audits++;},
    console
  };
  vm.createContext(context);
  vm.runInContext(extract('enforceRateLimit_')+'\n'+extract('apiMemberLogin'),context,{timeout:1000});
  return{login:(id,pin)=>context.apiMemberLogin(id,pin),cache,stats};
}
test('failed PIN attempts are counted, but valid PIN bypasses an exhausted failure bucket',()=>{
  const h=harness();
  for(let i=0;i<8;i++)assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/PIN tidak valid/);
  assert.equal([...h.cache.values()][0],'8','eight failed checks must be recorded for this Member ID');
  const result=h.login('MPS-ABCDEF12','123456');
  assert.equal(result.ok,true);
  assert.equal(h.stats.sessions,1);
  assert.equal(h.cache.size,1);
});
test('ninth incorrect PIN is throttled after eight failed checks',()=>{
  const h=harness();
  for(let i=0;i<8;i++)assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/PIN tidak valid/);
  assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/Terlalu banyak percobaan/);
  assert.equal(h.stats.sessions,0);
  assert.equal(h.stats.lock,9);
  assert.equal(h.stats.release,9);
});
test('successful login does not consume the failed-attempt allowance',()=>{
  const h=harness();
  assert.equal(h.login('MPS-ABCDEF12','123456').ok,true);
  assert.equal(h.cache.size,0);
  assert.equal(h.stats.sessions,1);
  assert.equal(h.stats.lock,0);
});
test('malformed member ID or PIN is rejected before any failed-PIN counter is consumed',()=>{
  const h=harness();
  assert.throws(()=>h.login('not-a-member','000000'),/ID Member atau PIN tidak valid/);
  assert.throws(()=>h.login('MPS-ABCDEF12','abc'),/ID Member atau PIN tidak valid/);
  assert.equal(h.cache.size,0);
  assert.equal(h.stats.lock,0);
});
test('source increments the per-member throttle only after a failed PIN comparison',()=>{
  const body=extract('apiMemberLogin');
  const compare=body.indexOf('constantTimeEquals_');
  const throttle=body.indexOf("enforceRateLimit_('member-login'");
  const success=body.indexOf("return createSession_('MEMBER',id)");
  assert.ok(compare>=0&&throttle>compare&&success>throttle);
  assert.match(body,/A valid PIN always succeeds even after an attacker/);
});

test('rate-limit lock contention fails closed quickly without leaking the lock',()=>{
 const h=harness();h.stats.busy=true;
 assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/Sistem sedang sibuk/);
 assert.equal(h.stats.waitMs,1500);
 assert.equal(h.stats.release,0);
 assert.equal(h.cache.size,0);
 assert.equal(h.stats.audits,0);
});
test('rate-limit denial audits only after releasing the global lock',()=>{
 const h=harness();
 for(let i=0;i<8;i++)assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/PIN tidak valid/);
 assert.throws(()=>h.login('MPS-ABCDEF12','000000'),/Terlalu banyak percobaan/);
 assert.equal(h.stats.audits,1);
 assert.equal(h.stats.release,9);
});
