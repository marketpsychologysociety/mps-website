import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const legacy=[
  'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara',
  'Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun',
  'Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit',
  'Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin',
  'Waktu Konfirmasi','Terakhir Diperbarui'
];
const extended=[...legacy,'Telegram Chat ID','Telegram Link Token','Telegram Linked At',
  'PIN Hash','PIN Updated At','Telegram Link Expires At','Application Ref',
  'VIP Invite Link','VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'];

function extract(name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
const helpers=['ensureSheet_','legacySheet_','sheet_'].map(extract).join('\n');
function fakeSheet(headers,{lastRow=2}={}){
  let writes=0;
  return {
    getLastRow:()=>lastRow,
    getLastColumn:()=>headers.length,
    getRange:(row,col,rows=1,cols=1)=>({
      getDisplayValues:()=>[headers.slice(col-1,col-1+cols)],
      setValues:()=>{writes++;},
    }),
    setFrozenRows:()=>{writes++;},
    writes:()=>writes
  };
}
function context(sheet,sheets={}){
  const all={...sheets};
  const ss={getSheetByName:name=>name==='Database Member'?sheet:(all[name]||null),
    insertSheet:name=>{const made=fakeSheet([],{lastRow:0});all[name]=made;return made;}};
  const MPS={LEGACY_SHEET:'Database Member',LEGACY_HEADERS:legacy,
    LEGACY_EXTENDED_HEADERS:extended,SHEETS:{aux:{name:'Auxiliary',headers:['A','B','C']}}};
  const ctx={MPS,openDb_:()=>ss};
  vm.createContext(ctx);vm.runInContext(helpers,ctx,{timeout:1000});
  return {ctx,ss};
}

test('legacy member access accepts exact 18-column schema',()=>{
  const h=context(fakeSheet(legacy));
  assert.equal(h.ctx.legacySheet_().getLastColumn(),18);
});
test('legacy member access accepts exact 30-column v4.8 schema',()=>{
  const h=context(fakeSheet(extended));
  assert.equal(h.ctx.legacySheet_().getLastColumn(),30);
});
test('legacy member access rejects partial, oversized, and unknown trailing columns',()=>{
  for(const headers of [extended.slice(0,19),extended.slice(0,29),[...extended,'Unexpected']]){
    const h=context(fakeSheet(headers));
    assert.throws(()=>h.ctx.legacySheet_(),/Lebar Database Member tidak cocok/);
  }
});
test('legacy member access rejects a modified technical header in 30-column schema',()=>{
  const headers=extended.slice();headers[25]='Wrong VIP Invite Link';
  const h=context(fakeSheet(headers));
  assert.throws(()=>h.ctx.legacySheet_(),/Skema Database Member tidak cocok/);
});
test('auxiliary sheet access requires exact width and exact headers',()=>{
  const good=fakeSheet(['A','B','C']);
  const h=context(fakeSheet(legacy),{Auxiliary:good});
  assert.equal(h.ctx.sheet_('aux').getLastColumn(),3);
  const extra=context(fakeSheet(legacy),{Auxiliary:fakeSheet(['A','B','C','Unexpected'])});
  assert.throws(()=>extra.ctx.sheet_('aux'),/Lebar sheet Auxiliary tidak cocok/);
});
test('provisioning preflight rejects extra auxiliary columns without writing',()=>{
  const extra=fakeSheet(['A','B','C','Unexpected']);
  const h=context(fakeSheet(legacy),{Auxiliary:extra});
  assert.throws(()=>h.ctx.ensureSheet_(h.ss,{name:'Auxiliary',headers:['A','B','C']}),/Lebar sheet Auxiliary tidak cocok/);
  assert.equal(extra.writes(),0);
});
