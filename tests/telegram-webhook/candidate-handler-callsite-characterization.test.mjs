import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = fs.readFileSync(path.join(here, 'fixtures/candidate-handler-callsite-snapshot.gs'), 'utf8');
const sourceSha = 'c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba';
assert.match(fixture, new RegExp('Origin SHA-256: ' + sourceSha));
assert.equal(crypto.createHash('sha256').update(fixture).digest('hex'), '971553a0cf9a2a8ec2d609cf6bf69a0b9da427e70f2af8bb6a666209ac6a105b');

function harness(fetches = []) {
  const props = new Map([['MPS_TELEGRAM_VIP_CHAT_ID','-100123'],['MPS_TELEGRAM_BOT_TOKEN','test-token']]);
  const accessRow = ['MPS-ABCDEF12','777','777','','','','Aktif','','','',''];
  const memberRow = Array(30).fill('');
  memberRow[1] = 'Berhasil'; memberRow[2] = 'Disetujui';
  const access = {getRange:()=>({getValues:()=>[accessRow]})};
  const member = {getRange:()=>({getValues:()=>[memberRow]})};
  const ctx = {
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||''})},
    getTelegramAccessSheet_:()=>access, getMemberSheet_:()=>member,
    findTelegramAccessByUserId_:()=>2, findMemberById_:()=>2,
    MPS:{headers:Array(30)}, MPS_COL:{registrationStatus:2,depositStatus:3},
    UrlFetchApp:{fetch:()=>{if(!fetches.length)throw Error('unexpected Telegram fetch');return fetches.shift();}},
    parseTelegramResponse_:x=>x, telegramSendToChat_:()=>({ok:true}), recordMpsAudit_:()=>true,
    updateVipJoinStatus_:(...args)=>ctx.statusCalls.push(args), statusCalls:[], console
  };
  return ctx;
}
function invoke(ctx, name, ...args) {
  vm.runInNewContext(fixture + '; globalThis.__candidate = ' + name + ';', ctx);
  return ctx.__candidate(...args);
}
const member={ok:true,result:{status:'member',is_member:true}};
const left={ok:true,result:{status:'left',is_member:false}};
const approved={ok:true,result:true};
const failed={ok:false,description:'temporary Telegram failure'};

test('fixture provenance is pinned to the reviewed candidate source',()=>{
  assert.match(fixture,/not a deployable Code\.gs file/i);
  assert.match(fixture,/function processTelegramUpdateCore_/);
  assert.match(fixture,/function processVipJoinRequest_/);
});

test('chat_member handler currently drops update_id and Telegram event date',()=>{
  const ctx=harness();
  invoke(ctx,'processTelegramUpdateCore_', {update_id:987654,chat_member:{chat:{id:-100123},new_chat_member:{user:{id:777},status:'member',is_member:true,date:1770000000}}});
  assert.equal(ctx.statusCalls.length,1);
  assert.deepEqual(Array.from(ctx.statusCalls[0]),['777','member',true]);
});

test('join-request pre-approval reconciliation currently passes no update metadata',()=>{
  const ctx=harness([member]);
  invoke(ctx,'processVipJoinRequest_',{chat:{id:-100123},from:{id:777},user_chat_id:777});
  assert.deepEqual(Array.from(ctx.statusCalls[0]),['777','member',true]);
});

test('join-request successful approval currently passes no update metadata',()=>{
  const ctx=harness([left,approved]);
  invoke(ctx,'processVipJoinRequest_',{chat:{id:-100123},from:{id:777},user_chat_id:777});
  assert.deepEqual(Array.from(ctx.statusCalls[0]),['777','member',true]);
});

test('join-request retry reconciliation currently passes no update metadata',()=>{
  const ctx=harness([left,failed,member]);
  invoke(ctx,'processVipJoinRequest_',{chat:{id:-100123},from:{id:777},user_chat_id:777});
  assert.deepEqual(Array.from(ctx.statusCalls[0]),['777','member',true]);
});
