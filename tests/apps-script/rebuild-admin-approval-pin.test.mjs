import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
function extract(name,nextName){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction '+nextName+'(',start+1);
  assert.ok(start>=0&&end>start,name+' source boundaries must exist');
  return source.slice(start,end);
}
const folderPrivacySource=extract('assertMpsDriveFolderTreePrivate_','validateMpsRebuildConfig_');
const pendingIdSource=extract('ensurePendingMemberId_','apiSubmitDeposit');
const reviewSource=extract('apiAdminReview','apiAdminReissueTelegramLink');
const pinSource=extract('apiAdminIssuePin','randomPin_');
const ref='MPS-APP-0123456789ABCDEF0123';
const chatId='987654321';
const telegramUserId='123456789';

function makeSheet(rows=[]){
  return {
    rows:rows.map(r=>r.slice()),
    appendRow(row){this.rows.push(row.slice());},
    deleteRow(row){this.rows.splice(row-1,1);},
    getLastRow(){return this.rows.length;},
    getRange(r,c,nr=1,nc=1){
      const self=this;
      return {
        getValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc));},
        getDisplayValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc).map(v=>String(v??'')));},
        getDisplayValue(){return String((self.rows[r-1]||[])[c-1]??'');},
        getValue(){return (self.rows[r-1]||[])[c-1];},
        setValue(v){if(!self.rows[r-1])self.rows[r-1]=[];self.rows[r-1][c-1]=v;},
        setValues(values){values.forEach((line,i)=>{if(!self.rows[r-1+i])self.rows[r-1+i]=[];line.forEach((v,j)=>self.rows[r-1+i][c-1+j]=v);});}
      };
    }
  };
}
function approvalHarness({plan='ACTIVE_IB',ibStatus='Terverifikasi',amount=500000,telegram=true,regularPaid=true,depositSubmitted=true}={}){
  const pendingId=(plan==='REGULAR'?regularPaid:depositSubmitted)?'MPS-ABCDEF1234':'';
  const appRow=[ref,new Date('2026-11-19T00:00:00Z'),'MPS Trader','trader_mps','Indonesia','Belajar money management','', 'Deposit Dikirim',pendingId,'',telegram?'Terhubung':'Menunggu Verifikasi Telegram',telegram?chatId:'',telegram?telegramUserId:'','',new Date()];
  const planRow=[ref,plan,new Date(),plan==='REGULAR'?100000:0,ibStatus,'','', 'Menunggu Validasi'];
  const depRow=[ref,new Date(),'MPS Trader','12345678','Standard',amount,'2026-11-19','proof-deposit','','Menunggu Validasi',chatId,telegramUserId,'',''];
  const paymentRow=[ref,new Date(),100000,'2026-11-19','proof-qris','Menunggu Validasi','',''];
  const apps=makeSheet([new Array(15).fill(''),appRow]);
  const plans=makeSheet([new Array(8).fill(''),planRow]);
  const deposits=makeSheet([new Array(14).fill(''),...(plan==='REGULAR'||!depositSubmitted?[]:[depRow])]);
  const payments=makeSheet([new Array(8).fill(''),...(regularPaid&&plan==='REGULAR'?[paymentRow]:[])]);
  const members=makeSheet([new Array(18).fill('')]);
  const ledger=makeSheet([new Array(8).fill('')]);
  const queue=makeSheet([new Array(14).fill('')]);
  const map={applications:apps,membershipPlans:plans,deposits,regularPayments:payments,membershipLedger:ledger,queue};
  const audits=[];
  let lockDepth=0,inviteQueued=0;
  const proofFolder='proof-folder';
  const proofFile={
    isTrashed:()=>false,
    getSharingAccess:()=> 'PRIVATE',
    getParents(){let used=false;return{hasNext:()=>!used,next:()=>{used=true;return{getId:()=>proofFolder};}};}
  };
  const ctx={
    MPS:{TZ:'Asia/Jakarta'},
    clean_:(v,max)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max),
    requireSession_:()=>({role:'ADMIN',actorId:'admin-test'}),
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    sheet_:key=>{if(!map[key])throw new Error('unexpected sheet '+key);return map[key];},
    legacySheet_:()=>members,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    randomHex_:()=> 'ABCDEF1234',
    audit_:(...args)=>audits.push(args),
    prop_:key=>key==='MPS_PROOF_FOLDER_ID'?proofFolder:'',
    DriveApp:{getFileById:id=>{assert.ok(['proof-deposit','proof-qris'].includes(id));return proofFile;},getFolderById:id=>({getId:()=>proofFolder,getParents:()=>({hasNext:()=>false}),getSharingAccess:()=> 'PRIVATE'}),Access:{PRIVATE:'PRIVATE'}},
    Utilities:{formatDate:(date,tz,pattern)=>'2026-11-21'},
    enqueueVipInvite_:(memberId,applicationRef,userId,chat)=>{inviteQueued++;queue.appendRow(['queue-key','VIP_INVITE:'+memberId,'CREATE_AND_SEND_INVITE','vip-group',userId,'','','PENDING',0,new Date(),'','',new Date(),new Date()]);},
    Date
  };
  vm.createContext(ctx);vm.runInContext(folderPrivacySource,ctx,{timeout:1000});vm.runInContext(pendingIdSource,ctx,{timeout:1000});vm.runInContext(reviewSource,ctx,{timeout:1000});
  return {run:(decision='APPROVE')=>ctx.apiAdminReview('admin-session',ref,decision,'Reviewed by Admin'),apps,plans,deposits,payments,members,ledger,queue,audits,stats:()=>({lockDepth,inviteQueued})};
}

