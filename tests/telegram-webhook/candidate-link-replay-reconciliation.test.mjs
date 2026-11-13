import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
function extract(name,next){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('function '+next+'(',start+1);
  assert.ok(start>=0&&end>start,'missing source function '+name);
  return source.slice(start,end);
}
const applicationSource=extract('verifyTelegramApplication_','verifyTelegramLinkLegacy_');
const legacySource=extract('verifyTelegramLinkLegacy_','getTelegramLinksSheet_');
const queueSource=extract('enqueueMpsVipFollowup_','runMpsVipFollowupQueue_');
const noticeSource=extract('enqueueMpsTelegramLinkConfirmation_','verifyTelegramApplication_');
const headers=['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At'];
const userId='987654321';
const chatId=userId;
const msg={chat:{id:chatId,type:'private'},from:{id:Number(userId),username:'same_user',first_name:'Same'}};

function harness({kind='application',storedUser=userId,storedChat=chatId,expired=true}={}){
  const link=['hash',new Date(Date.now()-3600000),new Date(expired?Date.now()-1000:Date.now()+60000),'Terverifikasi',
    kind==='legacy'?'MPS-ABCDEF12':'','MPS-APP-0123456789ABCDEF0123',storedUser,storedChat,'same_user','Same',new Date()];
  const rows=[headers.slice(),link.slice()];
  const events=[],queueTasks=[],queueKeys=new Set();
  function makeSheet(data){
    return{
      getLastRow:()=>data.length,
      getRange(row,col,nr=1,nc=1){return{
        getValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>data[row-1+ri]?.[col-1+ci]??'')),
        getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(data[row-1+ri]?.[col-1+ci]??''))),
        getValue:()=>data[row-1]?.[col-1]??'',
        getDisplayValue:()=>String(data[row-1]?.[col-1]??''),
        setValue:value=>{data[row-1][col-1]=value;},
        setValues:values=>values.forEach((line,ri)=>line.forEach((value,ci)=>{data[row-1+ri][col-1+ci]=value;}))
      };},
      appendRow:row=>data.push(row.slice())
    };
  }
  const accessRows=[Array(11).fill(''),[kind==='application'?'MPS-APP-0123456789ABCDEF0123':'MPS-ABCDEF12',storedUser,storedChat,'same_user','Same',true,'Menunggu','','','','']];
  const appData=Array(15).fill('');appData[0]='MPS-APP-0123456789ABCDEF0123';appData[10]='Terverifikasi';appData[11]=storedUser;appData[12]=storedChat;
  const appRows=[Array(15).fill(''),appData];
  const memberData=Array(30).fill('');memberData[0]='MPS-ABCDEF12';
  const memberRows=[Array(30).fill(''),memberData];
  const sheet=makeSheet(rows),accessSheet=makeSheet(accessRows),appSheet=makeSheet(appRows),memberSheet=makeSheet(memberRows);
  let lockHeld=false,lockAcquires=0,lockReleases=0;
  const context={
    console,
    MPS_MEMBER_LINKS:{headers},
    MPS_APPLICATIONS:{headers:Array(15).fill('')},
    MPS:{headers:Array(30).fill('')},
    MPS_COL:{id:1},
    LockService:{getScriptLock:()=>({
      waitLock:()=>{assert.equal(lockHeld,false);lockHeld=true;lockAcquires++;},
      releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;lockReleases++;}
    })},
    getMpsMemberLinksSheet_:()=>sheet,
    findMpsMemberLinkRow_:()=>2,
    getTelegramAccessSheet_:()=>accessSheet,
    findTelegramAccessByUserId_:()=>storedUser===userId?2:0,
    consumeRateLimit_:()=>true,
    getMpsApplicationsSheet_:()=>appSheet,
    findMpsApplicationRow_:()=>2,
    getMemberSheet_:()=>memberSheet,
    findMemberById_:()=>2,
    getMpsDepositsSheet_:()=>{events.push('deposit-read');throw Error('deposit must not be changed on replay');},
    sha256_:()=> 'hash',
    telegramSendToChat_:(...args)=>{events.push(['telegram',...args]);return{ok:true};},
    enqueueMpsTelegramLinkConfirmation_:(tokenHash,target,message)=>{
      assert.equal(lockHeld,true,'notification intent must be appended under the existing verification lock');
      const taskKey='telegram-link-confirmation:'+String(tokenHash);
      const duplicate=queueKeys.has(taskKey);queueKeys.add(taskKey);
      if(!duplicate)queueTasks.push({taskKey,target,message});
      return{ok:true,duplicate};
    },
    runMpsVipFollowupQueue_:()=>{assert.equal(lockHeld,false,'Telegram delivery must run after ScriptLock release');events.push(['queue-drain']);},
    recordMpsAudit_:(...args)=>events.push(['audit',...args]),
    safeErrorMessage_:e=>String(e&&e.message||e),
    normalizeTelegram_:v=>String(v||''),
    clean_:v=>String(v||''),
    sheetText_:v=>String(v||'')
  };
  vm.createContext(context);
  vm.runInContext(kind==='application'?applicationSource:legacySource,context,{timeout:1000});
  return{
    run:()=>kind==='application'
      ?context.verifyTelegramApplication_(2,rows[1].slice(),msg)
      :context.verifyTelegramLinkLegacy_('token',msg),
    rows,accessRows,appRows,memberRows,events,queueTasks,stats:()=>({lockHeld,lockAcquires,lockReleases})
  };
}

