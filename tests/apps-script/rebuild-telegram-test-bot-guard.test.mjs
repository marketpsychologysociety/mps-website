import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
function extract(name,next){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction '+next+'(',start+1);
  assert.ok(start>=0&&end>start,name+' source boundaries must exist');
  return source.slice(start,end);
}
const botGuard=extract('requireDedicatedTestTelegramBot_','assertDedicatedTestVipGroup_');
const groupGuard=extract('assertDedicatedTestVipGroup_','getMpsTelegramWebhookDeploymentUrl_');
const revokeSource=extract('revokeVipInvite_','createVipInvite_');

function botHarness({label='MPS-ISOLATED-TEST',username='MPS_Test_Bot',token='TEST_TOKEN'}={}){
  const props={MPS_REBUILD_TEST_LABEL:label,MPS_TELEGRAM_BOT_USERNAME:username,MPS_TELEGRAM_BOT_TOKEN:token};
  const ctx={prop_:key=>props[key]||''};
  vm.createContext(ctx);vm.runInContext(botGuard,ctx,{timeout:1000});
  return {run:()=>ctx.requireDedicatedTestTelegramBot_()};
}
function groupHarness({title='MPS VIP TEST',code=200,ok=true}={}){
  let calls=0;
  const ctx={
    UrlFetchApp:{fetch:(url,options)=>{calls++;assert.match(url,/\/getChat$/);return{getResponseCode:()=>code,getContentText:()=>JSON.stringify({ok,result:{title}})};}},
    DriveApp:{}
  };
  vm.createContext(ctx);vm.runInContext(groupGuard,ctx,{timeout:1000});
  return {run:()=>ctx.assertDedicatedTestVipGroup_('-1001234567890','TEST_TOKEN'),calls:()=>calls};
}

test('outbound Telegram is blocked without the isolated TEST marker',()=>{
  assert.throws(()=>botHarness({label:''}).run(),/project bukan project TEST/i);
});

test('production Telegram bot username is rejected before token use',()=>{
  assert.throws(()=>botHarness({username:'MPS_Notificationnew_bot'}).run(),/username yang mengandung kata TEST/i);
});

test('dedicated Telegram TEST bot token is accepted only with TEST username and marker',()=>{
  assert.equal(botHarness().run(),'TEST_TOKEN');
});

test('VIP invite and join-request actions reject a production-named group',()=>{
  const h=groupHarness({title:'MPS VIP Official'});
  assert.throws(()=>h.run(),/grup Telegram TEST/i);
  assert.equal(h.calls(),1);
});

test('VIP TEST group must be readable and have TEST in its title',()=>{
  const h=groupHarness({title:'MPS VIP TEST'});
  assert.equal(h.run(),true);
  assert.equal(h.calls(),1);
});

test('unreadable VIP group blocks invite side effects',()=>{
  const h=groupHarness({code:403,ok:false});
  assert.throws(()=>h.run(),/tidak dapat diverifikasi/i);
});

test('invite revocation checks TEST bot and TEST group before Telegram mutation',()=>{
  let calls=[];
  const ctx={
    requireDedicatedTestTelegramBot_:()=>{calls.push('bot');return 'TEST_TOKEN';},
    assertDedicatedTestVipGroup_:(group,token)=>{calls.push(['group',group,token]);return true;},
    UrlFetchApp:{fetch:(url,options)=>{calls.push(url);return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{}})};}}
  };
  vm.createContext(ctx);vm.runInContext(revokeSource,ctx,{timeout:1000});
  assert.equal(ctx.revokeVipInvite_('-1001234567890','https://t.me/+old'),true);
  assert.deepEqual(calls,['bot',['group','-1001234567890','TEST_TOKEN'],'https://api.telegram.org/botTEST_TOKEN/revokeChatInviteLink']);
});
