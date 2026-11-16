import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../../candidates/Code.gs',import.meta.url),'utf8');
const start=code.indexOf('function adminUploadMarketPulseCore_(session,payload) {');
const end=code.indexOf('\nfunction apiMemberSetLearningProgress(',start);
assert.ok(start>=0&&end>start,'Market Pulse publication function must exist');
const source=code.slice(start,end);
const canonical='MPS Market Pulse Data.html';
const payload={name:'MPS-Market-Pulse-Data.html',base64:Buffer.from('<script>const D = {}; TH = 5;</script>').toString('base64')};

function makeFile(id,name,bytes,options={}) {
  let currentName=name,trashed=false,sharing='PRIVATE',size=bytes.length;
  let renameCalls=0,trashCalls=0;
  return {
    getId:()=>id,getName:()=>currentName,isTrashed:()=>trashed,
    setName(next){
      renameCalls++;
      if(options.restoreFailBefore&&next===canonical)throw new Error('INJECTED_RESTORE_BEFORE');
      currentName=next;
      if(options.renameBackupAfter&&next.startsWith('MPS Market Pulse Backup '))throw new Error('INJECTED_RENAME_RESPONSE_LOST');
      if(options.restoreFailAfter&&next===canonical)throw new Error('INJECTED_RESTORE_RESPONSE_LOST');
    },
    setTrashed(value){
      trashCalls++;
      if(options.trashFailBefore)throw new Error('INJECTED_TRASH_BEFORE');
      trashed=!!value;
      if(options.trashFailAfter)throw new Error('INJECTED_TRASH_RESPONSE_LOST');
    },
    getSharingAccess:()=>sharing,
    setSharing(access,permission){
      sharing=access;
      if(options.sharingFailAfter)throw new Error('INJECTED_SHARING_RESPONSE_LOST');
    },
    getSize:()=>options.sizeMismatch?size+1:size,
    get renameCalls(){return renameCalls;},get trashCalls(){return trashCalls;},
  };
}

function harness(options={}) {
  const bytes=Buffer.from(payload.base64,'base64');
  const old=options.withOld===false?null:makeFile('old-file',canonical,bytes,options.old||{});
  const files=old?[old]:[];
  let created=0;
  const folder={
    getSharingAccess:()=> 'PRIVATE',
    getFilesByName(name){
      const found=files.filter(f=>f.getName()===name&&!f.isTrashed());
      let i=0;return{hasNext:()=>i<found.length,next:()=>found[i++]};
    },
    createFile(blob){
      created++;
      const file=makeFile('new-file-'+created,blob.name,blob.bytes,options.new||{});
      files.push(file);
      if(options.createAfterWrite)throw new Error('INJECTED_CREATE_RESPONSE_LOST');
      return file;
    },
  };
  const context={
    MPS:{maxPulseDataBytes:1024*1024},
    requireSuperAdmin_:()=>({role:'SUPER_ADMIN',actorId:'synthetic-admin'}),
    clean_:v=>String(v||''),
    Utilities:{
      base64Decode:v=>Buffer.from(v,'base64'),
      newBlob:(b,mime,name)=>({bytes:Buffer.from(b),mime,name,getDataAsString:()=>Buffer.from(b).toString('utf8')}),
      formatDate:()=> '20261116-120000',getUuid:()=> 'abcdef123456',
    },
    validateMarketPulseSource_:()=>({data:{dataEnd:'2026-11-16T03:20:00+07:00',asOf:'2026-11-16T11:29:03+07:00'},stats:{totalSlots:864,emptySlots:0}}),
    getLearningFolderId_:()=> 'synthetic-folder',
    DriveApp:{getFolderById:()=>folder,Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'}},
    recordMpsAudit_:()=>true,adminRole_:()=> 'SUPER_ADMIN',adminActorRef_:()=> 'synthetic-admin',
    safeErrorMessage_:e=>String(e&&e.message||e),
  };
  vm.createContext(context);
  vm.runInContext(source,context,{timeout:1000});
  return {run:()=>context.adminUploadMarketPulseCore_('synthetic-session',payload),files,old,folder};
}
function activeNamed(h,name=canonical){return h.files.filter(f=>f.getName()===name&&!f.isTrashed())}

test('publication succeeds and keeps both active dataset and prior backup private',()=>{
  const h=harness();const result=h.run();
  assert.equal(result.ok,true);assert.equal(result.slots,864);
  assert.equal(activeNamed(h).length,1);assert.equal(activeNamed(h)[0].getId(),'new-file-1');
  assert.match(h.old.getName(),/^MPS Market Pulse Backup /);
  assert.equal(h.old.getSharingAccess(),'PRIVATE');assert.equal(activeNamed(h)[0].getSharingAccess(),'PRIVATE');
});

test('ambiguous old-file rename response is reconciled and restored',()=>{
  const h=harness({old:{renameBackupAfter:true}});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(activeNamed(h)[0].getId(),'old-file');
});

test('ambiguous createFile response is found by canonical name, trashed, and rolled back',()=>{
  const h=harness({createAfterWrite:true});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(activeNamed(h)[0].getId(),'old-file');
  assert.equal(h.files.find(f=>f.getId()==='new-file-1').isTrashed(),true);
});

test('new-file permission response loss is compensated and old dataset restored',()=>{
  const h=harness({new:{sharingFailAfter:true}});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(h.files.find(f=>f.getId()==='new-file-1').isTrashed(),true);
});

test('new-file size mismatch is compensated and old dataset restored',()=>{
  const h=harness({new:{sizeMismatch:true}});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(h.files.find(f=>f.getId()==='new-file-1').isTrashed(),true);
});

test('trash response loss after successful trash is reconciled as a clean rollback',()=>{
  const h=harness({new:{trashFailAfter:true}});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(h.files.find(f=>f.getId()==='new-file-1').isTrashed(),true);
});

test('old-file restore response loss after successful rename is reconciled',()=>{
  const h=harness({old:{restoreFailAfter:true},new:{sharingFailAfter:true}});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(h.old.getName(),canonical);assert.equal(activeNamed(h).length,1);
  assert.equal(activeNamed(h)[0].getId(),'old-file');
});

test('ambiguous create response without an old version leaves no active partial file',()=>{
  const h=harness({withOld:false,createAfterWrite:true});
  assert.throws(()=>h.run(),/versi sebelumnya berhasil dipulihkan/);
  assert.equal(activeNamed(h).length,0);
  assert.equal(h.files.find(f=>f.getId()==='new-file-1').isTrashed(),true);
});

test('rollback reports incomplete only when cleanup and old-file restoration both fail',()=>{
  const h=harness({new:{sharingFailAfter:true,trashFailBefore:true},old:{restoreFailBefore:true}});
  assert.throws(()=>h.run(),/rollback tidak lengkap/);
  assert.notEqual(h.old.getName(),canonical);
  assert.equal(activeNamed(h).length,1);
});
