import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
const runtimeSource=['requireMember_','getAdminSession_','requireSuperAdmin_'].map(extract).join('\n');

function harness(){
  const sessions=new Map(),properties=new Map();
  const member=['MPS-ABCDEF12'];
  let registration='Berhasil',deposit='Disetujui';
  const memberSheet={getRange:(row,col,nr,nc)=>({getDisplayValues:()=>[[registration,'','','','','','',deposit]]})};
  const digest=value=>('H'+String(value).repeat(64)).slice(0,64);
  const context={
    MPS_COL:{registrationStatus:8},MPS:{},
    sha256_:digest,
    constantTimeEquals_:(a,b)=>String(a)===String(b),
    pinPropertyKey_:id=>'PIN_'+id,
    CacheService:{getScriptCache:()=>({get:key=>sessions.get(key)||null})},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||''})},
    getMemberSheet_:()=>memberSheet,findMemberById_:()=>2
  };
  vm.createContext(context);vm.runInContext(runtimeSource,context,{timeout:1000});
  function memberSession(token='member-session',id='MPS-ABCDEF12',pin='salt$hash'){
    properties.set('PIN_'+id,pin);
    sessions.set('mps_member_'+digest(token),id+'|'+digest(pin).slice(0,32));
    return token;
  }
  function adminSession(role='SUPER_ADMIN',token='admin-session',credential='super-secret'){
    properties.set(role==='SUPER_ADMIN'?'MPS_SUPER_ADMIN_TOKEN':'MPS_ADMIN_TOKEN',credential);
    sessions.set('mps_admin_'+digest(token),JSON.stringify({role,actorId:role,credentialHash:digest(credential).slice(0,32)}));
    return token;
  }
  return{context,sessions,properties,memberSession,adminSession,setMemberStatus:(r,d)=>{registration=r;deposit=d;},digest};
}

test('member session requires an existing server-side cache record and matching PIN hash',()=>{
  const h=harness();
  assert.throws(()=>h.context.requireMember_(''),/Sesi member berakhir/);
  assert.throws(()=>h.context.requireMember_('attacker-chosen-session'),/Sesi member berakhir/);
  const token=h.memberSession();
  assert.equal(h.context.requireMember_(token).memberId,'MPS-ABCDEF12');
  h.sessions.set('mps_member_'+h.digest(token),'MPS-ABCDEF12|wrong-pin-digest');
  assert.throws(()=>h.context.requireMember_(token),/PIN telah diperbarui/);
});

test('member session is revoked when the stored PIN changes or member status is not approved',()=>{
  const h=harness(),token=h.memberSession();
  h.properties.set('PIN_MPS-ABCDEF12','new-salt$new-hash');
  assert.throws(()=>h.context.requireMember_(token),/PIN telah diperbarui/);
  h.memberSession('pending-session');
  h.setMemberStatus('Menunggu Aktivasi','Disetujui');
  assert.throws(()=>h.context.requireMember_('pending-session'),/Akses Learning tidak aktif/);
  h.memberSession('deposit-pending-session');
  h.setMemberStatus('Berhasil','Menunggu verifikasi');
  assert.throws(()=>h.context.requireMember_('deposit-pending-session'),/Akses Learning tidak aktif/);
});

test('Super Admin authorization cannot be escalated from an ordinary Admin session',()=>{
  const h=harness(),token=h.adminSession('ADMIN','ordinary-admin','admin-secret');
  assert.equal(h.context.getAdminSession_(token).role,'ADMIN');
  assert.throws(()=>h.context.requireSuperAdmin_(token),/hanya tersedia untuk Super Admin/);
});

test('Super Admin session requires a server-side role record and current matching credential hash',()=>{
  const h=harness();
  assert.throws(()=>h.context.requireSuperAdmin_('forged-super-session'),/Sesi admin berakhir/);
  const token=h.adminSession();
  assert.equal(h.context.requireSuperAdmin_(token).role,'SUPER_ADMIN');
  h.properties.set('MPS_SUPER_ADMIN_TOKEN','rotated-secret');
  assert.throws(()=>h.context.requireSuperAdmin_(token),/kredensial admin telah diperbarui/);
});

test('unknown or client-tampered administrator roles fail closed',()=>{
  const h=harness(),token='tampered-role';
  h.sessions.set('mps_admin_'+h.digest(token),JSON.stringify({role:'OWNER',actorId:'OWNER',credentialHash:h.digest('super-secret').slice(0,32)}));
  h.properties.set('MPS_SUPER_ADMIN_TOKEN','super-secret');
  assert.throws(()=>h.context.requireSuperAdmin_(token),/Role sesi administrator tidak valid/);
  const missingCredential='missing-credential';
  h.sessions.set('mps_admin_'+h.digest(missingCredential),JSON.stringify({role:'SUPER_ADMIN',actorId:'SUPER_ADMIN',credentialHash:h.digest('') .slice(0,32)}));
  assert.throws(()=>h.context.requireSuperAdmin_(missingCredential),/kredensial admin telah diperbarui/);
});
