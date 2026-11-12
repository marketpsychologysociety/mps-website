import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function apiAdminPublishAdvertisingRequest(session,payload) {');
const end=source.indexOf('\nfunction ',start+1);
assert.ok(start>=0&&end>start,'advertising publication function boundaries must exist');
const functionSource=source.slice(start,end);
const requestId='AR-REQUEST-0123456789';
const requestRow=['AR-REQUEST-0123456789',new Date('2026-11-01T00:00:00Z'),'MPS Brand','Contact','contact@example.com','@brand','Proposal','','','Public Home','30 days','','Approved','','Paid',new Date('2026-11-01T00:00:00Z'),'PKG-1'];

function harness({failRequestWrite=0,failRequestRestore=false,failAdDelete=false,appendForeignRow=false}={}) {
  const request=requestRow.slice(),adRows=[new Array(15).fill('')];
  let requestWriteCount=0,deletedRows=0,lockDepth=0;
  const reqSheet={
    getLastRow:()=>2,
    getRange(row,col,numRows=1,numCols=1){return{
      getValues:()=>[request.slice(col-1,col-1+numCols)],
      getDisplayValue:()=>String(request[col-1]??''),
      setValue(value){requestWriteCount++;request[col-1]=value;if(requestWriteCount===failRequestWrite)throw new Error('INJECTED_REQUEST_WRITE_'+requestWriteCount);},
      setValues(values){if(failRequestRestore)throw new Error('INJECTED_REQUEST_RESTORE');values[0].forEach((v,i)=>request[col-1+i]=v);}
    };}
  };
  const adsSheet={
    getLastRow:()=>adRows.length,
    getRange(row,col){return{getDisplayValue:()=>String((adRows[row-1]||[])[col-1]??'')};},
    appendRow(row){adRows.push(row.slice());if(appendForeignRow)adRows.push(['FOREIGN-ROW']);},
    deleteRow(row){if(failAdDelete)throw new Error('INJECTED_AD_DELETE');adRows.splice(row-1,1);deletedRows++;}
  };
  const context={
    requireSuperAdmin_:()=>true,
    clean_:v=>String(v??'').trim(),
    validHttpsUrl_:()=>true,
    parseOptionalDate_:v=>v?new Date(v):null,
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    getMpsContentSheet_:(name)=>name==='MPS Advertising Requests'?reqSheet:adsSheet,
    findMpsContentRow_:()=>2,
    MPS_AD_REQUESTS:{headers:new Array(17)},
    MPS_APPROVED_ADS:{headers:new Array(15)},
    readMpsContentRows_:()=>[],
    sheetText_:v=>String(v??''),
    Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
    CacheService:{getScriptCache:()=>({remove:()=>{}})},
    recordMpsAudit_:()=>true,
    adminRole_:()=>'SUPER_ADMIN',adminActorRef_:()=>'SUPER_ADMIN',
    safeErrorMessage_:e=>String(e&&e.message||e),
    console
  };
  vm.createContext(context);vm.runInContext(functionSource,context,{timeout:1000});
  const payload={requestId,title:'MPS Campaign',description:'Campaign description',imageUrl:'https://example.com/image.png',targetUrl:'https://example.com',placement:'Public Home',startAt:'2026-11-12',endAt:'2026-12-12'};
  return {run:()=>context.apiAdminPublishAdvertisingRequest('session',payload),request,adRows,stats:()=>({requestWriteCount,deletedRows,lockDepth})};
}

test('advertising publication commits the paid approved request and one ad row',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(h.request[12],'Published');
  assert.equal(h.adRows.length,2);assert.equal(h.adRows[1][0],result.adId);
  assert.equal(h.stats().lockDepth,0);
});
for(const failRequestWrite of [1,2]) {
  test('advertising publication rolls back ad row and request snapshot after request write '+failRequestWrite+' fails',()=>{
    const h=harness({failRequestWrite});
    assert.throws(()=>h.run(),new RegExp('Publikasi iklan gagal; perubahan proposal dan iklan sementara berhasil dibatalkan'));
    assert.equal(h.request[12],'Approved');assert.equal(h.request[14],'Paid');
    assert.equal(h.adRows.length,1);assert.equal(h.stats().deletedRows,1);
    assert.equal(h.stats().lockDepth,0);
  });
}
test('advertising publication reports incomplete rollback when request snapshot restoration fails',()=>{
  const h=harness({failRequestWrite:1,failRequestRestore:true});
  assert.throws(()=>h.run(),err=>{
    assert.match(err.message,/Publikasi iklan gagal dan rollback tidak lengkap/);
    assert.match(err.message,/status proposal: INJECTED_REQUEST_RESTORE/);
    return true;
  });
  assert.equal(h.adRows.length,1);assert.equal(h.stats().deletedRows,1);
  assert.equal(h.stats().lockDepth,0);
});
test('advertising publication preserves an unexpected last row instead of deleting another writer data',()=>{
  const h=harness({failRequestWrite:1,appendForeignRow:true});
  assert.throws(()=>h.run(),err=>{
    assert.match(err.message,/baris iklan terakhir berubah/);
    return true;
  });
  assert.equal(h.adRows.length,3);
  assert.equal(h.adRows[1][1],'AR-REQUEST-0123456789');
  assert.equal(h.adRows[2][0],'FOREIGN-ROW');
  assert.equal(h.stats().lockDepth,0);
});
