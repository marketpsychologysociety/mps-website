import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const candidate=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const candidateIndex=readFileSync(fileURLToPath(new URL('../../candidates/Index.html',import.meta.url)),'utf8');
new vm.Script(candidate,{filename:'candidate/Code.gs'});
function extract(name,next){
 const start=candidate.indexOf('function '+name+'(');
 const end=candidate.indexOf('function '+next+'(',start+1);
 assert.ok(start>=0&&end>start,'missing source function '+name);
 return candidate.slice(start,end);
}
const coreSource=extract('processTelegramUpdateCore_','processVipJoinRequest_');
const joinSource=extract('processVipJoinRequest_','verifyTelegramLinkFromUpdate_');
const resolverSource=extract('resolveMpsVipChatMemberTransition_','createMpsVipTransitionStatusWriter_');
const writerSource=extract('createMpsVipTransitionStatusWriter_','processMpsVipChatMemberEvent_');
const request=()=>({chat:{id:'-1001234567890'},from:{id:987654321,is_bot:false},user_chat_id:987654321,date:1760000000});
const tgResponse=(status,ok=true)=>({ok,result:{status,is_member:status==='member'},description:ok?'':'temporary failure'});

function joinHarness(fetchImpl){
 const calls=[],memberId='MPS-ABCDEF12',userId='987654321';
 const accessRow=[memberId,userId,userId,'test_user','Test',true,'Menunggu','https://t.me/+invite',null,null,''];
 const memberRow=new Array(30).fill('');
 memberRow[7]='Berhasil';memberRow[14]='Disetujui';memberRow[8]='Test Member';
 const accessSheet={getRange:()=>({getValues:()=>[accessRow]})};
 const memberSheet={getRange:()=>({getValues:()=>[memberRow]})};
 const context={
  console,MPS:{headers:new Array(30)},MPS_COL:{registrationStatus:8,depositStatus:15},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>({MPS_TELEGRAM_VIP_CHAT_ID:'-1001234567890',MPS_TELEGRAM_BOT_TOKEN:'123456:TEST_TOKEN_NOT_REAL'})[key]||''})},
  getTelegramAccessSheet_:()=>accessSheet,findTelegramAccessByUserId_:()=>2,
  getMemberSheet_:()=>memberSheet,findMemberById_:()=>2,
  UrlFetchApp:{fetch:(...args)=>{calls.push({type:'fetch',args});return fetchImpl(...args);}},
  parseTelegramResponse_:r=>r,
  updateVipJoinStatus_:()=>{throw new Error('LEGACY_STATUS_MUTATION_FORBIDDEN');},
  telegramSendToChat_:(...args)=>{calls.push({type:'dm',args});return{ok:true};},
  recordMpsAudit_:(...args)=>calls.push({type:'audit',args}),
  clean_:v=>String(v),safeErrorMessage_:e=>String(e&&e.message||e)
 };
 vm.createContext(context);vm.runInContext(joinSource,context,{timeout:1000});
 return{context,calls};
}

