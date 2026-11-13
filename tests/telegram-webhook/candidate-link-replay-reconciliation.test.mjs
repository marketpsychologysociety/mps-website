import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
function extract(name,next){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('function '+next+'(',start+1);
  assert.ok(start>=0&&end>start,'missing source function '+name);
  return source.slice(start,end);
}
const applicationSource=extract('verifyTelegramApplication_','verifyTelegramLinkLegacy_');
const legacySource=extract('verifyTelegramLinkLegacy_','getTelegramLinksSheet_');
const headers=['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At'];
const userId='987654321';
const chatId=userId;
const msg={chat:{id:chatId,type:'private'},from:{id:Number(userId),username:'same_user',first_name:'Same'}};

function harness({kind='application',storedUser=userId,storedChat=chatId,expired=true}={}){
  const link=['hash',new Date(Date.now()-3600000),new Date(expired?Date.now()-1000:Date.now()+60000),'Terverifikasi',
    kind==='legacy'?'MPS-ABCDEF12':'','MPS-APP-0123456789ABCDEF0123',storedUser,storedChat,'same_user','Same',new Date()];
  const rows=[headers.slice(),link.slice()];
  const events=[];
  const sheet={
    getLastRow:()=>rows.length,
    getRange(row,col,nr=1,nc=1){return{
      getValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>rows[row-1+ri]?.[col-1+ci]??'')),
      getDisplayValues:()=>Array.from({length:nr},(_,ri)=>Array.from({length:nc},(_,ci)=>String(rows[row-1+ri]?.[col-1+ci]??''))),
      getValue:()=>rows[row-1]?.[col-1]??'',
      getDisplayValue:()=>String(rows[row-1]?.[col-1]??''),
      setValue:value=>{rows[row-1][col-1]=value;},
      setValues:values=>values.forEach((line,ri)=>line.forEach((value,ci)=>{rows[row-1+ri][col-1+ci]=value;}))
    };},
    appendRow:row=>rows.push(row.slice())
  };
  let lockHeld=false,lockAcquires=0,lockReleases=0;
  const context={
    console,
    MPS_MEMBER_LINKS:{headers},
    MPS_APPLICATIONS:{headers:[]},
    MPS:{headers:[]},
    MPS_COL:{},
    LockService:{getScriptLock:()=>({
      waitLock:()=>{assert.equal(lockHeld,false);lockHeld=true;lockAcquires++;},
      releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;lockReleases++;}
    })},
    getMpsMemberLinksSheet_:()=>sheet,
    findMpsMemberLinkRow_:()=>2,
    getTelegramAccessSheet_:()=>{events.push('access-read');throw Error('must not read access on replay');},
    getMpsApplicationsSheet_:()=>{events.push('application-read');throw Error('must not read application on replay');},
    getMpsDepositsSheet_:()=>{events.push('deposit-read');throw Error('must not read deposit on replay');},
    getMemberSheet_:()=>{events.push('member-read');throw Error('must not read member on replay');},
    sha256_:()=> 'hash',
    telegramSendToChat_:(...args)=>{events.push(['telegram',...args]);return{ok:true};},
    recordMpsAudit_:(...args)=>events.push(['audit',...args]),
    safeErrorMessage_:e=>String(e&&e.message||e),
    normalizeTelegram_:v=>String(v||''),
    clean_:v=>String(v||''),
    sheetText_:v=>String(v||'')
  };
  vm.createContext(context);
  vm.runInContext(kind==='application'?applicationSource:legacySource,context,{timeout:1000});
  return{
    run:()=>kind==='application'
      ?context.verifyTelegramApplication_(2,rows[1].slice(),msg)
      :context.verifyTelegramLinkLegacy_('token',msg),
    rows,events,stats:()=>({lockHeld,lockAcquires,lockReleases})
  };
}

test('application link replay from the same Telegram identity succeeds even after expiry without repeating side effects',()=>{
  const h=harness({kind:'application',expired:true});
  assert.equal(h.run(),true);
  assert.deepEqual(h.events,[]);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('application link replay from a different Telegram identity is rejected and does not mutate linked records',()=>{
  const h=harness({kind:'application',storedUser:'111111111',storedChat:'111111111'});
  assert.throws(()=>h.run(),/akun Telegram lain/);
  assert.equal(h.rows[1][6],'111111111');
  assert.equal(h.rows[1][7],'111111111');
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('legacy link replay from the same Telegram identity succeeds even after expiry without repeating side effects',()=>{
  const h=harness({kind:'legacy',expired:true});
  assert.equal(h.run(),true);
  assert.deepEqual(h.events,[]);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
test('legacy link replay from a different Telegram identity is rejected without changing the original identity',()=>{
  const h=harness({kind:'legacy',storedUser:'111111111',storedChat:'111111111'});
  assert.equal(h.run(),false);
  assert.equal(h.rows[1][6],'111111111');
  assert.equal(h.rows[1][7],'111111111');
  assert.equal(h.events.filter(x=>Array.isArray(x)&&x[0]==='telegram').length,1);
  assert.deepEqual(h.stats(),{lockHeld:false,lockAcquires:1,lockReleases:1});
});