test('application link replay from the same Telegram identity succeeds even after expiry without repeating side effects',()=>{
  const h=harness({kind:'application',expired:true});
  assert.equal(h.run(),true);
  assert.deepEqual(h.events,[]);
  assert.equal(h.queueTasks.length,1);
  assert.match(h.queueTasks[0].message,/Telegram berhasil terhubung/);
  assert.equal(/token|PIN|invite/i.test(h.queueTasks[0].message),false);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('application link replay from a different Telegram identity is rejected and does not mutate linked records',()=>{
  const h=harness({kind:'application',storedUser:'111111111',storedChat:'111111111'});
  assert.throws(()=>h.run(),/akun Telegram lain/);
  assert.equal(h.rows[1][6],'111111111');
  assert.equal(h.rows[1][7],'111111111');
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('legacy link replay from the same Telegram identity succeeds even after expiry without repeating side effects',()=>{
  const h=harness({kind:'legacy',expired:true});
  assert.equal(h.run(),true);
  assert.deepEqual(h.events,[]);
  assert.equal(h.queueTasks.length,1);
  assert.match(h.queueTasks[0].message,/Telegram berhasil terhubung/);
  assert.equal(/token|PIN|invite/i.test(h.queueTasks[0].message),false);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('legacy link replay from a different Telegram identity is rejected without changing the original identity',()=>{
  const h=harness({kind:'legacy',storedUser:'111111111',storedChat:'111111111'});
  assert.equal(h.run(),false);
  assert.equal(h.rows[1][6],'111111111');
  assert.equal(h.rows[1][7],'111111111');
  assert.equal(h.events.filter(x=>Array.isArray(x)&&x[0]==='telegram').length,1);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});

test('application link replay is rejected when the persisted access row points to another application',()=>{
  const h=harness({kind:'application'});
  h.accessRows[1][0]='MPS-APP-OTHER';
  assert.throws(()=>h.run(),/identitas akses Telegram tidak cocok/);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('application link replay is rejected when the application record has a different Telegram binding',()=>{
  const h=harness({kind:'application'});
  h.appRows[1][11]='111111111';
  assert.throws(()=>h.run(),/pengajuan tidak terikat/);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('legacy link replay is rejected when the linked application no longer matches the Telegram identity',()=>{
  const h=harness({kind:'legacy'});
  h.appRows[1][12]='111111111';
  assert.equal(h.run(),false);
  assert.equal(h.events.filter(x=>Array.isArray(x)&&x[0]==='telegram').length,1);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});

test('replayed link confirmation reuses one stable notification task key',()=>{
  const h=harness({kind:'application',expired:true});
  assert.equal(h.run(),true);
  assert.equal(h.run(),true);
  assert.equal(h.queueTasks.length,1);
  assert.equal(h.stats().lockAcquires,2);
  assert.equal(h.stats().lockReleases,2);
});


test('admin decision notices use stable member/admin outbox tasks without persisting names or free-form notes',()=>{
  const start=source.indexOf('function enqueueMpsAdminDecisionNotices_(');
  const end=source.indexOf('function runMpsVipFollowupQueue_(',start);
  assert.ok(start>=0&&end>start,'admin decision notice helper must exist');
  const helper=source.slice(start,end);
  const headers=['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','State','Attempts','Next Attempt At','Lease Until','Last Error Code','Created At','Updated At'];
  const rows=[headers.slice()];
  const sheet={
    getLastColumn:()=>headers.length,getLastRow:()=>rows.length,
    getRange:(row,col,nr=1,nc=1)=>({
      getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[row-1+ri]?.[col-1+ci]??''))),
      setValues:values=>values.forEach((line,ri)=>{rows[row-1+ri]=line.slice();})
    })
  };
  let held=false,acquires=0,releases=0;
  const context={
    MPS_VIP_FOLLOWUP_QUEUE:{sheet:'MPS Telegram VIP Follow-up Queue',headers},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(held,false);held=true;acquires++;},releaseLock:()=>{assert.equal(held,true);held=false;releases++;}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'synthetic-spreadsheet'})},
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    sha256_:value=>Array.from(String(value)).reduce((n,c)=>((n*33+c.charCodeAt(0))>>>0),5381).toString(16).padStart(8,'0').repeat(8).slice(0,64),
    safeErrorMessage_:e=>String(e&&e.message||e)
  };
  vm.createContext(context);
  vm.runInContext(queueSource+'\n'+helper,context,{timeout:1000});
  const first=context.enqueueMpsAdminDecisionNotices_('MPS-APP-0123456789ABCDEF0123','MPS-ABCDEF12','approve','987654321');
  const replay=context.enqueueMpsAdminDecisionNotices_('MPS-APP-0123456789ABCDEF0123','MPS-ABCDEF12','approve','987654321');
  assert.equal(first.ok,true);
  assert.equal(replay.ok,true);
  assert.equal(rows.length,3,'member and admin tasks are inserted once each');
  assert.deepEqual(rows.slice(1).map(r=>r[2]),['SEND_DM','ADMIN_ALERT']);
  assert.ok(rows.every(r=>!String(r[6]||'').includes('Nama')&&!String(r[6]||'').includes('Catatan')));
  assert.ok(rows.slice(1).every(r=>r[5]==='','no secret invite link may be stored'));
  assert.equal(acquires,4,'each enqueue obtains and releases its own ScriptLock; no caller lock is held');
  assert.equal(releases,4);
  assert.equal(held,false);
  assert.match(rows[1][6],/PIN akses dikirim terpisah/);
  assert.match(rows[2][6],/MPS-APP-0123456789ABCDEF0123/);
  assert.doesNotMatch(rows[2][6],/Nama|Catatan admin|email|telepon/i);
  assert.equal(source.includes("telegramSendToChat_(chatId,action==='approve'"),false,'application direct decision DM must be removed');
  assert.equal(source.includes("try{const tg=sendTelegram_(telegramMessage)"),false,'legacy direct archive send must be removed');
});

test('actual link-notice helper appends to the existing queue under the caller-held lock without nested acquisition',()=>{
  const headers=['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','State','Attempts','Next Attempt At','Lease Until','Last Error Code','Created At','Updated At'];
  const rows=[headers.slice()];
  let lockHeld=true,lockAcquires=0,lockReleases=0;
  const sheet={
    getLastColumn:()=>headers.length,
    getLastRow:()=>rows.length,
    getRange:(row,col,nr=1,nc=1)=>({
      getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[row-1+ri]?.[col-1+ci]??''))),
      setValues:values=>values.forEach((line,ri)=>{rows[row-1+ri]=line.slice();})
    })
  };
  const context={
    MPS_VIP_FOLLOWUP_QUEUE:{sheet:'MPS Telegram VIP Follow-up Queue',headers},
    LockService:{getScriptLock:()=>({
      waitLock:()=>{assert.equal(lockHeld,false);lockHeld=true;lockAcquires++;},
      releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;lockReleases++;}
    })},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'synthetic-spreadsheet'})},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='MPS Telegram VIP Follow-up Queue'?sheet:null}),flush:()=>{}},
    sha256_:()=> 'a'.repeat(64)
  };
  vm.createContext(context);
  vm.runInContext(queueSource+'\n'+noticeSource,context,{timeout:1000});
  const message='Telegram berhasil terhubung. Admin akan memeriksa pengajuan.';
  const first=context.enqueueMpsTelegramLinkConfirmation_('stored-token-hash','987654321',message);
  const replay=context.enqueueMpsTelegramLinkConfirmation_('stored-token-hash','987654321',message);
  assert.equal(first.duplicate,false);
  assert.equal(replay.duplicate,true);
  assert.equal(rows.length,2);
  assert.equal(rows[1][2],'SEND_DM');
  assert.equal(rows[1][4],'987654321');
  assert.equal(rows[1][6],message);
  assert.equal(lockHeld,true);
  assert.equal(lockAcquires,0,'already-held mode must not acquire a nested ScriptLock');
  assert.equal(lockReleases,0,'already-held mode must not release the caller-owned ScriptLock');
  assert.equal(rows[1][5],'','no invite URL may be stored for a link-confirmation notice');
});


