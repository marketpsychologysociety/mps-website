import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function apiAdminCreateBackup(session) {');
const end=source.indexOf('\nfunction ',start+1);
assert.ok(start>=0&&end>start,'database backup function boundaries must exist');
const functionSource=source.slice(start,end);

function harness({privacyFailure=false,metadataFailure=false,trashFailure=false,sourcePrivate=true}={}) {
  const state={trashed:false,sharing:privacyFailure?'PUBLIC':'PRIVATE'},props={MPS_SPREADSHEET_ID:'source-db',MPS_LAST_BACKUP_ID:'old-backup',MPS_LAST_BACKUP_AT:'old-time'};
  let atWrites=0;
  const copy={
    setSharing(access,permission){if(!privacyFailure)this.sharing=access;},
    getSharingAccess(){return state.sharing;},
    setTrashed(value){if(trashFailure)throw new Error('INJECTED_TRASH_FAILURE');state.trashed=value;},
    getId:()=>'new-backup',
    getName:()=>'MPS DATABASE BACKUP 20261112-000000',
    getUrl:()=>'https://drive.google.test/spreadsheets/new-backup'
  };
  const sourceFile={getSharingAccess:()=>sourcePrivate?'PRIVATE':'ANYONE',makeCopy:()=>copy};
  const scriptProps={
    getProperty:key=>props[key]||'',
    setProperty(key,value){
      if(metadataFailure&&key==='MPS_LAST_BACKUP_AT'&&atWrites++===0)throw new Error('INJECTED_METADATA_FAILURE');
      props[key]=value;
    },
    deleteProperty:key=>{delete props[key];}
  };
  const context={
    requireSuperAdmin_:()=>true,
    consumeRateLimit_:()=>true,
    PropertiesService:{getScriptProperties:()=>scriptProps},
    MPS:{sheetName:'Database Member',headers:['ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui']},
    SpreadsheetApp:{openById:()=>({getSheetByName:name=>name==='Database Member'?{
      getLastRow:()=>1,getLastColumn:()=>18,
      getRange:()=>({getDisplayValues:()=>[['ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui']]})
    }:null})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFileById:()=>sourceFile},
    Utilities:{formatDate:()=> '20261112-000000'},
    recordMpsAudit_:()=>true,
    adminRole_:()=>'SUPER_ADMIN',adminActorRef_:()=>'SUPER_ADMIN',
    safeErrorMessage_:e=>String(e&&e.message||e)
  };
  vm.createContext(context);vm.runInContext(functionSource,context,{timeout:1000});
  return {run:()=>context.apiAdminCreateBackup('session'),props,state,copy};
}

test('database backup creates a private copy and updates backup metadata',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(result.backupId,'new-backup');
  assert.equal(h.state.sharing,'PRIVATE');assert.equal(h.props.MPS_LAST_BACKUP_ID,'new-backup');
  assert.ok(h.props.MPS_LAST_BACKUP_AT);assert.equal(h.state.trashed,false);
});
test('backup is rejected and temporary copy trashed when privacy cannot be verified',()=>{
  const h=harness({privacyFailure:true});
  assert.throws(()=>h.run(),/akses file tidak dapat dipastikan PRIVATE/);
  assert.equal(h.state.trashed,true);assert.equal(h.props.MPS_LAST_BACKUP_ID,'old-backup');
  assert.equal(h.props.MPS_LAST_BACKUP_AT,'old-time');
});
test('backup metadata failure restores previous properties and trashes the temporary copy',()=>{
  const h=harness({metadataFailure:true});
  assert.throws(()=>h.run(),/metadata Script Properties gagal disimpan/);
  assert.equal(h.props.MPS_LAST_BACKUP_ID,'old-backup');
  assert.equal(h.props.MPS_LAST_BACKUP_AT,'old-time');
  assert.equal(h.state.trashed,true);
});
test('backup reports incomplete rollback if temporary private copy cannot be trashed',()=>{
  const h=harness({metadataFailure:true,trashFailure:true});
  assert.throws(()=>h.run(),err=>{
    assert.match(err.message,/Backup dibuat tetapi penyimpanan metadata gagal dan rollback tidak lengkap/);
    assert.match(err.message,/INJECTED_TRASH_FAILURE/);
    return true;
  });
  assert.equal(h.state.trashed,false);
});
test('backup refuses to copy a database spreadsheet that is not private',()=>{
  const h=harness({sourcePrivate:false});
  assert.throws(()=>h.run(),/Database spreadsheet tidak PRIVATE/);
  assert.equal(h.props.MPS_LAST_BACKUP_ID,'old-backup');
});
