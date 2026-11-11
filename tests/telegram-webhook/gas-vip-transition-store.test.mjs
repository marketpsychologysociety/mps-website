import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=new URL('./',import.meta.url);
const effectSource=readFileSync(fileURLToPath(new URL('gas-effect-ledger-adapter.gs',root)),'utf8');
const storeSource=readFileSync(fileURLToPath(new URL('gas-vip-transition-store.gs',root)),'utf8');
const intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
const cursorHeaders=['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];

function harness({missingCursor=false,failFlushAt=0,failWriteAt=0}={}) {
 const rows=new Map([
  ['MPS Telegram VIP Transition Intents',[intentHeaders.slice()]],
  ['MPS Telegram VIP Member Cursor',missingCursor?null:[cursorHeaders.slice()]]
 ]);
 let held=false,flushCount=0,writeCount=0,acquired=0,released=0;
 const sheets=new Map();
 for(const [name,data] of rows) if(data) sheets.set(name,data);
 function context(){
  const services={
   SpreadsheetApp:{
    openById(id){
     if(id!=='isolated-vip-ledger')throw Error('WRONG_SPREADSHEET');
     return {getSheetByName(name){
      const data=sheets.get(name);if(!data)return null;
      return {
       getLastRow(){return data.length;},
       getLastColumn(){return Math.max(0,...data.map(x=>x.length));},
       getRange(row,col,nr=1,nc=1){return {
        getValues(){return Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>data[row-1+r]?.[col-1+c]??''));},
        getDisplayValues(){return this.getValues().map(line=>line.map(v=>v==null?'':String(v)));},
        setValues(values){
         writeCount++;if(failWriteAt===writeCount)throw Error('SIMULATED_WRITE_BEFORE_PERSIST');
         values.forEach((line,r)=>{const target=row-1+r;while(data.length<=target)data.push([]);while(data[target].length<col-1)data[target].push('');line.forEach((v,c)=>data[target][col-1+c]=v);});
         return this;
        }
       };}
      };
     }};
    },
    flush(){flushCount++;if(failFlushAt===flushCount)throw Error('SIMULATED_FLUSH_AFTER_PERSIST');}
   },
   LockService:{getScriptLock(){return{
    waitLock(){if(held)throw Error('LOCK_REENTRANT');held=true;acquired++;},
    releaseLock(){if(!held)throw Error('LOCK_NOT_HELD');held=false;released++;}
   };}}
  };
  const c={...services};vm.runInNewContext(effectSource+'\n'+storeSource+'\nthis.createLedger=createMpsGasEffectLedger_;this.createStore=createMpsGasVipTransitionStore_;',c,{timeout:1000});return c;
 }
 function run(fn){const c=context(),ledger=c.createLedger({spreadsheetId:'isolated-vip-ledger'}),store=c.createStore({spreadsheetId:'isolated-vip-ledger'});return ledger.runExclusive(tx=>fn(store,tx));}
 return {run,sheets,context,stats:()=>({held,acquired,released,flushCount,writeCount})};
}
const record=(key='telegram:2:100:vip_transition')=>({
 'Intent Key':key,'Update Epoch':2,'Update ID':'100','Member ID':'MPS-ABCDEF12','Member Name':'Test Member','Telegram User ID':'987654321',
 'Target State':'ACTIVE','Source Type':'CHAT_MEMBER','Source Date':1760000000,
 'Payload SHA-256':'a'.repeat(64),'Ticker Allowed':true,'State':'INTENT','Ticker Effect Key':key+':ticker',
 'Audit Effect Key':key+':audit','Created At':'2026-11-12T00:00:00Z',
 'Updated At':'2026-11-12T00:00:00Z','Last Error Code':''
});

