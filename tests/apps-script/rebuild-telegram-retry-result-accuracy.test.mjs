import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
new vm.Script(code,{filename:'Code.gs'});
const start=code.indexOf('function apiAdminRetryTelegramFailures(');
const end=code.indexOf('\nfunction createTelegramLink_(',start);
assert.ok(start>=0&&end>start);
const source=code.slice(start,end);

function harness({payload='{"update_id":42,"message":{"text":"hello"}}',process=()=>{}}={}){
 const row=['42','message','hash','FAILED',new Date(),new Date(Date.now()-60000),1,'','','','','INVALID_UPDATE',payload];
 const sh={rows:[new Array(13).fill(''),row],getRange(r,c){
  return {
   getDisplayValue:()=>String(sh.rows[r-1]?.[c-1]??''),
   getValue:()=>sh.rows[r-1]?.[c-1],
   setValue:v=>{sh.rows[r-1][c-1]=v;},
   clearContent:()=>{sh.rows[r-1][c-1]='';}
  };
 }};
 const ctx={
  requireSession_:()=>({role:'ADMIN',actorId:'admin'}),
  sheet_:()=>sh,
  rows_:()=>sh.rows.slice(1),
  findRow_:(sheet,col,value)=>{const i=sheet.rows.findIndex((r,n)=>n>0&&String(r[col-1])===String(value));return i<0?0:i+1;},
  processTelegramUpdate_:update=>process(sh,update),
  audit_:()=>true,
  Date,Number,String,JSON,Math,Error,console:{warn(){},error(){}}
 };
 vm.createContext(ctx);vm.runInContext(source,ctx,{timeout:1000});
 return {ctx,sh,run:()=>ctx.apiAdminRetryTelegramFailures('admin')};
}
test('Admin retry reports PROCESSING when another worker owns the lease',()=>{
 const h=harness({process:sh=>{sh.rows[1][3]='PROCESSING';}});
 const result=h.run();
 assert.equal(result.results[0].status,'PROCESSING');
 assert.notEqual(result.results[0].status,'COMPLETED');
});
test('Admin retry reports the actual COMPLETED journal state after processing',()=>{
 const h=harness({process:sh=>{sh.rows[1][3]='COMPLETED';}});
 assert.equal(h.run().results[0].status,'COMPLETED');
});
test('Admin retry reports NEEDS_RECONCILIATION when processing outcome is uncertain',()=>{
 const h=harness({process:sh=>{sh.rows[1][3]='NEEDS_RECONCILIATION';throw new Error('uncertain');}});
 assert.equal(h.run().results[0].status,'NEEDS_RECONCILIATION');
});
test('missing journal payload becomes explicitly NOT_RETRYABLE and appears in results',()=>{
 const h=harness({payload:''});
 const result=h.run();
 assert.equal(h.sh.rows[1][3],'NOT_RETRYABLE');
 assert.deepEqual(result.results[0],{updateId:'42',status:'NOT_RETRYABLE',reason:'PAYLOAD_MISSING'});
});
