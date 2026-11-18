import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('candidates/Code.gs','utf8');
const html=fs.readFileSync('candidates/Index.html','utf8');
new vm.Script(source,{filename:'candidates/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'missing '+name);
  return source.slice(start,end);
}
const runtime=['decodeTotpSecret_','isValidTotpSecret_','initializeMPSAdmin_'].map(extract).join('\n');
const strongAdmin='Existing-Admin-Password-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function harness(options={}){
  const values=Object.assign({MPS_ADMIN_TOKEN:strongAdmin},options.properties||{});
  const created=[],logs=[];
  let uuid=0;
  const props={
    getProperty:key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:null,
    setProperty:(key,value)=>{values[key]=String(value);return props;},
    deleteProperty:key=>{delete values[key];return props;}
  };
  const outputFile={
    sharing:'DOMAIN',
    trashed:false,
    id:'private-bootstrap-file-id',
    url:'https://drive.google.com/file/d/private-bootstrap-file-id/view',
    setSharing(access,permission){
      if(options.sharingFailure)throw new Error('sharing denied');
      this.sharing=access;this.permission=permission;
    },
    getSharingAccess(){return this.sharing;},
    getId(){return this.id;},
    getUrl(){return this.url;},
    setTrashed(value){this.trashed=!!value;}
  };
  const projectFile={getOwner:()=>({getEmail:()=>options.ownerEmail||'owner@example.com'})};
  const context={
    PropertiesService:{getScriptProperties:()=>props},
    ScriptApp:{getScriptId:()=>'script-file-id'},
    Session:{getEffectiveUser:()=>({getEmail:()=>options.actorEmail||'owner@example.com'})},
    DriveApp:{
      Access:{PRIVATE:'PRIVATE'},
      Permission:{NONE:'NONE'},
      getFileById:id=>{assert.equal(id,'script-file-id');return projectFile;},
      createFile:(name,content,mimeType)=>{
        created.push({name,content,mimeType,file:outputFile});
        return outputFile;
      }
    },
    MimeType:{PLAIN_TEXT:'text/plain'},
    Utilities:{getUuid:()=>{
      uuid++;
      return '00000000-0000-4000-8000-'+String(uuid).padStart(12,'0');
    }},
    Logger:{log:value=>logs.push(String(value))}
  };
  vm.createContext(context);
  vm.runInContext(runtime,context,{timeout:1000});
  return{context,values,created,logs,outputFile};
}

test('bootstrap is a private editor-only function and is not exposed through portal HTML',()=>{
  assert.match(source,/function initializeMPSAdmin_\(\)/);
  assert.doesNotMatch(source,/function initializeMPSAdmin\(\)/);
  assert.doesNotMatch(html,/google\.script\.run\s*\.\s*initializeMPSAdmin_/);
});

test('owner bootstrap preserves existing Admin password and provisions distinct Super Admin/MFA credentials',()=>{
  const h=harness();
  const result=h.context.initializeMPSAdmin_();
  assert.equal(result.ok,true);
  assert.equal(h.values.MPS_ADMIN_TOKEN,strongAdmin);
  assert.match(h.values.MPS_SUPER_ADMIN_TOKEN,/^MPS-[a-f0-9]{96}!$/);
  assert.equal(h.values.MPS_ADMIN_TOTP_SECRET.length,32);
  assert.equal(h.values.MPS_SUPER_ADMIN_TOTP_SECRET.length,32);
  assert.notEqual(h.values.MPS_ADMIN_TOTP_SECRET,h.values.MPS_SUPER_ADMIN_TOTP_SECRET);
  assert.equal(h.context.isValidTotpSecret_(h.values.MPS_ADMIN_TOTP_SECRET),true);
  assert.equal(h.context.isValidTotpSecret_(h.values.MPS_SUPER_ADMIN_TOTP_SECRET),true);
  assert.equal(h.values.MPS_OWNER_BOOTSTRAP_COMPLETED_AT!==undefined,true);
  assert.equal(h.values.MPS_OWNER_BOOTSTRAP_FILE_ID,'private-bootstrap-file-id');
  assert.equal(h.values.MPS_OWNER_BOOTSTRAP_STATE,undefined);
  assert.equal(h.created.length,1);
  assert.equal(h.outputFile.sharing,'PRIVATE');
  assert.equal(h.outputFile.permission,'NONE');
  assert.ok(h.created[0].content.includes(h.values.MPS_SUPER_ADMIN_TOKEN));
  assert.ok(h.created[0].content.includes(h.values.MPS_ADMIN_TOTP_SECRET));
  assert.ok(h.created[0].content.includes(h.values.MPS_SUPER_ADMIN_TOTP_SECRET));
  assert.equal(h.logs.some(line=>line.includes(h.values.MPS_SUPER_ADMIN_TOKEN)),false);
  assert.ok(h.logs.some(line=>line.includes(h.outputFile.url)));
});

test('bootstrap refuses rerun without replacing any existing credentials',()=>{
  const h=harness();
  h.context.initializeMPSAdmin_();
  const before=Object.assign({},h.values);
  assert.throws(()=>h.context.initializeMPSAdmin_(),/konfigurasi Admin\/MFA atau penanda bootstrap sudah ada/);
  assert.deepEqual(h.values,before);
  assert.equal(h.created.length,1);
});

test('bootstrap refuses execution by a non-owner before creating files or properties',()=>{
  const h=harness({actorEmail:'editor@example.com'});
  assert.throws(()=>h.context.initializeMPSAdmin_(),/hanya boleh dijalankan oleh pemilik/);
  assert.deepEqual(Object.keys(h.values),['MPS_ADMIN_TOKEN']);
  assert.equal(h.created.length,0);
});

test('bootstrap refuses a weak existing Admin password without changing properties',()=>{
  const h=harness({properties:{MPS_ADMIN_TOKEN:'weak'}});
  assert.throws(()=>h.context.initializeMPSAdmin_(),/belum memenuhi syarat minimal/);
  assert.deepEqual(h.values,{MPS_ADMIN_TOKEN:'weak'});
  assert.equal(h.created.length,0);
});

test('bootstrap rolls back generated properties and trashes handoff file if PRIVATE sharing cannot be confirmed',()=>{
  const h=harness({sharingFailure:true});
  assert.throws(()=>h.context.initializeMPSAdmin_(),/Bootstrap gagal; perubahan baru telah dibersihkan/);
  assert.deepEqual(h.values,{MPS_ADMIN_TOKEN:strongAdmin});
  assert.equal(h.created.length,1);
  assert.equal(h.outputFile.trashed,true);
});

test('bootstrap refuses partially configured or previously initialized MFA state',()=>{
  const h=harness({properties:{MPS_ADMIN_TOTP_SECRET:'A'.repeat(32)}});
  assert.throws(()=>h.context.initializeMPSAdmin_(),/konfigurasi Admin\/MFA atau penanda bootstrap sudah ada/);
  assert.deepEqual(h.values,{MPS_ADMIN_TOKEN:strongAdmin,MPS_ADMIN_TOTP_SECRET:'A'.repeat(32)});
  assert.equal(h.created.length,0);
});
