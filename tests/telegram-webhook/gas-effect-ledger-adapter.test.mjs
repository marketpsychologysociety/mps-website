import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const source=readFileSync(fileURLToPath(new URL('./gas-effect-ledger-adapter.gs',import.meta.url)),'utf8');
const schemas={audit:{name:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},ticker:{name:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']}};
function harness({kind='audit',missing=false,rows:initial,failFlushAt=0,failLock=false,failSetValuesAt=0}={}){
 const s=schemas[kind],rows=(initial||[s.headers.slice()]).map(r=>r.slice());let flush=0,setValuesCount=0,depth=0,acquired=0,released=0;
 const sheet={getLastRow(){return rows.length;},getLastColumn(){return Math.max(0,...rows.map(r=>r.length));},getRange(row,col,nr=1,nc=1){return{
  getValues(){return Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>rows[row-1+r]?.[col-1+c]??''));},
  getDisplayValues(){return this.getValues().map(line=>line.map(v=>v==null?'':String(v)));},
  setNumberFormat(){return this;},setValue(v){while(rows.length<row)rows.push([]);rows[row-1][col-1]=v;return this;},
  setValues(values){setValuesCount++;if(failSetValuesAt===setValuesCount)throw Error('SIMULATED_SET_VALUES_FAILURE');values.forEach((line,r)=>{const target=row-1+r;while(rows.length<=target)rows.push([]);while(rows[target].length<col-1)rows[target].push('');line.forEach((v,c)=>rows[target][col-1+c]=v);});return this;}
 };}};
 const context={SpreadsheetApp:{openById(id){if(id!=='isolated-effect-test')throw Error('WRONG_SPREADSHEET');return{getSheetByName(name){return missing||name!==s.name?null:sheet;}};},flush(){flush++;if(failFlushAt===flush)throw Error('SIMULATED_FLUSH_FAILURE');}},
 LockService:{getScriptLock(){return{waitLock(ms){acquired++;if(failLock)throw Error('SIMULATED_LOCK_FAILURE');if(depth)throw Error('LOCK_REENTRANT');if(!(ms>0))throw Error('BAD_LOCK_WAIT');depth++;},releaseLock(){released++;depth--;}};}}};
 vm.runInNewContext(source,context,{timeout:1000});
 return{rows,create:()=>context.createMpsGasEffectLedger_({spreadsheetId:'isolated-effect-test'}),get acquired(){return acquired;},get released(){return released;},get depth(){return depth;}};
}
const arow=()=>['2026-01-01T00:00:00Z','system','member-1','VIP_JOIN','member-1','OK','test'];
const trow=()=>['evt-1','2026-01-01T00:00:00Z','member-1','Test Member','joined','ACTIVE'];
test('audit migration appends col 8 and preserves old rows',()=>{const old=['d','system','old','OLD','old','OK','legacy'];const h=harness({rows:[schemas.audit.headers,old]});const r=h.create().migrate('audit');assert.equal(r.outcome,'MIGRATED');assert.equal(r.keyColumn,8);assert.deepEqual(h.rows[0],[...schemas.audit.headers,'Effect Key']);assert.deepEqual(h.rows[1],old);});
test('ticker migration appends col 7',()=>{const h=harness({kind:'ticker'});const r=h.create().migrate('ticker');assert.equal(r.outcome,'MIGRATED');assert.equal(r.keyColumn,7);});
test('migration recognizes already migrated sheet',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']]});assert.equal(h.create().migrate('audit').outcome,'ALREADY_MIGRATED');});
test('crash after header write is recovered on replay',()=>{const h=harness({failFlushAt:1});assert.throws(()=>h.create().migrate('audit'),/SIMULATED_FLUSH_FAILURE/);assert.equal(h.rows[0][7],'Effect Key');assert.equal(h.create().migrate('audit').outcome,'ALREADY_MIGRATED');});
test('legacy header mismatch fails closed',()=>{const bad=schemas.audit.headers.slice();bad[2]='Actor';const h=harness({rows:[bad]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_LEGACY_SCHEMA_MISMATCH/);assert.deepEqual(h.rows[0],bad);});
test('unknown extra columns fail closed',()=>{const h=harness({rows:[[...schemas.audit.headers,'Operator Note']]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_UNKNOWN_EXTRA_COLUMNS/);});
test('populated unlabelled extension column is not overwritten',()=>{const h=harness({rows:[schemas.audit.headers,['d','r','a','x','t','ok','legacy','data']]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_UNKNOWN_EXTRA_COLUMNS/);});
test('missing target tab is not created',()=>{const h=harness({missing:true});assert.throws(()=>h.create().migrate('audit'),/EFFECT_SHEET_MISSING/);});
test('spreadsheet ID is mandatory',()=>{const c={};vm.runInNewContext(source,c);assert.throws(()=>c.createMpsGasEffectLedger_({}),/EFFECT_SPREADSHEET_ID_REQUIRED/);});
test('unknown sheet kind is rejected',()=>{const h=harness();assert.throws(()=>h.create().migrate('members'),/UNKNOWN_EFFECT_SHEET/);});
test('append persists key as final column',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']]});const r=h.create().appendOnce('audit','telegram:1:vip_join_audit',arow());assert.equal(r.outcome,'APPENDED');assert.equal(r.row,2);assert.deepEqual(h.rows[1],[...arow(),'telegram:1:vip_join_audit']);});
test('same key and same payload replay is idempotent',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']]});const l=h.create();assert.equal(l.appendOnce('audit','telegram:2:vip_join_audit',arow()).outcome,'APPENDED');assert.equal(l.appendOnce('audit','telegram:2:vip_join_audit',arow()).outcome,'ALREADY_APPENDED');assert.equal(h.rows.length,2);});
test('same key with changed payload is quarantined',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']]});const l=h.create();l.appendOnce('audit','telegram:3:vip_join_audit',arow());const changed=arow();changed[3]='DIFFERENT';assert.equal(l.appendOnce('audit','telegram:3:vip_join_audit',changed).outcome,'REVIEW_KEY_COLLISION');assert.equal(h.rows.length,2);});
test('crash after append is reconciled by same key',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']],failFlushAt:1});assert.throws(()=>h.create().appendOnce('audit','telegram:4:vip_join_audit',arow()),/SIMULATED_FLUSH_FAILURE/);assert.equal(h.rows.length,2);assert.equal(h.create().appendOnce('audit','telegram:4:vip_join_audit',arow()).outcome,'ALREADY_APPENDED');});
test('repeated duplicate calls under the serialized lock produce one append',async()=>{const h=harness({kind:'ticker',rows:[[...schemas.ticker.headers,'Effect Key']]});const l=h.create();const rs=await Promise.all([1,2,3,4].map(()=>Promise.resolve().then(()=>l.appendOnce('ticker','telegram:5:vip_ticker_event',trow()))));assert.equal(rs.filter(x=>x.outcome==='APPENDED').length,1);assert.equal(h.rows.length,2);assert.equal(h.depth,0);});
test('duplicate pre-existing keys fail closed',()=>{const row=[...arow(),'telegram:6:vip_join_audit'];const h=harness({rows:[[...schemas.audit.headers,'Effect Key'],row,row]});assert.throws(()=>h.create().appendOnce('audit','telegram:7:vip_join_audit',arow()),/EFFECT_DUPLICATE_EXISTING_KEY/);});
test('malformed pre-existing key fails closed',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key'],[...arow(),'bad key']]});assert.throws(()=>h.create().appendOnce('audit','telegram:8:vip_join_audit',arow()),/EFFECT_INVALID_EXISTING_KEY/);});
test('invalid key and wrong row width are rejected',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']]});const l=h.create();assert.throws(()=>l.appendOnce('audit','bad key',arow()),/INVALID_EFFECT_KEY/);assert.throws(()=>l.appendOnce('audit','telegram:9:vip_join_audit',['short']),/INVALID_EFFECT_ROW/);});
test('lock releases after schema validation failure',()=>{const bad=schemas.audit.headers.slice();bad[0]='wrong';const h=harness({rows:[bad]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_LEGACY_SCHEMA_MISMATCH/);assert.equal(h.depth,0);assert.equal(h.acquired,h.released);});
test('lock failure prevents mutation',()=>{const h=harness({failLock:true});assert.throws(()=>h.create().migrate('audit'),/SIMULATED_LOCK_FAILURE/);assert.equal(h.rows[0].length,7);});
test('append before explicit migration is blocked',()=>{const h=harness();assert.throws(()=>h.create().appendOnce('audit','telegram:10:vip_join_audit',arow()),/EFFECT_MIGRATION_REQUIRED/);});
test('ticker append keeps six legacy fields plus key',()=>{const h=harness({kind:'ticker',rows:[[...schemas.ticker.headers,'Effect Key']]});assert.equal(h.create().appendOnce('ticker','telegram:11:vip_ticker_event',trow()).outcome,'APPENDED');assert.deepEqual(h.rows[1],[...trow(),'telegram:11:vip_ticker_event']);});

test('whitespace-padded persisted keys fail closed instead of bypassing exact-key replay',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key'],[...arow(),' telegram:12:vip_join_audit ']]});assert.throws(()=>h.create().appendOnce('audit','telegram:12:vip_join_audit',arow()),/EFFECT_INVALID_EXISTING_KEY/);});

test('whitespace-altered legacy header fails exact schema validation',()=>{const headers=schemas.audit.headers.slice();headers[0]='Timestamp ';const h=harness({rows:[headers]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_LEGACY_SCHEMA_MISMATCH/);});

test('append write failure before persistence leaves no row and permits safe retry',()=>{const h=harness({rows:[[...schemas.audit.headers,'Effect Key']],failSetValuesAt:1});const l=h.create();assert.throws(()=>l.appendOnce('audit','telegram:13:vip_join_audit',arow()),/SIMULATED_SET_VALUES_FAILURE/);assert.equal(h.rows.length,1);assert.equal(h.depth,0);assert.equal(h.acquired,h.released);assert.equal(h.create().appendOnce('audit','telegram:13:vip_join_audit',arow()).outcome,'APPENDED');});
test('migration lock is released when flush fails after header persistence',()=>{const h=harness({failFlushAt:1});assert.throws(()=>h.create().migrate('audit'),/SIMULATED_FLUSH_FAILURE/);assert.equal(h.rows[0][7],'Effect Key');assert.equal(h.depth,0);assert.equal(h.acquired,h.released);});
test('already-migrated schema rejects duplicate historical keys during migration verification',()=>{const row=[...arow(),'telegram:14:vip_join_audit'];const h=harness({rows:[[...schemas.audit.headers,'Effect Key'],row,row]});assert.throws(()=>h.create().migrate('audit'),/EFFECT_DUPLICATE_EXISTING_KEY/);assert.equal(h.depth,0);});


// A second, shared-service V8 harness creates independent VM contexts while
// retaining the same fake spreadsheet and lock service between invocations.
// This is still a mock runtime, not a deployed Google Apps Script project.
function sharedGasRuntime({kind='audit',failFlushAt=0,failWrite=''}={}){
 const schema=schemas[kind],rows=[schema.headers.slice()];let held=false,flushes=0,opens=0;
 const sheet={
  getLastRow(){return rows.length;},
  getLastColumn(){return Math.max(0,...rows.map(r=>r.length));},
  getRange(row,col,nr=1,nc=1){return{
   getValues(){return Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>rows[row-1+r]?.[col-1+c]??''));},
   getDisplayValues(){return this.getValues().map(line=>line.map(v=>v==null?'':String(v)));},
   setNumberFormat(){return this;},
   setValue(v){while(rows.length<row)rows.push([]);rows[row-1][col-1]=v;return this;},
   setValues(values){if(failWrite==='before'){failWrite='';throw Error('SIMULATED_WRITE_BEFORE_PERSIST');}values.forEach((line,r)=>{const target=row-1+r;while(rows.length<=target)rows.push([]);while(rows[target].length<col-1)rows[target].push('');line.forEach((v,c)=>rows[target][col-1+c]=v);});if(failWrite==='after'){failWrite='';throw Error('SIMULATED_WRITE_AFTER_PERSIST');}return this;}
  };}
 };
 const services={
  SpreadsheetApp:{
   openById(id){opens++;if(id!=='isolated-effect-test')throw Error('WRONG_SPREADSHEET');return{getSheetByName(name){return name===schema.name?sheet:null;}};},
   flush(){flushes++;if(failFlushAt===flushes)throw Error('SIMULATED_RUNTIME_FLUSH_FAILURE');}
  },
  LockService:{getScriptLock(){return{
   waitLock(ms){if(!(ms>0))throw Error('BAD_LOCK_WAIT');if(held)throw Error('SIMULATED_LOCK_TIMEOUT');held=true;},
   releaseLock(){if(!held)throw Error('LOCK_NOT_HELD');held=false;}
  };}}
 };
 function runtime(){const context={...services};vm.runInNewContext(source,context,{timeout:1000});return context.createMpsGasEffectLedger_({spreadsheetId:'isolated-effect-test'});}
 return{rows,runtime,hold(){if(held)throw Error('ALREADY_HELD');held=true;},release(){if(!held)throw Error('NOT_HELD');held=false;},get held(){return held;},get opens(){return opens;}};
}
test('independent V8 contexts reconcile persisted append using shared mock GAS services',()=>{
 const h=sharedGasRuntime();const first=h.runtime();assert.equal(first.migrate('audit').outcome,'MIGRATED');
 assert.equal(first.appendOnce('audit','telegram:runtime:1',arow()).outcome,'APPENDED');
 const second=h.runtime();assert.equal(second.appendOnce('audit','telegram:runtime:1',arow()).outcome,'ALREADY_APPENDED');
 assert.equal(h.rows.length,2);assert.equal(h.held,false);
});
test('simulated ScriptLock contention fails closed and retry succeeds after release',()=>{
 const h=sharedGasRuntime();const l=h.runtime();l.migrate('audit');h.hold();
 assert.throws(()=>l.appendOnce('audit','telegram:runtime:2',arow()),/SIMULATED_LOCK_TIMEOUT/);
 assert.equal(h.rows.length,1);assert.equal(h.held,true);h.release();
 assert.equal(h.runtime().appendOnce('audit','telegram:runtime:2',arow()).outcome,'APPENDED');
 assert.equal(h.held,false);
});
test('runtime restart reconciles append persisted before flush acknowledgement',()=>{
 const h=sharedGasRuntime({failFlushAt:2});const l=h.runtime();l.migrate('audit');
 assert.throws(()=>l.appendOnce('audit','telegram:runtime:3',arow()),/SIMULATED_RUNTIME_FLUSH_FAILURE/);
 assert.equal(h.rows.length,2);assert.equal(h.held,false);
 assert.equal(h.runtime().appendOnce('audit','telegram:runtime:3',arow()).outcome,'ALREADY_APPENDED');
 assert.equal(h.rows.length,2);
});
test('runtime restart recognizes migration header persisted before flush acknowledgement',()=>{
 const h=sharedGasRuntime({failFlushAt:1});assert.throws(()=>h.runtime().migrate('audit'),/SIMULATED_RUNTIME_FLUSH_FAILURE/);
 assert.equal(h.rows[0][7],'Effect Key');assert.equal(h.held,false);
 assert.equal(h.runtime().migrate('audit').outcome,'ALREADY_MIGRATED');
});
test('runtime write failure before persistence releases lock and permits retry',()=>{
 const h=sharedGasRuntime({failWrite:'before'});const l=h.runtime();l.migrate('audit');
 assert.throws(()=>l.appendOnce('audit','telegram:runtime:4',arow()),/SIMULATED_WRITE_BEFORE_PERSIST/);
 assert.equal(h.rows.length,1);assert.equal(h.held,false);
 assert.equal(h.runtime().appendOnce('audit','telegram:runtime:4',arow()).outcome,'APPENDED');
});
test('runtime write that persists then throws is reconciled without a duplicate',()=>{
 const h=sharedGasRuntime({failWrite:'after'});const l=h.runtime();l.migrate('audit');
 assert.throws(()=>l.appendOnce('audit','telegram:runtime:5',arow()),/SIMULATED_WRITE_AFTER_PERSIST/);
 assert.equal(h.rows.length,2);assert.equal(h.held,false);
 assert.equal(h.runtime().appendOnce('audit','telegram:runtime:5',arow()).outcome,'ALREADY_APPENDED');
 assert.equal(h.rows.length,2);
});
test('runtime never creates a missing target sheet and releases its lock',()=>{
 const h=sharedGasRuntime();const l=h.runtime();
 assert.throws(()=>l.migrate('ticker'),/EFFECT_SHEET_MISSING/);
 assert.equal(h.held,false);assert.equal(h.rows.length,1);
});
