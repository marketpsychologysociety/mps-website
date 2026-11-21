import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function verifyMpsBackupRestore_(backupFileId) {');
const end=source.indexOf('\nfunction apiGetPublicVipTicker()',start+1);
assert.ok(start>=0&&end>start,'restore drill function boundaries must exist');
const body=source.slice(start,end);

function sheet(name,values,formulas=values.map(row=>row.map(()=>''))){
  return {
    getName:()=>name,
    getLastRow:()=>values.length,
    getLastColumn:()=>values.reduce((n,row)=>Math.max(n,row.length),0),
    getRange:(r,c,nr,nc)=>({
      getValues:()=>values.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc)),
      getFormulas:()=>formulas.slice(r-1,r-1+nr).map(row=>row.slice(c-1,c-1+nc))
    })
  };
}
function harness({mismatch=false,backupMismatch=false,copyPrivacyFailure=false,cleanupFailure=false,outsideFolder=false,tooLarge=false}={}){
  const sourceSheets=[sheet('Database Member',[['ID Member','Status'],['MPS-TEST-0001','Berhasil']]),sheet('MPS Audit Logs',[['Event ID'],['EV-1']])];
  const changedSheets=[sheet('Database Member',[['ID Member','Status'],['MPS-TEST-0001','Ditolak']]),sourceSheets[1]];
  const backupSheets=backupMismatch?changedSheets:sourceSheets;
  const restoredSheets=mismatch?changedSheets:sourceSheets;
  const backupBook={getSheets:()=>tooLarge?[{...sheet('Huge',[]),getLastRow:()=>1001,getLastColumn:()=>101}]:backupSheets};
  const sourceBook={getSheets:()=>sourceSheets};
  const restoredBook={getSheets:()=>tooLarge?[{...sheet('Huge',[]),getLastRow:()=>1001,getLastColumn:()=>101}]:restoredSheets};
  const state={copyCreated:false,copyTrashed:false,sharing:copyPrivacyFailure?'ANYONE':'PRIVATE',folder:'MPS TEST - Backup'};
  const copy={
    getId:()=>'restore-copy-id',
    setSharing(access){if(!copyPrivacyFailure)state.sharing=access;},
    getSharingAccess:()=>state.sharing,
    setTrashed(value){if(cleanupFailure)throw new Error('INJECTED_TRASH_FAILURE');state.copyTrashed=value;},
    isTrashed:()=>state.copyTrashed
  };
  const backup={
    isTrashed:()=>false,
    getSharingAccess:()=>'PRIVATE',
    getName:()=>'MPS-v4.8.1-backup-20261121-200000',
    getParents:()=>{let yielded=false;return{hasNext:()=>!outsideFolder&&!yielded,next:()=>{yielded=true;return{getId:()=>'backup-folder'};}};},
    makeCopy:()=>{state.copyCreated=true;return copy;}
  };
  const context={
    requireOwnerContext_:()=>true,
    prop_:key=>({MPS_SPREADSHEET_ID:'source-db',MPS_BACKUP_FOLDER_ID:'backup-folder',MPS_PROOF_FOLDER_ID:'proof-folder'}[key]||''),
    openDb_:()=>sourceBook,
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFolderById:()=>({getName:()=>state.folder}),getFileById:()=>backup},
    SpreadsheetApp:{openById:id=>id==='backup-file-id'?backupBook:restoredBook},
    assertMpsDriveFolderTreePrivate_:()=>true,
    Utilities:{formatDate:()=> '20261121-200000'},
    sha256_:value=>crypto.createHash('sha256').update(String(value)).digest('hex'),
    MPS:{TZ:'Asia/Jakarta'},
    Date,console
  };
  vm.createContext(context);
  vm.runInContext(body,context,{timeout:1000});
  return {run:()=>context.verifyMpsBackupRestore_('backup-file-id'),state};
}

test('restore drill reopens a private backup copy, verifies all sheet content, and trashes temporary copy',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.checkedSheets,2);
  assert.equal(result.checkedCells,6);
  assert.equal(result.temporaryCopyCleanup,'CONFIRMED');
  assert.equal(h.state.copyCreated,true);
  assert.equal(h.state.copyTrashed,true);
});

test('restore drill rejects changed backup data and still cleans up temporary copy',()=>{
  const h=harness({mismatch:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_CONTENT_MISMATCH/);
  assert.equal(h.state.copyTrashed,true);
});

test('restore drill rejects a corrupt timestamped backup before creating a temporary copy',()=>{
  const h=harness({backupMismatch:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_BACKUP_CONTENT_MISMATCH/);
  assert.equal(h.state.copyCreated,false);
});

test('restore drill rejects a copy whose privacy cannot be verified and cleans it up',()=>{
  const h=harness({copyPrivacyFailure:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_COPY_PRIVACY_UNVERIFIED/);
  assert.equal(h.state.copyTrashed,true);
});

test('restore drill fails closed when the backup is outside the dedicated backup folder',()=>{
  const h=harness({outsideFolder:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_BACKUP_OUTSIDE_APPROVED_FOLDER/);
  assert.equal(h.state.copyCreated,false);
});

test('restore drill rejects oversized backup sheets before making a temporary copy',()=>{
  const h=harness({tooLarge:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_TEST_SHEET_TOO_LARGE/);
  assert.equal(h.state.copyCreated,false);
});

test('restore drill reports when a temporary private copy cannot be trashed',()=>{
  const h=harness({cleanupFailure:true});
  assert.throws(()=>h.run(),/RESTORE_DRILL_TEMP_COPY_REMAINS_PRIVATE/);
  assert.equal(h.state.copyTrashed,false);
});
