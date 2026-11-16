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
const catchStart=body.indexOf('    // The decision intent is the first durable write in this transaction.');
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

test('deterministic queue preflight failures are not misreported as incomplete business rollback',()=>{
 assert.match(source,/MPS_SPREADSHEET_ID_REQUIRED_FOR_DECISION_INTENT/);
 assert.match(catchSettlement,/intentPreflightFailure/);
 assert.match(catchSettlement,/VIP_FOLLOWUP_QUEUE_NOT_PROVISIONED/);
 assert.match(catchSettlement,/VIP_FOLLOWUP_QUEUE_SCHEMA_MISMATCH/);
 assert.match(catchSettlement,/if\(decisionIntentAttempted&&!intentPreflightFailure\)/);
});

test('invalid admin decision is rejected before acquiring a lock or creating an intent',()=>{
 const context={};
 vm.createContext(context);
 vm.runInContext(adminVerifySource,context,{timeout:1000});
 assert.throws(()=>context.adminVerifyApplication_('session','MPS-APP-0123456789ABCDEF0123','unknown',''),/ADMIN_DECISION_ACTION_INVALID/);
});

test('decision intent is settled only when enqueue was attempted; ambiguous failures remain reconciled',()=>{
 assert.match(body,/decisionIntentAttempted=true;enqueueMpsAdminDecisionIntent_/);
 assert.match(catchSettlement,/if\(decisionIntentAttempted&&!intentPreflightFailure\)/);
});

test('snapshot compensation is skipped until the first business mutation begins',()=>{
 assert.match(body,/businessMutationStarted=false/);
 assert.match(body,/if\(businessMutationStarted\)\s*\{/);
 assert.match(body,/businessMutationStarted=true;memberAppendStarted=true;db\.appendRow/);
 assert.match(body,/businessMutationStarted=true;apps\.getRange\(appRow,8\)\.setValue/);
});

function settlementHarness(initialState='PENDING') {
 const headers=['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','Status','Attempts','Next Attempt','Lease Until','Last Error','Created At','Updated At'];
 const key='admin-decision-intent:'+'a'.repeat(40);
 const row=[key,'admin-decision:'+'a'.repeat(40),'DECISION_INTENT','approve','','','{}',initialState,0,new Date(),'','',new Date(),new Date()];
 const rows=[headers,row];
 const sheet={
  getLastColumn:()=>headers.length,getLastRow:()=>rows.length,
  getRange(r,c,nr=1,nc=1){return{
   getDisplayValues:()=>Array.from({length:nr},(_,i)=>rows[r-1+i].slice(c-1,c-1+nc).map(String)),
   getValues:()=>Array.from({length:nr},(_,i)=>rows[r-1+i].slice(c-1,c-1+nc)),
   setValues(values){values.forEach((line,i)=>rows[r-1+i].splice(c-1,nc,...line));}
  };}
 };
 const context={
  MPS_VIP_FOLLOWUP_QUEUE:{sheet:'MPS VIP Followup Queue',headers},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'synthetic-spreadsheet'})},
  SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
  sha256_:()=> 'a'.repeat(64),Utilities:{},Date
 };
 vm.createContext(context);vm.runInContext(settle,context,{timeout:1000});
 return {run:incomplete=>context.settleMpsAdminDecisionIntentAfterRollback_('MPS-APP-0123456789ABCDEF0123','MPS-ABCDEF1234','approve',incomplete),row,rows,key};
}

test('decision-intent settlement cancels a cleanly rolled-back transaction in the queue',()=>{
 const h=settlementHarness();
 const result=h.run(false);
 assert.equal(result.ok,true);assert.equal(h.row[7],'CANCELLED');
 assert.equal(h.row[11],'BUSINESS_TRANSACTION_ROLLED_BACK');
 assert.equal(h.row[9],'');assert.equal(h.row[10],'');
});

test('decision-intent settlement quarantines an incompletely rolled-back transaction',()=>{
 const h=settlementHarness();
 const result=h.run(true);
 assert.equal(result.ok,true);assert.equal(h.row[7],'REVIEW');
 assert.equal(h.row[11],'BUSINESS_ROLLBACK_INCOMPLETE_OPERATOR_RECONCILIATION_REQUIRED');
 assert.equal(h.row[9],'');assert.equal(h.row[10],'');
});

