import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const candidate=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
function extractFunction(source,name){
 const start=source.indexOf('function '+name+'(');
 if(start<0)throw new Error('CANDIDATE_FUNCTION_MISSING:'+name);
 const nextFunction=source.indexOf('\nfunction ',start+1);
 const nextDoc=source.indexOf('\n/**',start+1);
 const nextTopLevelConst=source.indexOf('\nconst ',start+1);
 const ends=[nextFunction,nextDoc,nextTopLevelConst].filter(index=>index>=0);
 const end=ends.length?Math.min(...ends):source.length;
 const block=source.slice(start,end).trim();
 if(!block.endsWith('}'))throw new Error('CANDIDATE_FUNCTION_UNCLOSED:'+name);
 return block;
}
const queueConstant=candidate.match(/const MPS_VIP_FOLLOWUP_QUEUE = Object\.freeze\([\s\S]*?\);/)[0];
const candidateFunctions=[
 // These are extracted from the actual candidate Code.gs, not parallel test copies.
 'createMpsGasEffectLedger_','createMpsGasVipTransitionStore_',
 'createMpsGasVipTransitionOrchestrator_','createMpsGasVipChatMemberHandler_',
 'enqueueMpsVipFollowup_','runMpsVipFollowupQueue_',
 'getMpsExistingVipAccessSheetForTransition_','findUniqueMpsTransitionRow_',
 'resolveMpsVipChatMemberTransition_','createMpsVipTransitionStatusWriter_','removeMpsCacheBestEffort_',
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
const followupHeaders=['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','State','Attempts','Next Attempt At','Lease Until','Last Error Code','Created At','Updated At'];

function runtime({eligible=true,failCache=false,failRevoke=false,failKick=false}={}){
 const member=Array(memberHeaders.length).fill('');
 member[0]='MPS-ABCDEF12';member[2]='Trader MPS';member[7]=eligible?'Berhasil':'Menunggu Verifikasi';
 member[8]='Budi Santoso';member[14]=eligible?'Disetujui':'Menunggu Verifikasi';
 const access=['MPS-ABCDEF12','987654321','987654321','budi_mps','Budi',true,'Menunggu Aktivasi','old-invite-link','','', ''];
 const data=new Map([
  ['Database Member',[memberHeaders.slice(),member]],
  ['VIP Access',[accessHeaders.slice(),access]],
  ['MPS Audit Logs',[auditHeaders.slice()]],
  ['MPS VIP Ticker Events',[tickerHeaders.slice()]],
  ['MPS Telegram VIP Transition Intents',[intentHeaders.slice()]],
  ['MPS Telegram VIP Member Cursor',[cursorHeaders.slice()]],
  ['MPS Telegram VIP Follow-up Queue',[followupHeaders.slice()]]
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
  MPS_VIP_FOLLOWUP_QUEUE:{sheet:'MPS Telegram VIP Follow-up Queue',headers:followupHeaders.slice()},
  SpreadsheetApp:{openById:id=>{assert.equal(id,'isolated-vip-runtime');return ss;},flush:()=>{}},
  LockService:{getScriptLock:()=>({waitLock:()=>{if(held)throw Error('MOCK_LOCK_REENTRANT');held=true;acquired++;},releaseLock:()=>{if(!held)throw Error('MOCK_LOCK_NOT_HELD');held=false;released++;}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-vip-runtime':key==='MPS_TELEGRAM_VIP_CHAT_ID'?'-1001234567890':''})},
  CacheService:{getScriptCache:()=>({remove:key=>{assert.equal(held,false,'cache/network follow-up must run after ScriptLock release');cacheRemovals++;if(failCache)throw Error('MOCK_CACHE_UNAVAILABLE');}})},
  openDatabase_:()=>ss,
  getMemberSheet_:()=>sheet('Database Member'),
  clean_:(v,n)=>String(v??'').replace(/\\s+/g,' ').trim().slice(0,n),
  isSafePublicIdentity_:v=>!/[0-9@]/.test(String(v||'')),
  sha256_:value=>createHash('sha256').update(String(value)).digest('hex'),
  revokeVipInviteLink_:()=>{assert.equal(held,false);networkCalls++;return !failRevoke;},
  kickMpsUnauthorizedUser_:()=>{assert.equal(held,false,'Telegram follow-up must run after ScriptLock release');networkCalls++;return !failKick;},
  sendTelegram_:()=>{assert.equal(held,false);networkCalls++;return {ok:true};},
  console
 };
 vm.createContext(context);
 vm.runInContext(queueConstant+'\n'+candidateFunctions+'\n'+
  'this.makeLedger=createMpsGasEffectLedger_;this.runCandidateVipEvent=processMpsVipChatMemberEvent_;this.runFollowups=runMpsVipFollowupQueue_;',context,{timeout:2000});
 const ledger=context.makeLedger({spreadsheetId:'isolated-vip-runtime'});
 // Explicit isolated setup: append Effect Key headers before any webhook event.
 ledger.runExclusive(tx=>{tx.migrate('audit');tx.migrate('ticker');});
 return{
  process:update=>context.runCandidateVipEvent(update,update.chat_member),
  runQueue:()=>context.runFollowups(20),
  sheets:data,stats:()=>({held,acquired,released,followups,networkCalls,cacheRemovals}),
  addUnauthorizedAccess(){data.get('VIP Access').push(['','','','','',false,'','','','','']);},
  duplicateAccess(){data.get('VIP Access').push(data.get('VIP Access')[1].slice());},
  duplicateMember(){data.get('Database Member').push(data.get('Database Member')[1].slice());},
  setEligible(value){data.get('Database Member')[1][7]=value?'Berhasil':'Menunggu Verifikasi';data.get('Database Member')[1][14]=value?'Disetujui':'Menunggu Verifikasi';},
  setFollowupFailures(value){failRevoke=value;failKick=value;},
  setKickFailure(value){failKick=value;},
  makeQueueDue(row){data.get('MPS Telegram VIP Follow-up Queue')[row][9]=new Date(0);}
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
test('VIP membership transition remains committed when post-commit public cache invalidation fails',()=>{
 const h=runtime({failCache:true});
 assert.equal(h.process(event(7101,1760000100,'left','member')),'ACTIVE');
 const access=h.sheets.get('VIP Access')[1],member=h.sheets.get('Database Member')[1];
 assert.equal(access[6],'Aktif');assert.equal(member[29],'Aktif');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][11],'COMPLETED');
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
test('failed invite revocation is durably queued and retried without Telegram webhook redelivery',()=>{
 const h=runtime({failRevoke:true});
 assert.equal(h.process(event(7301,1760000300,'left','member')),'ACTIVE');
 const queue=h.sheets.get('MPS Telegram VIP Follow-up Queue');
 assert.equal(queue.length,2);assert.equal(queue[1][2],'REVOKE_INVITE');assert.equal(queue[1][7],'RETRY');assert.equal(queue[1][8],1);
 assert.equal(h.sheets.get('VIP Access')[1][6],'Aktif');
 assert.equal(h.sheets.get('Database Member')[1][29],'Aktif');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][11],'COMPLETED');
 h.setFollowupFailures(false);
 h.makeQueueDue(1);assert.deepEqual(h.runQueue(),{ok:true,processed:1,completed:1,retried:0});
 assert.equal(queue[1][7],'DONE');assert.equal(queue[1][8],2);
 assert.equal(h.stats().held,false);
});
test('failed unauthorized-member removal is durably queued and retried by the scheduled worker',()=>{
 const h=runtime({failKick:true});
 assert.equal(h.process(event(7302,1760000301,'left','member','555000111')),'DENIED');
 const queue=h.sheets.get('MPS Telegram VIP Follow-up Queue');
 assert.equal(queue.length,2);assert.equal(queue[1][2],'REMOVE_MEMBER');assert.equal(queue[1][7],'RETRY');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][11],'COMPLETED');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][6],'DENIED');
 h.setKickFailure(false);h.makeQueueDue(1);
 assert.deepEqual(h.runQueue(),{ok:true,processed:1,completed:1,retried:0});
 assert.equal(queue[1][7],'DONE');
 assert.equal(h.stats().held,false);
});

test('duplicate Telegram identity rows in VIP Access fail closed without changing member or ticker state',()=>{
 const h=runtime();h.duplicateAccess();
 assert.throws(()=>h.process(event(7401,1760000400,'left','member')),/VIP_TRANSITION_DUPLICATE_IDENTITY_ROW/);
 assert.equal(h.sheets.get('VIP Access')[1][6],'Menunggu Aktivasi');
 assert.equal(h.sheets.get('Database Member')[1][29],'');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,1);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,1);
 assert.equal(h.stats().held,false);
});
test('duplicate member IDs in Database Member fail closed before VIP activation',()=>{
 const h=runtime();h.duplicateMember();
 assert.throws(()=>h.process(event(7402,1760000401,'left','member')),/VIP_TRANSITION_DUPLICATE_IDENTITY_ROW/);
 assert.equal(h.sheets.get('VIP Access')[1][6],'Menunggu Aktivasi');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,1);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,1);
 assert.equal(h.stats().held,false);
});
test('webhook replay does not duplicate a pending follow-up task; worker completes it once',()=>{
 const h=runtime({failRevoke:true}),update=event(7403,1760000402,'left','member');
 assert.equal(h.process(update),'ACTIVE');
 assert.equal(h.process(update),'DUPLICATE');
 const queue=h.sheets.get('MPS Telegram VIP Follow-up Queue');
 assert.equal(queue.length,2);assert.equal(queue[1][7],'RETRY');
 h.setFollowupFailures(false);h.makeQueueDue(1);h.runQueue();
 assert.equal(queue.length,2);assert.equal(queue[1][7],'DONE');
 assert.equal(h.stats().held,false);
});
test('eligibility revoked after activation queues invite revocation and member removal independently of webhook replay',()=>{
 const h=runtime({failRevoke:true}),update=event(7404,1760000403,'left','member');
 assert.equal(h.process(update),'ACTIVE');
 h.setEligible(false);h.setFollowupFailures(false);
 assert.equal(h.process(update),'DUPLICATE');
 const queue=h.sheets.get('MPS Telegram VIP Follow-up Queue');
 assert.equal(queue.length,3);assert.equal(queue[1][2],'REVOKE_INVITE');assert.equal(queue[2][2],'REMOVE_MEMBER');
 h.makeQueueDue(1);h.runQueue();
 assert.equal(queue[1][7],'DONE');assert.equal(queue[2][7],'DONE');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][6],'ACTIVE');
 assert.equal(h.sheets.get('VIP Access')[1][6],'Aktif');
 assert.equal(h.sheets.get('Database Member')[1][29],'Aktif');
 assert.equal(h.stats().held,false);
});

