import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});

const start=source.indexOf('function adminVerifyApplication_(session,applicationRef,action,note) {');
const end=source.indexOf('\nfunction apiAdminRetryVipInvite',start+1);
assert.ok(start>=0&&end>start,'adminVerifyApplication_ source boundaries must exist');
const body=source.slice(start,end);
const rollback=body.indexOf('if(rollbackErrors.length){');
const rollbackEnd=body.indexOf('\n    throw err;',rollback);
assert.ok(rollback>=0&&rollbackEnd>rollback,'incomplete rollback branch must exist');
const branch=body.slice(rollback,rollbackEnd);

test('incomplete admin-verification rollback persists a durable admin alert before releasing lock',()=>{
 assert.match(branch,/enqueueMpsVipFollowup_\(\{/);
 assert.match(branch,/action:'ADMIN_ALERT'/);
 assert.match(branch,/taskKey:alertKey/);
 assert.match(branch,/Application Ref:/);
 assert.match(branch,/Jangan proses ulang sebelum Super Admin memeriksa/);
 assert.match(branch,/enqueueMpsVipFollowup_\([\s\S]*?\},true\)/);
 assert.match(branch,/Peringatan rekonsiliasi tersimpan di antrean Admin/);
 assert.match(branch,/Peringatan antrean gagal disimpan; perlu eskalasi manual segera/);
});

test('reconciliation alert does not include member personal or proof data',()=>{
 assert.doesNotMatch(branch,/dep\[|app\[|nickname|chatId|telegramUserId|proof|email|phone|MT5/i);
});

const settleStart=source.indexOf('function settleMpsAdminDecisionIntentAfterRollback_(');
const settleEnd=source.indexOf('\nfunction materializeMpsAdminDecisionIntent_',settleStart+1);
assert.ok(settleStart>=0&&settleEnd>settleStart,'decision-intent rollback settlement helper must exist');
const settle=source.slice(settleStart,settleEnd);
const catchStart=body.indexOf('    // The durable notification intent was created before the multi-sheet writes.');
const catchEnd=body.indexOf('    if(rollbackErrors.length){',catchStart);
assert.ok(catchStart>=0&&catchEnd>catchStart,'admin rollback must settle the decision intent before handling rollback outcome');
const catchSettlement=body.slice(catchStart,catchEnd);

test('clean compensation cancels the pre-committed decision intent',()=>{
 assert.match(settle,/row\[7\]=incomplete\?'REVIEW':'CANCELLED'/);
 assert.match(settle,/BUSINESS_TRANSACTION_ROLLED_BACK/);
 assert.match(catchSettlement,/settleMpsAdminDecisionIntentAfterRollback_\(applicationRef,memberId,action,rollbackErrors.length>0\)/);
});

test('incomplete compensation quarantines the decision intent for operator review',()=>{
 assert.match(settle,/BUSINESS_ROLLBACK_INCOMPLETE_OPERATOR_RECONCILIATION_REQUIRED/);
 assert.match(settle,/row\[7\]=incomplete\?'REVIEW':'CANCELLED'/);
 assert.match(settle,/\['DONE','CANCELLED','REVIEW'\]/);
 assert.match(catchSettlement,/catch\(intentErr\)\s*\{\s*rollbackErrors\.push/);
});
