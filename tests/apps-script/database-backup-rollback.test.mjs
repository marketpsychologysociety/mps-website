import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function apiAdminCreateBackup(session) {');
const end=source.indexOf('\nfunction assertSheetHeaders_',start);
assert.ok(start>=0&&end>start,'database backup function boundaries must exist');
const functionSource=source.slice(start,end);

const legacyHeaders=['ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui'];
const appendedHeaders=['Kolom 19','Kolom 20','Kolom 21','Kolom 22','Kolom 23','Kolom 24','Kolom 25','Kolom 26','Kolom 27','Kolom 28','Kolom 29','Kolom 30'];

function harness({
  privacyFailure=false,metadataFailure=false,trashFailure=false,sourcePrivate=true,
  memberColumns=18,backupColumns=memberColumns,sourceRows=2,backupRows=sourceRows,
  backupHeaderMismatch=false,backupDataMismatch=false
}={}) {
  const state={trashed:false,sharing:privacyFailure?'PUBLIC':'PRIVATE'};
  const props={MPS_SPREADSHEET_ID:'source-db',MPS_LAST_BACKUP_ID:'old-backup',MPS_LAST_BACKUP_AT:'old-time'};
  let atWrites=0;
  function makeMemberSheet(columns,rows,{headerMismatch=false,dataMismatch=false}={}) {
    const headers=(memberColumns===30?legacyHeaders.concat(appendedHeaders):legacyHeaders).slice(0,columns);
    if(headerMismatch&&headers.length)headers[headers.length-1]='WRONG HEADER';
    const values=[headers,Array(columns).fill(dataMismatch?'tampered-row':'member-row')].slice(0,rows);
    const formulas=values.map(line=>line.map(()=>'')); 
    return {
      getName:()=>'Database Member',
      getLastRow:()=>rows,
      getLastColumn:()=>columns,
      getRange:(row,col,nr=1,nc=1)=>({
        getDisplayValues:()=>row===1&&nr===1?[headers.slice(col-1,col-1+nc)]:values.slice(row-1,row-1+nr).map(line=>line.slice(col-1,col-1+nc).map(v=>String(v??''))),
        getValues:()=>values.slice(row-1,row-1+nr).map(line=>line.slice(col-1,col-1+nc)),
        getFormulas:()=>formulas.slice(row-1,row-1+nr).map(line=>line.slice(col-1,col-1+nc))
      })
    };
  }
  const sourceMembers=makeMemberSheet(memberColumns,sourceRows);
  const backupMembers=makeMemberSheet(backupColumns,backupRows,{headerMismatch:backupHeaderMismatch,dataMismatch:backupDataMismatch});
  const sourceBook={getSheetByName:name=>name==='Database Member'?sourceMembers:null,getSheets:()=>[sourceMembers]};
  const backupBook={getSheetByName:name=>name==='Database Member'?backupMembers:null,getSheets:()=>[backupMembers]};
  const copy={
    setSharing(access,permission){if(!privacyFailure)state.sharing=access;},
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
  function hash(value){
    const text=String(value);let h=2166136261;
    for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(16).padStart(8,'0');
  }
  const context={
    requireSuperAdmin_:()=>true,
    consumeRateLimit_:()=>true,
    PropertiesService:{getScriptProperties:()=>scriptProps},
    MPS:{sheetName:'Database Member',headers:memberColumns===30?legacyHeaders.concat(appendedHeaders):legacyHeaders},
    SpreadsheetApp:{openById:id=>id==='source-db'?sourceBook:backupBook},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFileById:()=>sourceFile},
    Utilities:{formatDate:()=> '20261112-000000'},
    sha256_:hash,
    recordMpsAudit_:()=>true,
    adminRole_:()=>'SUPER_ADMIN',adminActorRef_:()=>'SUPER_ADMIN',
    safeErrorMessage_:e=>String(e&&e.message||e)
  };
  vm.createContext(context);vm.runInContext(functionSource,context,{timeout:1000});
  return {run:()=>context.apiAdminCreateBackup('session'),props,state,copy};
}

test('database backup creates a private copy and updates backup metadata for legacy 18-column schema',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(result.backupId,'new-backup');
  assert.equal(h.state.sharing,'PRIVATE');assert.equal(h.props.MPS_LAST_BACKUP_ID,'new-backup');
  assert.ok(h.props.MPS_LAST_BACKUP_AT);assert.equal(h.state.trashed,false);
});

test('database backup verifies all 30 v4.8 member columns and complete member fingerprint',()=>{
  const h=harness({memberColumns:30});
  const result=h.run();
  assert.equal(result.ok,true);assert.equal(result.backupId,'new-backup');
  assert.match(result.message,/integritas Database Member diverifikasi/);
  assert.equal(h.state.trashed,false);
});

test('backup rejects a copy that omits appended v4.8 member columns',()=>{
  const h=harness({memberColumns:30,backupColumns:18});
  assert.throws(()=>h.run(),/Dimensi sheet Database Member berbeda dari sumber/);
  assert.equal(h.state.trashed,true);
  assert.equal(h.props.MPS_LAST_BACKUP_ID,'old-backup');
});

test('backup rejects a copy with an incomplete member row count',()=>{
  const h=harness({memberColumns:30,backupRows:1});
  assert.throws(()=>h.run(),/Dimensi sheet Database Member berbeda dari sumber/);
  assert.equal(h.state.trashed,true);
});

test('backup rejects a copy with changed member data fingerprint',()=>{
  const h=harness({memberColumns:30,backupDataMismatch:true});
  assert.throws(()=>h.run(),/Fingerprint isi Database Member/);
  assert.equal(h.state.trashed,true);
});

test('backup rejects a copy with a mismatched appended header',()=>{
  const h=harness({memberColumns:30,backupHeaderMismatch:true});
  assert.throws(()=>h.run(),/Dimensi sheet Database Member berbeda dari sumber|Header Database Member pada salinan tidak cocok/);
  assert.equal(h.state.trashed,true);
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
