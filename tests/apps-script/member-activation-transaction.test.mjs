import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function activateMemberAfterPin_(memberId) {');
const end=source.indexOf('function apiAdminLogin(',start+1);
assert.ok(start>=0&&end>start,'activation function boundaries must exist');
const activationSource=source.slice(start,end);

function activationHarness({legacy=false,failAt=''}={}) {
  const memberId='MPS-ABCDEF1234',applicationRef='MPS-APP-0123456789ABCDEF0123';
  const member=new Array(30).fill('');
  member[0]=memberId;member[7]='Menunggu Aktivasi';member[14]='Disetujui';member[24]=legacy?'':applicationRef;
  const app=new Array(15).fill('');
  app[0]=applicationRef;app[7]='Menunggu Aktivasi';app[8]=memberId;
  const deposit=new Array(14).fill('');
  deposit[0]=applicationRef;deposit[9]=legacy?'Menunggu Validasi Admin':'Menunggu Aktivasi';
  let failPending=!!failAt,writeCounts={member:0,app:0,deposit:0},lockDepth=0,lockReleases=0;
  function sheet(row,label) {
    return {
      getRange(r,c,nr=1,nc=1) {
        return {
          getValues:()=>[row.slice(c-1,c-1+nc)],
          getDisplayValues:()=>[row.slice(c-1,c-1+nc).map(v=>String(v??''))],
          setValue(value) {
            writeCounts[label]++;
            if(failPending&&failAt===label){failPending=false;throw new Error('INJECTED_'+label+'_WRITE');}
            row[c-1]=value;
          },
          setValues(values) {
            writeCounts[label]++;
            if(failPending&&failAt===label){failPending=false;throw new Error('INJECTED_'+label+'_WRITE');}
            for(let i=0;i<values[0].length;i++)row[c-1+i]=values[0][i];
          }
        };
      }
    };
  }
  const memberSheet=sheet(member,'member'),appSheet=sheet(app,'app'),depositSheet=sheet(deposit,'deposit');
  const props={
    ['MPS_PIN_DELIVERED_'+memberId]:'1',
    ['MPS_PIN_'+memberId]:'salt$hash'
  };
  const context={
    MPS:{headers:new Array(30)},MPS_COL:{registrationStatus:8,depositStatus:15},
    MPS_APPLICATIONS:{headers:new Array(15)},MPS_DEPOSITS:{headers:new Array(14)},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;lockReleases++;}})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>props[key]||''})},
    CacheService:{getScriptCache:()=>({remove:()=>{}})},
    openDatabase_:()=>({getSheetByName:()=>appSheet}),
    getMemberSheet_:()=>memberSheet,getMpsApplicationsSheet_:()=>appSheet,getMpsDepositsSheet_:()=>depositSheet,
    findMemberById_:()=>2,findMpsApplicationRowByMember_:()=>2,findMpsDepositRow_:()=>2,
    pinPropertyKey_:id=>'MPS_PIN_'+id,
    safeErrorMessage_:e=>String(e&&e.message||e),
    console
  };
  vm.createContext(context);vm.runInContext(activationSource,context,{timeout:1000});
  return {run:()=>context.activateMemberAfterPin_(memberId),member,app,deposit,stats:()=>({writeCounts,lockDepth,lockReleases})};
}

test('new 4.8 member activation commits member, application, and deposit together',()=>{
  const h=activationHarness();
  assert.equal(h.run(),true);
  assert.equal(h.member[7],'Berhasil');assert.equal(h.app[7],'Berhasil');assert.equal(h.deposit[9],'Berhasil');
  assert.deepEqual(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
});
test('legacy member activation also updates its linked application and deposit rows',()=>{
  const h=activationHarness({legacy:true});
  assert.equal(h.run(),true);
  assert.equal(h.member[7],'Berhasil');assert.equal(h.app[7],'Berhasil');assert.equal(h.deposit[9],'Berhasil');
});
for (const failAt of ['member','app','deposit']) {
  test('activation restores all sheet snapshots when '+failAt+' write fails',()=>{
    const h=activationHarness({failAt});
    assert.throws(()=>h.run(),new RegExp('INJECTED_'+failAt+'_WRITE'));
    assert.equal(h.member[7],'Menunggu Aktivasi');
    assert.equal(h.app[7],'Menunggu Aktivasi');
    assert.equal(h.deposit[9],failAt==='deposit'?'Menunggu Aktivasi':'Menunggu Aktivasi');
    assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
  });
}
