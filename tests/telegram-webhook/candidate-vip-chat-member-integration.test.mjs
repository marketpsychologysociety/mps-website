import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const candidate=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
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
  console,
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

test('candidate Code.gs compiles as one Apps Script source unit',()=>{
 assert.ok(candidate.includes('function apiAdminPrepareTelegramVipTransitionStorage(session)'));
 assert.ok(candidate.includes('function processMpsVipChatMemberEvent_(update,memberUpdate)'));
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
 assert.deepEqual(result,{ok:true,alreadyJoined:true});
 assert.equal(locks,1);
 assert.equal(writes.length,0,'getChatMember observation must not mutate access or member status');
});