test('Active IB approval issues Member ID only after IB, deposit proof, Telegram binding, and privacy checks pass',()=>{
  const h=approvalHarness();
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.status,'Disetujui');
  assert.equal(result.memberId,'MPS-ABCDEF1234');
  assert.equal(h.apps.rows[1][8],result.memberId,'approval must preserve the ID issued after proof submission');
  assert.equal(h.members.rows.length,2);
  assert.equal(h.members.rows[1][0],result.memberId);
  assert.equal(h.members.rows[1][7],'Berhasil');
  assert.equal(h.members.rows[1][11],500000);
  assert.equal(h.apps.rows[1][7],'Disetujui');
  assert.equal(h.apps.rows[1][8],result.memberId);
  assert.equal(h.deposits.rows[1][9],'Disetujui');
  assert.equal(h.plans.rows[1][7],'Aktif');
  assert.equal(h.ledger.rows.length,2);
  assert.equal(h.queue.rows.length,2);
  assert.deepEqual(h.stats(),{lockDepth:0,inviteQueued:1});
});

test('Regular approval requires a valid Rp100,000 QRIS record and linked Telegram account',()=>{
  const h=approvalHarness({plan:'REGULAR',regularPaid:true});
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.memberId,'MPS-ABCDEF1234');
  assert.equal(h.members.rows[1][11],100000);
  assert.equal(h.payments.rows[1][5],'Disetujui');
  assert.equal(h.apps.rows[1][7],'Disetujui');
});

test('Active IB approval is blocked until Exness IB status is verified',()=>{
  const h=approvalHarness({ibStatus:'Menunggu Verifikasi Manual'});
  assert.throws(()=>h.run(),/Status Exness IB harus diverifikasi Admin terlebih dahulu/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234','submitted proof already reserved the Member ID');
  assert.equal(h.plans.rows[1][7],'Menunggu Validasi');
});

test('Active IB approval rejects deposits below Rp500,000 without issuing a Member ID',()=>{
  const h=approvalHarness({amount:499999});
  assert.throws(()=>h.run(),/Deposit belum memenuhi nominal minimum/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234','submitted proof already reserved the Member ID');
});

test('Approval is blocked until the registered Telegram identity is linked',()=>{
  const h=approvalHarness({telegram:false});
  assert.throws(()=>h.run(),/Verifikasi Telegram harus berhasil/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234','submitted proof already reserved the Member ID');
});

test('Regular approval is blocked until a valid QRIS proof is submitted',()=>{
  const h=approvalHarness({plan:'REGULAR',regularPaid:false});
  assert.throws(()=>h.run(),/Bukti QRIS Regular belum tersedia/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][8],'','no payment proof means no Member ID yet');
});

test('Admin can reject an incomplete Active IB application with no deposit submitted',()=>{
  const h=approvalHarness({depositSubmitted:false,telegram:false});
  const result=h.run('REJECT');
  assert.equal(result.ok,true);
  assert.equal(result.status,'Ditolak');
  assert.equal(h.apps.rows[1][7],'Ditolak');
  assert.equal(h.plans.rows[1][7],'Ditolak');
  assert.equal(h.apps.rows[1][8],'');
  assert.equal(h.members.rows.length,1);
  assert.equal(h.stats().inviteQueued,0);
});

test('Admin rejection records rejection without issuing Member ID or VIP invite',()=>{
  const h=approvalHarness({telegram:false});
  const result=h.run('REJECT');
  assert.equal(result.ok,true);
  assert.equal(result.status,'Ditolak');
  assert.equal(h.apps.rows[1][7],'Ditolak');
  assert.equal(h.plans.rows[1][7],'Ditolak');
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234','the issued ID remains auditable after rejection');
  assert.equal(h.members.rows.length,1);
  assert.equal(h.stats().inviteQueued,0);
});

function pinHarness(active=true,linked=false){
  const memberId='MPS-ABCDEF1234';
  const memberRow=new Array(18).fill('');memberRow[0]=memberId;memberRow[7]=active?'Berhasil':'Menunggu Aktivasi';
  const members=makeSheet([new Array(18).fill(''),memberRow]);
  const appRow=new Array(15).fill('');appRow[8]=memberId;appRow[10]=linked?'Terhubung':'Belum Terhubung';appRow[12]=linked?chatId:'';
  const apps=makeSheet([new Array(15).fill(''),appRow]);
  const props={},audits=[];
  let lockDepth=0,telegramCalls=0;
  const ctx={
    clean_:(v,max)=>String(v??'').trim().slice(0,max),
    requireSession_:()=>({role:'ADMIN',actorId:'admin-test'}),
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    legacySheet_:()=>members,
    sheet_:()=>apps,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    randomPin_:()=>'123456',
    randomHex_:()=>'salt-test',
    sha256_:(value)=>'HASH:'+value,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,setProperty:(k,v)=>{props[k]=v;},setProperties:values=>Object.assign(props,values),deleteProperty:k=>{delete props[k];}})},
    sendTelegramMessage_:()=>{telegramCalls++;return true;},
    audit_:(...args)=>audits.push(args)
  };
  vm.createContext(ctx);vm.runInContext(pinSource,ctx,{timeout:1000});
  return {run:()=>ctx.apiAdminIssuePin('admin-session',memberId),props,audits,telegramCalls:()=>telegramCalls,memberId,stats:()=>({lockDepth})};
}