test('decision-intent settlement is idempotent and does not overwrite terminal queue states',()=>{
 for(const state of ['DONE','CANCELLED','REVIEW']){
  const h=settlementHarness(state),before=h.row.slice();
  const result=h.run(true);
  assert.equal(result.alreadySettled,true);
  assert.deepEqual(h.row,before);
 }
});

const adminVerifyStart=source.indexOf('function adminVerifyApplication_(session,applicationRef,action,note) {');
const adminVerifyEnd=source.indexOf('\nfunction apiAdminRetryVipInvite',adminVerifyStart+1);
assert.ok(adminVerifyStart>=0&&adminVerifyEnd>adminVerifyStart,'adminVerifyApplication_ boundaries must exist');
const adminVerifySource=source.slice(adminVerifyStart,adminVerifyEnd);

function adminRejectHarness(failAt=[],intentError=null) {
 const appRef='MPS-APP-0123456789ABCDEF0123';
 const app=[appRef,new Date(),'Member Test','@member_test','ID','Trading','', 'Deposit Dikirim','','','', '', '', '',new Date()];
 const deposit=[appRef,new Date(),'Member Test','12345678','Standard',1000000,'2026-11-15','proof','https://drive.google.com/file/d/proof','Menunggu Telegram','','987654321','',''];
 const link=['hash',new Date(),new Date(Date.now()+600000),'Menunggu','',appRef,'','','','',''];
 const access=[appRef,'987654321','987654321','@member_test','Member Test',true,'Menunggu','','','',''];
 const counts={apps:0,deposits:0,links:0,access:0},remaining=failAt.slice();
 let lockDepth=0,lockReleases=0,settlement='',alertQueued=0,intentCreated=0;
 function sheet(row,label,allRows) {
  return {
   getLastRow:()=>allRows?allRows.length:2,
   getRange(r,c,nr=1,nc=1){return{
    getValues:()=>allRows?allRows.slice(r-1,r-1+nr).map(line=>line.slice(c-1,c-1+nc)):[row.slice(c-1,c-1+nc)],
    getDisplayValues:()=>allRows?allRows.slice(r-1,r-1+nr).map(line=>line.slice(c-1,c-1+nc).map(v=>String(v??''))):[row.slice(c-1,c-1+nc).map(v=>String(v??''))],
    setValue(value){counts[label]++;row[c-1]=value;const key=label+':'+counts[label],i=remaining.indexOf(key);if(i>=0){remaining.splice(i,1);throw new Error('INJECTED_'+key+'_WRITE');}},
    setValues(values){counts[label]++;values.forEach((line,ri)=>line.forEach((v,ci)=>{if(!allRows||allRows[r-1+ri]) (allRows?allRows[r-1+ri]:row)[c-1+ci]=v;}));const key=label+':'+counts[label],i=remaining.indexOf(key);if(i>=0){remaining.splice(i,1);throw new Error('INJECTED_'+key+'_WRITE');}}
   };},
   appendRow(values){allRows.push(values.slice());},
   deleteRow(r){allRows.splice(r-1,1);}
  };
 }
 const appsRows=[new Array(15).fill(''),app],depositRows=[new Array(14).fill(''),deposit],linkRows=[new Array(11).fill(''),link];
 const apps=sheet(app,'apps'),deposits=sheet(deposit,'deposits'),links=sheet(link,'links',linkRows),accessSheet=sheet(access,'access');
 const original={app:app.slice(),deposit:deposit.slice(),link:link.slice(),access:access.slice()};
 const context={
  MPS:{headers:new Array(30),minDeposit:1000000},MPS_APPLICATIONS:{headers:new Array(15)},MPS_DEPOSITS:{headers:new Array(14)},MPS_MEMBER_LINKS:{headers:new Array(11)},
  LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;lockReleases++;}})},
  Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
  getMpsApplicationsSheet_:()=>apps,findMpsApplicationRow_:()=>2,
  getMpsDepositsSheet_:()=>deposits,findMpsDepositRow_:()=>2,
  getMpsMemberLinksSheet_:()=>links,getTelegramAccessSheet_:()=>accessSheet,findTelegramAccessByMemberId_:()=>2,
  enqueueMpsAdminDecisionIntent_:()=>{intentCreated++;if(intentError)throw new Error(intentError);return{ok:true};},
  settleMpsAdminDecisionIntentAfterRollback_:(subject,member,action,incomplete)=>{settlement=incomplete?'REVIEW':'CANCELLED';return{ok:true,state:settlement};},
  enqueueMpsVipFollowup_:(task)=>{if(task.action==='ADMIN_ALERT')alertQueued++;return{ok:true};},
  sha256_:()=> 'b'.repeat(64),sheetText_:v=>String(v??''),safeErrorMessage_:e=>String(e&&e.message||e),
  CacheService:{getScriptCache:()=>({remove:()=>{}})},runMpsVipFollowupQueue_:()=>({ok:true}),
  recordMpsAudit_:()=>true,adminRole_:()=> 'ADMIN',adminActorRef_:()=> 'ADMIN',
  console
 };
 vm.createContext(context);vm.runInContext(adminVerifySource,context,{timeout:1000});
 return {
  run:()=>context.adminVerifyApplication_('session',appRef,'reject','Bukti tidak valid'),
  app,deposit,link,access,original,stats:()=>({counts,lockDepth,lockReleases,settlement,alertQueued,intentCreated})
 };
}

