import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function apiAdminSaveNewsReview(session, id, decision, category, summary) {');
const end=source.indexOf('\nfunction ',start+1);
assert.ok(start>=0&&end>start,'news review function boundaries must exist');
const functionSource=source.slice(start,end);
const original=['NEWS-1',new Date('2026-11-01T00:00:00Z'),'Official Source','Macro','Old title','Old summary','https://example.com/news','Review','Reviewed by MPS Admin','PUBLIC',false,'',new Date('2026-11-01T00:00:00Z')];

function harness({failWrite=false,failRollback=false,officialUrl='https://example.com/news'}={}) {
  const row=original.slice();let writes=0;
  const sheet={getRange(r,c,nr=1,nc=1){return{
    getValues:()=>[row.slice(c-1,c-1+nc)],
    setValues(values){writes++;values[0].forEach((v,i)=>row[c-1+i]=v);if((failWrite&&writes===1)||(failRollback&&writes===2))throw new Error(writes===1?'INJECTED_NEWS_WRITE':'INJECTED_NEWS_ROLLBACK');}
  };}};
  const context={
    requireSuperAdmin_:()=>true,
    getMpsContentSheet_:()=>sheet,
    findMpsContentRow_:()=>2,
    MPS_CONTENT:{newsSheet:'MPS News',newsHeaders:new Array(13)},
    validHttpsUrl_:url=>/^https:\/\//.test(String(url)),
    isMpsOfficialNewsUrl_:()=>officialUrl==='https://official.example.gov/news',
    clean_:v=>String(v??'').trim(),
    sheetText_:v=>String(v??''),
    cleanNewsText_:v=>String(v??'').trim(),
    CacheService:{getScriptCache:()=>({remove:()=>{}})},
    recordMpsAudit_:()=>true,
    adminRole_:()=>'SUPER_ADMIN',adminActorRef_:()=>'SUPER_ADMIN'
  };
  vm.createContext(context);vm.runInContext(functionSource,context,{timeout:1000});
  return {run:(decision='publish')=>context.apiAdminSaveNewsReview('session','NEWS-1',decision,'Markets','Reviewed news summary'),row,writes:()=>writes};
}

test('news review commits category, summary, verification, status and timestamp in one row write',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(h.writes(),1);
  assert.equal(h.row[3],'Markets');assert.equal(h.row[5],'Reviewed news summary');
  assert.equal(h.row[7],'Published');assert.equal(h.row[8],'Reviewed by MPS Admin');
});
test('news hide commits a single row update without changing verification metadata',()=>{
  const h=harness(),result=h.run('hide');
  assert.equal(result.ok,true);assert.equal(h.writes(),1);
  assert.equal(h.row[7],'Hidden');assert.equal(h.row[8],'Reviewed by MPS Admin');
});
test('news review restores the full row snapshot after a failed write',()=>{
  const h=harness({failWrite:true});
  assert.throws(()=>h.run(),/Review berita gagal; snapshot berita berhasil dipulihkan/);
  assert.deepEqual(h.row,original);assert.equal(h.writes(),2);
});
test('news review surfaces incomplete rollback instead of reporting success',()=>{
  const h=harness({failWrite:true,failRollback:true});
  assert.throws(()=>h.run(),/Review berita gagal dan rollback tidak lengkap/);
  assert.equal(h.writes(),2);
});
