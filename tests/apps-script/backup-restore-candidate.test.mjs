import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../candidates/Index.html',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});

function functionSource(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'function '+name+' exists');
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?undefined:end);
}

test('restore preparation is Super Admin-only, rate-limited and bound to the last verified private MPS backup',()=>{
  const fn=functionSource('apiAdminPrepareDatabaseRestore');
  assert.match(fn,/requireSuperAdmin_\(session\)/);
  assert.match(fn,/consumeRateLimit_\('mps_restore_candidate_global',1,21600/);
  assert.match(fn,/MPS_LAST_BACKUP_ID/);
  assert.match(fn,/MPS_SPREADSHEET_ID/);
  assert.match(fn,/backupId===activeId/);
  assert.match(fn,/application\/vnd\.google-apps\.spreadsheet/);
  assert.match(fn,/MPS DATABASE BACKUP /);
  assert.match(fn,/DriveApp\.Access\.PRIVATE/);
});

test('restore candidate validates schema, sheet identities, dimensions and member fingerprint before reporting success',()=>{
  const fn=functionSource('apiAdminPrepareDatabaseRestore');
  assert.match(fn,/MPS\.headers\.slice\(0,18\)/);
  assert.match(fn,/MPS\.headers\.slice\(\)/);
  assert.match(fn,/sheetMeta=backupBook\.getSheets\(\)\.map/);
  assert.match(fn,/candidate=backup\.makeCopy\('MPS DATABASE RESTORE CANDIDATE '/);
  assert.match(fn,/candidate\.setSharing\(DriveApp\.Access\.PRIVATE,DriveApp\.Permission\.NONE\)/);
  assert.match(fn,/restoredFingerprint!==fingerprint/);
  assert.match(fn,/candidate\.setTrashed\(true\)/);
});

test('restore candidate never changes the active spreadsheet ID or claims a full-system restore',()=>{
  const fn=functionSource('apiAdminPrepareDatabaseRestore');
  assert.match(fn,/MPS_SPREADSHEET_ID/);
  assert.doesNotMatch(fn,/setProperty\(['"]MPS_SPREADSHEET_ID['"]/);
  assert.match(fn,/activeDatabaseChanged:false/);
  assert.match(fn,/bukan pemulihan penuh/);
  assert.match(fn,/Script Properties/);
  assert.match(html,/id="prepareDatabaseRestore"/);
  assert.match(html,/apiAdminPrepareDatabaseRestore/);
});

test('restore preparation creates and verifies a private candidate without switching the active database',()=>{
  const backupId='backup-sheet-id',candidateId='restore-candidate-id';
  const headers=Array.from({length:30},(_,i)=>'HEADER_'+i);
  const data=[headers.slice(0,18),Array.from({length:18},(_,i)=>'VALUE_'+i)];
  const makeSheet=rows=>({
    getLastRow:()=>rows.length,
    getLastColumn:()=>rows[0].length,
    getRange(r,c,n=1,w=1){return{
      getDisplayValues:()=>Array.from({length:n},(_,i)=>rows[r-1+i].slice(c-1,c-1+w).map(v=>String(v??''))),
      getValues:()=>Array.from({length:n},(_,i)=>rows[r-1+i].slice(c-1,c-1+w)),
      getFormulas:()=>Array.from({length:n},()=>Array.from({length:w},()=>'')),
    }}
  });
  const backupSheet=makeSheet(data.map(r=>r.slice())),candidateSheet=makeSheet(data.map(r=>r.slice()));
  const book=sheet=>({getSheets:()=>[sheet],getSheetByName:name=>name==='Database Member'?sheet:null});
  const backupBook=book(backupSheet),candidateBook=book(candidateSheet);
  const propsMap={MPS_LAST_BACKUP_ID:backupId,MPS_SPREADSHEET_ID:'active-db-id'};
  const props={getProperty:key=>propsMap[key]||null,setProperty:(k,v)=>{propsMap[k]=String(v)},deleteProperty:k=>{delete propsMap[k]}};
  let candidatePrivate=false,candidateTrashed=false;
  const candidate={getId:()=>candidateId,getName:()=> 'MPS DATABASE RESTORE CANDIDATE 20261125-120000',getUrl:()=> 'https://docs.google.com/spreadsheets/d/'+candidateId, getSharingAccess:()=>candidatePrivate?'PRIVATE':'PRIVATE',setSharing:(access,permission)=>{candidatePrivate=access==='PRIVATE'&&permission==='NONE'},setTrashed:v=>{candidateTrashed=v}};
  const backup={getId:()=>backupId,getName:()=> 'MPS DATABASE BACKUP 20261125-110000',getMimeType:()=> 'application/vnd.google-apps.spreadsheet',getSharingAccess:()=> 'PRIVATE',makeCopy:()=>candidate};
  const ctx={
    Date,Number,String,Array,JSON,
    MPS:{headers,sheetName:'Database Member'},
    DriveApp:{getFileById:id=>id===backupId?backup:candidate,Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'}},
    SpreadsheetApp:{openById:id=>id===backupId?backupBook:candidateBook},
    PropertiesService:{getScriptProperties:()=>props},
    Utilities:{formatDate:()=> '20261125-120000'},
    requireSuperAdmin_:()=>({role:'SUPER_ADMIN',actorId:'SUPER_ADMIN'}),
    consumeRateLimit_:()=>true,sha256_:value=>String(value),
    recordMpsAudit_:()=>true,adminRole_:()=> 'SUPER_ADMIN',adminActorRef_:()=> 'SUPER_ADMIN',
    safeErrorMessage_:e=>String(e&&e.message||e),console
  };
  vm.createContext(ctx);vm.runInContext(functionSource('apiAdminPrepareDatabaseRestore'),ctx);
  const result=ctx.apiAdminPrepareDatabaseRestore('admin-session');
  assert.equal(result.ok,true);
  assert.equal(result.activeDatabaseChanged,false);
  assert.equal(propsMap.MPS_SPREADSHEET_ID,'active-db-id');
  assert.equal(propsMap.MPS_LAST_RESTORE_CANDIDATE_ID,candidateId);
  assert.equal(candidatePrivate,true);
  assert.equal(candidateTrashed,false);
});
