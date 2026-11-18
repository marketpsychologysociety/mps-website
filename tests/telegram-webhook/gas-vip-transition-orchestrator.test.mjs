import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=new URL('./',import.meta.url);
const sources=['gas-effect-ledger-adapter.gs','gas-vip-transition-store.gs','gas-vip-transition-orchestrator.gs']
  .map(name=>readFileSync(fileURLToPath(new URL(name,root)),'utf8')).join('\n');
const intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
const cursorHeaders=['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];
const auditHeaders=['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details'];
const tickerHeaders=['Event ID','Created At','Member ID','Member Name','Event Text','Status'];
const accessHeaders=['Member ID','VIP Status','Last Transition Key'];
const memberHeaders=['Member ID','VIP Status','Last Transition Key'];

function harness({crashAt=''}={}) {
 const sheets=new Map([
  ['MPS Telegram VIP Transition Intents',[intentHeaders.slice()]],
  ['MPS Telegram VIP Member Cursor',[cursorHeaders.slice()]],
  ['MPS Audit Logs',[auditHeaders.slice()]],
  ['MPS VIP Ticker Events',[tickerHeaders.slice()]],
  ['MPS VIP Access State',[accessHeaders.slice()]],
  ['MPS Member State',[memberHeaders.slice()]]
 ]);
 let held=false,acquired=0,released=0,crashed=false;
 function trip(point){if(crashAt===point&&!crashed){crashed=true;throw new Error('SIMULATED_CRASH_'+point);}}
 const SpreadsheetApp={
  openById(id){if(id!=='isolated-vip-orchestrator')throw Error('WRONG_SPREADSHEET');return{getSheetByName(name){
   const data=sheets.get(name);if(!data)return null;
   return{getLastRow:()=>data.length,getLastColumn:()=>Math.max(0,...data.map(r=>r.length)),
    getRange(row,col,nr=1,nc=1){return{
     getValues(){return Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>data[row-1+r]?.[col-1+c]??''));},
     getDisplayValues(){return this.getValues().map(line=>line.map(v=>v==null?'':String(v)));},
     setNumberFormat(){return this;},
     setValue(v){while(data.length<row)data.push([]);while(data[row-1].length<col)data[row-1].push('');data[row-1][col-1]=v;return this;},
     setValues(values){values.forEach((line,r)=>{const ri=row-1+r;while(data.length<=ri)data.push([]);while(data[ri].length<col-1)data[ri].push('');line.forEach((v,c)=>data[ri][col-1+c]=v);});return this;}
    };}
   };
  }};},
  flush(){}
 };
 const LockService={getScriptLock(){return{
  waitLock(){if(held)throw Error('MOCK_LOCK_REENTRANT');held=true;acquired++;},
  releaseLock(){if(!held)throw Error('MOCK_LOCK_NOT_HELD');held=false;released++;}
 };}};
 const context={SpreadsheetApp,LockService};vm.runInNewContext(sources+'\nthis.makeLedger=createMpsGasEffectLedger_;this.makeStore=createMpsGasVipTransitionStore_;this.makeOrchestrator=createMpsGasVipTransitionOrchestrator_;',context,{timeout:1000});
 const ledger=context.makeLedger({spreadsheetId:'isolated-vip-orchestrator'});
 const store=context.makeStore({spreadsheetId:'isolated-vip-orchestrator'});
 const rawStatus={
  applyAccessStatus(tx,r){tx.assertActive();writeStatus('MPS VIP Access State',r);trip('AFTER_STATUS_A');},
  applyMemberStatus(tx,r){tx.assertActive();writeStatus('MPS Member State',r);trip('AFTER_STATUS_B');}
 };
 function writeStatus(name,r){
  const rows=sheets.get(name),i=rows.findIndex((x,n)=>n>0&&String(x[0])===r.memberId);
  const row=[r.memberId,r.targetState,r.transitionKey];
  if(i<0)rows.push(row);else rows[i]=row;
  SpreadsheetApp.flush();
 }
 const statusWriter=rawStatus;
 function makeLedger(){
  return{runExclusive(cb){return ledger.runExclusive(tx=>{
   const scoped=Object.freeze({
    assertActive:()=>tx.assertActive(),
    migrate:(...a)=>tx.migrate(...a),
    appendOnce(kind,...args){const result=tx.appendOnce(kind,...args);trip(kind==='ticker'?'AFTER_TICKER':'AFTER_AUDIT');return result;}
   });
   return cb(scoped);
  });}};
 }
 const wrappedStore=Object.freeze({
  findPending:(...a)=>store.findPending(...a),readIntent:(...a)=>store.readIntent(...a),
  readCursor:(...a)=>store.readCursor(...a),writeCursor(tx,...a){const r=store.writeCursor(tx,...a);trip('AFTER_CURSOR');return r;},
  insertIntent(tx,...a){const r=store.insertIntent(tx,...a);trip('AFTER_INTENT');return r;},
  updateIntent(tx,key,patch){const r=store.updateIntent(tx,key,patch);if(patch.State==='STATUS_APPLIED')trip('AFTER_STATUS_APPLIED');if(patch.State==='COMPLETED')trip('AFTER_COMPLETE');return r;}
 });
 function orchestrator(){return context.makeOrchestrator({ledger:makeLedger(),store:wrappedStore,statusWriter});}
 function migrateEffects(){return ledger.runExclusive(tx=>{tx.migrate('audit');tx.migrate('ticker');});}
 function resetCounts(){acquired=0;released=0;}
 return{process:(input,resolveTransition)=>orchestrator().process(input,resolveTransition),isCurrent:(input,resolved)=>orchestrator().isCurrent(input,resolved),migrateEffects,sheets,stats:()=>({held,acquired,released}),resetCounts};
}
const input=(targetState='ACTIVE',updateId='700',sourceDate=1760000000)=>({
 updateId,epoch:0,sourceDate,memberId:'MPS-ABCDEF12',memberName:'Test Member',telegramUserId:'987654321',tickerAllowed:true,
 targetState,sourceType:'CHAT_MEMBER',payloadSha256:'a'.repeat(64)
});
function migrate(h){h.migrateEffects();}