test('candidate Code.gs compiles and removes every legacy status-handler callsite',()=>{
 assert.ok(candidate.includes('function apiAdminPrepareTelegramVipTransitionStorage(session)'));
 assert.ok(candidate.includes('function processMpsVipChatMemberEvent_(update,memberUpdate)'));
 assert.equal(candidate.includes('updateVipJoinStatus_'),false);
 assert.equal(candidate.includes('recordMpsVipTickerEvent_'),false);
 assert.equal(joinSource.includes('updateVipJoinStatus_'),false);
 const invite=extract('sendVipInvite_','isSafePublicIdentity_');
 assert.equal(invite.includes("setValue('Aktif'"),false);
});
test('chat_member ingress passes the complete original update and event to durable handler',()=>{
 const calls=[];
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>'-1001234567890'})},
  processMpsVipChatMemberEvent_:(u,e)=>calls.push({update:u,event:e})
 };
 vm.createContext(context);vm.runInContext(coreSource,context,{timeout:1000});
 const update={update_id:123456,chat_member:{date:1760000000,chat:{id:'-1001234567890'},new_chat_member:{user:{id:987654321},status:'member',is_member:true}}};
 context.processTelegramUpdateCore_(update);
 assert.equal(calls.length,1);assert.equal(calls[0].update,update);assert.equal(calls[0].event,update.chat_member);
});
test('pre-approval getChatMember reconciliation does not mutate VIP status',()=>{
 const h=joinHarness(()=>tgResponse('member'));
 h.context.processVipJoinRequest_(request());
 assert.equal(h.calls.filter(x=>x.type==='dm').length,1);
 assert.equal(h.calls.some(x=>x.type==='audit'),false);
});
test('successful join-request approval waits for chat_member before status mutation',()=>{
 let n=0;const h=joinHarness(()=>++n===1?tgResponse('left'):{ok:true,result:true});
 h.context.processVipJoinRequest_(request());
 assert.equal(n,2);
 assert.equal(h.calls.filter(x=>x.type==='dm').length,1);
});
test('failed approval followed by getChatMember member observation does not mutate VIP status',()=>{
 let n=0;const h=joinHarness(()=>++n===1?tgResponse('left'):n===2?tgResponse('',false):tgResponse('member'));
 h.context.processVipJoinRequest_(request());
 assert.equal(n,3);
 assert.equal(h.calls.some(x=>x.type==='audit'),false);
});
test('in-lock resolver selects ACTIVE with real safe member name and ticker only for a true join',()=>{
 const memberId='MPS-ABCDEF12',userId='987654321';
 const accessData=[memberId,userId,userId,'test_user','Test',true,'Menunggu','invite-link',null,null,''];
 const memberData=new Array(30).fill('');memberData[7]='Berhasil';memberData[14]='Disetujui';memberData[8]='Real Member Name';
 const access={getRange:()=>({getValues:()=>[accessData]})},db={getRange:()=>({getValues:()=>[memberData]})};
 const context={
  MPS:{headers:new Array(30)},MPS_COL:{id:1,registrationStatus:8,depositStatus:15,accountName:9,nickname:3},
  getMpsExistingVipAccessSheetForTransition_:()=>access,getMemberSheet_:()=>db,
  findUniqueMpsTransitionRow_:(sheet,col,value)=>sheet===access?2:2,
  clean_:v=>String(v),isSafePublicIdentity_:()=>true
 };
 vm.createContext(context);vm.runInContext(resolverSource,context,{timeout:1000});
 const result=context.resolveMpsVipChatMemberTransition_({assertActive:()=>true},{telegramUserId:userId,telegramStatus:'member',isMember:true,wasMember:false});
 assert.equal(result.targetState,'ACTIVE');assert.equal(result.memberName,'Real Member Name');
 assert.equal(result.tickerAllowed,true);assert.equal(result.inviteToRevoke,'invite-link');
});
test('unauthorized active member is DENIED and ticker is suppressed',()=>{
 const userId='987654321',accessData=['MPS-ABCDEF12',userId,userId,'test_user','Test',true,'Menunggu','',null,null,''];
 const memberData=new Array(30).fill('');memberData[7]='Menunggu';memberData[14]='Pending';
 const access={getRange:()=>({getValues:()=>[accessData]})},db={getRange:()=>({getValues:()=>[memberData]})};
 const context={
  MPS:{headers:new Array(30)},MPS_COL:{id:1,registrationStatus:8,depositStatus:15,accountName:9,nickname:3},
  getMpsExistingVipAccessSheetForTransition_:()=>access,getMemberSheet_:()=>db,
  findUniqueMpsTransitionRow_:()=>2,clean_:v=>String(v),isSafePublicIdentity_:()=>true
 };
 vm.createContext(context);vm.runInContext(resolverSource,context,{timeout:1000});
 const result=context.resolveMpsVipChatMemberTransition_({assertActive:()=>true},{telegramUserId:userId,telegramStatus:'member',isMember:true,wasMember:false});
 assert.equal(result.targetState,'DENIED');assert.equal(result.kickNeeded,true);assert.equal(result.tickerAllowed,false);
});
test('status writer uses the caller scope and never acquires a nested ScriptLock',()=>{
 const accessValues=['MPS-ABCDEF12','987654321','987654321','','',true,'Menunggu','',null,null,''];
 const memberValues=new Array(30).fill('');let flushed=0;
 const access={getRange:(row,col,nr=1,nc=1)=>({
  getDisplayValues:()=>[accessValues],
  setValue:v=>{accessValues[col-1]=v;},
  setValues:v=>{for(let j=0;j<v[0].length;j++)memberValues[col-1+j]=v[0][j];}
 })};
 const db={getRange:(row,col,nr=1,nc=1)=>({
  setValue:v=>{memberValues[col-1]=v;},
  setValues:v=>{for(let j=0;j<v[0].length;j++)memberValues[col-1+j]=v[0][j];}
 })};
 const context={
  getMpsExistingVipAccessSheetForTransition_:()=>access,findUniqueMpsTransitionRow_:()=>2,
  getMemberSheet_:()=>db,MPS_COL:{id:1},MPS:{headers:new Array(30)},
  SpreadsheetApp:{flush:()=>flushed++},
  LockService:{getScriptLock:()=>{throw new Error('NESTED_LOCK_FORBIDDEN');}}
 };
 vm.createContext(context);vm.runInContext(writerSource,context,{timeout:1000});
 const writer=context.createMpsVipTransitionStatusWriter_(),tx={assertActive:()=>true};
 writer.applyAccessStatus(tx,{memberId:'MPS-ABCDEF12',telegramUserId:'987654321',targetState:'ACTIVE',sourceDate:1760000000});
 writer.applyMemberStatus(tx,{memberId:'MPS-ABCDEF12',telegramUserId:'987654321',targetState:'ACTIVE',sourceDate:1760000000});
 assert.equal(accessValues[6],'Aktif');assert.equal(accessValues[9].getTime(),1760000000000);
 assert.equal(memberValues[27].getTime(),1760000000000);assert.equal(memberValues[28],'987654321');assert.equal(memberValues[29],'Aktif');
 assert.equal(flushed,2);
});

