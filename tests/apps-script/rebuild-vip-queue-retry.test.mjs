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
const queueSource=extract('apiAdminProcessVipQueue','revokeVipInvite_');
const revokeSource=extract('revokeVipInvite_','createVipInvite_');
const memberId='MPS-TEST-0001', userId='700001', chatId='700001', groupId='-1001234567890';
function makeSheet(rows){
  return {rows:rows.map(r=>r.slice()),getRange(row,col,nr=1,nc=1){
    const self=this;
    return {
      getValue:()=>((self.rows[row-1]||[])[col-1]),
      getDisplayValue:()=>String((self.rows[row-1]||[])[col-1]??''),
      getValues:()=>Array.from({length:nr},(_,i)=>(self.rows[row-1+i]||[]).slice(col-1,col-1+nc)),
      setValue:value=>{if(!self.rows[row-1])self.rows[row-1]=[];self.rows[row-1][col-1]=value;},
      setValues:values=>values.forEach((line,i)=>line.forEach((v,j)=>{if(!self.rows[row-1+i])self.rows[row-1+i]=[];self.rows[row-1+i][col-1+j]=v;}))
    };
  }};
}
function harness({state='SENT',ageHours=49,joined=false,entitlement=true,sendOk=true,oldInvite='https://t.me/+old-invite'}={}){
  const now=Date.now();
  const queue=makeSheet([new Array(14).fill(''),[
    'VIP_TASK_1','VIP_INVITE:'+memberId,'INVITE',groupId,userId,oldInvite,'',''+state,1,new Date(now-1000),'','',new Date(now-50*3600000),new Date(now-ageHours*3600000)
  ]]);
  const apps=makeSheet([new Array(15).fill(''),[
    'MPS-APP-1234567890ABCDEF1234',new Date(),'MPS Trader','trader_mps','Indonesia','Belajar','',
    'Disetujui',memberId,new Date(),'Terhubung',userId,chatId,'',new Date()
  ]]);
  const legacy=makeSheet([new Array(18).fill(''),[memberId,new Date(),'MPS Trader','trader_mps','Indonesia','','','Berhasil']]);
  const events=joined?[[ 'EV1',memberId,'MPS Trader','JOINED',userId,new Date(),true,true ]]:[];
  const vip=makeSheet([new Array(8).fill(''),...events]);
  let inviteCalls=0,sendCalls=0;const revoked=[],sent=[];
  const ctx={
    requireSession_:()=>({role:'ADMIN',actorId:'admin'}),
    sheet_:key=>({queue,applications:apps,vip}[key]),
    rows_:sh=>sh.rows.slice(1).map(r=>r.slice()),
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    legacySheet_:()=>legacy,
    assertMembershipEntitlement_:()=>{if(!entitlement)throw new Error('MEMBERSHIP_EXPIRED');return true;},
    prop_:key=>key==='MPS_VIP_GROUP_ID'?groupId:key==='MPS_TELEGRAM_BOT_TOKEN'?'TEST_TOKEN':'',
    createVipInvite_:()=>{inviteCalls++;return 'https://t.me/+fresh-'+inviteCalls;},
    revokeVipInvite_:(g,link)=>{revoked.push({g,link});return true;},
    sendTelegramMessage_:(chat,text)=>{sendCalls++;sent.push({chat,text});return sendOk;},
    audit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    Date
  };
  vm.createContext(ctx);vm.runInContext(queueSource,ctx,{timeout:1000});
  return {run:()=>ctx.apiAdminProcessVipQueue('session'),queue,apps,legacy,vip,revoked,sent,stats:()=>({inviteCalls,sendCalls})};
}

test('expired SENT invite is replaced with a fresh 48-hour invite and old link is revoked',()=>{
  const h=harness({state:'SENT',ageHours:49});
  const result=h.run();
  assert.equal(result.processed,1);
  assert.equal(result.results[0].status,'REISSUED','Queue error: '+h.queue.rows[1][11]);
  assert.equal(h.queue.rows[1][7],'SENT');
  assert.equal(h.queue.rows[1][5],'https://t.me/+fresh-1');
  assert.deepEqual(h.revoked,[{g:groupId,link:'https://t.me/+old-invite'}]);
  assert.equal(h.stats().inviteCalls,1);
  assert.equal(h.stats().sendCalls,1);
});

test('unexpired SENT invite is not resent or rotated',()=>{
  const h=harness({state:'SENT',ageHours:12});
  const result=h.run();
  assert.equal(result.processed,0);
  assert.equal(h.queue.rows[1][5],'https://t.me/+old-invite');
  assert.deepEqual(h.stats(),{inviteCalls:0,sendCalls:0});
  assert.equal(h.revoked.length,0);
});

test('expired SENT invite is not reissued when a verified JOINED event already exists',()=>{
  const h=harness({state:'SENT',ageHours:60,joined:true});
  const result=h.run();
  assert.equal(result.processed,1);
  assert.equal(result.results[0].status,'JOINED_ALREADY');
  assert.equal(h.queue.rows[1][7],'JOINED');
  assert.equal(h.stats().inviteCalls,0);
  assert.equal(h.stats().sendCalls,0);
});

test('RETRY queue rotates any old invite before sending a new one',()=>{
  const h=harness({state:'RETRY',ageHours:2});
  const result=h.run();
  assert.equal(result.results[0].status,'SENT','Queue error: '+h.queue.rows[1][11]);
  assert.equal(h.queue.rows[1][5],'https://t.me/+fresh-1');
  assert.equal(h.revoked[0].link,'https://t.me/+old-invite');
});

test('failed Telegram delivery revokes the newly generated invite and leaves queue retryable',()=>{
  const h=harness({state:'SENT',ageHours:49,sendOk:false});
  const result=h.run();
  assert.equal(result.results[0].status,'RETRY');
  assert.equal(h.queue.rows[1][7],'RETRY');
  assert.equal(h.revoked.length,2,'old and newly generated invites are both revoked best-effort');
  assert.equal(h.revoked[1].link,'https://t.me/+fresh-1');
});

test('expired invite is not sent when member entitlement has expired',()=>{
  const h=harness({state:'SENT',ageHours:49,entitlement:false});
  const result=h.run();
  assert.equal(result.results[0].status,'RETRY');
  assert.equal(h.queue.rows[1][7],'RETRY');
  assert.equal(h.stats().inviteCalls,0);
  assert.equal(h.stats().sendCalls,0);
});

test('revoke helper calls Telegram revokeChatInviteLink without returning credentials',()=>{
  let request;
  const ctx={prop_:()=> 'TEST_TOKEN',UrlFetchApp:{fetch:(url,options)=>{request={url,options};return{getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,result:{}})};}}};
  vm.createContext(ctx);vm.runInContext(revokeSource,ctx,{timeout:1000});
  assert.equal(ctx.revokeVipInvite_(groupId,'https://t.me/+old-invite'),true);
  assert.equal(request.url,'https://api.telegram.org/botTEST_TOKEN/revokeChatInviteLink');
  assert.deepEqual(JSON.parse(request.options.payload),{chat_id:groupId,invite_link:'https://t.me/+old-invite'});
});
