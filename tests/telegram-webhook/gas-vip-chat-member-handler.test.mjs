import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('./gas-vip-chat-member-handler.gs',import.meta.url)),'utf8');
function harness({result='ACTIVE'}={}) {
 let held=false,calls=[],after=[];
 const orchestrator={process(input,resolver){
  calls.push(input);held=true;
  const resolved=resolver({assertActive(){assert.equal(held,true);return true;}},input);
  held=false;
  if(resolved&&resolved.ignored===true)return 'IGNORED';
  after.push({resolved,held});
  return result;
 }};
 const context={};vm.runInNewContext(source+'\nthis.makeHandler=createMpsGasVipChatMemberHandler_;',context,{timeout:1000});
 const handler=context.makeHandler({
  orchestrator,vipChatId:'-1001234567890',
  hashEvent:event=>'f'.repeat(64),
  resolveTransition:(tx,input)=>({memberId:'MPS-ABCDEF12',targetState:input.telegramStatus==='left'?'LEFT':'ACTIVE',memberName:'Test Member',telegramUserId:input.telegramUserId,tickerAllowed:true}),
  afterTransition:payload=>{after.push({payload,held});}
 });
 return{handler,calls,after,held:()=>held};
}
const update=(status='member',date=1760000000)=>({update_id:123456789,chat_member:{
 chat:{id:'-1001234567890'},date,new_chat_member:{user:{id:987654321},status,is_member:status==='member'}
}});

test('preserves Telegram update_id, original event date, user and payload hash',()=>{
 const h=harness();assert.equal(h.handler.process(update()),'ACTIVE');
 assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].updateId,123456789);
 assert.equal(h.calls[0].sourceDate,1760000000);
 assert.equal(h.calls[0].telegramUserId,'987654321');
 assert.equal(h.calls[0].payloadSha256,'f'.repeat(64));
 assert.equal(h.calls[0].sourceType,'CHAT_MEMBER');
});
test('resolver runs under orchestrator scope and external follow-up runs after lock release',()=>{
 const h=harness();h.handler.process(update());
 assert.equal(h.held(),false);
 assert.equal(h.after.length,1);
 assert.equal(h.after[0].held,false);
});
test('foreign group and join-request-only updates are ignored',()=>{
 const h=harness();
 assert.equal(h.handler.process({...update(),chat_member:{...update().chat_member,chat:{id:'-100999'}}}),'IGNORED');
 assert.equal(h.handler.process({update_id:123,chat_join_request:{date:1760000000}}),'IGNORED');
 assert.equal(h.calls.length,0);
});
test('missing update ID and original event date fail closed',()=>{
 const h=harness();
 assert.throws(()=>h.handler.process({...update(),update_id:null}),/VIP_CHAT_MEMBER_UPDATE_ID_REQUIRED/);
 assert.throws(()=>h.handler.process({...update(),chat_member:{...update().chat_member,date:undefined}}),/VIP_CHAT_MEMBER_SOURCE_DATE_REQUIRED/);
});
test('membership states classify active, leave and ignored transitions',()=>{
 const active=harness();active.handler.process(update('member'));
 assert.equal(active.calls[0].targetState,'');
 const left=harness({result:'LEFT'});assert.equal(left.handler.process(update('left')),'LEFT');
 const unknown=harness();assert.equal(unknown.handler.process(update('kicked-but-not-valid')),'IGNORED');
});
