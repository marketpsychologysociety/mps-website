import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Index.html',import.meta.url)),'utf8');
new vm.Script(code,{filename:'rebuild/v4.8.1/Code.gs'});

function extract(source,name){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'source boundaries must exist for '+name);
  return source.slice(start,end);
}
const contentId='MPS-LEARN-ABCDEF123456';
const fileId='learning-file-0123456789';
const pdf=[37,80,68,70,45];

function harness(options={}){
  const o={role:'MEMBER',memberStatus:'Berhasil',entitled:true,published:true,
    resourceUrl:'https://drive.google.com/file/d/'+fileId+'/view',
    folderId:'learning-folder',proofFolderId:'proof-folder',folderAccess:'PRIVATE',
    ancestorAccess:'PRIVATE',fileAccess:'PRIVATE',fileMime:'application/pdf',
    fileBytes:pdf,fileSize:pdf.length,trashed:false,inFolder:true,rateLimit:true,...options};
  let fileReads=0,folderReads=0,catalogReads=0,memberReads=0,rateCalls=0;
  const ancestor={getId:()=> 'learning-root',getSharingAccess:()=>o.ancestorAccess,getParents:()=>iterator([])};
  const folder={getId:()=>o.folderId,getSharingAccess:()=>o.folderAccess,getParents:()=>iterator(o.ancestorAccess==='NONE'?[]:[ancestor])};
  const fileParent=o.inFolder?folder:{getId:()=> 'other-folder',getSharingAccess:()=> 'PRIVATE',getParents:()=>iterator([])};
  const file={getId:()=>fileId,getName:()=> 'MPS Materi.pdf',getSize:()=>o.fileSize,getMimeType:()=>o.fileMime,
    isTrashed:()=>o.trashed,getSharingAccess:()=>o.fileAccess,getParents:()=>iterator([fileParent]),
    getBlob:()=>({getBytes:()=>o.fileBytes})};
  const record=[contentId,new Date(),new Date(),'Materi Uji','Risk','Isi',o.resourceUrl,o.published,1];
  const catalog={getRange:(row,col,nr,nc)=>({getValues:()=>{catalogReads++;return [record];}})};
  const memberSheet={getRange:()=>({getDisplayValue:()=>o.memberStatus})};
  const context={
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:id=>{folderReads++;assert.equal(id,o.folderId);return folder;},
      getFileById:id=>{fileReads++;assert.equal(id,fileId);return file;}},
    Utilities:{base64Encode:bytes=>{assert.deepEqual(Array.from(bytes),o.fileBytes);return 'UEZERi0=';}},
    requireSession_:(token,roles)=>{if(!roles.includes(o.role))throw Error('ROLE_NOT_ALLOWED');return {role:o.role,actorId:o.role==='MEMBER'?'MPS-ABCDEF12':'ADMIN-TEST'};},
    legacySheet_:()=>{memberReads++;return memberSheet;},
    findRow_:(sheet,col,value)=>value==='MPS-ABCDEF12'?2:2,
    assertMembershipEntitlement_:()=>{if(!o.entitled)throw Error('ENTITLEMENT_DENIED');},
    enforceRateLimit_:()=>{rateCalls++;if(!o.rateLimit)throw Error('RATE_LIMITED');},
    clean_:(v,max)=>String(v??'').replace(/[<>]/g,'').trim().slice(0,max),
    sheet_:key=>{assert.equal(key,'learning');return catalog;},
    prop_:key=>key==='MPS_LEARNING_FOLDER_ID'?o.folderId:key==='MPS_PROOF_FOLDER_ID'?o.proofFolderId:'',
    String,Number,Array,Date
  };
  vm.createContext(context);
  const source=['assertMpsDriveFolderTreePrivate_','assertMpsDriveFileTreePrivate_','driveFileIdFromUrl_','apiDownloadLearningMaterial'].map(n=>extract(code,n)).join('\n');
  vm.runInContext(source,context,{timeout:1000});
  return {run:()=>context.apiDownloadLearningMaterial('session-token',contentId),
    stats:()=>({fileReads,folderReads,catalogReads,memberReads,rateCalls})};
}
function iterator(items){let i=0;return{hasNext:()=>i<items.length,next:()=>items[i++]};}