test('removal retry continues after invite revocation is already completed',()=>{
 const h=runtime(),update=event(7405,1760000404,'left','member');
 assert.equal(h.process(update),'ACTIVE');
 h.setEligible(false);h.setKickFailure(true);h.process(update);
 const queue=h.sheets.get('MPS Telegram VIP Follow-up Queue');
 assert.equal(queue.length,3);assert.equal(queue[1][7],'DONE');assert.equal(queue[2][7],'RETRY');
 h.setKickFailure(false);h.makeQueueDue(2);h.runQueue();
 assert.equal(queue[2][7],'DONE');assert.equal(queue[2][8],2);
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents')[1][6],'ACTIVE');
 assert.equal(h.stats().held,false);
});
test('same update ID with a changed Telegram payload still fails closed as an intent collision',()=>{
 const h=runtime(),update=event(7406,1760000405,'left','member');
 assert.equal(h.process(update),'ACTIVE');
 const tampered=event(7406,1760000405,'left','administrator');
 assert.throws(()=>h.process(tampered),/VIP_TRANSITION_INTENT_COLLISION/);
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,2);
 assert.equal(h.sheets.get('MPS VIP Ticker Events').length,2);
 assert.equal(h.stats().held,false);
});
test('candidate ignores member-to-admin role changes because membership remains active',()=>{
 const h=runtime();
 assert.equal(h.process(event(7200,1760000200,'member','administrator')),'IGNORED');
 assert.equal(h.sheets.get('MPS Telegram VIP Transition Intents').length,1);
 assert.equal(h.sheets.get('MPS Audit Logs').length,1);
 assert.equal(h.stats().acquired,1,'both explicit setup migrations share one ScriptLock scope');
});
