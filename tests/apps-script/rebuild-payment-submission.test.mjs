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
const depositSource=extract('apiSubmitDeposit','apiSubmitRegularPayment');
const regularSource=extract('apiSubmitRegularPayment','apiAdminLogin');

function makeSheet(rows=[]){
  return {
    rows:rows.map(r=>r.slice()),
    appendRow(row){this.rows.push(row.slice());},
    getRange(r,c,nr=1,nc=1){
      const self=this;
      return {
        getValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc));},
        getDisplayValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc).map(v=>String(v??'')));},
        getDisplayValue(){return String((self.rows[r-1]||[])[c-1]??'');},
        setValue(v){if(!self.rows[r-1])self.rows[r-1]=[];self.rows[r-1][c-1]=v;}
      };
    }
  };
}
const ref='MPS-APP-0123456789ABCDEF0123';
const testDate='2026-11-20';
function harness(plan='ACTIVE_IB'){
  const apps=makeSheet([new Array(15).fill(''),[ref,new Date('2026-11-19T00:00:00Z'),'MPS Trader','trader_mps','Indonesia','Belajar money management','', 'Menunggu Pendaftaran','','','Belum Terhubung','','','','']]);
  const plans=makeSheet([new Array(8).fill(''),[ref,plan,new Date(),plan==='REGULAR'?100000:0,'','','','Menunggu Pembayaran']]);
  const deposits=makeSheet([new Array(14).fill('')]);
  const regular=makeSheet([new Array(8).fill('')]);
  const files=[];
  const file={
    id:'proof-file-'+plan,shared:'',trashed:false,
    setSharing(access,permission){this.shared=access+':'+permission;},
    getId(){return this.id;},
    getSharingAccess(){return this.shared.split(':')[0];},
    isTrashed(){return this.trashed;}
  };
  const folder={
    getId:()=> 'proof-folder',
    getParents:()=>({hasNext:()=>false}),
    getSharingAccess:()=> 'PRIVATE',
    createFile(blob){files.push({blob,file});return file;}
  };
  const sheetMap={applications:apps,membershipPlans:plans,deposits,regularPayments:regular};
  let linkCalls=0,telegramCalls=0,lockDepth=0;
  const context={
    MPS:{TZ:'Asia/Jakarta'},
    clean_:(v,max)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max),
    cleanUsername_:v=>String(v||'').replace(/^@/,'').trim().toLowerCase(),
    enforceRateLimit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    sheet_:key=>{if(!sheetMap[key])throw new Error('unexpected sheet '+key);return sheetMap[key];},
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    prop_:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':key==='MPS_TELEGRAM_CHAT_ID'?'admin-chat':'',
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFolderById:id=>{assert.equal(id,'proof-folder');return folder;}},
    Utilities:{
      base64Decode:()=>new Uint8Array([137,80,78,71,13,10,26,10]),
      newBlob:(bytes,mime,name)=>({bytes,mime,name}),
      formatDate:(date,tz,pattern)=>new Date(date.getTime()+7*60*60*1000).toISOString().slice(0,10)
    },
    isAllowedImageBytes_:()=>true,
    createTelegramLink_:()=>{linkCalls++;return{url:'https://t.me/MPS_Notificationnew_bot?start=token',expiresAt:'2026-11-20T12:15:00+07:00'};},
    sendTelegramMessage_:()=>{telegramCalls++;return true;},
    audit_:()=>{},
    Date
  };
  vm.createContext(context);
  vm.runInContext(folderPrivacySource,context,{timeout:1000});
  vm.runInContext(depositSource,context,{timeout:1000});
  vm.runInContext(regularSource,context,{timeout:1000});
  return {context,apps,plans,deposits,regular,files,file,stats:()=>({linkCalls,telegramCalls,lockDepth})};
}
const proof={proofMime:'image/png',proofBase64:'iVBORw0KGgo='};

