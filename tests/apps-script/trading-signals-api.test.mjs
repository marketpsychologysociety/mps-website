import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const code=fs.readFileSync(new URL('../../candidates/Code.gs',import.meta.url),'utf8');
const start=code.indexOf('/* MPS Trading Signals — isolated bot-to-backend pipeline.');
assert.ok(start>=0,'Trading Signals implementation must exist');
const source=code.slice(start);
const headers={
  signals:['Signal ID','Bot ID','Instrument','Side','Timeframe','Entry','Stop Loss','Take Profit 1','Take Profit 2','Status','Signal Time','Updated At','Last Event ID'],
  events:['Event ID','Signal ID','Bot ID','Event Type','Previous Status','New Status','Instrument','Side','Timeframe','Entry','Stop Loss','Take Profit 1','Take Profit 2','Signal Time','Received At','Payload Fingerprint'],
  bots:['Bot ID','Display Name','Enabled','Allowed Instruments','Allowed Timeframes','Last Seen At','Last Event ID']
};

function makeSheet(name,head,rows=[]) {
  const data=[head.slice(),...rows.map(r=>r.slice())];
  return {
    name,
    getLastRow:()=>data.length,
    getRange(row,col,numRows=1,numCols=1){
      return {
        getValues:()=>data.slice(row-1,row-1+numRows).map(r=>r.slice(col-1,col-1+numCols)),
        getDisplayValues:()=>data.slice(row-1,row-1+numRows).map(r=>r.slice(col-1,col-1+numCols).map(v=>v instanceof Date?v.toISOString():String(v??''))),
        setValues(values){
          for(let i=0;i<values.length;i++){
            const target=row-1+i;
            while(data.length<=target)data.push([]);
            for(let j=0;j<values[i].length;j++)data[target][col-1+j]=values[i][j];
          }
        }
      };
    },
    appendRow(values){data.push(values.slice());},
    snapshot:()=>data.map(r=>r.slice()),
  };
}

