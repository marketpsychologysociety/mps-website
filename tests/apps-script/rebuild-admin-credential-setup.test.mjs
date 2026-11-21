import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const start=source.indexOf('function initializeMpsAdminCredentials_() {');
const end=source.indexOf('\nfunction initializeMpsTotpSecrets_(',start+1);
assert.ok(start>=0&&end>start,'credential bootstrap source boundaries must exist');
const bootstrapSource=source.slice(start,end);
const adminPassword='Admin-password-strong-2026!';
const superPassword='SuperAdmin-password-strong-2026!';
function harness({initial={},failSet=false,failDelete=''}={}){
  const values={...initial};let setCalls=0,ownerCalls=0,saltCounter=0;
  const props={
    getProperty:key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:null,
    setProperties(input){setCalls++;if(failSet){values.MPS_REBUILD_ADMIN_PASSWORD_HASH=input.MPS_REBUILD_ADMIN_PASSWORD_HASH;throw new Error('INJECTED_SET_PROPERTIES');}Object.assign(values,input);},
    deleteProperty(key){if(failDelete===key)throw new Error('INJECTED_DELETE_'+key);delete values[key];}
  };
  const ctx={
    requireOwnerContext_:()=>{ownerCalls++;},
    PropertiesService:{getScriptProperties:()=>props},
    randomHex_:n=>'SALT_'+n+'_'+(++saltCounter),
    sha256_:value=>'HASH_'+value
  };
  vm.createContext(ctx);vm.runInContext(bootstrapSource,ctx,{timeout:1000});
  return {run:()=>ctx.initializeMpsAdminCredentials_(),values,stats:()=>({setCalls,ownerCalls})};
}

test('bootstrap stores separate salted hashes and removes both temporary plaintext passwords',()=>{
  const h=harness({initial:{
    MPS_REBUILD_ADMIN_SETUP_PASSWORD:adminPassword,
    MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:superPassword
  }});
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.setupPasswordsRemoved,true);
  assert.equal(h.values.MPS_REBUILD_ADMIN_PASSWORD_HASH,'HASH_SALT_64_1'+adminPassword);
  assert.equal(h.values.MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH,'HASH_SALT_64_2'+superPassword);
  assert.ok(h.values.MPS_REBUILD_ADMIN_PASSWORD_SALT);
  assert.ok(h.values.MPS_REBUILD_SUPER_ADMIN_PASSWORD_SALT);
  assert.equal('MPS_REBUILD_ADMIN_SETUP_PASSWORD' in h.values,false);
  assert.equal('MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD' in h.values,false);
  assert.equal(JSON.stringify(result).includes(adminPassword),false);
  assert.equal(JSON.stringify(result).includes(superPassword),false);
  assert.deepEqual(h.stats(),{setCalls:1,ownerCalls:1});
});

test('weak or identical passwords fail before any credential write',()=>{
  for(const initial of [
    {MPS_REBUILD_ADMIN_SETUP_PASSWORD:'short',MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:superPassword},
    {MPS_REBUILD_ADMIN_SETUP_PASSWORD:adminPassword,MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:adminPassword}
  ]){
    const h=harness({initial});
    assert.throws(()=>h.run());
    assert.equal(h.stats().setCalls,0);
    assert.equal('MPS_REBUILD_ADMIN_PASSWORD_HASH' in h.values,false);
  }
});

test('existing credentials are never overwritten by bootstrap',()=>{
  const h=harness({initial:{
    MPS_REBUILD_ADMIN_SETUP_PASSWORD:adminPassword,
    MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:superPassword,
    MPS_REBUILD_ADMIN_PASSWORD_HASH:'existing-hash',
    MPS_REBUILD_ADMIN_PASSWORD_SALT:'existing-salt'
  }});
  assert.throws(()=>h.run(),/tidak akan menimpa/);
  assert.equal(h.values.MPS_REBUILD_ADMIN_PASSWORD_HASH,'existing-hash');
  assert.equal(h.stats().setCalls,0);
});

test('ambiguous property write is compensated and temporary inputs remain for safe retry',()=>{
  const h=harness({failSet:true,initial:{
    MPS_REBUILD_ADMIN_SETUP_PASSWORD:adminPassword,
    MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:superPassword
  }});
  assert.throws(()=>h.run(),/INJECTED_SET_PROPERTIES/);
  assert.equal('MPS_REBUILD_ADMIN_PASSWORD_HASH' in h.values,false);
  assert.equal('MPS_REBUILD_ADMIN_SETUP_PASSWORD' in h.values,true);
  assert.equal('MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD' in h.values,true);
});

test('failed plaintext cleanup is reported explicitly without returning credentials',()=>{
  const h=harness({failDelete:'MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD',initial:{
    MPS_REBUILD_ADMIN_SETUP_PASSWORD:adminPassword,
    MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD:superPassword
  }});
  assert.throws(()=>h.run(),/password sementara belum seluruhnya terhapus/);
  assert.ok(h.values.MPS_REBUILD_ADMIN_PASSWORD_HASH);
  assert.ok(h.values.MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH);
  assert.equal('MPS_REBUILD_ADMIN_SETUP_PASSWORD' in h.values,false);
  assert.equal(h.values.MPS_REBUILD_SUPER_ADMIN_SETUP_PASSWORD,superPassword);
});
