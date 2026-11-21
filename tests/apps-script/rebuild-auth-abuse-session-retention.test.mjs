import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'rebuild/v4.8.1/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
function sessionMs(value){
  if(value instanceof Date)return value.getTime();
  if(typeof value==='number'&&Number.isFinite(value))return value;
  const raw=String(value==null?'':value).trim();
  if(/^\d{10,13}$/.test(raw))return Number(raw);
  const parsed=new Date(raw).getTime();
  return Number.isFinite(parsed)?parsed:NaN;
}
function harness(rows,now=Date.now(),lastPrune=''){
  const properties=new Map(lastPrune?[['MPS_SESSIONS_LAST_PRUNE_AT',lastPrune]]:[]);
  const cleared=[];
  const sh={
    getLastRow:()=>rows.length+1,
    getRange:(row,col,nr,nc)=>({
      getDisplayValues:()=>rows.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc)),
      clearContent:()=>{cleared.push(row);rows[row-2]=Array(7).fill('');}
    })
  };
  const context={
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,String(v))})},
    sessionTimeMs_:sessionMs,console
  };
  vm.createContext(context);vm.runInContext(extract('pruneExpiredSessionsLocked_'),context,{timeout:1000});
  return{run:()=>context.pruneExpiredSessionsLocked_(sh,now),rows,cleared,properties};
}
const DAY=86400000;

test('six-digit PIN retains per-member brute-force throttling until a second factor is implemented',()=>{
  assert.match(source,/enforceRateLimit_\('member-login', id \|\| 'invalid', 8, 900\)/);
  assert.doesNotMatch(source,/enforceRateLimit_\\('member-login', 'global'/);
});
test('session pruning clears only expired or revoked sessions older than 30 days without shifting rows',()=>{
  const now=Date.now(),old=now-31*DAY,fresh=now-2*DAY;
  const rows=[
    ['hash-a','MEMBER','A',String(old-8*3600000),String(old),String(old),''],
    ['hash-b','MEMBER','B',String(fresh-8*3600000),String(fresh),String(fresh),''],
    ['hash-c','ADMIN','C',String(old),String(now+DAY),String(now),''],
    ['hash-d','ADMIN','D',String(old),String(now+DAY),String(now),String(old)],
    ['hash-e','MEMBER','E','bad','bad','bad','']
  ];
  const h=harness(rows,now),result=h.run();
  assert.equal(result.deleted,2);
  assert.deepEqual(h.cleared,[5,2]);
  assert.deepEqual(h.rows.map(r=>r[0]),['','hash-b','hash-c','','hash-e']);
});
test('daily pruning is skipped and does not touch any session rows',()=>{
  const now=Date.now(),rows=[['hash','MEMBER','A',String(now),String(now+DAY),String(now),'']];
  const h=harness(rows,now,String(now-DAY/2)),result=h.run();
  assert.equal(result.skipped,true);
  assert.equal(result.deleted,0);
  assert.equal(h.cleared.length,0);
});
test('malformed timestamps and active sessions are retained fail-safe',()=>{
  const now=Date.now(),rows=[
    ['active','MEMBER','A',String(now),String(now+DAY),String(now),''],
    ['malformed','MEMBER','B','bad','bad','bad','']
  ];
  const h=harness(rows,now),result=h.run();
  assert.equal(result.deleted,0);
  assert.equal(h.rows.length,2);
});
test('prune marker is not advanced when clearing a row fails',()=>{
  const now=Date.now(),old=now-31*DAY,properties=new Map();
  const sh={
    getLastRow:()=>2,
    getRange:()=>({getDisplayValues:()=>[[String(old),String(old),'','']],clearContent:()=>{throw new Error('clear failed');}})
  };
  const context={PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,String(v))})},sessionTimeMs_:sessionMs};
  vm.createContext(context);vm.runInContext(extract('pruneExpiredSessionsLocked_'),context,{timeout:1000});
  assert.throws(()=>context.pruneExpiredSessionsLocked_(sh,now),/clear failed/);
  assert.equal(properties.has('MPS_SESSIONS_LAST_PRUNE_AT'),false);
});
test('cleanup runs under the session-creation lock and failure is non-fatal',()=>{
  const start=source.indexOf('function createSession_('),end=source.indexOf('\nfunction ',start+1);
  const body=source.slice(start,end);
  assert.ok(body.indexOf('lock.waitLock(10000)')<body.indexOf('pruneExpiredSessionsLocked_'));
  assert.match(body,/try \{ pruneExpiredSessionsLocked_\(sh,nowMs\); \}[\s\S]*catch \(pruneError\)/);
  assert.ok(body.indexOf('pruneExpiredSessionsLocked_')<body.indexOf('lock.releaseLock()'));
});