function harness(options={}) {
  const signals=makeSheet('Signals',headers.signals);
  const events=makeSheet('Signal Events',headers.events);
  const bots=makeSheet('Bot Registry',headers.bots,[
    ['BOT_01','SMC Bot',true,'XAUUSD,EURUSD','M5,M15,H1','',''],
    ['BOT_02','News Bot',false,'XAUUSD','M5','','',''],
    ['BOT_03','Scalp Bot',true,'XAUUSD','M5','','',''],
    ['BOT_04','Pending Bot',false,'','','','',''],
  ]);
  if(options.signalsAppendBeforeThrow){const original=signals.appendRow.bind(signals);signals.appendRow=values=>{if(!options.signalsAppendTriggered){options.signalsAppendTriggered=true;throw new Error('INJECTED_BEFORE_SIGNAL_ROW');}original(values);};}
  if(options.signalsAppendAfterThrow){
    const original=signals.appendRow.bind(signals);
    signals.appendRow=values=>{original(values);if(!options.signalsAppendTriggered){options.signalsAppendTriggered=true;throw new Error('INJECTED_AFTER_SIGNAL_ROW');}};
  }
  if(options.eventsAppendAfterThrow){
    const original=events.appendRow.bind(events);
    events.appendRow=values=>{original(values);if(!options.eventsAppendTriggered){options.eventsAppendTriggered=true;throw new Error('INJECTED_AFTER_EVENT_ROW');}};
  }
  const sheetMap={Signals:signals,'Signal Events':events,'Bot Registry':bots};
  const properties={
    MPS_SPREADSHEET_ID:'member-db',
    MPS_TRADING_SIGNALS_SPREADSHEET_ID:'signals-db',
    MPS_SIGNAL_BOT_01_SECRET:'bot-one-secret',
    MPS_SIGNAL_BOT_02_SECRET:'bot-two-secret',
    MPS_SIGNAL_BOT_03_SECRET:'bot-three-secret',
    MPS_SIGNAL_BOT_04_SECRET:'bot-four-secret'
  };
  const grandParentFolder={getId:()=> 'grand-parent',getSharingAccess:()=>options.grandParentPrivate===false?'ANYONE':'PRIVATE',getEditors:()=>options.grandParentEditors||[],getViewers:()=>options.grandParentViewers||[],getParents:()=>({hasNext:()=>false,next:()=>null})};
  const parentFolder={getId:()=> 'parent',getSharingAccess:()=>options.parentPrivate===false?'ANYONE':'PRIVATE',getEditors:()=>options.parentEditors||[],getViewers:()=>options.parentViewers||[],getParents(){let used=false;return{hasNext:()=>!used&&!!options.withGrandParent,next:()=>{used=true;return grandParentFolder;}};}};
  const file={
    getId:()=> 'signal-file',
    getSharingAccess:()=>options.filePrivate===false?'ANYONE':'PRIVATE',
    getParents(){let used=false;return{hasNext:()=>!used&&!!options.withParent,next:()=>{used=true;return parentFolder;}};}
  };
  if(!options.aclUnavailable){file.getEditors=()=>options.fileEditors||[];file.getViewers=()=>options.fileViewers||[];}
  const ss={getSheetByName:name=>sheetMap[name]||null};
  const context={
    MPS:{},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]||'',setProperty:(key,value)=>{properties[key]=value;}})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:()=>file},
    SpreadsheetApp:{openById:()=>ss},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    consumeRateLimit_:()=>{},
    constantTimeEquals_:(a,b)=>String(a)===String(b),
    sha256_:value=>createHash('sha256').update(String(value)).digest('hex'),
    formatDateForClient_:value=>value instanceof Date?value.toISOString():String(value||''),
    requireMember_:session=>{if(session!=='member-session')throw new Error('MEMBER_SESSION_REQUIRED');return{memberId:'MPS-AAAAAAAAAA'};},
    requireAdmin_:session=>{if(session!=='admin-session')throw new Error('ADMIN_SESSION_REQUIRED');return{actorId:'admin-1',role:'ADMIN'};},
    requireSuperAdmin_:session=>{if(session!=='super-session')throw new Error('SUPER_ADMIN_REQUIRED');return{actorId:'super-1',role:'SUPER_ADMIN'};},
    adminActorRef_:()=> 'super-1',
    recordMpsAudit_:()=>true,
    console
  };
  vm.createContext(context);
  vm.runInContext(source,context,{timeout:1000});
  return {context,signals,events,bots,properties};
}

function payload(overrides={}) {
  return {
    action:'tradingSignal',botId:'BOT_01',botSecret:'bot-one-secret',
    eventId:'event-create-000001',signalId:'signal-000001',
    eventType:'CREATE',instrument:'XAUUSD',side:'BUY',timeframe:'M5',
    entry:2000,stopLoss:1990,takeProfit1:2010,takeProfit2:2020,
    status:'ACTIVE',signalTime:'2026-11-16T10:00:00+07:00',
    ...overrides
  };
}

test('Trading Signals payload enforces IDs, explicit timezone, supported fields and correct BUY/SELL price ordering',()=>{
  const h=harness(),fn=h.context.normalizeTradingSignalPayload_;
  assert.equal(fn(payload()).signalTime,'2026-11-16T03:00:00.000Z');
  assert.throws(()=>fn(payload({eventId:'short'})),/EVENT_ID_TIDAK_VALID/);
  assert.throws(()=>fn(payload({signalTime:'2026-11-16 10:00'})),/ISO8601/);
  assert.throws(()=>fn(payload({entry:'2000'})),/HARGA_HARUS_NUMBER/);
  assert.throws(()=>fn(payload({entry:Infinity})),/HARGA_HARUS_NUMBER/);
  assert.throws(()=>fn(payload({takeProfit1:1980})),/URUTAN_HARGA_BUY/);
  assert.doesNotThrow(()=>fn(payload({side:'SELL',entry:2000,stopLoss:2010,takeProfit1:1990,takeProfit2:1980})));
  assert.throws(()=>fn(payload({side:'SELL',entry:2000,stopLoss:1990,takeProfit1:1980,takeProfit2:1970})),/URUTAN_HARGA_SELL/);
});

