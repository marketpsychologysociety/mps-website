import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';

const source=fs.readFileSync('candidates/Code.gs','utf8');
const html=fs.readFileSync('candidates/Index.html','utf8');
function extract(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing '+name);
  const end=source.indexOf('\nfunction ',start+10);
  return source.slice(start,end<0?source.length:end);
}
const propertyStore=Object.create(null);
let lockReleases=0;
const names=['constantTimeEquals_','decodeTotpSecret_','isValidTotpSecret_','totpCodeAt_','findTotpMatchingStep_','verifyTotpCode_','consumeTotpCode_'];
const sandbox={
  Utilities:{
    MacAlgorithm:{HMAC_SHA_1:'HMAC_SHA_1'},
    computeHmacSignature:(algorithm,value,key)=>{
      assert.equal(algorithm,'HMAC_SHA_1');
      const raw=crypto.createHmac('sha1',Buffer.from(key.map(v=>v&255))).update(Buffer.from(value.map(v=>v&255))).digest();
      return Array.from(raw,v=>v>127?v-256:v);
    }
  },
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){lockReleases++;}})},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>Object.prototype.hasOwnProperty.call(propertyStore,key)?propertyStore[key]:null,
    setProperty:(key,value)=>{propertyStore[key]=String(value);}
  })}
};
vm.createContext(sandbox);
vm.runInContext(names.map(extract).join('\n'),sandbox);

const RFC_SECRET='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
test('Base32 TOTP secret decodes to the expected 160-bit RFC key',()=>{
  const bytes=sandbox.decodeTotpSecret_(RFC_SECRET).map(v=>v&255);
  assert.equal(Buffer.from(bytes).toString('ascii'),'12345678901234567890');
  assert.equal(sandbox.isValidTotpSecret_(RFC_SECRET),true);
  assert.equal(sandbox.isValidTotpSecret_('NOT-A-SECRET'),false);
});

test('TOTP SHA-1 matches RFC 6238 six-digit test vectors',()=>{
  const vectors=[
    [59,'287082'],
    [1111111109,'081804'],
    [1111111111,'050471'],
    [1234567890,'005924'],
    [2000000000,'279037'],
    [20000000000,'353130']
  ];
  for(const [time,expected] of vectors)assert.equal(sandbox.totpCodeAt_(RFC_SECRET,time),expected);
});

test('TOTP verifier accepts only the current or adjacent 30-second window',()=>{
  const code=sandbox.totpCodeAt_(RFC_SECRET,59);
  assert.equal(sandbox.verifyTotpCode_(RFC_SECRET,code,59),true);
  assert.equal(sandbox.verifyTotpCode_(RFC_SECRET,code,89),true);
  assert.equal(sandbox.verifyTotpCode_(RFC_SECRET,code,119),false);
  assert.equal(sandbox.verifyTotpCode_(RFC_SECRET,'12345',59),false);
  assert.equal(sandbox.verifyTotpCode_(RFC_SECRET,'abcdef',59),false);
});

test('accepted TOTP codes cannot be replayed and Admin/Super Admin counters are isolated',()=>{
  const adminCode=sandbox.totpCodeAt_(RFC_SECRET,59);
  assert.equal(sandbox.consumeTotpCode_('ADMIN',RFC_SECRET,adminCode,59),true);
  assert.equal(sandbox.consumeTotpCode_('ADMIN',RFC_SECRET,adminCode,59),false);
  assert.equal(sandbox.consumeTotpCode_('SUPER_ADMIN',RFC_SECRET,adminCode,59),true);
  const nextCode=sandbox.totpCodeAt_(RFC_SECRET,89);
  assert.equal(sandbox.consumeTotpCode_('ADMIN',RFC_SECRET,nextCode,89),true);
  assert.equal(sandbox.consumeTotpCode_('ADMIN',RFC_SECRET,adminCode,89),false);
  propertyStore.MPS_ADMIN_TOTP_LAST_STEP='corrupt';
  assert.equal(sandbox.consumeTotpCode_('ADMIN',RFC_SECRET,sandbox.totpCodeAt_(RFC_SECRET,119),119),false);
  assert.ok(lockReleases>=6,'ScriptLock must be released for every consume attempt');
});

test('Admin login requires the role-specific TOTP secret and validates it before issuing a session',()=>{
  const login=extract('apiAdminLogin');
  assert.ok(login.includes('MPS_ADMIN_TOTP_SECRET'));
  assert.ok(login.includes('MPS_SUPER_ADMIN_TOTP_SECRET'));
  assert.ok(login.includes('consumeTotpCode_(role,totpSecret,otp)'));
  assert.ok(login.indexOf('consumeTotpCode_')<login.indexOf('const session ='));
  assert.ok(login.indexOf('consumeTotpCode_')<login.indexOf('CacheService.getScriptCache().put'));
  assert.ok(login.includes('MFA belum dikonfigurasi'));
  assert.ok(html.includes('name="otp"'));
  assert.ok(html.includes('autocomplete="one-time-code"'));
  assert.ok(html.includes("api('apiAdminLogin',role,password,otp)"));
});

test('read-only configuration diagnostic reports both distinct TOTP secrets without revealing them',()=>{
  const diagnostic=extract('apiAdminCheckSystemConfiguration');
  assert.ok(diagnostic.includes('MPS_ADMIN_TOTP_SECRET'));
  assert.ok(diagnostic.includes('MPS_SUPER_ADMIN_TOTP_SECRET'));
  assert.ok(diagnostic.includes('adminMfaReady&&superMfaReady&&!constantTimeEquals_'));
  assert.ok(!/add\('Admin MFA',[^,]+,[^)]*adminTotpSecret/.test(diagnostic));
});