test('insert and read durable intent under the single scoped lock',()=>{
 const h=harness();const result=h.run((s,tx)=>{assert.equal(s.insertIntent(tx,record()).outcome,'INSERTED');return s.readIntent(tx,'telegram:2:100:vip_transition');});
 assert.equal(result['State'],'INTENT');assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,2);
 assert.deepEqual(h.stats(),{held:false,acquired:1,released:1,flushCount:1,writeCount:1});
});
test('replay after runtime recreation finds same intent and does not append duplicate',()=>{
 const h=harness();h.run((s,tx)=>s.insertIntent(tx,record()));
 const result=h.run((s,tx)=>s.insertIntent(tx,record()));
 assert.equal(result.outcome,'EXISTS');assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,2);
 const changed={...record(),'Target State':'LEFT'};assert.equal(h.run((s,tx)=>s.insertIntent(tx,changed)).outcome,'REVIEW_COLLISION');
});
test('intent state update survives a new runtime context',()=>{
 const h=harness();h.run((s,tx)=>s.insertIntent(tx,record()));
 h.run((s,tx)=>s.updateIntent(tx,'telegram:2:100:vip_transition',{'State':'STATUS_APPLIED','Updated At':'later'}));
 assert.equal(h.run((s,tx)=>s.readIntent(tx,'telegram:2:100:vip_transition')['State']),'STATUS_APPLIED');
});
test('member cursor inserts then updates without duplicate member rows',()=>{
 const h=harness();
 assert.equal(h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'100',transitionKey:'telegram:2:100:vip_transition',updatedAt:'now'})).outcome,'INSERTED');
 assert.equal(h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000001,updateId:'101',transitionKey:'telegram:2:101:vip_transition',updatedAt:'later'})).outcome,'UPDATED');
 const c=h.run((s,tx)=>s.readCursor(tx,'MPS-ABCDEF12'));assert.equal(c.updateId,'101');assert.equal(c.sourceDate,1760000001);
 assert.equal(h.sheets.get('MPS Telegram VIP Member Cursor').length,2);
});
test('findPending returns one unfinished transition and rejects multiple pending rows',()=>{
 const h=harness();h.run((s,tx)=>{s.insertIntent(tx,record());return s.findPending(tx,'MPS-ABCDEF12');});
 assert.equal(h.run((s,tx)=>s.findPending(tx,'MPS-ABCDEF12'))['Intent Key'],'telegram:2:100:vip_transition');
 h.run((s,tx)=>s.insertIntent(tx,record('telegram:2:101:vip_transition')));
 assert.throws(()=>h.run((s,tx)=>s.findPending(tx,'MPS-ABCDEF12')),/VIP_TRANSITION_MULTIPLE_PENDING/);
});
test('missing provisioned tab fails closed and is never auto-created',()=>{
 const h=harness({missingCursor:true});assert.throws(()=>h.run((s,tx)=>s.readCursor(tx,'MPS-ABCDEF12')),/VIP_TRANSITION_SHEET_MISSING/);
 assert.equal(h.sheets.has('MPS Telegram VIP Member Cursor'),false);
});
test('unknown schema and duplicate intent rows fail closed',()=>{
 const h=harness();h.sheets.get('MPS Telegram VIP Transition Intents')[0][0]='Wrong';
 assert.throws(()=>h.run((s,tx)=>s.readIntent(tx,'x')),/VIP_TRANSITION_SCHEMA_MISMATCH/);
 const h2=harness();const row=Object.values(record());h2.sheets.get('MPS Telegram VIP Transition Intents').push(row,row);
 assert.throws(()=>h2.run((s,tx)=>s.readIntent(tx,'telegram:2:100:vip_transition')),/VIP_TRANSITION_DUPLICATE_ROW/);
});
test('scope is mandatory and retained scope expires after callback',()=>{
 const h=harness();let retained;
 const c=h.context(),ledger=c.createLedger({spreadsheetId:'isolated-vip-ledger'}),store=c.createStore({spreadsheetId:'isolated-vip-ledger'});
 ledger.runExclusive(tx=>{retained=tx;assert.equal(store.readCursor(tx,'MPS-ABCDEF12'),null);});
 assert.throws(()=>store.readCursor(retained,'MPS-ABCDEF12'),/EFFECT_SCOPE_CLOSED/);
 assert.throws(()=>store.readCursor({},'MPS-ABCDEF12'),/VIP_TRANSITION_SCOPE_REQUIRED/);
});
test('write failure before persistence releases lock and permits safe retry',()=>{
 const h=harness({failWriteAt:1});assert.throws(()=>h.run((s,tx)=>s.insertIntent(tx,record())),/SIMULATED_WRITE_BEFORE_PERSIST/);
 assert.equal(h.stats().held,false);assert.equal(h.run((s,tx)=>s.insertIntent(tx,record()).outcome),'INSERTED');
});
test('flush failure after intent persistence is reconciled by a fresh runtime',()=>{
 const h=harness({failFlushAt:1});assert.throws(()=>h.run((s,tx)=>s.insertIntent(tx,record())),/SIMULATED_FLUSH_AFTER_PERSIST/);
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,2);
 assert.equal(h.run((s,tx)=>s.insertIntent(tx,record()).outcome),'EXISTS');
 assert.equal(h.stats().held,false);
});
test('cursor writes use text update IDs and reject malformed identifiers before mutation',()=>{
 const h=harness();h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'90071992547409931234',transitionKey:'telegram:2:100:vip_transition',updatedAt:'now'}));
 assert.equal(h.run((s,tx)=>s.readCursor(tx,'MPS-ABCDEF12').updateId),'90071992547409931234');
 assert.throws(()=>h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'01',transitionKey:'telegram:2:100:vip_transition',updatedAt:'now'})),/VIP_TRANSITION_INVALID_UPDATE_ID/);
});

