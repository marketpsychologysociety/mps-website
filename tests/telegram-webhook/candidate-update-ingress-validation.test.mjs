import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function processTelegramUpdate_(');
const end=source.indexOf('function processTelegramUpdateCore_(',start);
assert.ok(start>=0&&end>start,'webhook ingress wrapper must exist');
const wrapper=source.slice(start,end);

function harness(state='') {
 const calls={core:0,cacheGet:0,cachePut:[],cacheRemove:[],lock:0,unlock:0};
 const cache={
  get(){calls.cacheGet++;return state||null;},
  put(key,value,ttl){calls.cachePut.push({key,value,ttl});state=value;},
  remove(key){calls.cacheRemove.push(key);state='';}
 };
 const context={
  CacheService:{getScriptCache:()=>cache},
  LockService:{getScriptLock:()=>({waitLock(){calls.lock++;},releaseLock(){calls.unlock++;}})},
  processTelegramUpdateCore_:()=>{calls.core++;}
 };
 vm.createContext(context);
 vm.runInContext(wrapper+'\nthis.run=processTelegramUpdate_;',context,{timeout:1000});
 return {run:context.run,calls};
}

test('rejects missing, malformed, unsafe and noncanonical update IDs before cache or handlers',()=>{
 for(const update of [{},{update_id:null},{update_id:-1},{update_id:1.5},{update_id:Number.MAX_SAFE_INTEGER+1},{update_id:'01'},{update_id:'-1'},{update_id:'1.0'},{update_id:'1'.repeat(21)},null,[], '123']){
  const h=harness();
  assert.throws(()=>h.run(update),/tidak valid/);
  assert.equal(h.calls.core,0);
  assert.equal(h.calls.cacheGet,0);
  assert.equal(h.calls.cachePut.length,0);
 }
});

test('accepts Telegram numeric update IDs and canonical decimal strings',()=>{
 for(const update_id of [0,123456,'0','123456','12345678901234567890']){
  const h=harness();h.run({update_id});
  assert.equal(h.calls.core,1);
  assert.deepEqual(h.calls.cachePut.map(x=>x.value),['PROCESSING','DONE']);
  assert.equal(h.calls.cachePut[0].ttl,600);
  assert.equal(h.calls.cachePut[1].ttl,21600);
 }
});

test('duplicate completed update is acknowledged without re-running handler',()=>{
 const h=harness('DONE');h.run({update_id:123});
 assert.equal(h.calls.core,0);
 assert.equal(h.calls.cachePut.length,0);
});

test('in-flight duplicate stays retryable and releases lock',()=>{
 const h=harness('PROCESSING');
 assert.throws(()=>h.run({update_id:123}),/sedang diproses/);
 assert.equal(h.calls.core,0);
 assert.equal(h.calls.unlock,1);
});
