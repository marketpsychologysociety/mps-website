import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Index.html',import.meta.url)),'utf8');
new vm.Script(code,{filename:'Code.gs'});
function body(name){
 const start=code.indexOf('function '+name+'(');assert.ok(start>=0,'function '+name+' exists');
 const end=code.indexOf('\nfunction ',start+1);return code.slice(start,end<0?undefined:end);
}
function errorHarness(name,fetchImpl){
 const ctx={UrlFetchApp:{fetch:fetchImpl},requireDedicatedTestTelegramBot_:()=> 'TEST_TOKEN',
   assertDedicatedTestVipGroup_:()=>true,prop_:()=> 'TEST_TOKEN',JSON,Error,String,Math,Date};
 vm.createContext(ctx);vm.runInContext(body(name),ctx);
 return ctx;
}
const response=(status,payload)=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify(payload)});
test('VIP queue reconciles stale in-flight work instead of blindly repeating remote side effects',()=>{
 const ctx={Date,Number,Math,String};vm.createContext(ctx);vm.runInContext(body('vipQueueDecision_'),ctx);
 const now=Date.parse('2026-11-21T00:00:00Z');
 assert.equal(ctx.vipQueueDecision_('CREATING_INVITE',1,'',new Date(now-11*60000),now).status,'NEEDS_RECONCILIATION');
 assert.equal(ctx.vipQueueDecision_('DELIVERING',1,'',new Date(now-11*60000),now).status,'DELIVERY_UNKNOWN');
 assert.equal(ctx.vipQueueDecision_('PROCESSING',1,'',new Date(NaN),now).action,'MARK_UNKNOWN');
 assert.equal(ctx.vipQueueDecision_('NEEDS_RECONCILIATION',1,'',new Date(now-47*3600000),now).action,'WAIT');
 assert.equal(ctx.vipQueueDecision_('NEEDS_RECONCILIATION',1,'',new Date(now-49*3600000),now).action,'PROCESS');
});
test('VIP queue retry respects backoff and stops after five attempts',()=>{
 const ctx={Date,Number,Math,String};vm.createContext(ctx);vm.runInContext(body('vipQueueDecision_'),ctx);
 const now=Date.parse('2026-11-21T00:00:00Z');
 assert.equal(ctx.vipQueueDecision_('RETRY',2,new Date(now+60000),new Date(now-1000),now).action,'WAIT');
 assert.equal(ctx.vipQueueDecision_('RETRY',2,new Date(now-1),new Date(now-1000),now).action,'PROCESS');
 assert.equal(ctx.vipQueueDecision_('RETRY',5,'',new Date(now-1000),now).status,'DEAD_LETTER');
 assert.equal(ctx.vipQueueDecision_('PENDING',5,'','',now).status,'DEAD_LETTER');
});
test('invite creation network timeout and HTTP 5xx are ambiguous; definite 4xx is not',()=>{
 const timeout=errorHarness('createVipInvite_',()=>{throw new Error('socket timeout');});
 assert.throws(()=>timeout.createVipInvite_('-100','123'),e=>e.ambiguousRemoteOutcome===true&&e.code==='VIP_INVITE_CREATE_OUTCOME_UNKNOWN');
 const server=errorHarness('createVipInvite_',()=>response(503,{ok:false}));
 assert.throws(()=>server.createVipInvite_('-100','123'),e=>e.ambiguousRemoteOutcome===true);
 const client=errorHarness('createVipInvite_',()=>response(400,{ok:false}));
 assert.throws(()=>client.createVipInvite_('-100','123'),e=>e.ambiguousRemoteOutcome!==true&&e.code==='VIP_INVITE_CREATE_FAILED');
});
test('Telegram message delivery timeout and HTTP 5xx are ambiguous',()=>{
 const timeout=errorHarness('sendTelegramMessage_',()=>{throw new Error('socket timeout');});
 assert.throws(()=>timeout.sendTelegramMessage_('123','hello'),e=>e.ambiguousRemoteOutcome===true&&e.code==='TELEGRAM_SEND_OUTCOME_UNKNOWN');
 const server=errorHarness('sendTelegramMessage_',()=>response(502,{ok:false}));
 assert.throws(()=>server.sendTelegramMessage_('123','hello'),e=>e.ambiguousRemoteOutcome===true);
 const client=errorHarness('sendTelegramMessage_',()=>response(403,{ok:false}));
 assert.throws(()=>client.sendTelegramMessage_('123','hello'),e=>e.ambiguousRemoteOutcome!==true&&e.code==='TELEGRAM_SEND_FAILED');
});
test('VIP invite revoke timeout is ambiguous and cannot be treated as a confirmed cleanup',()=>{
 const timeout=errorHarness('revokeVipInvite_',()=>{throw new Error('socket timeout');});
 assert.throws(()=>timeout.revokeVipInvite_('-100','https://t.me/+test'),e=>e.ambiguousRemoteOutcome===true);
});
test('VIP worker persists invite and delivery phase before sending; ambiguous outcomes are never auto-revoked',()=>{
 const worker=body('apiAdminProcessVipQueue');
 assert.ok(worker.indexOf("queue.getRange(row,6).setValue(newInvite)")<worker.indexOf("sendTelegramMessage_(chatId"));
 assert.match(worker,/queue\.getRange\(row,8\)\.setValue\('DELIVERING'\)/);
 assert.match(worker,/err&&err\.ambiguousRemoteOutcome/);
 assert.match(worker,/phase==='DELIVERING'\?'DELIVERY_UNKNOWN':'NEEDS_RECONCILIATION'/);
 assert.match(worker,/deliveryConfirmed\|\|storedState==='SENT'/);
 assert.match(worker,/catch\(auditError\).*VIP_INVITE_AUDIT_DEFERRED/s);
 assert.match(body('vipQueueRecordFailure_'),/Math\.min\(6\*60\*60\*1000,5\*60\*1000\*Math\.pow\(2/);
 assert.match(worker,/MAX_ATTEMPTS_REACHED/);
});
test('VIP reconciliation becomes eligible only after the 48-hour invite lifetime',()=>{
 const decision=body('vipQueueDecision_');
 assert.match(decision,/48\*60\*60\*1000/);
 assert.match(decision,/NEEDS_RECONCILIATION/);
 assert.match(decision,/DELIVERY_UNKNOWN/);
});
test('Telegram journal marks ambiguous outcomes and does not blindly replay stale PROCESSING rows',()=>{
 const process=body('processTelegramUpdate_'),retry=body('apiAdminRetryTelegramFailures');
 assert.match(process,/err&&err\.ambiguousRemoteOutcome\?'NEEDS_RECONCILIATION':'FAILED'/);
 assert.match(retry,/STALE_UPDATE_OUTCOME_UNKNOWN/);
 assert.match(retry,/LEGACY_FAILURE_REQUIRES_RECONCILIATION/);
 assert.match(retry,/if\(state!=='FAILED'\) continue/);
});

test('duplicate VIP join approval is reconciled by current Telegram membership',()=>{
 const joinBody=body('telegramJoinRequestAction_'),memberBody=body('telegramMemberIsActive_');
 const source=memberBody+'\\n'+joinBody;
 const make=(responses)=>{let i=0;const ctx={UrlFetchApp:{fetch:()=>{const next=responses[i++];if(next instanceof Error)throw next;return next;}},requireDedicatedTestTelegramBot_:()=> 'TEST_TOKEN',assertDedicatedTestVipGroup_:()=>true,JSON,Error,String};vm.createContext(ctx);vm.runInContext(source,ctx);return{ctx,calls:()=>i};};
 const active=make([response(200,{ok:true,result:{status:'member',is_member:true}})]);
 assert.equal(active.ctx.telegramJoinRequestAction_('approveChatJoinRequest','-100','123'),true);
 assert.equal(active.calls(),1,'already joined member is not approved twice');
 const recovered=make([response(200,{ok:true,result:{status:'left',is_member:false}}),new Error('timeout'),response(200,{ok:true,result:{status:'member',is_member:true}})]);
 assert.equal(recovered.ctx.telegramJoinRequestAction_('approveChatJoinRequest','-100','123'),true);
 assert.equal(recovered.calls(),3,'ambiguous approval is verified by getChatMember');
 const unknown=make([response(200,{ok:true,result:{status:'left',is_member:false}}),new Error('timeout'),response(200,{ok:true,result:{status:'left',is_member:false}})]);
 assert.throws(()=>unknown.ctx.telegramJoinRequestAction_('approveChatJoinRequest','-100','123'),e=>e.ambiguousRemoteOutcome===true);
});
test('Admin can inspect safe VIP queue states without receiving invite links or Telegram identifiers',()=>{
 const list=body('apiAdminListVipQueue'),health=body('apiAdminSystemHealth');
 assert.match(list,/requireSession_\(session,\['ADMIN','SUPER_ADMIN'\]\)/);
 assert.match(list,/lastErrorCode/);
 assert.doesNotMatch(list,/inviteLink|telegramUserId|chatId/);
 assert.match(health,/needsReconciliation/);
 assert.match(health,/deliveryUnknown/);
 assert.match(health,/deadLetter/);
 assert.match(html,/apiAdminListVipQueue/);
 assert.match(html,/STATUS ANTREAN VIP & REKONSILIASI/);
});