test('admin decision intent materializes notices only after application and deposit rows confirm the committed decision',()=>{
  const start=source.indexOf('function materializeMpsAdminDecisionIntent_(');
  const end=source.indexOf('function enqueueMpsAdminDecisionNotices_(',start);
  assert.ok(start>=0&&end>start,'decision intent materializer must exist');
  const fn=source.slice(start,end);
  const app=Array(15).fill('');app[0]='MPS-APP-0123456789ABCDEF0123';app[7]='Berhasil';app[8]='MPS-ABCDEF12';
  const dep=Array(14).fill('');dep[0]=app[0];dep[9]='Berhasil';
  const member=Array(30).fill('');member[0]='MPS-ABCDEF12';
  const makeSheet=row=>({getRange:()=>({getValues:()=>[row]})});
  let held=false,called=null;
  const context={
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(held,false);held=true;},releaseLock:()=>{assert.equal(held,true);held=false;}})},
    getMpsApplicationsSheet_:()=>makeSheet(app),findMpsApplicationRow_:()=>2,
    getMpsDepositsSheet_:()=>makeSheet(dep),findMpsDepositRow_:()=>2,
    getMemberSheet_:()=>makeSheet(member),findMemberById_:()=>2,
    MPS_APPLICATIONS:{headers:Array(15).fill('')},MPS_DEPOSITS:{headers:Array(14).fill('')},MPS:{headers:Array(30).fill('')},
    enqueueMpsAdminDecisionNotices_:(...args)=>{assert.equal(held,true,'child outbox tasks are inserted under the same lock');called=args;return{ok:true};}
  };
  vm.createContext(context);vm.runInContext(fn,context,{timeout:1000});
  const task={telegramUserId:'987654321',alertText:JSON.stringify({subject:app[0],member:'MPS-ABCDEF12',decision:'approve'})};
  assert.equal(context.materializeMpsAdminDecisionIntent_(task),true);
  assert.deepEqual(called,[app[0],'MPS-ABCDEF12','approve','987654321',true]);
  assert.equal(held,false);
});