for(const preflightError of ['VIP_FOLLOWUP_QUEUE_NOT_PROVISIONED','VIP_FOLLOWUP_QUEUE_SCHEMA_MISMATCH']){
 test('admin rejection does not report incomplete rollback when decision-intent enqueue fails before any write: '+preflightError,()=>{
  const h=adminRejectHarness([],preflightError);
  assert.throws(()=>h.run(),new RegExp(preflightError));
  const stats=h.stats();
  assert.deepEqual(h.app,h.original.app);assert.deepEqual(h.deposit,h.original.deposit);
  assert.deepEqual(h.link,h.original.link);assert.deepEqual(h.access,h.original.access);
  assert.equal(stats.settlement,'');assert.equal(stats.alertQueued,0);
  assert.equal(Object.values(stats.counts).reduce((sum,n)=>sum+n,0),0,'no business sheet compensation writes are needed before any mutation');
  assert.equal(stats.lockDepth,0);assert.equal(stats.lockReleases,1);
 });
}

test('ambiguous decision-intent enqueue failure still attempts durable settlement',()=>{
 const h=adminRejectHarness([],'INJECTED_FLUSH_RESPONSE_LOST');
 assert.throws(()=>h.run(),/INJECTED_FLUSH_RESPONSE_LOST/);
 const stats=h.stats();
 assert.equal(stats.settlement,'CANCELLED');
 assert.equal(stats.alertQueued,0);
 assert.equal(stats.lockDepth,0);
 assert.equal(stats.lockReleases,1);
});

for(const boundary of ['apps:1','apps:2','apps:3','deposits:1','deposits:2','deposits:3','links:1','access:1']){
 test('admin rejection restores all business snapshots after '+boundary+' write fails',()=>{
  const h=adminRejectHarness([boundary]);
  assert.throws(()=>h.run(),new RegExp('INJECTED_'+boundary+'_WRITE'));
  assert.deepEqual(h.app,h.original.app);assert.deepEqual(h.deposit,h.original.deposit);
  assert.deepEqual(h.link,h.original.link);assert.deepEqual(h.access,h.original.access);
  assert.equal(h.stats().settlement,'CANCELLED');assert.equal(h.stats().alertQueued,0);
  assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
 });
}

for(const rollbackBoundary of ['access:2','links:2','apps:4','deposits:4']){
 test('admin rejection quarantines decision and queues alert when '+rollbackBoundary+' compensation fails',()=>{
  const h=adminRejectHarness(['access:1',rollbackBoundary]);
  assert.throws(()=>h.run(),err=>{
   assert.match(err.message,/Rollback tidak lengkap/);
   assert.match(err.message,/Peringatan rekonsiliasi tersimpan di antrean Admin/);
   return true;
  });
  assert.equal(h.stats().settlement,'REVIEW');assert.equal(h.stats().alertQueued,1);
  assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
 });
}

