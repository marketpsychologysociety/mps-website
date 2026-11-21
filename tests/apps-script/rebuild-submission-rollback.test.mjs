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
const registerSource=extract('apiRegister','apiSubmitDeposit');
const depositSource=extract('apiSubmitDeposit','apiSubmitRegularPayment');
const paymentSource=extract('apiSubmitRegularPayment','apiAdminLogin');
const linkSource=extract('createTelegramLink_','handleTelegramStart_');
const ref='MPS-APP-0123456789ABCDEF0123';
const proofBytes=new Uint8Array([137,80,78,71,13,10,26,10]);

function makeSheet(rows=[],name='',faults={}){
  return {
    name,rows:rows.map(r=>r.slice()),
    appendRow(row){
      this.rows.push(row.slice());
      if(faults.appendAfter===name&&!faults.appendAfterUsed){faults.appendAfterUsed=true;throw new Error('INJECTED_'+name+'_APPEND_AFTER_WRITE');}
    },
    deleteRow(row){
      if(faults.delete===name&&!faults.deleteUsed){faults.deleteUsed=true;throw new Error('INJECTED_'+name+'_DELETE');}
      this.rows.splice(row-1,1);
    },
    getLastRow(){return this.rows.length;},
    getRange(r,c,nr=1,nc=1){
      const self=this;
      return {
        getValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc));},
        getDisplayValues(){return Array.from({length:nr},(_,i)=>(self.rows[r-1+i]||[]).slice(c-1,c-1+nc).map(v=>String(v??'')));},
        getDisplayValue(){return String((self.rows[r-1]||[])[c-1]??'');},
        getValue(){return (self.rows[r-1]||[])[c-1];},
        setValue(v){
          if(!self.rows[r-1])self.rows[r-1]=[];
          self.rows[r-1][c-1]=v;
          const key=name+':'+r+':'+c;
          if(faults.setAfter===key&&!faults.setAfterUsed){faults.setAfterUsed=true;throw new Error('INJECTED_'+key+'_AFTER_WRITE');}
        },
        setValues(values){
          values.forEach((line,i)=>{if(!self.rows[r-1+i])self.rows[r-1+i]=[];line.forEach((v,j)=>self.rows[r-1+i][c-1+j]=v);});
          const key=name+':'+r+':'+c;
          if(faults.setAfter===key&&!faults.setAfterUsed){faults.setAfterUsed=true;throw new Error('INJECTED_'+key+'_AFTER_WRITE');}
        }
      };
    }
  };
}
function harness({plan='ACTIVE_IB',faults={}}={}){
  const applications=makeSheet([new Array(15).fill('')], 'applications',faults);
  const plans=makeSheet([new Array(8).fill('')], 'membershipPlans',faults);
  const deposits=makeSheet([new Array(14).fill('')],'deposits',faults);
  const payments=makeSheet([new Array(8).fill('')],'regularPayments',faults);
  const links=makeSheet([new Array(11).fill('')],'links',faults);
  const files=[];
  const file={
    id:'proof-file-'+plan,trashed:false,sharing:'',
    getId(){return this.id;},
    setSharing(access,permission){this.sharing=access+':'+permission;},
    getSharingAccess(){return this.sharing.split(':')[0];},
    setTrashed(v){this.trashed=v;},
    isTrashed(){return this.trashed;}
  };
  const folder={
    getSharingAccess:()=> 'PRIVATE',
    createFile(){files.push(file);return file;}
  };
  const map={applications, membershipPlans:plans, deposits, regularPayments:payments, links};
  let lockDepth=0,telegramCalls=0;
  const ctx={
    MPS:{TZ:'Asia/Jakarta'},
    clean_:(v,max)=>String(v==null?'':v).replace(/[<>]/g,'').trim().slice(0,max),
    cleanUsername_:v=>String(v||'').replace(/^@/,'').trim().toLowerCase(),
    enforceRateLimit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockDepth,0);lockDepth++;},releaseLock:()=>{lockDepth--;}})},
    sheet_:key=>{if(!map[key])throw new Error('unexpected sheet '+key);return map[key];},
    rows_:sh=>sh.rows,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    prop_:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':key==='MPS_TELEGRAM_BOT_USERNAME'?'MPS_Notificationnew_bot':key==='MPS_TELEGRAM_CHAT_ID'?'admin-chat':'',
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFolderById:()=>folder},
    Utilities:{
      base64Decode:()=>proofBytes,
      newBlob:(bytes,mime,name)=>({bytes,mime,name}),
      formatDate:(date)=>new Date(date.getTime()+7*60*60*1000).toISOString().slice(0,10)
    },
    isAllowedImageBytes_:()=>true,
    randomHex_:n=>n===20?'0123456789ABCDEF0123':'ABCDEF1234567890ABCDEF1234567890',
    sha256_:v=>'HASH_'+v,
    createTelegramLink_:undefined,
    sendTelegramMessage_:()=>{telegramCalls++;return true;},
    audit_:()=>{},
    Date
  };
  vm.createContext(ctx);
  vm.runInContext(folderPrivacySource,ctx,{timeout:1000});
  vm.runInContext(registerSource,ctx,{timeout:1000});
  vm.runInContext(depositSource,ctx,{timeout:1000});
  vm.runInContext(paymentSource,ctx,{timeout:1000});
  vm.runInContext(linkSource,ctx,{timeout:1000});
  return {ctx,applications,plans,deposits,payments,links,files,file,stats:()=>({lockDepth,telegramCalls})};
}
const registration={nickname:'Trader MPS',telegramUsername:'@trader_mps',country:'Indonesia',goal:'Belajar money management',note:'',plan:'REGULAR'};
const proof={proofMime:'image/png',proofBase64:'iVBORw0KGgo='};
const depositInput={applicationRef:ref,accountName:'MPS Trader',mt5Login:'12345678',accountType:'Standard',amount:500000,depositDate:'2026-11-20',...proof};
const paymentInput={applicationRef:ref,amount:100000,paymentDate:'2026-11-20',...proof};

