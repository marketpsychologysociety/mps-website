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
const helperSource=extract('isValidImageSignature_');
const approvalSource=extract('validateProofFileForApproval_');
const fileId='proof-file-0123456789';

function harness({mime='image/png',bytes=[137,80,78,71,13,10,26,10,0],filePrivate='PRIVATE',folderPrivate='PRIVATE',inFolder=true,trashed=false,size=9}={}){
  const file={
    isTrashed:()=>trashed,getSize:()=>size,getMimeType:()=>mime,getSharingAccess:()=>filePrivate,
    getId:()=>fileId,getName:()=>'proof.png',getBlob:()=>({getBytes:()=>bytes}),
    getParents:()=>{let used=false;return{hasNext:()=>!used,next:()=>{used=true;return{getId:()=>inFolder?'proof-folder':'other-folder'};}};}
  };
  const folder={getSharingAccess:()=>folderPrivate};
  const context={
    MPS:{maxProofBytes:5*1024*1024},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':key==='MPS_LEARNING_FOLDER_ID'?'learning-folder':''})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>folder,getFileById:id=>{assert.equal(id,fileId);return file;}}
  };
  vm.createContext(context);
  vm.runInContext(helperSource,context,{timeout:1000});
  vm.runInContext(approvalSource,context,{timeout:1000});
  return {run:(url='https://drive.google.com/file/d/'+fileId+'/view')=>context.validateProofFileForApproval_(url),file};
}

test('approval accepts a private in-folder PNG with a matching file signature',()=>{
  const h=harness();const result=h.run();
  assert.equal(result.fileId,fileId);assert.equal(result.size,9);
});
test('approval rejects spoofed image MIME when the stored bytes do not match',()=>{
  for(const mime of ['image/jpeg','image/png','image/webp']){
    const h=harness({mime,bytes:[1,2,3,4,5,6,7,8,9,10,11,12]});
    assert.throws(()=>h.run(),/Isi file bukti deposit tidak sesuai/);
  }
});
test('approval rejects a non-private proof folder or file',()=>{
  assert.throws(()=>harness({folderPrivate:'ANYONE'}).run(),/Folder bukti deposit tidak PRIVATE/);
  assert.throws(()=>harness({filePrivate:'ANYONE'}).run(),/File bukti deposit tidak PRIVATE/);
});
test('approval rejects trashed, oversized, and out-of-folder proof files',()=>{
  assert.throws(()=>harness({trashed:true}).run(),/File bukti deposit tidak tersedia/);
  assert.throws(()=>harness({size:5*1024*1024+1}).run(),/File bukti deposit tidak tersedia/);
  assert.throws(()=>harness({inFolder:false}).run(),/File bukti tidak berada di folder/);
});
test('approval rejects malformed and non-Google-Drive proof URLs',()=>{
  assert.throws(()=>harness().run('not-a-drive-url'),/tautan Google Drive yang valid/);
  const h=harness();
  const ctx={MPS:{maxProofBytes:5*1024*1024},PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':'learning-folder'})},DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>({getSharingAccess:()=>'PRIVATE'})}};
  vm.createContext(ctx);vm.runInContext(helperSource,ctx);vm.runInContext(approvalSource,ctx);
  assert.throws(()=>ctx.validateProofFileForApproval_('https://example.com/file/'+fileId),/tautan Google Drive yang valid/);
});