test('cursor rejects regression and conflicting transition at identical sequence',()=>{
 const h=harness();
 h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000001,updateId:'101',transitionKey:'telegram:2:101:vip_transition',updatedAt:'now'}));
 assert.throws(()=>h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'999',transitionKey:'telegram:2:999:vip_transition',updatedAt:'old'})),/VIP_TRANSITION_CURSOR_REGRESSION/);
 assert.throws(()=>h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000001,updateId:'101',transitionKey:'telegram:2:101:other',updatedAt:'now'})),/VIP_TRANSITION_CURSOR_COLLISION/);
});

test('intent state machine rejects backward and unsupported state transitions',()=>{
 const h=harness();h.run((s,tx)=>s.insertIntent(tx,record()));
 assert.throws(()=>h.run((s,tx)=>s.updateIntent(tx,'telegram:2:100:vip_transition',{'State':'COMPLETED'})),/VIP_TRANSITION_INVALID_STATE_CHANGE/);
 h.run((s,tx)=>s.updateIntent(tx,'telegram:2:100:vip_transition',{'State':'STATUS_APPLIED'}));
 assert.throws(()=>h.run((s,tx)=>s.updateIntent(tx,'telegram:2:100:vip_transition',{'State':'INTENT'})),/VIP_TRANSITION_INVALID_STATE_CHANGE/);
});
test('malformed existing cursor is quarantined instead of overwritten',()=>{
 const h=harness();
 h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'100',transitionKey:'telegram:2:100:vip_transition',updatedAt:'now'}));
 h.sheets.get('MPS Telegram VIP Member Cursor')[1][2]='not-a-date';
 assert.throws(()=>h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000001,updateId:'101',transitionKey:'telegram:2:101:vip_transition',updatedAt:'later'})),/VIP_TRANSITION_CURSOR_CORRUPT/);
});
test('intent repository rejects non-chat-member source and invalid initial state',()=>{
 const h=harness();
 assert.throws(()=>h.run((s,tx)=>s.insertIntent(tx,{...record(),'Source Type':'CHAT_JOIN_REQUEST'})),/VIP_TRANSITION_UNSUPPORTED_SOURCE_TYPE/);
 assert.throws(()=>h.run((s,tx)=>s.insertIntent(tx,{...record(),'State':'COMPLETED'})),/VIP_TRANSITION_INVALID_INITIAL_STATE/);
});


test('cursor accepts later source date even when ingress epoch is lower after Telegram ID reset',()=>{
 const h=harness();
 h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:5,sourceDate:1760000000,updateId:'900',transitionKey:'telegram:5:900:vip_transition',updatedAt:'first'}));
 assert.equal(h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:0,sourceDate:1760000001,updateId:'2',transitionKey:'telegram:0:2:vip_transition',updatedAt:'later'})).outcome,'UPDATED');
 assert.equal(h.run((s,tx)=>s.readCursor(tx,'MPS-ABCDEF12')).updateId,'2');
});

test('corrupt persisted intent and cursor are rejected on read',()=>{
 const h=harness();
 h.run((s,tx)=>s.insertIntent(tx,record()));
 h.sheets.get('MPS Telegram VIP Transition Intents')[1][8]='not-a-date';
 assert.throws(()=>h.run((s,tx)=>s.readIntent(tx,'telegram:2:100:vip_transition')),/VIP_TRANSITION_INTENT_CORRUPT/);
 h.run((s,tx)=>s.writeCursor(tx,{memberId:'MPS-ABCDEF12',epoch:2,sourceDate:1760000000,updateId:'100',transitionKey:'telegram:2:100:vip_transition',updatedAt:'now'}));
 h.sheets.get('MPS Telegram VIP Member Cursor')[1][3]='not-decimal';
 assert.throws(()=>h.run((s,tx)=>s.readCursor(tx,'MPS-ABCDEF12')),/VIP_TRANSITION_CURSOR_CORRUPT/);
});