test('bot authentication, disabled state and instrument/timeframe allowlists fail closed',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  assert.throws(()=>ingest(payload({botSecret:'wrong'})),/BOT_AUTHENTICATION_FAILED/);
  assert.throws(()=>ingest(payload({instrument:'BTCUSD'})),/INSTRUMENT_NOT_ALLOWED/);
  assert.throws(()=>ingest(payload({timeframe:'M30'})),/TIMEFRAME_NOT_ALLOWED/);
  assert.throws(()=>ingest(payload({botId:'BOT_02',botSecret:'bot-two-secret',eventId:'event-news-000001',signalId:'signal-news-001'})),/BOT_DISABLED/);
});

test('CREATE appends one current signal and one immutable event; same event ID is idempotent',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  const first=ingest(payload());
  assert.equal(first.ok,true);assert.equal(first.duplicate,false);
  assert.equal(h.signals.snapshot().length,2);assert.equal(h.events.snapshot().length,2);
  const retry=ingest(payload());
  assert.equal(retry.duplicate,true);
  assert.equal(h.signals.snapshot().length,2);assert.equal(h.events.snapshot().length,2);
  assert.equal(Number.isFinite(h.bots.snapshot()[1][5]&&h.bots.snapshot()[1][5].getTime&&h.bots.snapshot()[1][5].getTime()),true);
});

test('reused event ID with different payload is quarantined as a collision',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  ingest(payload());
  assert.throws(()=>ingest(payload({status:'ACTIVE',entry:2001})),/EVENT_ID_COLLISION/);
  assert.equal(h.events.snapshot().length,2);
});

test('signal updates enforce bot ownership, immutable trade parameters and legal status transitions',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  ingest(payload());
  const update={...payload(),eventId:'event-update-000001',eventType:'UPDATE',status:'TP1_HIT'};
  assert.equal(ingest(update).status,'TP1_HIT');
  const tp2={...update,eventId:'event-update-000002',status:'TP2_HIT'};
  assert.throws(()=>ingest({...tp2,eventId:'event-change-price-001',entry:2001}),/UPDATE_CANNOT_CHANGE_SIGNAL_PARAMETERS/);
  assert.equal(ingest(tp2).status,'TP2_HIT');
  assert.throws(()=>ingest({...tp2,eventId:'event-update-000003',status:'TIMEOUT'}),/STATUS_TRANSITION_NOT_ALLOWED/);
  assert.throws(()=>ingest({...update,eventId:'event-other-bot-0001',botId:'BOT_03',botSecret:'bot-three-secret'}),/BOT_SIGNAL_OWNERSHIP_MISMATCH/);
  assert.equal(h.events.snapshot().length,4,'header plus CREATE, TP1_HIT and TP2_HIT events only');
});

test('TP1 may progress to TP2, SL or timeout; terminal states cannot be reopened',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  ingest(payload());
  ingest({...payload(),eventId:'event-tp1-00000001',eventType:'UPDATE',status:'TP1_HIT'});
  assert.equal(ingest({...payload(),eventId:'event-sl-000000001',eventType:'UPDATE',status:'SL_HIT'}).status,'SL_HIT');
  assert.throws(()=>ingest({...payload(),eventId:'event-reopen-000001',eventType:'UPDATE',status:'TP2_HIT'}),/STATUS_TRANSITION_NOT_ALLOWED/);
});

test('ambiguous event append is reconciled by retry without duplicate event',()=>{
  const h=harness({eventsAppendAfterThrow:true}),ingest=h.context.ingestTradingSignal_;
  assert.throws(()=>ingest(payload()),/INJECTED_AFTER_EVENT_ROW/);
  assert.equal(h.events.snapshot().length,2);
  const retry=ingest(payload());
  assert.equal(retry.duplicate,true);
  assert.equal(h.events.snapshot().length,2);
  assert.equal(h.signals.snapshot().length,2);
});