test('admin decision intent refuses to notify when persisted application decision is incomplete',()=>{
  const start=source.indexOf('function materializeMpsAdminDecisionIntent_(');
  const end=source.indexOf('function enqueueMpsAdminDecisionNotices_(',start);
  const fn=source.slice(start,end);
  const app=Array(15).fill('');app[0]='MPS-APP-0123456789ABCDEF0123';app[7]='Deposit Dikirim';app[8]='MPS-ABCDEF12';
  const dep=Array(14).fill('');dep[0]=app[0];dep[9]='Menunggu Validasi Admin';
  let held=false,called=false;
  const makeSheet=row=>({getRange:()=>({getValues:()=>[row]})});
  const context={
    LockService:{getScriptLock:()=>({waitLock:()=>{held=true;},releaseLock:()=>{held=false;}})},
    getMpsApplicationsSheet_:()=>makeSheet(app),findMpsApplicationRow_:()=>2,
    getMpsDepositsSheet_:()=>makeSheet(dep),findMpsDepositRow_:()=>2,
    getMemberSheet_:()=>makeSheet(Array(30).fill('')),findMemberById_:()=>0,
    MPS_APPLICATIONS:{headers:Array(15).fill('')},MPS_DEPOSITS:{headers:Array(14).fill('')},MPS:{headers:Array(30).fill('')},
    enqueueMpsAdminDecisionNotices_:()=>{called=true;return{ok:true};}
  };
  vm.createContext(context);vm.runInContext(fn,context,{timeout:1000});
  assert.throws(()=>context.materializeMpsAdminDecisionIntent_({telegramUserId:'987654321',alertText:JSON.stringify({subject:app[0],member:'MPS-ABCDEF12',decision:'approve'})}),/ADMIN_DECISION_INTENT_NOT_COMMITTED/);
  assert.equal(called,false,'no notification may be queued for an uncommitted decision');
  assert.equal(held,false);
});