test('Active IB deposit submission accepts the Rp500,000 minimum, stores private proof, and requests Telegram linking',()=>{
  const h=harness('ACTIVE_IB');
  const result=h.context.apiSubmitDeposit({applicationRef:ref,accountName:'MPS Trader',mt5Login:'12345678',accountType:'Standard',amount:500000,depositDate:testDate,...proof});
  assert.equal(result.ok,true);
  assert.equal(result.status,'Menunggu Validasi Admin');
  assert.equal(h.deposits.rows.length,2);
  assert.equal(h.deposits.rows[1][5],500000);
  assert.equal(h.deposits.rows[1][9],'Menunggu Validasi');
  assert.equal(h.file.shared,'PRIVATE:NONE');
  assert.equal(h.apps.rows[1][7],'Deposit Dikirim');
  assert.equal(h.apps.rows[1][10],'Menunggu Verifikasi Telegram');
  assert.equal(result.telegramLinkAvailable,true);
  assert.deepEqual(h.stats(),{linkCalls:1,telegramCalls:1,lockDepth:0});
});

test('Active IB deposit below Rp500,000 is rejected before Drive or sheet writes',()=>{
  const h=harness('ACTIVE_IB');
  assert.throws(()=>h.context.apiSubmitDeposit({applicationRef:ref,accountName:'MPS Trader',mt5Login:'12345678',accountType:'Standard',amount:499999,depositDate:testDate,...proof}),/di bawah Rp500.000/);
  assert.equal(h.deposits.rows.length,1);
  assert.equal(h.files.length,0);
  assert.equal(h.apps.rows[1][7],'Menunggu Pendaftaran');
  assert.equal(h.stats().linkCalls,0);
});

test('Exness deposit endpoint rejects Regular applications without creating proof files',()=>{
  const h=harness('REGULAR');
  assert.throws(()=>h.context.apiSubmitDeposit({applicationRef:ref,accountName:'MPS Trader',mt5Login:'12345678',accountType:'Standard',amount:500000,depositDate:testDate,...proof}),/hanya untuk Active IB Member/);
  assert.equal(h.deposits.rows.length,1);
  assert.equal(h.files.length,0);
});

test('Regular QRIS submission accepts exactly Rp100,000 and stores proof privately',()=>{
  const h=harness('REGULAR');
  const result=h.context.apiSubmitRegularPayment({applicationRef:ref,amount:100000,paymentDate:testDate,...proof});
  assert.equal(result.ok,true);
  assert.equal(result.status,'Menunggu Validasi Pembayaran');
  assert.equal(h.regular.rows.length,2);
  assert.equal(h.regular.rows[1][2],100000);
  assert.equal(h.regular.rows[1][5],'Menunggu Validasi');
  assert.equal(h.file.shared,'PRIVATE:NONE');
  assert.equal(h.apps.rows[1][7],'Pembayaran Dikirim');
  assert.equal(result.telegramLinkAvailable,true);
  assert.deepEqual(h.stats(),{linkCalls:1,telegramCalls:1,lockDepth:0});
});

test('Regular QRIS submission rejects any amount other than Rp100,000 before writes',()=>{
  const h=harness('REGULAR');
  assert.throws(()=>h.context.apiSubmitRegularPayment({applicationRef:ref,amount:99999,paymentDate:testDate,...proof}),/tepat Rp100.000/);
  assert.equal(h.regular.rows.length,1);
  assert.equal(h.files.length,0);
  assert.equal(h.apps.rows[1][7],'Menunggu Pendaftaran');
});

test('Regular QRIS endpoint rejects Active IB applications without creating proof files',()=>{
  const h=harness('ACTIVE_IB');
  assert.throws(()=>h.context.apiSubmitRegularPayment({applicationRef:ref,amount:100000,paymentDate:testDate,...proof}),/hanya untuk pendaftar Regular Member/);
  assert.equal(h.regular.rows.length,1);
  assert.equal(h.files.length,0);
});