function ambiguousMemberAppendHarness() {
 const appRef='MPS-APP-0123456789ABCDEF0123',chatId='987654321';
 const app=[appRef,new Date(),'Approval Test','@approval_test','ID','Trading','', 'Deposit Dikirim','','','Terverifikasi',chatId,chatId,'',''];
 const deposit=[appRef,new Date(),'Approval Test','12345678','Standard',1000000,'2026-11-15','proof-file-id','https://drive.google.com/file/d/proof-file-id','Menunggu Telegram',chatId,chatId,'',''];
 const access=[appRef,chatId,chatId,'@approval_test','Approval Test',true,'Menunggu','','','',''];
 const dbRows=[new Array(30).fill('')];
 let lockDepth=0,lockReleases=0,appendCalls=0,deletedRows=0;
 function rowSheet(row,label) {
  return {getRange(r,c,nr=1,nc=1){return{
   getValues:()=>[row.slice(c-1,c-1+nc)],
   setValue(v){row[c-1]=v;},
   setValues(values){values[0].forEach((v,i)=>row[c-1+i]=v);}
  };}};
 }
 const apps=rowSheet(app,'apps'),deposits=rowSheet(deposit,'deposits'),accessSheet=rowSheet(access,'access');
 const db={
  getLastRow:()=>dbRows.length,
  appendRow(values){dbRows.push(values.slice());appendCalls++;throw new Error('INJECTED_APPEND_RESPONSE_LOST_AFTER_WRITE');},
  deleteRow(row){dbRows.splice(row-1,1);deletedRows++;}
 };
 const context={
  MPS:{headers:new Array(30),minDeposit:1000000},MPS_APPLICATIONS:{headers:new Array(15)},MPS_DEPOSITS:{headers:new Array(14)},
  LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;lockReleases++;}})},
  Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
  getMpsApplicationsSheet_:()=>apps,findMpsApplicationRow_:()=>2,
  getMpsDepositsSheet_:()=>deposits,findMpsDepositRow_:()=>2,
  getMemberSheet_:()=>db,findMemberById_:(sheet,id)=>{for(let i=1;i<dbRows.length;i++)if(String(dbRows[i][0])===String(id))return i+1;return 0;},
  ensureUniqueMt5_:()=>true,validateProofFileForApproval_:()=>({fileId:'proof-file-id'}),
  getTelegramAccessSheet_:()=>accessSheet,findTelegramAccessByMemberId_:()=>2,
  enqueueMpsAdminDecisionIntent_:()=>({ok:true}),sheetText_:v=>String(v??''),safeErrorMessage_:e=>String(e&&e.message||e),console
 };
 vm.createContext(context);vm.runInContext(adminVerifySource,context,{timeout:1000});
 return {run:()=>context.adminVerifyApplication_('session',appRef,'approve',''),dbRows,stats:()=>({lockDepth,lockReleases,appendCalls,deletedRows})};
}

test('admin approval re-discovers and deletes a member row when appendRow writes but response fails',()=>{
 const h=ambiguousMemberAppendHarness();
 assert.throws(()=>h.run(),/INJECTED_APPEND_RESPONSE_LOST_AFTER_WRITE/);
 assert.equal(h.stats().appendCalls,1);assert.equal(h.stats().deletedRows,1);
 assert.equal(h.dbRows.length,1,'the ambiguous appended member row must not remain orphaned');
 assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
});