test('legacy decision intent accepts a fully activated member and matching application state',()=>{
  const start=source.indexOf('function materializeMpsAdminDecisionIntent_('),end=source.indexOf('function enqueueMpsAdminDecisionNotices_(',start);
  const fn=source.slice(start,end);
  const member=Array(30).fill('');member[0]='MPS-ABCDEF12';member[7]='Berhasil';member[14]='Disetujui';
  const app=Array(15).fill('');app[0]='MPS-APP-0123456789ABCDEF0123';app[7]='Berhasil';app[8]=member[0];
  const makeSheet=row=>({getRange:()=>({getValues:()=>[row]})});
  let held=false,called=null;
  const context={
    LockService:{getScriptLock:()=>({waitLock:()=>{held=true;},releaseLock:()=>{held=false;}})},
    getMemberSheet_:()=>makeSheet(member),findMemberById_:()=>2,
    getMpsApplicationsSheet_:()=>makeSheet(app),findMpsApplicationRowByMember_:()=>2,
    MPS:{headers:Array(30)},MPS_COL:{registrationStatus:8,depositStatus:15},MPS_APPLICATIONS:{headers:Array(15)},
    enqueueMpsAdminDecisionNotices_:(...args)=>{assert.equal(held,true);called=args;return{ok:true};}
  };
  vm.createContext(context);vm.runInContext(fn,context,{timeout:1000});
  assert.equal(context.materializeMpsAdminDecisionIntent_({telegramUserId:'987654321',alertText:JSON.stringify({subject:member[0],member:member[0],decision:'approve'})}),true);
  assert.deepEqual(called,[member[0],member[0],'approve','987654321',true]);
  assert.equal(held,false);
});

test('application rejection intent materializes without inventing a Member ID',()=>{
  const start=source.indexOf('function materializeMpsAdminDecisionIntent_('),end=source.indexOf('function enqueueMpsAdminDecisionNotices_(',start);
  const fn=source.slice(start,end);
  const app=Array(15).fill('');app[0]='MPS-APP-0123456789ABCDEF0123';app[7]='Deposit Ditolak';
  const dep=Array(14).fill('');dep[0]=app[0];dep[9]='Ditolak';
  const makeSheet=row=>({getRange:()=>({getValues:()=>[row]})});
  let called=null;
  const context={
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    getMpsApplicationsSheet_:()=>makeSheet(app),findMpsApplicationRow_:()=>2,
    getMpsDepositsSheet_:()=>makeSheet(dep),findMpsDepositRow_:()=>2,
    MPS_APPLICATIONS:{headers:Array(15)},MPS_DEPOSITS:{headers:Array(14)},MPS:{headers:Array(30)},
    enqueueMpsAdminDecisionNotices_:(...args)=>{called=args;return{ok:true};}
  };
  vm.createContext(context);vm.runInContext(fn,context,{timeout:1000});
  assert.equal(context.materializeMpsAdminDecisionIntent_({telegramUserId:'987654321',alertText:JSON.stringify({subject:app[0],member:'',decision:'reject'})}),true);
  assert.deepEqual(called,[app[0],'','reject','987654321',true]);
});
