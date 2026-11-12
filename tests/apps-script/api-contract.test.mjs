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

test('every administrator API except login/logout enforces a backend role guard',()=>{
  const matches=[...code.matchAll(/\bfunction\s+(apiAdmin[A-Za-z0-9_$]*)\s*\(/g)];
  const body=name=>{
    const i=matches.findIndex(m=>m[1]===name);
    assert.ok(i>=0,'missing '+name);
    return code.slice(matches[i].index,matches[i+1]?.index??code.length);
  };
  for(const match of matches) {
    const name=match[1];
    if(['apiAdminLogin','apiAdminLogout'].includes(name))continue;
    assert.match(body(name),/require(?:Super)?Admin_\(/,name+' must enforce server-side admin authorization');
  }
});

test('ordinary Admin retains member-workflow permissions while content and file management stay Super Admin only',()=>{
  const matches=[...code.matchAll(/\bfunction\s+(apiAdmin[A-Za-z0-9_$]*)\s*\(/g)];
  const body=name=>{
    const i=matches.findIndex(m=>m[1]===name);
    assert.ok(i>=0,'missing '+name);
    return code.slice(matches[i].index,matches[i+1]?.index??code.length);
  };
  for(const name of ['apiAdminList','apiAdminVerify','apiAdminIssuePin','apiAdminRetryVipInvite','apiAdminResendRegistrationNotice','apiAdminGetDashboard','apiAdminGetHeatmap','apiAdminGetMarketPulse','apiAdminGetMemberIntelligence']) {
    assert.match(body(name),/^function [^{]+\{\s*(?:const\s+[A-Za-z_$][\w$]*\s*=\s*)?requireAdmin_\(/,name);
  }
  for(const name of ['apiAdminGetLearningList','apiAdminSaveLearningCatalog','apiAdminUploadLearningFile','apiAdminDeleteLearningFile','apiAdminMigrateMemberSheetToV480','apiAdminSaveWebsiteSettings','apiAdminCheckSystemConfiguration','apiAdminCreateBackup','apiAdminGetContent','apiAdminSaveAnnouncement']) {
    assert.match(body(name),/^function [^{]+\{\s*(?:const\s+[A-Za-z_$][\w$]*\s*=\s*)?requireSuperAdmin_\(/,name);
  }
});
test('database backup verifies private access and core member-sheet headers before recording success',()=>{
  const start=code.indexOf('function apiAdminCreateBackup(session)');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'backup function boundaries must exist');
  const body=code.slice(start,end);
  assert.match(body,/requireSuperAdmin_\(session\)/);
  assert.match(body,/source\.getSharingAccess\(\)[^;]*DriveApp\.Access\.PRIVATE/);
  assert.match(body,/copy\.setSharing\(DriveApp\.Access\.PRIVATE,DriveApp\.Permission\.NONE\)/);
  assert.match(body,/SpreadsheetApp\.openById\(copy\.getId\(\)\)/);
  assert.match(body,/backupBook\.getSheetByName\(MPS\.sheetName\)/);
  assert.match(body,/MPS\.headers\.slice\(0,18\)/);
  assert.match(body,/backupHeaders\[index\][^;]*!==header/);
  assert.match(body,/copy\.setTrashed\(true\)/);
  assert.ok(body.indexOf('Verifikasi isi salinan')<body.indexOf('MPS_LAST_BACKUP_ID'),'backup content must be checked before success metadata');
});

test('all frontend API calls route through the guarded google.script.run wrapper',()=>{
  assert.match(html,/function api\(method,\.\.\.args\)[\s\S]{0,500}runner\[method\]\(\.\.\.args\)/);
});

test('post-commit cache failures cannot turn a persisted public submission into a failure response',()=>{
  const start=code.indexOf('function submitCore_(data) {');
  const end=code.indexOf('function registerMember_(',start+1);
  assert.ok(start>=0&&end>start,'submitCore_ boundaries must exist');
  const body=code.slice(start,end);
  assert.match(body,/Persistent business writes have completed at this point/);
  assert.match(body,/try\s*\{\s*cache\.remove\('mps_public_dashboard_v480'\);\s*\}\s*catch\s*\(cacheErr\)/);
  assert.match(body,/try\s*\{\s*cache\.put\('mps_req_'/);
  assert.match(body,/catch\s*\(cacheErr\)\s*\{\s*console\.warn\('MPS post-commit request cache write failed/);
});
test('Telegram webhook secret is read from pathInfo and never placed in query parameters',()=>{
  const start=code.indexOf('function doPost(e)');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'doPost boundaries must exist');
  const body=code.slice(start,end);
  assert.match(body,/e\s*&&\s*e\.pathInfo/);
  assert.doesNotMatch(body,/e\.parameter|params\.tg/);
  assert.match(code,/webAppUrl\.replace\([^;]+\)\s*\+\s*'\/'\s*\+\s*encodeURIComponent\(webhookSecret\)/);
  assert.doesNotMatch(code,/webAppUrl\s*\+\s*'\?tg='/);
});
test('read-only system diagnostics reflect path-based Telegram webhook protection',()=>{
  assert.match(code,/add\('Telegram webhook secret transport',true,'Secret webhook divalidasi melalui pathInfo Apps Script, bukan query string/);
  assert.doesNotMatch(code,/add\('Telegram webhook secret transport',false,'Webhook Apps Script saat ini memvalidasi secret melalui URL query/);
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

test('Market Pulse member and admin endpoints enforce backend authorization and per-principal throttling',()=>{
  const functions=[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{
    const i=functions.findIndex(m=>m[1]===name);
    assert.ok(i>=0,'missing '+name);
    return code.slice(functions[i].index,functions[i+1]?.index??code.length);
  };
  const member=body('apiGetMarketPulse');
  assert.match(member,/requireMember_\(session\)/);
  assert.match(member,/mps_market_pulse_/);
  assert.match(member,/consumeRateLimit_\(/);
  const admin=body('apiAdminGetMarketPulse');
  assert.match(admin,/requireAdmin_\(session\)/);
  assert.match(admin,/mps_market_pulse_admin_/);
  assert.match(admin,/consumeRateLimit_\(/);
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


test('administrator sessions are role-bound, hashed at rest, and invalidated by credential rotation',()=>{
  const body=name=>{
    const start=code.indexOf('function '+name+'(');
    const end=code.indexOf('\nfunction ',start+1);
    assert.ok(start>=0&&end>start,'missing function boundary for '+name);
    return code.slice(start,end);
  };
  const login=body('apiAdminLogin');
  const session=body('getAdminSession_');
  assert.ok(login.includes("['ADMIN','SUPER_ADMIN'].includes(role)"));
  assert.ok(login.includes('constantTimeEquals_(expected, supplied)'));
  assert.ok(login.includes("sha256_(session)"));
  assert.ok(login.includes('credentialHash:sha256_(expected)'));
  assert.ok(session.includes("sha256_(s)"));
  assert.ok(session.includes('constantTimeEquals_(data.credentialHash,sha256_(expected).slice(0,32))'));
  assert.ok(session.includes("data.role==='SUPER_ADMIN'?'MPS_SUPER_ADMIN_TOKEN':'MPS_ADMIN_TOKEN'"));
});

test('member PIN records are salted hashes and verification uses constant-time comparison',()=>{
  const body=name=>{
    const start=code.indexOf('function '+name+'(');
    const end=code.indexOf('\nfunction ',start+1);
    assert.ok(start>=0&&end>start,'missing function boundary for '+name);
    return code.slice(start,end);
  };
  const store=body('storeMemberPin_');
  const verify=body('verifyMemberPin_');
  assert.ok(store.includes('const salt = Utilities.getUuid()'));
  assert.ok(store.includes("sha256_(salt + ':' + memberId + ':' + pin)"));
  assert.ok(store.includes("salt + '$' + hash"));
  assert.ok(verify.includes('constantTimeEquals_(parts[1], sha256_('));
  assert.ok(body('apiAdminIssuePin').includes('requireAdmin_(session)'));
});

test('PIN generator security limitation remains explicit and must not be represented as a CSPRNG',()=>{
  const start=code.indexOf('function generatePin_(');
  const end=code.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'PIN generator function boundaries must exist');
  const body=code.slice(start,end);
  assert.match(body,/bukan klaim CSPRNG/i);
  assert.ok(body.includes("padStart(6, '0')"));
});

test('admin and member login attempts use atomic persistent throttles isolated from general API limits',()=>{
  const body=name=>{
    const start=code.indexOf('function '+name+'(');
    const end=code.indexOf('\nfunction ',start+1);
    assert.ok(start>=0&&end>start,'missing function boundary for '+name);
    return code.slice(start,end);
  };
  const admin=body('apiAdminLogin');
  const member=body('apiMemberLogin');
  const limiter=body('consumePersistentLoginRateLimit_');
  const clear=body('clearPersistentLoginRateLimit_');
  const general=body('consumeRateLimit_');
  assert.ok(admin.includes("consumePersistentLoginRateLimit_(key, MPS.adminMaxAttempts, MPS.adminWindowSeconds"));
  assert.ok(admin.includes("clearPersistentLoginRateLimit_(key)"));
  assert.ok(member.includes("consumePersistentLoginRateLimit_(key,MPS.loginMaxAttempts,MPS.loginWindowSeconds"));
  assert.ok(member.includes("clearPersistentLoginRateLimit_(key)"));
  assert.ok(!member.includes("recordMemberLoginFailure_"));
  assert.ok(limiter.includes("LockService.getScriptLock()"));
  assert.ok(limiter.includes("PropertiesService.getScriptProperties()"));
  assert.ok(limiter.includes("props.getProperty(propertyKey)"));
  assert.ok(limiter.includes("props.setProperty(propertyKey, JSON.stringify(state))"));
  assert.ok(limiter.includes("state.count = Number(state.count) + 1"));
  assert.ok(limiter.includes("state.startedAt"));
  assert.ok(clear.includes("deleteProperty(propertyKey)"));
  assert.ok(!limiter.includes("CacheService.getScriptCache"));
  assert.ok(general.includes("CacheService.getScriptCache()"),"non-login throttles must retain cache-backed behavior");
  assert.ok(general.includes("cache.put(key, String(count + 1)"));
});

test('admin and member sessions have explicit bounded cache lifetimes and credential/PIN revocation checks',()=>{
  assert.match(code,/adminSessionSeconds:\s*3600/);
  assert.match(code,/sessionSeconds:\s*21600/);
  const adminStart=code.indexOf('function apiAdminLogin('),adminEnd=code.indexOf('\nfunction ',adminStart+1);
  const admin=code.slice(adminStart,adminEnd);
  assert.ok(admin.includes('MPS.adminSessionSeconds'));
  const memberStart=code.indexOf('function apiMemberLogin('),memberEnd=code.indexOf('\nfunction ',memberStart+1);
  const member=code.slice(memberStart,memberEnd);
  assert.ok(member.includes('MPS.sessionSeconds'));
  const guardStart=code.indexOf('function requireMember_('),guardEnd=code.indexOf('\nfunction ',guardStart+1);
  const guard=code.slice(guardStart,guardEnd);
  assert.ok(guard.includes("sha256_(pinRecord).slice(0,32)"));
  assert.ok(guard.includes("r[0] !== 'Berhasil' || r[7] !== 'Disetujui'"));
});

test('member-only Learning and VIP endpoints enforce authorization in backend, not only frontend',()=>{
  const names=['apiGetLearningList','apiGetLearningFile','apiMemberSetLearningProgress','apiGetVipCalculatorHtml','apiCheckVipCalculatorAccess'];
  const functions=[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{
    const i=functions.findIndex(m=>m[1]===name);
    assert.ok(i>=0,'missing '+name);
    return code.slice(functions[i].index,functions[i+1]?.index??code.length);
  };
  for(const name of names) assert.match(body(name),/require(?:Vip)?Member_\(/,name+' must enforce backend member authorization');
});


test('member Learning and analytics endpoints enforce per-member request throttles',()=>{
  const functions=[...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{
    const i=functions.findIndex(m=>m[1]===name);
    assert.ok(i>=0,'missing '+name);
    return code.slice(functions[i].index,functions[i+1]?.index??code.length);
  };
  const expected={
    apiGetLearningList:'mps_learning_list_',
    apiGetLearningFile:'mps_learning_file_',
    apiMemberSetLearningProgress:'mps_learning_progress_',
    apiGetDashboard:'mps_dashboard_',
    apiGetHeatmap:'mps_heatmap_',
    apiGetMemberIntelligence:'mps_member_intel_'
  };
  for(const [name,key] of Object.entries(expected)){
    const source=body(name);
    assert.match(source,/requireMember_\(/,name+' must authorize the member first');
    assert.ok(source.includes(key),name+' must use a per-member throttle key');
    assert.match(source,/consumeRateLimit_\(/,name+' must enforce a request limit');
  }
});