test('sendVipInvite_ getChatMember observation never writes VIP status',()=>{
 const source=extract('sendVipInvite_','isSafePublicIdentity_');
 const writes=[],memberId='MPS-ABCDEF12',userId='987654321';
 const accessRow=[memberId,userId,userId,'test_user','Test',true,'Undangan dikirim','old-link',new Date(),null,''];
 const memberRow=new Array(30).fill('');memberRow[7]='Berhasil';memberRow[14]='Disetujui';
 const access={getRange:()=>({getValues:()=>[accessRow],setValue:v=>writes.push(v),setValues:v=>writes.push(v)})};
 const db={getRange:()=>({getValues:()=>[memberRow],setValue:v=>writes.push(v),setValues:v=>writes.push(v)})};
 let locks=0;
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>{
   if(key==='MPS_PIN_DELIVERED_'+memberId)return'1';
   if(key==='MPS_TELEGRAM_BOT_TOKEN')return'123456:TEST_TOKEN_NOT_REAL';
   if(key==='MPS_TELEGRAM_VIP_CHAT_ID')return'-1001234567890';
   return'';
  }})},
  CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{},remove:()=>{}})},
  LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{}})},
  getTelegramAccessSheet_:()=>access,findTelegramAccessByMemberId_:()=>2,
  getMemberSheet_:()=>db,findMemberById_:()=>2,
  MPS:{headers:new Array(30)},MPS_COL:{registrationStatus:8,depositStatus:15},
  UrlFetchApp:{fetch:()=>({})},
  parseTelegramResponse_:()=>({ok:true,result:{status:'member',is_member:true}}),
  sha256_:()=> 'a'.repeat(64),console
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
 const result=context.sendVipInvite_(memberId);
 assert.equal(result.ok,true);assert.equal(result.alreadyJoined,true);
 assert.equal(locks,1);
 assert.equal(writes.length,0,'getChatMember observation must not mutate access or member status');
});

test('unauthorized kick replay does not unban a user already left or manually kicked',()=>{
 const source=extract('kickMpsUnauthorizedUser_','revokeVipInviteLink_');
 const calls=[];
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> '123456:TEST_TOKEN_NOT_REAL'})},
  UrlFetchApp:{fetch:(url)=>{calls.push(url);return{};}},
  parseTelegramResponse_:()=>({ok:true,result:{status:'kicked'}}),console
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
 assert.equal(context.kickMpsUnauthorizedUser_('-1001234567890','987654321'),true);
 assert.equal(calls.length,1);
 assert.ok(calls[0].includes('getChatMember'));
});
test('already-invalid Telegram invite link is treated as safely revoked on replay',()=>{
 const source=extract('revokeVipInviteLink_','testTelegram_');
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> '123456:TEST_TOKEN_NOT_REAL'})},
  UrlFetchApp:{fetch:()=>({})},
  parseTelegramResponse_:()=>({ok:false,description:'INVITE_HASH_INVALID'})
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
 assert.equal(context.revokeVipInviteLink_('-1001234567890','old-invite-link'),true);
});

