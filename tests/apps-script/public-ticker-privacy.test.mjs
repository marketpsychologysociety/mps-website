import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function isSafePublicIdentity_(value) {');
const end=source.indexOf('\nfunction createMpsVipTransitionStatusWriter_(',start+1);
assert.ok(start>=0&&end>start,'public identity guard boundaries must exist');
const guardSource=source.slice(start,end);
const context={};
vm.createContext(context);vm.runInContext(guardSource,context,{timeout:1000});
const settingsStart=source.indexOf('function apiAdminSaveWebsiteSettings(session,payload) {');
const settingsEnd=source.indexOf('\nfunction ',settingsStart+1);
assert.ok(settingsStart>=0&&settingsEnd>settingsStart,'ticker settings API boundaries must exist');
context.requireSuperAdmin_=()=>true;
context.clean_=(value,max)=>String(value??'').trim().slice(0,max);
context.getMpsContentSheet_=()=>{throw new Error('INVALID_LABEL_MUST_BE_REJECTED_BEFORE_STORAGE_ACCESS');};
vm.runInContext(source.slice(settingsStart,settingsEnd),context,{timeout:1000});
const readSettingsStart=source.indexOf('function readMpsWebsiteSettings_() {');
const readSettingsEnd=source.indexOf('\nfunction ',readSettingsStart+1);
assert.ok(readSettingsStart>=0&&readSettingsEnd>readSettingsStart,'ticker settings read API boundaries must exist');
context.MPS_SITE_SETTINGS={sheet:'MPS Website Settings',headers:['Key','Value','Updated At']};
context.getMpsContentSheet_=()=>({getLastRow:()=>2});
context.readMpsContentRows_=()=>[];
let tickerLockDepth=0;
context.LockService={getScriptLock:()=>({waitLock:()=>{assert.equal(tickerLockDepth,0);tickerLockDepth++;},releaseLock:()=>{tickerLockDepth--;}})};
context.findMpsContentRow_=()=>0;
context.sheetText_=v=>String(v??'');
context.CacheService={getScriptCache:()=>({remove:()=>{}})};
const cacheHelperStart=source.indexOf('function removeMpsCacheBestEffort_(');
const cacheHelperEnd=source.indexOf('\nfunction ',cacheHelperStart+1);
assert.ok(cacheHelperStart>=0&&cacheHelperEnd>cacheHelperStart,'cache helper boundaries must exist');
vm.runInContext(source.slice(cacheHelperStart,cacheHelperEnd),context,{timeout:1000});
context.recordMpsAudit_=()=>true;
context.adminRole_=()=> 'SUPER_ADMIN';
context.adminActorRef_=()=> 'SUPER_ADMIN';
vm.runInContext(source.slice(readSettingsStart,readSettingsEnd),context,{timeout:1000});



test('public VIP ticker identity is member ID only; stored names are never projected',()=>{
  const start=source.indexOf('function apiGetPublicCenter() {');
  const end=source.indexOf(String.fromCharCode(10)+'function ',start+1);
  assert.ok(start>=0&&end>start,'public Center endpoint boundaries must exist');
  const body=source.slice(start,end);
  assert.ok(body.includes("PublicAlias:r['Member ID']"));
  assert.ok(body.includes("r['Member ID']"));
  assert.ok(!body.includes("PublicAlias:r['Member Name']"));
  assert.ok(body.includes("r.Status==='Visible'&&/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(String(r['Member ID']||''))"));
});
test('empty, oversized, and identifier-like names are denied',()=>{
  for(const value of ['', '   ', 'A'.repeat(101), 'MPS-ABCDEF1234', 'MPS-APP-0123456789ABCDEF', '@trader_mps', 'MT5 Login: 12345678', 'LOGIN 12345678']) {
    assert.equal(context.isSafePublicIdentity_(value),false,String(value));
  }
});
test('contact details, payment amounts, and links are denied from public ticker fields',()=>{
  for(const value of ['member@example.com','+62 812-3456-7890','081234567890','RP 1.500.000','IDR 250000','https://example.com/proof','www.example.com']) {
    assert.equal(context.isSafePublicIdentity_(value),false,value);
  }
});
test('public activity projection exposes only member ID and event text, never member name',()=>{
  assert.ok(source.includes("const publicActivity = activity.map(function(r){return {PublicAlias:r['Member ID'],PublicText:r['Event Text']};});"));
  assert.ok(source.includes("r.Status==='Visible'&&/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(String(r['Member ID']||''))"));
  assert.ok(!source.includes("PublicAlias:r['Member Name']"));
  assert.ok(!/PublicAlias:r\\['Member Name'\\]/.test(source));
});
test('public Center rejects cached ticker payloads containing legacy names after the ID-only privacy change',()=>{
  const start=source.indexOf('function apiGetPublicCenter() {');
  const end=source.indexOf(String.fromCharCode(10)+'function ',start+1);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  assert.ok(body.includes("cache.get('mps_public_center_v480')"));
  assert.ok(body.includes('cachedPayload.activity.every'));
  assert.ok(body.includes("item.PublicAlias||''"));
  assert.ok(body.includes("isSafePublicIdentity_(item.PublicText)"));
  assert.ok(body.indexOf('cachedTickerSafe')<body.indexOf('if(cachedTickerSafe)return cachedPayload'));
});

test('Admin ticker API also omits stored member names and returns only approved event fields',()=>{
  const start=source.indexOf('function apiAdminGetContent(session) {');
  const end=source.indexOf(String.fromCharCode(10)+'function ',start+1);
  assert.ok(start>=0&&end>start,'admin content endpoint boundaries must exist');
  const body=source.slice(start,end);
  assert.ok(body.includes("'Member ID':r['Member ID']"));
  assert.ok(body.includes("'Event Text':r['Event Text']"));
  assert.ok(!body.includes("'Member Name':r['Member Name']"));
  assert.ok(body.includes("Status:r.Status"));
});

test('public Center does not project Market Pulse or premium calendar/news payloads',()=>{
  const start=source.indexOf('function apiGetPublicCenter() {');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'public Center endpoint boundaries must exist');
  const body=source.slice(start,end);
  assert.ok(body.includes('const news = []'),'public news payload must remain empty');
  assert.ok(body.includes('const calendar = [];'),'public calendar payload must remain empty');
  assert.doesNotMatch(body,/getMarketPulseData_|MarketPulseData|pulseData|marketPulse:/i);
});
test('direct Market Pulse endpoint requires a verified member session before reading data',()=>{
  const start=source.indexOf('function apiGetMarketPulse(session) {');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'Market Pulse endpoint boundaries must exist');
  const body=source.slice(start,end);
  assert.match(body,/^function apiGetMarketPulse\(session\) \{\s*const member\s*=\s*requireMember_\(session\);\s*\/\/ Dataset historis berukuran hingga 1 MB; batasi pembacaan Drive per member\.\s*consumeRateLimit_\('mps_market_pulse_'.*?return getMarketPulseData_\(\);/s);
});

test('Market Pulse refuses a publicly shared parent folder before enumerating the data file',()=>{
  const start=source.indexOf('function getMarketPulseData_() {');
  const end=source.indexOf(String.fromCharCode(10)+'function ',start+1);
  assert.ok(start>=0&&end>start,'Market Pulse data helper boundaries must exist');
  const calls={folder:0,files:0};
  const isolated={
    MPS:{maxPulseDataBytes:1024*1024},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>{calls.folder++;return{
      getSharingAccess:()=> 'ANYONE',
      getFilesByName:()=>{calls.files++;return{hasNext:()=>false};}
    };}},
    getLearningFolderId_:()=>'learning-folder'
  };
  vm.createContext(isolated);
  vm.runInContext(source.slice(start,end),isolated,{timeout:1000});
  assert.throws(()=>isolated.getMarketPulseData_(),/Folder Learning tidak PRIVATE/);
  assert.equal(calls.folder,1);
  assert.equal(calls.files,0,'must fail before listing Pulse files');
});

