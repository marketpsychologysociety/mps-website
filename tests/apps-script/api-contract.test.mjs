import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const code=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../candidates/Index.html',import.meta.url)),'utf8');
const definitions=new Set([...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const calls=[...new Set([...html.matchAll(/\bapi\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]))].sort();

test('every literal frontend google.script.run API call has a matching backend function',()=>{
  assert.ok(calls.length>=40,'expected the complete frontend API inventory');
  const missing=calls.filter(name=>!definitions.has(name));
  assert.deepEqual(missing,[]);
});
test('all frontend API calls route through the guarded google.script.run wrapper',()=>{
  assert.match(html,/function api\(method,\.\.\.args\)[\s\S]{0,500}runner\[method\]\(\.\.\.args\)/);
});
test('backend router does not expose a generic unauthenticated doPost method dispatcher',()=>{
  const doPost=code.slice(code.indexOf('function doPost(e)'),code.indexOf('\nfunction doGet(e)'));
  assert.doesNotMatch(doPost,/data\.method|data\.action|this\[|globalThis\[|eval\s*\(/);
});

test('every public admin API except login/logout has an explicit backend role guard',()=>{
  const functions=[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const adminFunctions=functions.map((m,i)=>({name:m[1],start:m.index,end:functions[i+1]?.index??code.length}))
    .filter(x=>x.name.startsWith('apiAdmin'));
  assert.ok(adminFunctions.length>=30,'expected the full admin API inventory');
  const unguarded=adminFunctions.filter(x=>!['apiAdminLogin','apiAdminLogout'].includes(x.name))
    .filter(x=>!/require(?:Super)?Admin_\(/.test(code.slice(x.start,x.end)));
  assert.deepEqual(unguarded.map(x=>x.name),[]);
});
test('member workflow remains available to Admin while privileged content management is Super Admin only',()=>{
  const functions=[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{const i=functions.findIndex(m=>m[1]===name);assert.ok(i>=0,name);return code.slice(functions[i].index,functions[i+1]?.index??code.length);};
  for(const name of ['apiAdminVerify','apiAdminIssuePin','apiAdminRetryVipInvite'])assert.match(body(name),/requireAdmin_\(/,name);
  for(const name of ['apiAdminSaveLearningCatalog','apiAdminUploadLearningFile','apiAdminDeleteLearningFile','apiAdminMigrateMemberSheetToV480','apiAdminCreateBackup','apiAdminCheckSystemConfiguration'])assert.match(body(name),/requireSuperAdmin_\(/,name);
});

test('Market Pulse upload verifies the created Drive file is PRIVATE before reporting success',()=>{
  const start=code.indexOf('function adminUploadMarketPulseCore_(');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'Market Pulse upload core boundaries must exist');
  const body=code.slice(start,end);
  assert.ok(body.includes('folder.getSharingAccess()'));
  assert.ok(body.includes('folder.getSharingAccess())!==String(DriveApp.Access.PRIVATE)'));
  assert.ok(body.includes('newFile.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE)'));
  assert.ok(body.includes('newFile.getSharingAccess()'));
  assert.ok(body.includes('DriveApp.Access.PRIVATE'));
});

test('Learning PDF upload requires a private parent folder and verifies file privacy',()=>{
  const start=code.indexOf('function apiAdminUploadLearningFile(session,payload) {');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'Learning upload function boundaries must exist');
  const body=code.slice(start,end);
  assert.ok(body.includes('folder.getSharingAccess()'));
  assert.ok(body.includes('file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE)'));
  assert.ok(body.includes('file.getSharingAccess()'));
});

test('deposit proof upload requires a private folder and verifies the uploaded file privacy',()=>{
  const start=code.indexOf('function saveDeposit_(sheet, data, onFileCreated, onProofLinked) {');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'deposit proof upload function boundaries must exist');
  const body=code.slice(start,end);
  assert.ok(body.includes('folder.getSharingAccess()'));
  assert.ok(body.includes('file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE)'));
  assert.ok(body.includes('file.getSharingAccess()'));
});

test('Apps Script source contains no literal Telegram token, Google API key, or PEM private key',()=>{
  assert.doesNotMatch(code,/\b\d{5,15}:[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(code,/AIza[0-9A-Za-z_-]{35}/);
  assert.doesNotMatch(code,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
});

test('portal frontend avoids unsafe HTML injection and dynamic code execution sinks',()=>{
  assert.doesNotMatch(html,/\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b/);
  assert.doesNotMatch(html,/\beval\s*\(|\bnew\s+Function\s*\(/);
  assert.doesNotMatch(html,/document\.write\s*\(/);
});