const phases=['AFTER_INTENT','AFTER_STATUS_A','AFTER_STATUS_B','AFTER_STATUS_APPLIED','AFTER_CURSOR','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE'];
for(const phase of phases)test('actual GAS adapters recover activation after '+phase+' crash',()=>{
 const h=harness({crashAt:phase});
 // Effect-key migration is an explicit isolated setup step, never performed by the webhook.
 migrate(h);
 assert.throws(()=>h.process(input()),new RegExp('SIMULATED_CRASH_'+phase));
 assert.equal(h.process(input()),'DUPLICATE');
 const intents=h.sheets.get('MPS Telegram VIP Transition Intents');
 assert.equal(intents.length,2);assert.equal(intents[1][11],'COMPLETED');
 assert.equal(h.sheets.get('MPS VIP Access State').length,2);
 assert.equal(h.sheets.get('MPS Member State').length,2);
 assert.equal(h.sheets.get('MPS VIP Access State')[1][1],'ACTIVE');
 assert.equal(h.sheets.get('MPS Member State')[1][1],'ACTIVE');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
});
test('leave transition records audit but does not create public join ticker',()=>{
 const h=harness();migrate(h);assert.equal(h.process(input('LEFT','701')),'LEFT');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,1);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
 assert.equal(h.sheets.get('MPS VIP Access State')[1][1],'LEFT');
});
test('source date takes precedence over a numerically larger delayed update ID',()=>{
 const h=harness();migrate(h);
 assert.equal(h.process(input('LEFT','900',1760000002)),'LEFT');
 assert.equal(h.process(input('ACTIVE','901',1760000001)),'STALE');
 assert.equal(h.sheets.get('MPS VIP Access State')[1][1],'LEFT');
});
test('unsupported join-request observation and unsafe numeric update IDs fail closed',()=>{
 const h=harness();migrate(h);
 assert.throws(()=>h.process({...input(),'sourceType':'CHAT_JOIN_REQUEST'}),/VIP_UNSUPPORTED_SOURCE_TYPE/);
 assert.throws(()=>h.process({...input(),updateId:9007199254740992}),/VIP_INVALID_UPDATE_ID/);
});
test('single ScriptLock covers each transition critical section and is released after completion',()=>{
 const h=harness();migrate(h);h.resetCounts();assert.equal(h.process(input()),'ACTIVE');
 assert.deepEqual(h.stats(),{held:false,acquired:1,released:1});
});

test('same transition key with changed target or member identity is quarantined',()=>{
 const h=harness();migrate(h);assert.equal(h.process(input()),'ACTIVE');
 assert.throws(()=>h.process(input('LEFT','700')),/VIP_TRANSITION_INTENT_COLLISION/);
 assert.throws(()=>h.process({...input(),telegramUserId:'987654322'}),/VIP_TRANSITION_INTENT_COLLISION/);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
});


test('later Telegram event date wins after update ID reset even with lower epoch and ID',()=>{
 const h=harness();migrate(h);
 assert.equal(h.process({...input('LEFT','900',1760000000),epoch:5}),'LEFT');
 assert.equal(h.process({...input('ACTIVE','2',1760000001),epoch:0}),'ACTIVE');
 assert.equal(h.sheets.get('MPS VIP Access State')[1][1],'ACTIVE');
});

test('DENIED chat_member transition writes audit only and never emits public ticker',()=>{
 const h=harness();migrate(h);
 assert.equal(h.process(input('DENIED','702'),(tx,raw)=>{
  assert.equal(tx.assertActive(),true);
  assert.equal(h.stats().held,true);
  return {...raw,targetState:'DENIED',tickerAllowed:false};
 }),'DENIED');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,1);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs')[1][5],'WARNING');
});
test('transition resolver executes inside the one exclusive lock and may supply the member identity',()=>{
 const h=harness();migrate(h);h.resetCounts();let called=false;
 const result=h.process({...input(),memberId:'',targetState:''},(tx,raw)=>{
  called=true;assert.equal(h.stats().held,true);
  return {...raw,memberId:'MPS-ABCDEF12',targetState:'ACTIVE',telegramUserId:'987654321',tickerAllowed:true};
 });
 assert.equal(called,true);assert.equal(result,'ACTIVE');
 assert.equal(h.stats().acquired,1);assert.equal(h.stats().released,1);
});

test('current completed event may safely retry post-lock follow-up, stale duplicate may not',()=>{
 const h=harness();migrate(h);
 const first=input('ACTIVE','710',1760000000);
 assert.equal(h.process(first),'ACTIVE');
 assert.equal(h.isCurrent(first,{memberId:'MPS-ABCDEF12'}),true);
 assert.equal(h.process(input('LEFT','711',1760000001)),'LEFT');
 assert.equal(h.isCurrent(first,{memberId:'MPS-ABCDEF12'}),false);
});

test('completed event replay tolerates later member display-name or ticker-safety changes',()=>{
 const h=harness();migrate(h);
 const original=input('ACTIVE','720',1760000000);
 assert.equal(h.process(original),'ACTIVE');
 assert.equal(h.process({...original,memberName:'Updated Member Name',tickerAllowed:false}),'DUPLICATE');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
});