test('failed current-state write after durable event is repaired on idempotent retry',()=>{
  const h=harness({signalsAppendBeforeThrow:true}),ingest=h.context.ingestTradingSignal_;
  assert.throws(()=>ingest(payload()),/INJECTED_BEFORE_SIGNAL_ROW/);
  assert.equal(h.events.snapshot().length,2);
  assert.equal(h.signals.snapshot().length,1);
  const retry=ingest(payload());
  assert.equal(retry.duplicate,true);
  assert.equal(h.signals.snapshot().length,2);
  assert.equal(h.signals.snapshot()[1][9],'ACTIVE');
});

test('member read API requires an approved member session and returns filtered signal data only',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  ingest(payload());
  assert.throws(()=>h.context.apiGetTradingSignals('forged-session',{}),/MEMBER_SESSION_REQUIRED/);
  const result=h.context.apiGetTradingSignals('member-session',{instrument:'XAUUSD'});
  assert.equal(result.ok,true);assert.equal(result.signals.length,1);assert.equal(result.stats.active,1);
  assert.equal(Object.hasOwn(result.signals[0],'botSecret'),false);
});

test('member history is session-gated and admin health never exposes secrets',()=>{
  const h=harness(),ingest=h.context.ingestTradingSignal_;
  ingest(payload());
  assert.throws(()=>h.context.apiGetTradingSignalHistory('forged','signal-000001'),/MEMBER_SESSION_REQUIRED/);
  assert.equal(h.context.apiGetTradingSignalHistory('member-session','signal-000001').history.length,1);
  assert.throws(()=>h.context.apiAdminGetTradingSignalsHealth('forged'),/ADMIN_SESSION_REQUIRED/);
  const health=h.context.apiAdminGetTradingSignalsHealth('admin-session');
  assert.equal(health.bots.length,4);assert.equal(health.signalCount,1);
  assert.equal(JSON.stringify(health).includes('bot-one-secret'),false);
});

test('separate signal database and inherited Drive folder privacy are mandatory',()=>{
  const h=harness({filePrivate:false});
  assert.throws(()=>h.context.getTradingSignalsSheets_(),/tidak PRIVATE/);
  const parent=harness({withParent:true,parentPrivate:false});
  assert.throws(()=>parent.context.getTradingSignalsSheets_(),/tidak PRIVATE/);
});

test('named Drive collaborators and unverifiable ACLs block the Trading Signals database',()=>{
  const editor=harness({fileEditors:[{email:'private-editor@example.invalid'}]});
  assert.throws(()=>editor.context.getTradingSignalsSheets_(),/kolaborator bernama/);
  const viewer=harness({withParent:true,parentViewers:[{email:'private-viewer@example.invalid'}]});
  assert.throws(()=>viewer.context.getTradingSignalsSheets_(),/kolaborator bernama/);
  const sharedAncestor=harness({withParent:true,withGrandParent:true,grandParentPrivate:false});
  assert.throws(()=>sharedAncestor.context.getTradingSignalsSheets_(),/tidak PRIVATE/);
  const noAcl=harness({aclUnavailable:true});
  assert.throws(()=>noAcl.context.getTradingSignalsSheets_(),/ACL kolaborator/);
});

test('Super Admin configuration controls bot enablement and allowlists without exposing credentials',()=>{
  const h=harness();
  assert.throws(()=>h.context.apiAdminConfigureTradingSignalBot('admin-session','BOT_01','SMC',true,'XAUUSD','M5'),/SUPER_ADMIN_REQUIRED/);
  const result=h.context.apiAdminConfigureTradingSignalBot('super-session','BOT_02','News Bot',true,'XAUUSD,EURUSD','M5,M15');
  assert.equal(result.enabled,true);
  assert.equal(h.bots.snapshot()[2][2],true);
  assert.equal(h.bots.snapshot()[2][3],'XAUUSD,EURUSD');
  assert.equal(JSON.stringify(h.context.apiAdminGetTradingSignalsHealth('admin-session')).includes('bot-two-secret'),false);
});
