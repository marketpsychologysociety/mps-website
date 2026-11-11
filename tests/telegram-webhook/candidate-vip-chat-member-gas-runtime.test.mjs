import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const candidate=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
function extractFunction(source,name){
 const start=source.indexOf('function '+name+'(');
 if(start<0)throw new Error('CANDIDATE_FUNCTION_MISSING:'+name);
 const nextFunction=source.indexOf('\nfunction ',start+1);
 const nextDoc=source.indexOf('\n/**',start+1);
 const ends=[nextFunction,nextDoc].filter(index=>index>=0);
 const end=ends.length?Math.min(...ends):source.length;
 const block=source.slice(start,end).trim();
 if(!block.endsWith('}'))throw new Error('CANDIDATE_FUNCTION_UNCLOSED:'+name);
 return block;
}
const candidateFunctions=[
 // These are extracted from the actual candidate Code.gs, not parallel test copies.
 'createMpsGasEffectLedger_','createMpsGasVipTransitionStore_',
 'createMpsGasVipTransitionOrchestrator_','createMpsGasVipChatMemberHandler_',
 'getMpsExistingVipAccessSheetForTransition_','findUniqueMpsTransitionRow_',
 'resolveMpsVipChatMemberTransition_','createMpsVipTransitionStatusWriter_',
 'processMpsVipChatMemberEvent_'
].map(name=>extractFunction(candidate,name)).join('\n');
const memberHeaders=[
 'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran',
 'Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit',
 'Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui','Telegram Chat ID','Telegram Link Token','Telegram Linked At','PIN Hash',
 'PIN Updated At','Telegram Link Expires At','Application Ref','VIP Invite Link','VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'
];
const accessHeaders=['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'];
const intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
const cursorHeaders=['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];
const auditHeaders=['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details'];
const tickerHeaders=['Event ID','Created At','Member ID','Member Name','Event Text','Status'];

function runtime({eligible=true}={}){
 const member=Array(memberHeaders.length).fill('');
 member[0]='MPS-ABCDEF12';member[2]='Trader MPS';member[7]=eligible?'Berhasil':'Menunggu Verifikasi';
 member[8]='Budi Santoso';member[14]=eligible?'Disetujui':'Menunggu Verifikasi';
 const access=['MPS-ABCDEF12','987654321','987654321','budi_mps','Budi',true,'Menunggu Aktivasi','','','', ''];
 const data=new Map([
  ['Database Member',[memberHeaders.slice(),member]],
  ['VIP Access',[accessHeaders.slice(),access]],
  ['MPS Audit Logs',[auditHeaders.slice()]],
  ['MPS VIP Ticker Events',[tickerHeaders.slice()]],
  ['MPS Telegram VIP Transition Intents',[intentHeaders.slice()]],
  ['MPS Telegram VIP Member Cursor',[cursorHeaders.slice()]]
 ]);
 let held=false,acquired=0,released=0,followups=0,networkCalls=0,cacheRemovals=0;
 const sheets=new Map();
 function sheet(name){
  const rows=data.get(name);if(!rows)return null;
  if(sheets.has(name))return sheets.get(name);
  const sh={
   getLastRow:()=>rows.length,
   getLastColumn:()=>Math.max(0,...rows.map(row=>row.length)),
   getRange(row,col,nr=1,nc=1){return{
    getValues(){return Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>rows[row-1+ri]?.[col-1+ci]??''));},
    getDisplayValues(){return this.getValues().map(line=>line.map(v=>v==null?'':String(v)));},
    setNumberFormat(){return this;},
    setValue(value){while(rows.length<row)rows.push([]);while(rows[row-1].length<col)rows[row-1].push('');rows[row-1][col-1]=value;return this;},
    setValues(values){values.forEach((line,ri)=>{while(rows.length<row+ri)rows.push([]);while(rows[row-1+ri].length<col-1)rows[row-1+ri].push('');line.forEach((v,ci)=>rows[row-1+ri][col-1+ci]=v);});return this;}
   }; }
  };
  sheets.set(name,sh);return sh;
 }
 const ss={getSheetByName:sheet};
 const context={
  MPS:{headers:memberHeaders.slice()},
  MPS_COL:{id:1,nickname:3,registrationStatus:8,accountName:9,depositStatus:15},
  MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:auditHeaders.slice()},
  MPS_VIP_TICKER_EVENTS:{sheet:'MPS VIP Ticker Events',headers:tickerHeaders.slice()},
  SpreadsheetApp:{openById:id=>{assert.equal(id,'isolated-vip-runtime');return ss;},flush:()=>{}},
  LockService:{getScriptLock:()=>({waitLock:()=>{if(held)throw Error('MOCK_LOCK_REENTRANT');held=true;acquired++;},releaseLock:()=>{if(!held)throw Error('MOCK_LOCK_NOT_HELD');held=false;released++;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-vip-runtime':key==='MPS_TELEGRAM_VIP_CHAT_ID'?'-1001234567890':''})},
  CacheService:{getScriptCache:()=>({remove:key=>{assert.equal(held,false,'cache/network follow-up must run after ScriptLock release');cacheRemovals++;}})},
  openDatabase_:()=>ss,
  getMemberSheet_:()=>sheet('Database Member'),
  clean_:(v,n)=>String(v??'').replace(/\\s+/g,' ').trim().slice(0,n),
  isSafePublicIdentity_:v=>!/[0-9@]/.test(String(v||'')),
  sha256_:()=> 'a'.repeat(64),
  revokeVipInviteLink_:()=>{assert.equal(held,false);networkCalls++;return true;},
  kickMpsUnauthorizedUser_:()=>{assert.equal(held,false,'Telegram follow-up must run after ScriptLock release');networkCalls++;return true;},
  sendTelegram_:()=>{assert.equal(held,false);networkCalls++;},
  console
 };
 vm.createContext(context);
 vm.runInContext(candidateFunctions+'\n'+
  'this.makeLedger=createMpsGasEffectLedger_;this.runCandidateVipEvent=processMpsVipChatMemberEvent_;',context,{timeout:2000});
 const ledger=context.makeLedger({spreadsheetId:'isolated-vip-runtime'});
 // Explicit isolated setup: append Effect Key headers before any webhook event.
 ledger.runExclusive(tx=>{tx.migrate('audit');tx.migrate('ticker');});
 return{
  process:update=>context.runCandidateVipEvent(update,update.chat_member),
  sheets:data,stats:()=>({held,acquired,released,followups,networkCalls,cacheRemovals}),
  addUnauthorizedAccess(){data.get('VIP Access').push(['','','','','',false,'','','','','']);}
 };
}
function event(updateId,sourceDate,oldStatus,newStatus,userId='987654321'){
 return{update_id:updateId,chat_member:{
  chat:{id:-1001234567890,type:'supergroup'},
  date:sourceDate,
  old_chat_member:{status:oldStatus,user:{id:Number(userId),is_bot:false}},
  new_chat_member:{status:newStatus,user:{id:Number(userId),is_bot:false}}
 }};
}

test('complete candidate Code.gs loads in a clean Apps Script-like V8 global scope without top-level service access',()=>{
 const context={console};
 vm.runInNewContext(candidate,context,{timeout:3000,filename:'candidate/Code.gs'});
 for(const name of ['doGet','doPost','processTelegramUpdateCore_','processMpsVipChatMemberEvent_','apiAdminInspectMemberSchemaV480','apiAdminMigrateMemberSheetToV480','apiAdminPrepareTelegramVipTransitionStorage']){
  assert.equal(typeof context[name],'function','expected global function '+name);
 }
});
test('candidate chat_member activation writes actual VIP Access and Database Member state with durable intent and keyed effects',()=>{
 const h=runtime();
 const update=event(7001,1760000000,'left','member');
 assert.equal(h.process(update),'ACTIVE');
 const access=h.sheets.get('VIP Access')[1],member=h.sheets.get('Database Member')[1];
 assert.equal(access[6],'Aktif');assert.equal(access[9].getTime(),1760000000000);
 assert.equal(member[27].getTime(),1760000000000);assert.equal(member[28],'987654321');assert.equal(member[29],'Aktif');
 const intents=h.sheets.get('MPS Telegram VIP Transition Intents');
 assert.equal(intents.length,2);assert.equal(intents[1][11],'COMPLETED');assert.equal(intents[1][6],'ACTIVE');
 assert.equal(h.sheets.get('MPS Telegram VIP Member Cursor').length,2);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
 assert.equal(h.stats().held,false);assert.equal(h.stats().cacheRemovals,1);
});
test('candidate chat_member leave updates both VIP status stores without adding another join ticker',()=>{
 const h=runtime();
 assert.equal(h.process(event(7001,1760000000,'left','member')),'ACTIVE');
 assert.equal(h.process(event(7002,1760000010,'member','left')),'LEFT');
 const access=h.sheets.get('VIP Access')[1],member=h.sheets.get('Database Member')[1];
 assert.equal(access[6],'Keluar');assert.equal(member[29],'Keluar');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs').length,3);
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,3);
});
test('candidate exact chat_member replay is idempotent and does not duplicate durable effects',()=>{
 const h=runtime(),update=event(7001,1760000000,'left','member');
 assert.equal(h.process(update),'ACTIVE');assert.equal(h.process(update),'DUPLICATE');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,2);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
 assert.equal(h.stats().held,false);
});
test('candidate denies an unlinked Telegram member and performs removal follow-up only after lock release',()=>{
 const h=runtime();
 const update=event(7100,1760000100,'left','member','555000111');
 assert.equal(h.process(update),'DENIED');
 assert.equal(h.stats().networkCalls,1);
 assert.equal(h.stats().held,false);
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][6],'DENIED');
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,1);
 assert.equal(h.sheets.get('MPS Audit Logs').length,2);
});
test('candidate ignores member-to-admin role changes because membership remains active',()=>{
 const h=runtime();
 assert.equal(h.process(event(7200,1760000200,'member','administrator')),'IGNORED');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,1);
 assert.equal(h.sheets.get('MPS Audit Logs').length,1);
 assert.equal(h.stats().acquired,1,'both explicit setup migrations share one ScriptLock scope');
});
