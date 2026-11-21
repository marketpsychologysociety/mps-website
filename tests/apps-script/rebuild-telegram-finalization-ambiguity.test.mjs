import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
new vm.Script(code,{filename:'Code.gs'});
const start=code.indexOf('function processTelegramUpdate_(');
const end=code.indexOf('\nfunction finalizeTelegramUpdate_(',start);
assert.ok(start>=0&&end>start,'processTelegramUpdate_ boundaries');
const source=code.slice(start,end);
function sheetHarness(){
 const rows=[new Array(13).fill(''),['777','message','hash','FAILED',new Date(),new Date(Date.now()-60000),1,'','','','','','{}']];
 return {rows,getRange(row,col){
  const self=this;return{
   getDisplayValue:()=>String(self.rows[row-1]?.[col-1]??''),
   getValue:()=>self.rows[row-1]?.[col-1],
   setValue:v=>{self.rows[row-1][col-1]=v;},
   clearContent:()=>{self.rows[row-1][col-1]='';}
  };
 },getLastRow:()=>rows.length};
}
function harness({handler=()=>{},finalizers=[]}={}){
 const journal=sheetHarness(),calls=[];
 let finalizerIndex=0;
 const ctx={
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  sheet_:()=>journal,
  findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1])===String(value));return i<0?0:i+1;},
  randomHex_:()=>'a'.repeat(32),sha256_:()=> 'hash',
  handleTelegramStart_:handler,handleTelegramChatMember_:()=>{},handleTelegramJoinRequest_:()=>{},
  finalizeTelegramUpdate_:(row,token,state,code)=>{calls.push({row,token,state,code});const next=finalizers[finalizerIndex++];if(next instanceof Error)throw next;return next===undefined?true:next;},
  console:{warn(){},error(){}},Date,Math,Number,String,JSON,Error
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:1000});
 return {ctx,journal,calls,run:()=>ctx.processTelegramUpdate_({update_id:777,message:{text:'/start'}})};
}
test('successful Telegram side effects followed by failed COMPLETED acknowledgement become reconciliation-only',()=>{
 const h=harness({finalizers:[new Error('Sheets timeout'),true]});
 assert.throws(()=>h.run(),e=>e.code==='HANDLER_COMPLETED_FINALIZE_FAILED'&&e.ambiguousRemoteOutcome===true);
 assert.deepEqual(h.calls.map(x=>x.state),['COMPLETED','NEEDS_RECONCILIATION']);
 assert.equal(h.calls[1].code,'HANDLER_COMPLETED_FINALIZE_FAILED');
});
test('a definitive handler failure remains FAILED when its journal acknowledgement succeeds',()=>{
 const h=harness({handler:()=>{throw Object.assign(new Error('bad update'),{code:'INVALID_UPDATE'});},finalizers:[true]});
 assert.throws(()=>h.run(),/bad update/);
 assert.deepEqual(h.calls.map(x=>x.state),['FAILED']);
 assert.equal(h.calls[0].code,'INVALID_UPDATE');
});
test('if reconciliation acknowledgement also fails, the update is not converted to FAILED or auto-retried',()=>{
 const h=harness({finalizers:[new Error('first write timeout'),new Error('second write timeout')]});
 assert.throws(()=>h.run(),e=>e.code==='HANDLER_COMPLETED_FINALIZE_FAILED');
 assert.deepEqual(h.calls.map(x=>x.state),['COMPLETED','NEEDS_RECONCILIATION']);
 assert.doesNotContain(h.calls.map(x=>x.state),'FAILED');
});
