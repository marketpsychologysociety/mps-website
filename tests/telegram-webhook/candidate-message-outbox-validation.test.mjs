import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function enqueueMpsTelegramMessage_(');
const end=source.indexOf('function processTelegramUpdateCore_(',start);
assert.ok(start>=0&&end>start,'Telegram message outbox helper boundaries must exist');
const helper=source.slice(start,end);

function harness(){
  const calls={queued:[],drained:0};
  const context={
    sha256_:value=>'hash_'+String(value),
    enqueueMpsVipFollowup_:task=>{calls.queued.push(task);return {ok:true,duplicate:false};},
    runMpsVipFollowupQueue_:limit=>{calls.drained+=limit;return {ok:true};},
    safeErrorMessage_:error=>String(error&&error.message||error)
  };
  vm.createContext(context);
  vm.runInContext(helper+'\nthis.run=enqueueMpsTelegramMessage_;',context,{timeout:1000});
  return {run:context.run,calls};
}

test('accepts canonical 20-digit string update IDs without losing precision',()=>{
  const h=harness();
  const result=h.run({update_id:'12345678901234567890'},'987654321','private-start-welcome','SEND_DM','Welcome');
  assert.equal(result.ok,true);
  assert.equal(h.calls.queued.length,1);
  assert.match(h.calls.queued[0].taskKey,/^telegram:send_dm:hash_/);
  assert.equal(h.calls.queued[0].telegramUserId,'987654321');
  assert.equal(h.calls.drained,5);
});

test('accepts numeric and canonical short string update IDs',()=>{
  for(const update_id of [0,123456,'0','123456']){
    const h=harness();
    assert.equal(h.run({update_id},'987654321','link-not-found','SEND_DM','Notice').ok,true);
    assert.equal(h.calls.queued.length,1);
  }
});

test('rejects noncanonical or overlength string update IDs before queue writes',()=>{
  for(const update_id of ['01','-1','1.0','1'.repeat(21),'']){
    const h=harness();
    assert.throws(()=>h.run({update_id},'987654321','link-not-found','SEND_DM','Notice'),/TELEGRAM_MESSAGE_UPDATE_ID_INVALID/);
    assert.equal(h.calls.queued.length,0);
    assert.equal(h.calls.drained,0);
  }
});

test('rejects invalid effect names, action types and chat targets',()=>{
  const cases=[
    ['bad effect!','SEND_DM','987654321'],
    ['valid-effect','DELETE_MESSAGE','987654321'],
    ['valid-effect','SEND_DM','-1001234567890'],
    ['valid-effect','SEND_MESSAGE','not-a-chat']
  ];
  for(const [effect,action,target] of cases){
    const h=harness();
    assert.throws(()=>h.run({update_id:123},target,effect,action,'Notice'),/TELEGRAM_(MESSAGE_TASK|DM_TARGET|MESSAGE_TARGET)_INVALID/);
    assert.equal(h.calls.queued.length,0);
  }
});
