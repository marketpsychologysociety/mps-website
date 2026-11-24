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