function adminApproveHarness(failAt=[]) {
 const appRef='MPS-APP-0123456789ABCDEF0123',chatId='987654321';
 const app=[appRef,new Date(),'Approval Test','@approval_test','ID','Trading','', 'Deposit Dikirim','','','Terverifikasi',chatId,chatId,'',''];
 const deposit=[appRef,new Date(),'Approval Test','12345678','Standard',1000000,'2026-11-15','proof-file-id','https://drive.google.com/file/d/proof-file-id','Menunggu Telegram',chatId,chatId,'',''];
 const access=[appRef,chatId,chatId,'@approval_test','Approval Test',true,'Menunggu','','','',''];
 const original={app:app.slice(),deposit:deposit.slice(),access:access.slice()};
 const counts={db:0,dbDelete:0,access:0,apps:0,deposits:0},remaining=failAt.slice();
 let lockDepth=0,lockReleases=0,settlement='',alertQueued=0;
 function fail(key){const i=remaining.indexOf(key);if(i<0)return false;remaining.splice(i,1);return true;}
 function rowSheet(row,label) {
  return {getRange(r,c,nr=1,nc=1){return{
   getValues:()=>[row.slice(c-1,c-1+nc)],
   setValue(v){counts[label]++;row[c-1]=v;if(fail(label+':'+counts[label]))throw new Error('INJECTED_'+label+':'+counts[label]+'_WRITE');},
   setValues(values){counts[label]++;values[0].forEach((v,i)=>row[c-1+i]=v);if(fail(label+':'+counts[label]))throw new Error('INJECTED_'+label+':'+counts[label]+'_WRITE');}
  };}};
 }
 const apps=rowSheet(app,'apps'),deposits=rowSheet(deposit,'deposits'),accessSheet=rowSheet(access,'access');
 const dbRows=[new Array(30).fill('')];
 const db={
  getLastRow:()=>dbRows.length,
  appendRow(values){counts.db++;dbRows.push(values.slice());if(fail('db:'+counts.db))throw new Error('INJECTED_db:'+counts.db+'_WRITE');},
  deleteRow(row){counts.dbDelete++;if(fail('dbDelete:'+counts.dbDelete))throw new Error('INJECTED_dbDelete:'+counts.dbDelete+'_WRITE');dbRows.splice(row-1,1);}
 };
 const context={
  MPS:{headers:new Array(30),minDeposit:1000000},MPS_APPLICATIONS:{headers:new Array(15)},MPS_DEPOSITS:{headers:new Array(14)},
  LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;lockReleases++;}})},
  Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
  getMpsApplicationsSheet_:()=>apps,findMpsApplicationRow_:()=>2,
  getMpsDepositsSheet_:()=>deposits,findMpsDepositRow_:()=>2,
  getMemberSheet_:()=>db,findMemberById_:(sheet,id)=>{for(let i=1;i<dbRows.length;i++)if(String(dbRows[i][0])===String(id))return i+1;return 0;},
  ensureUniqueMt5_:()=>true,validateProofFileForApproval_:()=>({fileId:'proof-file-id'}),
  getTelegramAccessSheet_:()=>accessSheet,findTelegramAccessByMemberId_:()=>2,
  enqueueMpsAdminDecisionIntent_:()=>({ok:true}),
  settleMpsAdminDecisionIntentAfterRollback_:(subject,member,action,incomplete)=>{settlement=incomplete?'REVIEW':'CANCELLED';return{ok:true,state:settlement};},
  enqueueMpsVipFollowup_:(task)=>{if(task.action==='ADMIN_ALERT')alertQueued++;return{ok:true};},
  sha256_:()=> 'c'.repeat(64),sheetText_:v=>String(v??''),safeErrorMessage_:e=>String(e&&e.message||e),
  console
 };
 vm.createContext(context);vm.runInContext(adminVerifySource,context,{timeout:1000});
 return {run:()=>context.adminVerifyApplication_('session',appRef,'approve',''),app,deposit,access,original,dbRows,stats:()=>({counts,lockDepth,lockReleases,settlement,alertQueued})};
}

for(const boundary of ['db:1','access:1','apps:1','apps:2','apps:3','apps:4','deposits:1','deposits:2','deposits:3']){
 test('admin approval restores all snapshots after '+boundary+' business write fails',()=>{
  const h=adminApproveHarness([boundary]);
  assert.throws(()=>h.run(),new RegExp('INJECTED_'+boundary+'_WRITE'));
  assert.equal(h.dbRows.length,1,'no orphaned member row may remain');
  assert.deepEqual(h.app,h.original.app);assert.deepEqual(h.deposit,h.original.deposit);assert.deepEqual(h.access,h.original.access);
  assert.equal(h.stats().settlement,'CANCELLED');assert.equal(h.stats().alertQueued,0);
  assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
 });
}

for(const compensation of ['dbDelete:1','access:2','apps:5','deposits:4']){
 test('admin approval quarantines decision and queues alert when '+compensation+' compensation fails',()=>{
  const primaryFailure=compensation==='deposits:4'?'deposits:3':'deposits:1';
  const h=adminApproveHarness([primaryFailure,compensation]);
  assert.throws(()=>h.run(),err=>{
   assert.match(err.message,/Rollback tidak lengkap/);
   assert.match(err.message,/Peringatan rekonsiliasi tersimpan di antrean Admin/);
   return true;
  });
  assert.equal(h.stats().settlement,'REVIEW');assert.equal(h.stats().alertQueued,1);
  assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
 });
}
