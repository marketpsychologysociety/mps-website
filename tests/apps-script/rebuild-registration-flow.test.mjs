import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function apiRegister(input) {');
const end=source.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start,'apiRegister source boundaries must exist');
const apiSource=source.slice(start,end);

function makeSheet(rows=[]){
  return {
    rows:rows.map(r=>r.slice()),
    appendRow(row){this.rows.push(row.slice());},
  };
}
function harness(existing=[]){
  const applications=makeSheet(existing);
  const plans=makeSheet();
  const audits=[];
  const accessed=[];
  const ctx={
    clean_:(v,max)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max),
    cleanUsername_:v=>String(v||'').replace(/^@/,'').trim().toLowerCase(),
    enforceRateLimit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    sheet_:key=>{accessed.push(key);if(key==='applications')return applications;if(key==='membershipPlans')return plans;throw Error('unexpected sheet '+key);},
    rows_:sh=>sh.rows,
    randomHex_:()=> '0123456789ABCDEF0123',
    audit_:(...args)=>audits.push(args),
  };
  vm.createContext(ctx);vm.runInContext(apiSource,ctx,{timeout:1000});
  return {ctx,applications,plans,audits,accessed};
}
const valid={nickname:'Trader MPS',telegramUsername:'@trader_mps',country:'Indonesia',
  goal:'Belajar money management',note:'',plan:'REGULAR'};

test('registration creates Application Ref and plan only; never issues member ID or notifies Telegram',()=>{
  const h=harness();
  const result=h.ctx.apiRegister(valid);
  assert.equal(result.ok,true);
  assert.equal(result.applicationRef,'MPS-APP-0123456789ABCDEF0123');
  assert.equal(result.plan,'REGULAR');
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.applications.rows[0][0],result.applicationRef);
  assert.equal(h.applications.rows[0][7],'Menunggu Pendaftaran');
  assert.equal(h.applications.rows[0][8],'','member ID column must remain empty at initial registration');
  assert.equal(h.plans.rows[0][0],result.applicationRef);
  assert.equal(h.plans.rows[0][1],'REGULAR');
  assert.equal(h.plans.rows[0][3],100000);
  assert.deepEqual(h.accessed,['applications','membershipPlans']);
  assert.equal(h.audits.length,1);
});

test('Active IB registration records zero MPS monthly fee and awaits manual IB verification',()=>{
  const h=harness();
  const result=h.ctx.apiRegister({...valid,plan:'ACTIVE_IB'});
  assert.equal(result.ok,true);
  assert.equal(h.plans.rows[0][1],'ACTIVE_IB');
  assert.equal(h.plans.rows[0][3],0);
  assert.equal(h.plans.rows[0][4],'Menunggu Verifikasi Manual');
});

test('duplicate active Telegram username is rejected without appending a second application',()=>{
  const h=harness([['MPS-APP-AAAAAAAAAAAAAAAAAAAA',new Date(),'Old','trader_mps','','','',
    'Menunggu Deposit']]);
  assert.throws(()=>h.ctx.apiRegister(valid),/sudah memiliki pengajuan aktif/);
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.plans.rows.length,0);
});

test('rejected prior application does not permanently block a new registration',()=>{
  const h=harness([['MPS-APP-AAAAAAAAAAAAAAAAAAAA',new Date(),'Old','trader_mps','','','',
    'Ditolak']]);
  const result=h.ctx.apiRegister(valid);
  assert.equal(result.ok,true);
  assert.equal(h.applications.rows.length,2);
});

test('invalid Telegram username, membership plan, and goal fail before any sheet writes',()=>{
  for(const input of [
    {...valid,telegramUsername:'bad name'},
    {...valid,plan:'FREE'},
    {...valid,goal:'Trading profit guarantee'},
  ]){
    const h=harness();
    assert.throws(()=>h.ctx.apiRegister(input));
    assert.equal(h.applications.rows.length,0);
    assert.equal(h.plans.rows.length,0);
  }
});