test('candidate chat_member bridge builds isolated adapters and forwards the original update',()=>{
 const source=extract('processMpsVipChatMemberEvent_','apiAdminPrepareTelegramVipTransitionStorage');
 const calls=[];let handlerConfig=null;
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_TELEGRAM_VIP_CHAT_ID'?'-1001234567890':key==='MPS_SPREADSHEET_ID'?'isolated-db':''})},
  createMpsGasEffectLedger_:config=>{calls.push(['ledger',config]);return{runExclusive:()=>{}};},
  createMpsGasVipTransitionStore_:config=>{calls.push(['store',config]);return{};},
  createMpsVipTransitionStatusWriter_:()=>({applyAccessStatus(){},applyMemberStatus(){}}),
  createMpsGasVipTransitionOrchestrator_:config=>{calls.push(['orchestrator',config]);return{process(){return'ACTIVE';}};},
  createMpsGasVipChatMemberHandler_:config=>{handlerConfig=config;return{process:update=>{calls.push(['update',update]);return'ACTIVE';}};},
  resolveMpsVipChatMemberTransition_:()=>({targetState:'ACTIVE'}),
  sha256_:()=> 'b'.repeat(64)
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
 const update={update_id:123,chat_member:{date:1760000000,chat:{id:'-1001234567890'},new_chat_member:{user:{id:987654321},status:'member'}}};
 assert.equal(context.processMpsVipChatMemberEvent_(update,update.chat_member),'ACTIVE');
 assert.equal(calls.find(x=>x[0]==='ledger')[1].spreadsheetId,'isolated-db');
 assert.equal(calls.find(x=>x[0]==='store')[1].spreadsheetId,'isolated-db');
 assert.equal(calls.find(x=>x[0]==='update')[1],update);
 assert.equal(typeof handlerConfig.resolveTransition,'function');
 assert.equal(typeof handlerConfig.afterTransition,'function');
});

const legacyMemberHeaders=['ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui'];
const appendedMemberHeaders=['Telegram Chat ID','Telegram Link Token','Telegram Linked At','PIN Hash','PIN Updated At','Telegram Link Expires At','Application Ref','VIP Invite Link','VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'];
function migrationHarness(initialHeaders,{adminAllowed=true}={}) {
 const legacyRow=Array.from({length:initialHeaders.length},(_,i)=>'legacy-'+i);legacyRow[0]='MPS-OLD12345';
 const rows=[initialHeaders.slice(),legacyRow];
 let writes=0,flushes=0,locks=0,releases=0;
 const sheet={getLastColumn:()=>rows[0].length,getLastRow:()=>rows.length,getRange:(r,col,nr=1,nc=1)=>({
  getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[r-1+ri]?.[col-1+ci]??''))),
  setValues:values=>{writes++;values.forEach((line,ri)=>{while(rows.length<=r-1+ri)rows.push([]);line.forEach((v,ci)=>rows[r-1+ri][col-1+ci]=v);});}
 })};
 const context={
  MPS:{headers:[...legacyMemberHeaders,...appendedMemberHeaders]},
  requireSuperAdmin_:()=>{if(!adminAllowed)throw new Error('SUPER_ADMIN_REQUIRED');},
  LockService:{getScriptLock:()=>({waitLock:()=>{locks++;},releaseLock:()=>{releases++;}})},
  openDatabase_:()=>({getSheetByName:name=>name==='Database Member'?sheet:null}),
  SpreadsheetApp:{flush:()=>{flushes++;}}
 };
 vm.createContext(context);vm.runInContext(extract('apiAdminMigrateMemberSheetToV480','apiAdminPrepareTelegramVipTransitionStorage'),context,{timeout:1000});
 return{run:()=>context.apiAdminMigrateMemberSheetToV480('admin-session'),rows,stats:()=>({writes,flushes,locks,releases})};
}
test('explicit member migration appends 12 headers and preserves all legacy row values',()=>{
 const h=migrationHarness(legacyMemberHeaders),before=h.rows[1].slice();
 const result=h.run();
 assert.equal(result.ok,true);assert.equal(result.migrated,true);assert.equal(result.appendedColumns,12);
 assert.deepEqual(h.rows[0],[...legacyMemberHeaders,...appendedMemberHeaders]);
 assert.deepEqual(h.rows[1],before);
 assert.deepEqual(h.stats(),{writes:1,flushes:1,locks:1,releases:1});
});
test('explicit member migration is idempotent on an exact 30-column schema',()=>{
 const h=migrationHarness([...legacyMemberHeaders,...appendedMemberHeaders]);
 const result=h.run();
 assert.equal(result.ok,true);assert.equal(result.migrated,false);
 assert.equal(h.stats().writes,0);assert.equal(h.stats().locks,1);assert.equal(h.stats().releases,1);
});
test('member migration fails closed on mismatched legacy headers or partial schema',()=>{
 const wrong=migrationHarness(['Wrong Header',...legacyMemberHeaders.slice(1)]);
 assert.throws(()=>wrong.run(),/Skema 18 kolom/);
 assert.equal(wrong.stats().writes,0);assert.equal(wrong.stats().releases,1);
 const partial=migrationHarness([...legacyMemberHeaders,...appendedMemberHeaders.slice(0,2)]);
 assert.throws(()=>partial.run(),/Jumlah kolom/);
 assert.equal(partial.stats().writes,0);
});
test('member migration requires super-admin before acquiring a lock',()=>{
 const h=migrationHarness(legacyMemberHeaders,{adminAllowed:false});
 assert.throws(()=>h.run(),/SUPER_ADMIN_REQUIRED/);
 assert.equal(h.stats().locks,0);assert.equal(h.stats().writes,0);
});