test('PIN can be issued only to an active approved member and plaintext is not stored in Script Properties',()=>{
  const h=pinHarness(true,false);
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.pin,'123456');
  assert.equal(result.pinDelivered,false);
  assert.equal(h.props['MPS_PIN_SALT_MPS-ABCDEF1234'],'salt-test');
  assert.equal(h.props['MPS_PIN_HASH_MPS-ABCDEF1234'],'HASH:salt-test123456');
  assert.equal(Object.values(h.props).includes('123456'),false);
  assert.equal(h.stats().lockDepth,0);
});

test('PIN is sent only to the linked Telegram chat of the approved member',()=>{
  const h=pinHarness(true,true);
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.pinDelivered,true);
  assert.equal(result.delivery,'Telegram terverifikasi');
  assert.equal(h.telegramCalls(),1);
});

test('PIN issuance is blocked for a member that is not active',()=>{
  const h=pinHarness(false,false);
  assert.throws(()=>h.run(),/PIN hanya dapat dibuat untuk member yang sudah aktif/);
  assert.deepEqual(h.props,{});
  assert.equal(h.stats().lockDepth,0);
});


test('approval rollback compensates an ambiguous ledger append failure',()=>{
  const h=approvalHarness();
  const append=h.ledger.appendRow.bind(h.ledger);
  h.ledger.appendRow=row=>{append(row);throw new Error('INJECTED_LEDGER_APPEND_AFTER_WRITE');};
  assert.throws(()=>h.run(),/INJECTED_LEDGER_APPEND_AFTER_WRITE/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][7],'Deposit Dikirim');
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234');
  assert.equal(h.deposits.rows[1][9],'Menunggu Validasi');
  assert.equal(h.plans.rows[1][7],'Menunggu Validasi');
  assert.equal(h.ledger.rows.length,1);
  assert.equal(h.queue.rows.length,1);
  assert.equal(h.stats().lockDepth,0);
});

test('approval rollback compensates an ambiguous VIP queue append failure',()=>{
  const h=approvalHarness();
  const append=h.queue.appendRow.bind(h.queue);
  h.queue.appendRow=row=>{append(row);throw new Error('INJECTED_VIP_QUEUE_APPEND_AFTER_WRITE');};
  assert.throws(()=>h.run(),/INJECTED_VIP_QUEUE_APPEND_AFTER_WRITE/);
  assert.equal(h.members.rows.length,1);
  assert.equal(h.apps.rows[1][7],'Deposit Dikirim');
  assert.equal(h.apps.rows[1][8],'MPS-ABCDEF1234');
  assert.equal(h.ledger.rows.length,1);
  assert.equal(h.queue.rows.length,1);
  assert.equal(h.stats().lockDepth,0);
});

test('rejection restores application and membership plan if plan-state write fails',()=>{
  const h=approvalHarness({depositSubmitted:false,telegram:false});
  const original=h.plans.getRange.bind(h.plans);
  let failOnce=true;
  h.plans.getRange=(row,col,nr,nc)=>{
    const range=original(row,col,nr,nc);
    const setValue=range.setValue.bind(range);
    range.setValue=value=>{
      if(col===8 && value==='Ditolak' && failOnce){failOnce=false;throw new Error('INJECTED_PLAN_REJECT_WRITE');}
      return setValue(value);
    };
    return range;
  };
  assert.throws(()=>h.run('REJECT'),/INJECTED_PLAN_REJECT_WRITE/);
  assert.equal(h.apps.rows[1][7],'Deposit Dikirim');
  assert.equal(h.plans.rows[1][7],'Menunggu Validasi');
  assert.equal(h.members.rows.length,1);
  assert.equal(h.stats().lockDepth,0);
});
