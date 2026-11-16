import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function processTelegramUpdate_(');
const end=source.indexOf('function processTelegramUpdateCore_(',start);
assert.ok(start>=0&&end>start,'durable webhook ingress wrapper must exist');
const wrapper=source.slice(start,end);

function harness(claimResult,{handlerError=null,journalError=null,alertError=null}={}) {
 const calls={core:0,claim:[],finish:[],retry:[],review:[],alerts:[],drains:0};
 const journal={
  claim:(update,now)=>{calls.claim.push({update,now});if(journalError)throw journalError;return claimResult;},
  finish:(...args)=>calls.finish.push(args),
  retry:(...args)=>calls.retry.push(args),
  review:(...args)=>calls.review.push(args)
 };
 const context={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_SPREADSHEET_ID'?'isolated-spreadsheet':''})},
  MPS_TELEGRAM_UPDATE_JOURNAL:{sheet:'MPS Telegram Update Journal'},
  createMpsTelegramGasJournal_:config=>{calls.config=config;return journal;},
  processTelegramUpdateCore_:update=>{calls.core++;if(handlerError)throw handlerError;},
  enqueueMpsVipFollowup_:task=>{calls.alerts.push(task);if(alertError)throw alertError;return{ok:true};},
  runMpsVipFollowupQueue_:()=>{calls.drains++;return{ok:true};},
  sha256_:value=>'a'.repeat(64)
 };
 vm.createContext(context);
 vm.runInContext(wrapper+'\nthis.run=processTelegramUpdate_;',context,{timeout:1000});
 return{run:context.run,calls};
}
const claim=(overrides={})=>({outcome:'CLAIMED',recovered:false,row:{updateType:'MESSAGE',attemptCount:1,claimToken:'claim-token',...overrides}});

test('new Telegram update uses the persistent journal and marks DONE after handler success',()=>{
 const h=harness(claim()),update={update_id:'12345678901234567890',message:{text:'/start'}};
 h.run(update);
 assert.equal(h.calls.config.spreadsheetId,'isolated-spreadsheet');
 assert.equal(h.calls.config.sheetName,'MPS Telegram Update Journal');
 assert.equal(h.calls.claim.length,1);assert.equal(h.calls.claim[0].update,update);
 assert.equal(h.calls.core,1);assert.equal(h.calls.finish.length,1);
 assert.deepEqual(h.calls.finish[0].slice(0,2),[update.update_id,'claim-token']);
 assert.equal(h.calls.retry.length,0);assert.equal(h.calls.review.length,0);
});

test('completed duplicate update is acknowledged without executing handlers',()=>{
 const h=harness({outcome:'DUPLICATE_DONE'});
 h.run({update_id:123,message:{text:'/start'}});
 assert.equal(h.calls.core,0);assert.equal(h.calls.finish.length,0);
});

test('concurrent duplicate stays retryable while a durable lease is active',()=>{
 const h=harness({outcome:'BUSY'});
 assert.throws(()=>h.run({update_id:123}),/sedang diproses/);
 assert.equal(h.calls.core,0);
});

test('payload collision or quarantined update schedules a durable admin review alert',()=>{
 const h=harness({outcome:'MANUAL_REVIEW'});
 h.run({update_id:123,message:{text:'different payload'}});
 assert.equal(h.calls.core,0);assert.equal(h.calls.alerts.length,1);
 assert.equal(h.calls.alerts[0].action,'ADMIN_ALERT');
 assert.match(h.calls.alerts[0].taskKey,/^telegram:update-review:/);
 assert.match(h.calls.alerts[0].alertText,/Payload pribadi tidak disimpan/);
 assert.equal(h.calls.drains,1);
});

test('expired or retryable lease re-enters only the allowlisted idempotent handler path',()=>{
 const h=harness(claim({attemptCount:2}));
 h.run({update_id:123,message:{text:'/start'}});
 assert.equal(h.calls.core,1);assert.equal(h.calls.finish.length,1);
});

test('transient handler error is durably marked RETRYABLE before webhook retry',()=>{
 const h=harness(claim(),{handlerError:new Error('VIP_JOIN_NOTICE_QUEUE_FAILED:temporary')});
 assert.throws(()=>h.run({update_id:123,chat_join_request:{}}),/VIP_JOIN_NOTICE_QUEUE_FAILED/);
 assert.equal(h.calls.core,1);assert.equal(h.calls.retry.length,1);
 assert.equal(h.calls.retry[0][3],'JOIN_NOTICE_QUEUE_FAILED');
 assert.equal(h.calls.finish.length,0);assert.equal(h.calls.review.length,0);
});

test('ambiguous external outcome is quarantined and notified instead of retried',()=>{
 const error=new Error('provider timed out after request write');error.ambiguousExternalOutcome=true;
 const h=harness(claim(),{handlerError:error});
 h.run({update_id:123,message:{text:'/start'}});
 assert.equal(h.calls.retry.length,0);assert.equal(h.calls.review.length,1);
 assert.equal(h.calls.review[0][3],'AMBIGUOUS_EXTERNAL_OUTCOME');
 assert.equal(h.calls.alerts.length,1);
});

test('unsupported update types and exhausted attempts are quarantined',()=>{
 for(const row of [{updateType:'UNTRUSTED_TYPE',attemptCount:1,claimToken:'token'},{updateType:'MESSAGE',attemptCount:5,claimToken:'token'}]){
  const h=harness(claim(row));
  h.run({update_id:123,message:{text:'/start'}});
  assert.equal(h.calls.core,0);assert.equal(h.calls.review.length,1);assert.equal(h.calls.alerts.length,1);
 }
});

test('journal storage outage fails closed before invoking a Telegram handler',()=>{
 const h=harness(claim(),{journalError:new Error('JOURNAL_SHEET_MISSING')});
 assert.throws(()=>h.run({update_id:123}),/JOURNAL_SHEET_MISSING/);
 assert.equal(h.calls.core,0);
});

test('manual-review alert queue failure propagates while the update remains quarantined',()=>{
 const h=harness({outcome:'MANUAL_REVIEW'},{alertError:new Error('VIP_FOLLOWUP_QUEUE_NOT_PROVISIONED')});
 assert.throws(()=>h.run({update_id:123}),/TELEGRAM_UPDATE_REVIEW_ALERT_NOT_DURABLE/);
 assert.equal(h.calls.core,0);assert.equal(h.calls.alerts.length,1);
});

test('webhook ingress no longer uses CacheService as its deduplication authority',()=>{
 assert.equal(wrapper.includes('CacheService'),false);
 assert.equal(wrapper.includes('LockService'),false);
 assert.ok(wrapper.includes('createMpsTelegramGasJournal_'));
});
