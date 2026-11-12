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
  const failRules=Array.isArray(failAt)?failAt.slice():failAt?[String(failAt)+':1']:[];
  let writeCounts={member:0,app:0,deposit:0},lockDepth=0,lockReleases=0;
  function sheet(row,label) {
    return {
      getRange(r,c,nr=1,nc=1) {
        return {
          getValues:()=>[row.slice(c-1,c-1+nc)],
          getDisplayValues:()=>[row.slice(c-1,c-1+nc).map(v=>String(v??''))],
          setValue(value) {
            writeCounts[label]++;
            row[c-1]=value;
            const rule=label+':'+writeCounts[label],at=failRules.indexOf(rule);
            if(at>=0){failRules.splice(at,1);throw new Error('INJECTED_'+rule+'_WRITE');}
          },
          setValues(values) {
            writeCounts[label]++;
            for(let i=0;i<values[0].length;i++)row[c-1+i]=values[0][i];
            const rule=label+':'+writeCounts[label],at=failRules.indexOf(rule);
            if(at>=0){failRules.splice(at,1);throw new Error('INJECTED_'+rule+'_WRITE');}
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
  test('activation restores all sheet snapshots when '+failAt+' write fails after mutation',()=>{
    const h=activationHarness({failAt});
    assert.throws(()=>h.run(),new RegExp('INJECTED_'+failAt+':1_WRITE'));
    assert.equal(h.member[7],'Menunggu Aktivasi');
    assert.equal(h.app[7],'Menunggu Aktivasi');
    assert.equal(h.deposit[9],'Menunggu Aktivasi');
    assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
  });
}
for (const rollbackTarget of ['member','app','deposit']) {
  test('activation reports incomplete rollback when '+rollbackTarget+' snapshot restoration fails',()=>{
    const rollbackWrite=rollbackTarget==='app'?3:2;
    const h=activationHarness({failAt:['deposit:1',rollbackTarget+':'+rollbackWrite]});
    assert.throws(()=>h.run(),err=>{
      assert.match(err.message,/Aktivasi gagal dan rollback tidak lengkap/);
      assert.match(err.message,new RegExp(rollbackTarget+': INJECTED_'+rollbackTarget+':2_WRITE'));
      return true;
    });
    assert.equal(h.stats().lockDepth,0);assert.equal(h.stats().lockReleases,1);
  });
}

const legacyStart=source.indexOf('function adminVerifyLegacy_(session, memberId, decision, adminNote) {');
const legacyEnd=source.indexOf('function apiAdminVerify(',legacyStart+1);
assert.ok(legacyStart>=0&&legacyEnd>legacyStart,'legacy verification function boundaries must exist');
const legacyVerifySource=source.slice(legacyStart,legacyEnd);

function legacyRejectHarness({failAt=''}={}) {
  const memberId='MPS-OLD12345',appRef='MPS-APP-0123456789ABCDEF0123';
  const member=new Array(30).fill('');member[0]=memberId;member[2]='Legacy Member';member[7]='Menunggu Aktivasi';member[11]=1000000;member[14]='Menunggu verifikasi';
  const app=new Array(15).fill('');app[0]=appRef;app[7]='Menunggu Validasi Admin';app[8]=memberId;app[10]='Terverifikasi';
  const access=[memberId,'987654321','987654321','@legacy_user','Legacy',true,'Menunggu','','','',''];
  let failed=false,lockDepth=0;
  function sheet(row,label) {
    return {getRange(r,c,nr=1,nc=1){return{
      getValues:()=>[row.slice(c-1,c-1+nc)],
      getDisplayValue:()=>String(row[c-1]??''),
      setValue(v){if(!failed&&failAt===label){row[c-1]=v;failed=true;throw new Error('INJECTED_'+label+'_WRITE');}row[c-1]=v;},
      setValues(values){if(!failed&&failAt===label){values[0].forEach((v,i)=>row[c-1+i]=v);failed=true;throw new Error('INJECTED_'+label+'_WRITE');}values[0].forEach((v,i)=>row[c-1+i]=v);}
    };}};
  }
  const memberSheet=sheet(member,'member'),appSheet=sheet(app,'app'),accessSheet=sheet(access,'access');
  const context={
    MPS:{headers:new Array(30)},MPS_COL:{registrationStatus:8,depositStatus:15,updatedAt:18,nickname:3},
    MPS_APPLICATIONS:{headers:new Array(15)},
    requireAdmin_:()=>true,clean_:v=>String(v??'').slice(0,500).trim().toUpperCase()==='MPS-OLD12345'?'MPS-OLD12345':String(v??'').slice(0,500).trim(),
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    getMemberSheet_:()=>memberSheet,findMemberById_:()=>2,
    getTelegramAccessSheet_:()=>accessSheet,findTelegramAccessByMemberId_:()=>2,
    getMpsApplicationsSheet_:()=>appSheet,findMpsApplicationRowByMember_:()=>2,
    formatMemberRow_:()=>{},CacheService:{getScriptCache:()=>({remove:()=>{}})},
    sendTelegram_:()=>({ok:true}),recordMpsAudit_:()=>{},adminRole_:()=>'ADMIN',adminActorRef_:()=>'ADMIN',
    safeErrorMessage_:e=>String(e&&e.message||e),sheetText_:v=>String(v??''),console
  };
  vm.createContext(context);vm.runInContext(legacyVerifySource,context,{timeout:1000});
  return {run:()=>context.adminVerifyLegacy_('session',memberId,'reject','Dokumen tidak valid'),member,app,access,stats:()=>({lockDepth})};
}
test('legacy rejection synchronizes member, application, and Telegram access states',()=>{
  const h=legacyRejectHarness();
  const result=h.run();
  assert.equal(result.ok,true);assert.equal(h.member[7],'Ditolak');assert.equal(h.member[14],'Ditolak');
  assert.equal(h.app[7],'Deposit Ditolak');assert.equal(h.access[6],'Akses Ditolak');
  assert.equal(h.stats().lockDepth,0);
});
for (const failAt of ['member','app','access']) {
  test('legacy rejection restores all snapshots when '+failAt+' write fails after partial mutation',()=>{
    const h=legacyRejectHarness({failAt});
    assert.throws(()=>h.run(),new RegExp('INJECTED_'+failAt+'_WRITE'));
    assert.equal(h.member[7],'Menunggu Aktivasi');assert.equal(h.member[14],'Menunggu verifikasi');
    assert.equal(h.app[7],'Menunggu Validasi Admin');assert.equal(h.access[6],'Menunggu');
    assert.equal(h.stats().lockDepth,0);
  });
}