test('registration compensates an ambiguous membership-plan append failure',()=>{
  const h=harness({faults:{appendAfter:'membershipPlans'}});
  assert.throws(()=>h.ctx.apiRegister(registration),/INJECTED_membershipPlans_APPEND_AFTER_WRITE/);
  assert.equal(h.applications.rows.length,1);
  assert.equal(h.plans.rows.length,1);
  assert.deepEqual(h.stats(),{lockDepth:0,telegramCalls:0});
});

test('Active IB deposit compensates an ambiguous deposit append failure and trashes orphan proof',()=>{
  const h=harness({faults:{appendAfter:'deposits'}});
  h.ctx.apiRegister({...registration,plan:'ACTIVE_IB'});
  assert.throws(()=>h.ctx.apiSubmitDeposit(depositInput),/INJECTED_deposits_APPEND_AFTER_WRITE/);
  assert.equal(h.deposits.rows.length,1);
  assert.equal(h.applications.rows[1][7],'Menunggu Pendaftaran');
  assert.equal(h.links.rows.length,1);
  assert.equal(h.file.trashed,true);
  assert.deepEqual(h.stats(),{lockDepth:0,telegramCalls:0});
});

test('Active IB deposit compensates a partial application-state write and cancels its Telegram link',()=>{
  const h=harness({faults:{setAfter:'applications:2:8'}});
  h.ctx.apiRegister({...registration,plan:'ACTIVE_IB'});
  assert.throws(()=>h.ctx.apiSubmitDeposit(depositInput),/INJECTED_applications:2:8_AFTER_WRITE/);
  assert.equal(h.deposits.rows.length,1);
  assert.equal(h.applications.rows[1][7],'Menunggu Pendaftaran');
  assert.equal(h.links.rows.length,2);
  assert.equal(h.links.rows[1][3],'CANCELLED');
  assert.equal(h.file.trashed,true);
});

test('Regular QRIS submission restores plan and application after an ambiguous plan update',()=>{
  const h=harness({plan:'REGULAR',faults:{setAfter:'membershipPlans:2:8'}});
  h.ctx.apiRegister(registration);
  assert.throws(()=>h.ctx.apiSubmitRegularPayment(paymentInput),/INJECTED_membershipPlans:2:8_AFTER_WRITE/);
  assert.equal(h.payments.rows.length,1);
  assert.equal(h.plans.rows[1][7],'Menunggu Pembayaran / Verifikasi');
  assert.equal(h.applications.rows[1][7],'Menunggu Pendaftaran');
  assert.equal(h.links.rows.length,2);
  assert.equal(h.links.rows[1][3],'CANCELLED');
  assert.equal(h.file.trashed,true);
});

test('rollback failure preserves private proof and raises an explicit reconciliation error',()=>{
  const h=harness({faults:{appendAfter:'deposits',delete:'deposits'}});
  h.ctx.apiRegister({...registration,plan:'ACTIVE_IB'});
  assert.throws(()=>h.ctx.apiSubmitDeposit(depositInput),err=>{
    assert.match(err.message,/rollback tidak lengkap/i);
    assert.equal(err.preserveProofFile,true);
    return true;
  });
  assert.equal(h.deposits.rows.length,2,'failed compensation leaves the evidence row for manual reconciliation');
  assert.equal(h.file.trashed,false,'proof is preserved privately when its database row cannot be removed');
});
