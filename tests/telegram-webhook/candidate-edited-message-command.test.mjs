import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function enqueueMpsTelegramMessage_(');
const end=source.indexOf('function processVipJoinRequest_(',start+1);
assert.ok(start>=0&&end>start,'candidate Telegram core handler must exist');
const handler=source.slice(start,end);

function harness(){
  const sent=[],keys=new Set();
  const context={
    console,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    sha256_:value=>'e'.repeat(64),
    enqueueMpsVipFollowup_:task=>{const duplicate=keys.has(task.taskKey);keys.add(task.taskKey);if(!duplicate)sent.push(task);return{ok:true,duplicate};},
    runMpsVipFollowupQueue_:()=>({ok:true,processed:0}),
    verifyTelegramLinkFromUpdate_:()=>{throw new Error('unexpected token verification');},
    processVipJoinRequest_:()=>{throw new Error('unexpected join request');},
    processMpsVipChatMemberEvent_:()=>{throw new Error('unexpected chat member event');},
    recordMpsAudit_:()=>{throw new Error('unexpected audit');},
    sendTelegram_:()=>{throw new Error('unexpected admin notification');},
    clean_:v=>String(v||'')
  };
  vm.createContext(context);
  vm.runInContext(handler,context,{timeout:1000});
  return {run:update=>context.processTelegramUpdateCore_(update),sent};
}

test('edited private /start message cannot trigger a second welcome DM',()=>{
  const h=harness();
  h.run({update_id:101,edited_message:{chat:{id:123,type:'private'},from:{id:123},text:'/start'}});
  assert.deepEqual(h.sent,[]);
});

test('new private /start message still receives the welcome DM',()=>{
  const h=harness();
  h.run({update_id:102,message:{chat:{id:123,type:'private'},from:{id:123},text:'/start'}});
  assert.equal(h.sent.length,1);
  assert.equal(h.sent[0].action,'SEND_DM');
  assert.equal(h.sent[0].telegramUserId,'123');
  assert.match(h.sent[0].alertText,/Selamat datang di MPS/);
});

test('edited group /start message cannot register an unconfirmed VIP chat candidate',()=>{
  const h=harness();
  h.run({update_id:103,edited_message:{chat:{id:-100123,type:'supergroup',title:'MPS VIP Community'},from:{id:123},text:'/start'}});
  assert.deepEqual(h.sent,[]);
});
