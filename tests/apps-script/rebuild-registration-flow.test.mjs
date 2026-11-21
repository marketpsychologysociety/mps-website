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
    deleteRow(row){this.rows.splice(row-1,1);},
    getRange(row,col,numRows=1,numCols=1){
      const self=this;
      return {
        getValues(){return Array.from({length:numRows},(_,ri)=>Array.from({length:numCols},(_,ci)=>self.rows[row-1+ri]?.[col-1+ci]??''));},
        getValue(){return self.rows[row-1]?.[col-1]??'';},
        getDisplayValue(){return String(self.rows[row-1]?.[col-1]??'');},
        setValue(value){self.rows[row-1][col-1]=value;},
        setValues(values){values.forEach((r,ri)=>r.forEach((v,ci)=>{self.rows[row-1+ri][col-1+ci]=v;}));}
      };
    }
  };
}
function harness(existing=[]){
  const applications=makeSheet(existing),plans=makeSheet(),ledger=makeSheet();
  const audits=[],accessed=[];
  const ctx={
    clean_:(v,max)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max),
    cleanUsername_:v=>String(v||'').replace(/^@/,'').trim().toLowerCase(),
    enforceRateLimit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    sheet_:key=>{accessed.push(key);if(key==='applications')return applications;if(key==='membershipPlans')return plans;if(key==='ledger')return ledger;throw Error('unexpected sheet '+key);},
    rows_:sh=>sh.rows,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex(r=>String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    randomHex_:()=> '0123456789ABCDEF0123',
    sha256_:()=> 'A'.repeat(64),
    audit_:(...args)=>audits.push(args),
  };
  vm.createContext(ctx);vm.runInContext(apiSource,ctx,{timeout:1000});
  return {ctx,applications,plans,ledger,audits,accessed};
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
  assert.deepEqual(h.accessed,['applications','membershipPlans','ledger']);
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

test('identical registration retry returns the original Application Ref without duplicate rows',()=>{
  const h=harness();
  const first=h.ctx.apiRegister(valid),second=h.ctx.apiRegister(valid);
  assert.equal(second.applicationRef,first.applicationRef);
  assert.equal(second.idempotent,true);
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.plans.rows.length,1);
  assert.equal(h.ledger.rows.length,1);
  assert.equal(h.ledger.rows[0][2],'COMMITTED');
});
test('STARTED request reconciles matching application and plan rows after lost journal acknowledgement',()=>{
  const h=harness(),first=h.ctx.apiRegister(valid);
  h.ledger.rows[0][2]='STARTED';
  const retry=h.ctx.apiRegister(valid);
  assert.equal(retry.applicationRef,first.applicationRef);
  assert.equal(retry.reconciled,true);
  assert.equal(h.ledger.rows[0][2],'COMMITTED');
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.plans.rows.length,1);
});
test('partial registration rows are quarantined and never duplicated on retry',()=>{
  const h=harness(),first=h.ctx.apiRegister(valid);
  h.plans.rows.length=0;h.ledger.rows[0][2]='STARTED';
  assert.throws(()=>h.ctx.apiRegister(valid),/rekonsiliasi Admin/);
  assert.equal(h.ledger.rows[0][2],'NEEDS_RECONCILIATION');
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.plans.rows.length,0);
  assert.equal(first.applicationRef,h.applications.rows[0][0]);
});
