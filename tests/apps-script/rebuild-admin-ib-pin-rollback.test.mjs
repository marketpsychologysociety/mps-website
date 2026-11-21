import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
function extract(name,next){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction '+next+'(',start+1);
  assert.ok(start>=0&&end>start,name+' source boundaries must exist');
  return source.slice(start,end);
}
const pinSource=extract('apiAdminIssuePin','apiMemberLogin');
const ibSource=extract('apiAdminSetIbVerification','apiAdminReview');
const memberId='MPS-ABCDEF1234';
function sheet(rows,{failSet='',failRollback=false}={}){
  let injected=false;
  return {rows:rows.map(r=>r.slice()),getRange(row,col,nr=1,nc=1){
    const self=this;
    return {
      getValue:()=>((self.rows[row-1]||[])[col-1]),
      getDisplayValue:()=>String((self.rows[row-1]||[])[col-1]??''),
      getValues:()=>Array.from({length:nr},(_,i)=>(self.rows[row-1+i]||[]).slice(col-1,col-1+nc)),
      setValue(value){
        self.rows[row-1][col-1]=value;
        if(failSet===row+':'+col&&!injected){injected=true;throw new Error('INJECTED_SET_'+row+'_'+col);}
      },
      setValues(values){
        if(failRollback)throw new Error('INJECTED_ROLLBACK');
        values.forEach((line,i)=>line.forEach((v,j)=>{self.rows[row-1+i][col-1+j]=v;}));
      }
    };
  }};
}
function pinHarness({chatId='700001',telegramStatus='Terhubung',initialProps={},failSet=false}={}){
  const legacy=sheet([new Array(18).fill(''),[memberId,'','','','','','','Berhasil']]);
  const apps=sheet([new Array(15).fill(''),['APP1','','Trader','trader_mps','Indonesia','','','Disetujui',memberId,'',telegramStatus,'700001',chatId,'','']]);
  const values={...initialProps};let setCalls=0,sendCalls=0;
  const props={
    getProperty:key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:null,
    setProperties(input){setCalls++;if(failSet&&setCalls===1){values['MPS_PIN_SALT_'+memberId]=input['MPS_PIN_SALT_'+memberId];throw new Error('INJECTED_PIN_SET_PROPERTIES');}Object.assign(values,input);},
    setProperty:(key,value)=>{values[key]=value;},
    deleteProperty:key=>{delete values[key];}
  };
  const ctx={
    requireSession_:()=>({role:'ADMIN',actorId:'admin'}),
    clean_:(v,max)=>String(v||'').trim().slice(0,max),
    legacySheet_:()=>legacy,
    sheet_:key=>key==='applications'?apps:null,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    randomPin_:()=> '123456',
    Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789012'},
    randomHex_:()=> 'NEW_SALT',
    sha256_:v=>'HASH_'+v,
    PropertiesService:{getScriptProperties:()=>props},
    sendTelegramMessage_:()=>{sendCalls++;return true;},
    audit_:()=>{},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}
  };
  vm.createContext(ctx);vm.runInContext(pinSource,ctx,{timeout:1000});
  return {run:()=>ctx.apiAdminIssuePin('session',memberId),values,stats:()=>({setCalls,sendCalls})};
}
function ibHarness({failSet='',failRollback=false}={}){
  const ref='MPS-APP-ABCDEF1234567890ABCD';
  const plans=sheet([new Array(8).fill(''),[ref,'ACTIVE_IB',new Date(),0,'Menunggu Verifikasi','','','Menunggu Pembayaran']],{failSet,failRollback});
  const ctx={
    requireSession_:()=>({role:'ADMIN',actorId:'admin'}),
    clean_:(v,max)=>String(v||'').trim().slice(0,max),
    sheet_:key=>key==='membershipPlans'?plans:null,
    findRow_:(sh,col,value)=>{const i=sh.rows.findIndex((r,n)=>n>0&&String(r[col-1]??'')===String(value));return i<0?0:i+1;},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
    audit_:()=>{}
  };
  vm.createContext(ctx);vm.runInContext(ibSource,ctx,{timeout:1000});
  return {run:(decision='VERIFY')=>ctx.apiAdminSetIbVerification('session',ref,decision,'Bukti telah diperiksa'),plans};
}

test('PIN issuance atomically stores hash and salt and sends only to verified Telegram',()=>{
  const h=pinHarness();
  const result=h.run();
  assert.equal(result.pinDelivered,true);
  assert.equal('pin' in result,false);
  assert.equal(h.values['MPS_PIN_SALT_'+memberId],'NEW_SALT');
  assert.equal(h.values['MPS_PIN_HASH_'+memberId],'HASH_NEW_SALT123456');
  assert.deepEqual(h.stats(),{setCalls:1,sendCalls:1});
});

test('PIN fallback displays the PIN once only when Telegram is not verified',()=>{
  const h=pinHarness({chatId:'',telegramStatus:'Belum Terhubung'});
  const result=h.run();
  assert.equal(result.pinDelivered,false);
  assert.equal(result.pin,'123456');
  assert.equal(h.stats().sendCalls,0);
});

test('ambiguous PIN property write restores the previous valid hash and salt',()=>{
  const h=pinHarness({failSet:true,initialProps:{
    ['MPS_PIN_SALT_'+memberId]:'OLD_SALT',
    ['MPS_PIN_HASH_'+memberId]:'OLD_HASH'
  }});
  assert.throws(()=>h.run(),/INJECTED_PIN_SET_PROPERTIES/);
  assert.equal(h.values['MPS_PIN_SALT_'+memberId],'OLD_SALT');
  assert.equal(h.values['MPS_PIN_HASH_'+memberId],'OLD_HASH');
});

test('IB verification success writes the full status transition',()=>{
  const h=ibHarness();
  const result=h.run('VERIFY');
  assert.equal(result.ok,true);
  assert.equal(result.status,'Terverifikasi');
  assert.equal(h.plans.rows[1][4],'Terverifikasi');
  assert.equal(h.plans.rows[1][5],'admin');
  assert.equal(h.plans.rows[1][7],'Menunggu Persetujuan Admin');
});

test('partial IB verification write restores the original complete plan row',()=>{
  const h=ibHarness({failSet:'2:7'});
  const before=h.plans.rows[1].slice();
  assert.throws(()=>h.run('VERIFY'),/INJECTED_SET_2_7/);
  assert.deepEqual(h.plans.rows[1],before);
});

test('IB verification reports explicitly when compensation also fails',()=>{
  const h=ibHarness({failSet:'2:7',failRollback:true});
  assert.throws(()=>h.run('VERIFY'),/rollback tidak lengkap/i);
});
