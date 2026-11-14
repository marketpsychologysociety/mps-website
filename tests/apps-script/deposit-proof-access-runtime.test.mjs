import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
const runtimeSource=['isValidImageSignature_','validateProofFileForApproval_','apiAdminGetDepositProof'].map(extract).join('\n');
const applicationRef='MPS-APP-0123456789ABCDEF0123',memberId='MPS-ABCDEF1234',fileId='proof-file-0123456789';
const proofUrl='https://drive.google.com/file/d/'+fileId+'/view';
const png=[137,80,78,71,13,10,26,10,0];

function harness({authorized=true,status='Menunggu Validasi Admin',storedFileId=fileId,privateFile='PRIVATE',privateFolder='PRIVATE',legacy=false}={}){
  const deposit=[applicationRef,new Date(),'Nama','12345678','Standard',1000000,new Date(),storedFileId,proofUrl,status,'','','',new Date()];
  const member=new Array(30).fill('');member[0]=memberId;member[13]=proofUrl;member[14]='Menunggu verifikasi';
  let sheetReads=0,fileReads=0,rateCalls=0;
  const file={getId:()=>fileId,getName:()=> 'bukti.png',getMimeType:()=> 'image/png',getSize:()=>png.length,isTrashed:()=>false,getSharingAccess:()=>privateFile,getBlob:()=>({getBytes:()=>png}),getParents:()=>{let used=false;return{hasNext:()=>!used,next:()=>{used=true;return{getId:()=> 'proof-folder'};}};}};
  const folder={getSharingAccess:()=>privateFolder};
  const context={
    MPS:{headers:new Array(30),maxProofBytes:5*1024*1024},
    MPS_COL:{depositStatus:15,proofUrl:14},
    MPS_DEPOSITS:{headers:new Array(14)},
    MPS_APPLICATIONS:{headers:new Array(15)},
    requireAdmin_:()=>{if(!authorized)throw Error('ADMIN_AUTH_REQUIRED');return{role:'ADMIN',actorId:'ADMIN-1'};},
    consumeRateLimit_:()=>{rateCalls++;},sha256_:()=> 'a'.repeat(64),clean_:v=>String(v??'').trim().slice(0,48),
    getMpsDepositsSheet_:()=>{sheetReads++;return{getRange:()=>({getValues:()=>[deposit]})};},
    findMpsDepositRow_:()=>2,getMemberSheet_:()=>({getRange:()=>({getValues:()=>[member]})}),findMemberById_:()=>2,
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':key==='MPS_LEARNING_FOLDER_ID'?'learning-folder':''})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>folder,getFileById:id=>{fileReads++;assert.equal(id,fileId);return file;}},
    Utilities:{base64Encode:()=> 'iVBORw0KGgo='}
  };
  vm.createContext(context);vm.runInContext(runtimeSource,context,{timeout:1000});
  return{run:(key=legacy?memberId:applicationRef)=>context.apiAdminGetDepositProof('admin-session',key),stats:()=>({sheetReads,fileReads,rateCalls})};
}

test('ordinary Admin retrieves pending proof through authenticated API without a Drive URL',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(result.mimeType,'image/png');assert.equal(result.base64,'iVBORw0KGgo=');
  assert.equal(Object.hasOwn(result,'url'),false);assert.deepEqual(h.stats(),{sheetReads:1,fileReads:2,rateCalls:1});
});
test('unauthenticated callers cannot read proof or trigger rate-limited storage work',()=>{
  const h=harness({authorized:false});
  assert.throws(()=>h.run(),/ADMIN_AUTH_REQUIRED/);
  assert.deepEqual(h.stats(),{sheetReads:0,fileReads:0,rateCalls:0});
});
test('proof endpoint denies non-pending records and mismatched stored file IDs',()=>{
  const closed=harness({status:'Disetujui'});
  assert.throws(()=>closed.run(),/masih menunggu verifikasi/);assert.equal(closed.stats().fileReads,0);
  const mismatch=harness({storedFileId:'different-file-id-123456'});
  assert.throws(()=>mismatch.run(),/ID file bukti tidak cocok/);assert.equal(mismatch.stats().fileReads,1);
});
test('proof endpoint rejects non-private Drive storage before returning bytes',()=>{
  assert.throws(()=>harness({privateFile:'ANYONE'}).run(),/File bukti deposit tidak PRIVATE/);
  assert.throws(()=>harness({privateFolder:'ANYONE'}).run(),/Folder bukti deposit tidak PRIVATE/);
});
test('legacy pending deposits remain accessible through the same Admin-only proof proxy',()=>{
  const h=harness({legacy:true});
  const result=h.run(memberId);
  assert.equal(result.ok,true);assert.equal(result.mimeType,'image/png');assert.equal(h.stats().fileReads,2);
});