test('Market Pulse keeps its file-level PRIVATE check after the parent folder check',()=>{
  const start=source.indexOf('function getMarketPulseData_() {');
  const end=source.indexOf(String.fromCharCode(10)+'function ',start+1);
  const file={isTrashed:()=>false,getSize:()=>100,getMimeType:()=>'text/html',getSharingAccess:()=>'ANYONE'};
  const isolated={
    MPS:{maxPulseDataBytes:1024*1024},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>({
      getSharingAccess:()=>'PRIVATE',
      getFilesByName:()=>{let first=true;return{hasNext:()=>first,next:()=>{first=false;return file;}};}
    })},
    getLearningFolderId_:()=>'learning-folder'
  };
  vm.createContext(isolated);
  vm.runInContext(source.slice(start,end),isolated,{timeout:1000});
  assert.throws(()=>isolated.getMarketPulseData_(),/File Market Pulse tidak PRIVATE/);
});

test('all member-only data APIs enforce a server-side member session',()=>{
  const functions=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{const i=functions.findIndex(m=>m[1]===name);assert.ok(i>=0,name);return source.slice(functions[i].index,functions[i+1]?.index??source.length);};
  for(const name of ['apiGetLearningList','apiGetLearningFile','apiGetMarketPulse','apiGetDashboard','apiGetHeatmap','apiGetMemberIntelligence']) {
    assert.match(body(name),/requireMember_\(/,name);
  }
});
test('VIP calculator HTML and access-check APIs enforce the paid-VIP server gate',()=>{
  const functions=[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
  const body=name=>{const i=functions.findIndex(m=>m[1]===name);assert.ok(i>=0,name);return source.slice(functions[i].index,functions[i+1]?.index??source.length);};
  for(const name of ['apiGetVipCalculatorHtml','apiCheckVipCalculatorAccess'])assert.match(body(name),/requireVipMember_\(/,name);
});

test('Super Admin cannot publish personal contact or account identifiers in ticker labels',()=>{
  const base={enabled:true,speed:34,theme:'Neon',prefix:'VIP LIVE',suffix:'bergabung ke MPS VIP Community'};
  for(const [field,value] of [
    ['prefix','support@example.com'],
    ['prefix','MPS-ABCDEF1234'],
    ['suffix','+62 812-3456-7890'],
    ['suffix','MT5 Login: 12345678'],
    ['suffix','https://example.com/proof']
  ]) {
    assert.throws(()=>context.apiAdminSaveWebsiteSettings('session',{...base,[field]:value}),/Label ticker tidak boleh memuat/);
  }
});

test('unsafe legacy ticker settings fall back to safe public defaults at read time',()=>{
  context.readMpsContentRows_=()=>[
    {Key:'VIP_TICKER_PREFIX',Value:'support@example.com'},
    {Key:'VIP_TICKER_SUFFIX',Value:'+62 812-3456-7890'}
  ];
  const settings=context.readMpsWebsiteSettings_();
  assert.equal(settings.prefix,'VIP LIVE');
  assert.equal(settings.suffix,'bergabung ke MPS VIP Community');
});
test('safe existing ticker settings remain configurable',()=>{
  context.readMpsContentRows_=()=>[
    {Key:'VIP_TICKER_PREFIX',Value:'MPS VIP'},
    {Key:'VIP_TICKER_SUFFIX',Value:'bergabung ke komunitas trader'}
  ];
  const settings=context.readMpsWebsiteSettings_();
  assert.equal(settings.prefix,'MPS VIP');
  assert.equal(settings.suffix,'bergabung ke komunitas trader');
});

test('valid ticker settings are serialized and persisted with a released script lock',()=>{
  const rows=[['Key','Value','Updated At']];
  context.getMpsContentSheet_=()=>({
    getLastRow:()=>rows.length,
    appendRow:row=>rows.push(row.slice())
  });
  const result=context.apiAdminSaveWebsiteSettings('session',{enabled:true,speed:34,theme:'Neon',prefix:'VIP LIVE',suffix:'bergabung ke MPS VIP Community'});
  assert.equal(result.ok,true);
  assert.equal(tickerLockDepth,0);
  assert.equal(rows.length,6);
  assert.ok(rows.some(r=>r[0]==='VIP_TICKER_PREFIX'&&r[1]==='VIP LIVE'));
  assert.ok(rows.some(r=>r[0]==='VIP_TICKER_SUFFIX'&&r[1]==='bergabung ke MPS VIP Community'));
});