test('unauthorized restricted member with is_member=true is also scheduled for removal',()=>{
 const userId='987654321',accessData=['MPS-ABCDEF12',userId,userId,'test_user','Test',true,'Menunggu','',null,null,''];
 const memberData=new Array(30).fill('');memberData[7]='Menunggu';memberData[14]='Pending';
 const access={getRange:()=>({getValues:()=>[accessData]})},db={getRange:()=>({getValues:()=>[memberData]})};
 const context={
  MPS:{headers:new Array(30)},MPS_COL:{id:1,registrationStatus:8,depositStatus:15,accountName:9,nickname:3},
  getMpsExistingVipAccessSheetForTransition_:()=>access,getMemberSheet_:()=>db,
  findUniqueMpsTransitionRow_:()=>2,clean_:v=>String(v),isSafePublicIdentity_:()=>true
 };
 vm.createContext(context);vm.runInContext(resolverSource,context,{timeout:1000});
 const result=context.resolveMpsVipChatMemberTransition_({assertActive:()=>true},{telegramUserId:userId,telegramStatus:'restricted',isMember:true,wasMember:false});
 assert.equal(result.targetState,'DENIED');assert.equal(result.kickNeeded,true);
});
test('unauthorized restricted active user is banned and unbanned only after live membership check',()=>{
 const source=extract('kickMpsUnauthorizedUser_','revokeVipInviteLink_');
 const calls=[];let parsed=0;
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> '123456:TEST_TOKEN_NOT_REAL'})},
  UrlFetchApp:{fetch:url=>{calls.push(url);return{};}},
  parseTelegramResponse_:()=>++parsed===1?{ok:true,result:{status:'restricted',is_member:true}}:{ok:true},
  console
 };
 vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
 assert.equal(context.kickMpsUnauthorizedUser_('-1001234567890','987654321'),true);
 assert.equal(calls.length,3);
 assert.ok(calls[0].includes('getChatMember'));assert.ok(calls[1].includes('banChatMember'));assert.ok(calls[2].includes('unbanChatMember'));
});

function auditPruneHarness({allKeyed=false}={}) {
 const rows=[['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details','Effect Key']];
 for(let i=0;i<2001;i++)rows.push([new Date(1760000000000+i),'SYSTEM','actor','ACTION','target','SUCCESS','legacy detail',allKeyed?'effect-'+i:(i===0?'durable-effect':'')]);
 const sheet={
  getLastRow:()=>rows.length,getLastColumn:()=>8,
  appendRow:row=>rows.push(row.slice()),
  getRange:(r,col,nr=1,nc=1)=>({
   getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[r-1+ri]?.[col-1+ci]??'')))
  }),
  deleteRows:(start,count)=>rows.splice(start-1,count)
 };
 const context={MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},getMpsContentSheet_:()=>sheet,clean_:v=>String(v),sheetText_:v=>String(v),cleanNewsText_:v=>String(v),safeErrorMessage_:e=>String(e),console};
 vm.createContext(context);vm.runInContext(extract('recordMpsAudit_','apiAdminCheckSystemConfiguration'),context,{timeout:1000});
 return{run:()=>context.recordMpsAudit_('ADMIN','actor','ACTION','target','SUCCESS','detail'),rows};
}
test('audit pruning never deletes keyed effect-ledger rows',()=>{
 const h=auditPruneHarness();h.run();
 assert.equal(h.rows.length,2001);
 assert.equal(h.rows.some(r=>r[7]==='durable-effect'),true);
 assert.equal(h.rows[h.rows.length-1][3],'ACTION');
});
test('audit pruning may exceed soft cap rather than delete durable keyed rows',()=>{
 const h=auditPruneHarness({allKeyed:true});h.run();
 assert.equal(h.rows.length,2003);
 assert.equal(h.rows.slice(1,-1).every(r=>String(r[7]).startsWith('effect-')),true);
 assert.equal(h.rows[h.rows.length-1][3],'ACTION');
});


