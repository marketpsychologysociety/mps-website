import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function openDb_() {');
const end=source.indexOf('\nfunction requireOwnerContext_(',start+1);
assert.ok(start>=0&&end>start,'openDb source boundaries must exist');
const openSource=source.slice(start,end);
const helperStart=source.indexOf('function assertMpsDriveFolderTreePrivate_(');
const helperEnd=source.indexOf('\nfunction validateMpsRebuildConfig_(',helperStart+1);
assert.ok(helperStart>=0&&helperEnd>helperStart,'folder privacy helper boundaries must exist');
const privacySource=source.slice(helperStart,helperEnd);

function folder(name,access='PRIVATE',parents=[]){
  return {getId:()=>name,getName:()=>name,getSharingAccess:()=>access,getParents:()=>{let i=0;return{hasNext:()=>i<parents.length,next:()=>parents[i++]};}};
}
function harness({label='MPS-ISOLATED-TEST',spreadsheetName='MPS TEST - Database Member',proofName='MPS TEST - Bukti Deposit',proofAccess='PRIVATE',parents=[],databaseAccess='PRIVATE',databaseParents=[]}={}){
  let spreadsheetOpens=0,folderOpens=0,fileOpens=0;
  const ss={getName:()=>spreadsheetName};
  const proof=folder(proofName,proofAccess,parents);
  const databaseFile={getId:()=> 'synthetic-db-id',getName:()=>spreadsheetName,getSharingAccess:()=>databaseAccess,getParents:()=>{let i=0;return{hasNext:()=>i<databaseParents.length,next:()=>databaseParents[i++]};}};
  const ctx={
    prop_:key=>({MPS_SPREADSHEET_ID:'synthetic-db-id',MPS_REBUILD_TEST_LABEL:label,MPS_PROOF_FOLDER_ID:'synthetic-proof-id'}[key]||''),
    SpreadsheetApp:{openById:id=>{spreadsheetOpens++;assert.equal(id,'synthetic-db-id');return ss;}},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:id=>{fileOpens++;assert.equal(id,'synthetic-db-id');return databaseFile;},getFolderById:id=>{folderOpens++;assert.equal(id,'synthetic-proof-id');return proof;}}
  };
  vm.createContext(ctx);vm.runInContext(privacySource,ctx,{timeout:1000});vm.runInContext(openSource,ctx,{timeout:1000});
  return {run:()=>ctx.openDb_(),stats:()=>({spreadsheetOpens,folderOpens,fileOpens})};
}

test('database access requires the exact isolated TEST marker before opening any resource',()=>{
  const h=harness({label:'true'});
  assert.throws(()=>h.run(),/MPS-ISOLATED-TEST/);
  assert.deepEqual(h.stats(),{spreadsheetOpens:0,folderOpens:0,fileOpens:0});
});

test('production-named spreadsheet is rejected before Drive access',()=>{
  const h=harness({spreadsheetName:'MPS - Database Member'});
  assert.throws(()=>h.run(),/spreadsheet sintetis/);
  assert.deepEqual(h.stats(),{spreadsheetOpens:1,folderOpens:0,fileOpens:0});
});

test('production-named proof folder is rejected',()=>{
  const h=harness({proofName:'MPS - Bukti Konfirmasi'});
  assert.throws(()=>h.run(),/folder TEST/);
  assert.deepEqual(h.stats(),{spreadsheetOpens:1,folderOpens:1,fileOpens:1});
});

test('public or unreadable ancestor folder blocks database access',()=>{
  const h=harness({parents:[folder('MPS TEST - Parent','ANYONE_WITH_LINK')]});
  assert.throws(()=>h.run(),/folder induknya tidak PRIVATE/);
});

test('publicly shared database file is rejected before spreadsheet data is opened',()=>{
  const h=harness({databaseAccess:'ANYONE_WITH_LINK'});
  assert.throws(()=>h.run(),/database TEST.*tidak PRIVATE/);
  assert.deepEqual(h.stats(),{spreadsheetOpens:0,folderOpens:0,fileOpens:1});
});

test('database file in a publicly shared parent folder is rejected',()=>{
  const h=harness({databaseParents:[folder('MPS TEST - Shared Parent','ANYONE_WITH_LINK')]});
  assert.throws(()=>h.run(),/Folder induk file database TEST.*tidak PRIVATE/);
  assert.deepEqual(h.stats(),{spreadsheetOpens:0,folderOpens:0,fileOpens:1});
});

test('explicitly labeled synthetic spreadsheet and private proof folder pass',()=>{
  const h=harness();
  assert.ok(h.run());
  assert.deepEqual(h.stats(),{spreadsheetOpens:1,folderOpens:1});
});

test('provisioner clears its one-time allow flag and full acceptance requires separated TEST backup resources',()=>{
  assert.match(source,/deleteProperty\('MPS_REBUILD_ALLOW_PROVISION'\)/);
  assert.match(source,/backupFolderSeparate/);
  assert.match(source,/testBackupFolderNameValid/);
  assert.match(source,/testSpreadsheetNameValid/);
  assert.match(source,/testProofFolderNameValid/);
});