test('Learning download returns PDF bytes only after member session, entitlement, publication and private Drive checks',()=>{
  const h=harness(),result=h.run();
  assert.equal(result.ok,true);assert.equal(result.mimeType,'application/pdf');assert.equal(result.base64,'UEZERi0=');
  assert.equal(result.name,'MPS Materi.pdf');
  assert.deepEqual(h.stats(),{fileReads:1,folderReads:1,catalogReads:1,memberReads:1,rateCalls:1});
});
test('invalid session is rejected before any catalog or Drive lookup',()=>{
  const h=harness({role:'INVALID'});
  // Session role is supplied by the session stub; enforce the accepted role list here.
  assert.throws(()=>h.run(),/ROLE_NOT_ALLOWED/);
  assert.equal(h.stats().fileReads,0);
});
test('member entitlement and active status are checked before file access',()=>{
  const expired=harness({entitled:false});
  assert.throws(()=>expired.run(),/ENTITLEMENT_DENIED/);
  assert.equal(expired.stats().fileReads,0);
  const inactive=harness({memberStatus:'Menunggu Aktivasi'});
  assert.throws(()=>inactive.run(),/Akses member tidak aktif/);
  assert.equal(inactive.stats().fileReads,0);
});
test('unpublished, unknown, or non-Google-Drive resources fail closed',()=>{
  for(const options of [{published:false},{resourceUrl:'https://example.com/private.pdf'},{resourceUrl:'https://drive.google.com/file/d/short/view'}]){
    const h=harness(options);
    assert.throws(()=>h.run(),/Materi tidak tersedia|Google Drive privat/);
    assert.equal(h.stats().fileReads,0);
  }
});
test('Learning folder must be configured, separate from proof folder, and private through all ancestors',()=>{
  for(const options of [{folderId:'',proofFolderId:'proof-folder'},{folderId:'proof-folder',proofFolderId:'proof-folder'},{folderAccess:'ANYONE'},{ancestorAccess:'DOMAIN_WITH_LINK'}]){
    const h=harness(options);
    assert.throws(()=>h.run(),/Folder Learning|konfigurasi secara aman/);
    assert.equal(h.stats().fileReads,0);
  }
});
test('download rejects shared, misplaced, trashed, oversized, non-PDF, and invalid-signature files',()=>{
  const cases=[
    [{fileAccess:'ANYONE'},/File Learning PDF.*PRIVATE/],
    [{inFolder:false},/Akses file tidak diizinkan/],
    [{trashed:true},/PDF tidak tersedia/],
    [{fileSize:8*1024*1024+1},/PDF tidak tersedia/],
    [{fileMime:'image/png'},/PDF tidak tersedia/],
    [{fileBytes:[1,2,3,4,5]},/bukan PDF yang valid/]
  ];
  for(const [options,pattern] of cases)assert.throws(()=>harness(options).run(),pattern);
});
test('per-member download rate limit is enforced',()=>{
  const h=harness({rateLimit:false});
  assert.throws(()=>h.run(),/RATE_LIMITED/);
  assert.equal(h.stats().fileReads,0);
});
test('member content projection exposes only a download flag, never the Drive URL',()=>{
  const body=extract(code,'apiGetMemberContent');
  assert.ok(body.includes("hasDownload:!!String(r[6]||'').trim()"));
  assert.doesNotMatch(body,/resourceUrl:/);
});
test('member UI uses authenticated download API and does not create direct Learning links',()=>{
  assert.match(html,/runApi\('apiDownloadLearningMaterial',\[memberSession,contentId\]\)/);
  assert.match(html,/item\.hasDownload/);
  assert.doesNotMatch(html,/item\.resourceUrl/);
  assert.match(html,/URL\.createObjectURL\(blob\)/);
});