const queueConstant=candidate.match(/const MPS_VIP_FOLLOWUP_QUEUE = Object\\.freeze\\([\\s\\S]*?\\);/)[0];
const schemaStorageInspectorSource=queueConstant+'\n'+extract('inspectMpsVipTransitionStorageSchemas_','apiAdminInspectMemberSchemaV480');
const schemaPreflightSource=extract('apiAdminInspectMemberSchemaV480','apiAdminMigrateMemberSheetToV480');
const intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
const cursorHeaders=['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];
const accessHeaders=['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'];
function schemaPreflightHarness(headers,{sheetExists=true,adminAllowed=true,storageSheets={}}={}) {
 let reads=0,writes=0,locks=0;
 const dbSheet={getLastColumn:()=>headers.length,getRange:(row,col,nr,nc)=>({getDisplayValues:()=>{reads++;return [headers.slice(col-1,col-1+nc)];},setValues:()=>{writes++;}})};
 const ss={getSheetByName:name=>name==='Database Member'?(sheetExists?dbSheet:null):(storageSheets[name]||null)};
 const context={
  MPS:{headers:[...legacyMemberHeaders,...appendedMemberHeaders]},
  MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
  MPS_VIP_TICKER_EVENTS:{sheet:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']},
  requireSuperAdmin_:()=>{if(!adminAllowed)throw new Error('SUPER_ADMIN_REQUIRED');},
  openDatabase_:()=>ss,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-db':''})},
  createMpsGasVipTransitionStore_:()=>({headers:{intents:intentHeaders,cursor:cursorHeaders}}),
  LockService:{getScriptLock:()=>{locks++;throw new Error('READ_ONLY_PREFLIGHT_MUST_NOT_LOCK');}},
  SpreadsheetApp:{flush:()=>{throw new Error('READ_ONLY_PREFLIGHT_MUST_NOT_FLUSH');}}
 };
 vm.createContext(context);vm.runInContext(schemaStorageInspectorSource,context,{timeout:1000});vm.runInContext(schemaPreflightSource,context,{timeout:1000});
 return{run:()=>context.apiAdminInspectMemberSchemaV480('admin-session'),stats:()=>({reads,writes,locks})};
}
function storageInspectorHarness(storageSheets={}) {
 const context={
  MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
  MPS_VIP_TICKER_EVENTS:{sheet:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']},
  vmSheets:storageSheets
 };
 const ss={getSheetByName:name=>context.vmSheets[name]||null};
 vm.createContext(context);vm.runInContext(schemaStorageInspectorSource,context,{timeout:1000});
 return context.inspectMpsVipTransitionStorageSchemas_(ss,{headers:{intents:intentHeaders,cursor:cursorHeaders}});
}
test('read-only schema preflight recognizes exact 18-column legacy schema without writes or locks',()=>{
 const h=schemaPreflightHarness(legacyMemberHeaders);
 const result=h.run();
 assert.equal(result.ok,true);assert.equal(result.state,'LEGACY_18_READY');assert.equal(result.appendable,true);assert.equal(result.provisioningReady,false);
 assert.deepEqual(h.stats(),{reads:1,writes:0,locks:0});
});
test('read-only schema preflight recognizes exact 30-column v4.8 schema and all-missing storage as provisionable',()=>{
 const h=schemaPreflightHarness([...legacyMemberHeaders,...appendedMemberHeaders]);
 const result=h.run();
 assert.equal(result.ok,true);assert.equal(result.state,'READY_30');assert.equal(result.appendable,false);assert.equal(result.provisioningReady,true);
 assert.equal(result.provisioningChecks.length,6);
 assert.deepEqual(h.stats(),{reads:1,writes:0,locks:0});
});
test('read-only schema preflight blocks provisioning when an existing storage sheet has a mismatched header',()=>{
 const badSheet={getLastRow:()=>1,getLastColumn:()=>1,getRange:()=>({getDisplayValues:()=>[['Wrong Header']]})};
 const h=schemaPreflightHarness([...legacyMemberHeaders,...appendedMemberHeaders],{storageSheets:{'VIP Access':badSheet}});
 const result=h.run();
 assert.equal(result.ok,true);assert.equal(result.state,'READY_30');assert.equal(result.provisioningReady,false);
 assert.match(result.message,/VIP Access/);assert.equal(h.stats().writes,0);assert.equal(h.stats().locks,0);
});
test('read-only schema preflight fails closed for mismatched, partial, or missing member sheets',()=>{
 const wrong=schemaPreflightHarness(['Wrong Header',...legacyMemberHeaders.slice(1)]);
 assert.equal(wrong.run().state,'SCHEMA_MISMATCH');assert.equal(wrong.stats().writes,0);
 const partial=schemaPreflightHarness([...legacyMemberHeaders,...appendedMemberHeaders.slice(0,2)]);
 assert.equal(partial.run().state,'SCHEMA_MISMATCH');assert.equal(partial.stats().writes,0);
 const missing=schemaPreflightHarness([], {sheetExists:false});
 assert.equal(missing.run().state,'MISSING_SHEET');assert.equal(missing.stats().writes,0);
});
test('read-only schema preflight enforces super-admin before reading database',()=>{
 const h=schemaPreflightHarness(legacyMemberHeaders,{adminAllowed:false});
 assert.throws(()=>h.run(),/SUPER_ADMIN_REQUIRED/);
 assert.deepEqual(h.stats(),{reads:0,writes:0,locks:0});
});
test('storage schema inspector accepts missing tabs and exact legacy/effect-key schemas but rejects duplicate effect keys',()=>{
 const empty=storageInspectorHarness();
 assert.equal(empty.ok,true);assert.equal(empty.checks.length,6);
 const keyedHeaders=['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details','Effect Key'];
 const audit={getLastRow:()=>3,getLastColumn:()=>8,getRange:(row,col,nr,nc)=>({getDisplayValues:()=>row===1?[keyedHeaders]:[['same'],['same']]})};
 const bad=storageInspectorHarness({'MPS Audit Logs':audit});
 assert.equal(bad.ok,false);assert.equal(bad.checks.find(x=>x.name==='MPS Audit Logs').state,'EFFECT_KEY_DATA_INVALID');
});
test('VIP storage provisioning validates every target schema before creating or migrating anything',()=>{
 const source=extract('apiAdminPrepareTelegramVipTransitionStorage','kickMpsUnauthorizedUser_');
 const preflight=source.indexOf('inspectMpsVipTransitionStorageSchemas_(ss,store)');
 const memberCheck=source.indexOf("memberSheet.getRange(1,1,1,MPS.headers.length)");
 const accessCreation=source.indexOf('getTelegramAccessSheet_()');
 const auditMigration=source.indexOf("tx.migrate('audit')");
 assert.ok(memberCheck>=0&&preflight>memberCheck);
 assert.ok(accessCreation>preflight&&auditMigration>preflight);
 assert.ok(source.indexOf('provisionMpsSheets_(')>preflight,'audit and ticker sheets must use the explicit provisioning boundary');
});
function vipProvisionHarness({badVipHeader=false,badMemberHeader=false}={}) {
 let inserts=0,flushes=0,telegramAccessCalls=0,contentCalls=0,migrations=0,memberSheetCalls=0,triggerCreates=0;
 const dbHeaders=[...legacyMemberHeaders,...appendedMemberHeaders];
 if(badMemberHeader)dbHeaders[0]='Wrong ID Header';
 function makeSheet(rows=[]){
  return {
   getLastRow:()=>rows.length,getLastColumn:()=>rows[0]?rows[0].length:0,
   getRange:(row,col,nr=1,nc=1)=>({
    getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[row-1+ri]?.[col-1+ci]??''))),
    setValues:values=>{values.forEach((line,ri)=>{while(rows.length<=row-1+ri)rows.push([]);line.forEach((v,ci)=>rows[row-1+ri][col-1+ci]=v);});}
   })
  };
 }
 const dbSheet=makeSheet([dbHeaders]);
 const sheets={};
 const badVip=makeSheet([['Wrong VIP Header']]);
 const ss={
  getSheetByName:name=>name==='Database Member'?dbSheet:(name==='VIP Access'&&badVipHeader?badVip:(sheets[name]||null)),
  insertSheet:name=>{inserts++;const sh=makeSheet();sheets[name]=sh;return sh;}
 };
 const context={
  MPS:{headers:[...legacyMemberHeaders,...appendedMemberHeaders]},
  MPS_AUDIT_LOGS:{sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
  MPS_VIP_TICKER_EVENTS:{sheet:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']},
  requireSuperAdmin_:()=>true,
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-db':''})},
  createMpsGasEffectLedger_:()=>({runExclusive:callback=>callback({migrate:()=>{migrations++;return{outcome:'MIGRATED'};}})}),
  createMpsGasVipTransitionStore_:()=>({headers:{intents:intentHeaders,cursor:cursorHeaders}}),
  SpreadsheetApp:{openById:id=>{assert.equal(id,'isolated-db');return ss;},flush:()=>{flushes++;}},
  ScriptApp:{getProjectTriggers:()=>[],newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({create:()=>{assert.equal(name,'processMpsVipFollowupQueueScheduled_');assert.equal(n,5);triggerCreates++;}})})})},
  getMemberSheet_:()=>{memberSheetCalls++;return dbSheet;},
  getTelegramAccessSheet_:()=>{telegramAccessCalls++;return makeSheet();},
  provisionMpsSheets_:definitions=>{contentCalls+=definitions.length;return definitions.map(()=>makeSheet());},
  console
 };
 vm.createContext(context);vm.runInContext(schemaStorageInspectorSource,context,{timeout:1000});vm.runInContext(extract('apiAdminPrepareTelegramVipTransitionStorage','kickMpsUnauthorizedUser_'),context,{timeout:1000});
 return{run:()=>context.apiAdminPrepareTelegramVipTransitionStorage('admin-session'),stats:()=>({inserts,flushes,telegramAccessCalls,contentCalls,migrations,memberSheetCalls,triggerCreates})};
}
test('VIP provisioning aborts before every write when an existing storage schema is mismatched',()=>{
 const h=vipProvisionHarness({badVipHeader:true});
 assert.throws(()=>h.run(),/VIP_TRANSITION_PREFLIGHT_FAILED/);
 assert.deepEqual(h.stats(),{inserts:0,flushes:0,telegramAccessCalls:0,contentCalls:0,migrations:0,memberSheetCalls:0});
});
test('VIP provisioning verifies exact member schema, creates three durable transition tabs, and installs one scheduled worker',()=>{
 const h=vipProvisionHarness();
 const result=h.run();
 assert.equal(result.ok,true);
 assert.deepEqual(h.stats(),{inserts:3,flushes:3,telegramAccessCalls:1,contentCalls:2,migrations:2,memberSheetCalls:1,triggerCreates:1});
});
test('candidate Index exposes guarded migration controls only for super-admin and requires explicit confirmations',()=>{
 assert.match(candidateIndex,/<section class="panel" id="memberSchemaMaintenance" data-super-admin-only/);
 assert.match(candidateIndex,/if\(\/sesi admin\/i\.test\(message\)\)\{state\.adminSession='';state\.adminRole='';state\.memberSchemaPreflight=null;/);
 assert.match(candidateIndex,/state\.adminSession='';state\.adminRole='';state\.memberSchemaPreflight=null;\$\('migrateMemberSchemaV480'\)\.disabled=true;\$\('prepareVipTransitionStorage'\)\.disabled=true;/);
 assert.match(candidateIndex,/<button class="btn secondary" id="inspectMemberSchemaV480" type="button">/);
 assert.match(candidateIndex,/<button class="btn" id="migrateMemberSchemaV480" type="button" disabled>/);
 assert.match(candidateIndex,/<button class="btn secondary" id="prepareVipTransitionStorage" type="button" disabled>/);
 assert.match(candidateIndex,/api\('apiAdminInspectMemberSchemaV480',state\.adminSession\)/);
 assert.match(candidateIndex,/prepare\.disabled=!\(result&&result\.ok===true&&result\.state==='READY_30'&&result\.provisioningReady===true\)/);
 assert.match(candidateIndex,/preflight\.provisioningReady!==true/);
 const migrateHandler=candidateIndex.slice(candidateIndex.indexOf("$('migrateMemberSchemaV480').addEventListener"),candidateIndex.indexOf("$('prepareVipTransitionStorage').addEventListener"));
 const provisionHandler=candidateIndex.slice(candidateIndex.indexOf("$('prepareVipTransitionStorage').addEventListener"),candidateIndex.indexOf("$('refreshAdmin').addEventListener"));
 assert.ok(migrateHandler.indexOf('if(!confirm(')>=0&&migrateHandler.indexOf("api('apiAdminMigrateMemberSheetToV480'")>migrateHandler.indexOf('if(!confirm('));
 assert.ok(provisionHandler.indexOf('if(!confirm(')>=0&&provisionHandler.indexOf("api('apiAdminPrepareTelegramVipTransitionStorage'")>provisionHandler.indexOf('if(!confirm('));
 assert.match(provisionHandler,/const verify=await api\('apiAdminInspectMemberSchemaV480',state\.adminSession\)/);
 assert.match(provisionHandler,/verify\.provisioningReady!==true/);
 assert.equal((candidateIndex.match(/api\('apiAdminInspectMemberSchemaV480'/g)||[]).length,4);
 assert.equal((candidateIndex.match(/api\('apiAdminMigrateMemberSheetToV480'/g)||[]).length,1);
 assert.equal((candidateIndex.match(/api\('apiAdminPrepareTelegramVipTransitionStorage'/g)||[]).length,1);
});
