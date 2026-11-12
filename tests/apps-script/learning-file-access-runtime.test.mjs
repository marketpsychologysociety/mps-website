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
const runtimeSource=['listLearningFiles_','apiGetLearningFile','apiAdminGetLearningFile'].map(extract).join('\n');
const fileId='learning-file-0123456789';

function harness({catalogStatus='Published',privateFile='PRIVATE',privateFolder='PRIVATE',inFolder=true,mime='application/pdf',bytes=[37,80,68,70,45,49],trashed=false,authorized=true,adminRole='SUPER_ADMIN'}={}){
  let driveFileReads=0;
  const catalog=[{'File ID':fileId,Title:'Materi Uji',Category:'Risk',Level:'Beginner',Description:'',Status:catalogStatus,'Sort Order':1}];
  const file={
    getId:()=>fileId,getName:()=> 'materi.pdf',getSize:()=>bytes.length,getMimeType:()=>mime,
    getSharingAccess:()=>privateFile,isTrashed:()=>trashed,getLastUpdated:()=>new Date('2026-11-01T00:00:00Z'),
    getParents:()=>{let used=false;return{hasNext:()=>!used,next:()=>{used=true;return{getId:()=>inFolder?'learning-folder':'other-folder'};}};},
    getBlob:()=>({getBytes:()=>bytes})
  };
  const folder={getFiles:()=>{let used=false;return{hasNext:()=>!used,next:()=>{used=true;return file;}};},getSharingAccess:()=>privateFolder};
  const context={
    MPS:{maxLearningFileBytes:8*1024*1024},
    MPS_LEARNING_CATALOG:{sheet:'MPS Learning Catalog',headers:[]},
    MPS_LEARNING_PROGRESS:{sheet:'MPS Learning Progress',headers:[]},
    MimeType:{PDF:'application/pdf'},DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:()=>folder,getFileById:id=>{driveFileReads++;assert.equal(id,fileId);return file;}},
    getLearningFolderId_:()=> 'learning-folder',
    readMpsContentRows_:(sheet)=>sheet==='MPS Learning Catalog'?catalog:[],
    formatDateForClient_:()=> '2026-11-01',
    requireMember_:()=>{if(!authorized)throw Error('MEMBER_AUTH_REQUIRED');return{memberId:'MPS-ABCDEF1234'};},
    requireSuperAdmin_:()=>{if(adminRole!=='SUPER_ADMIN')throw Error('SUPER_ADMIN_REQUIRED');return{role:adminRole,actorId:adminRole};},
    consumeRateLimit_:()=>{},sha256_:()=> 'a'.repeat(64),
    Utilities:{base64Encode:()=> 'UEZERg=='}
  };
  vm.createContext(context);vm.runInContext(runtimeSource,context,{timeout:1000});
  return{
    member:()=>context.apiGetLearningFile('member-session',fileId),
    admin:()=>context.apiAdminGetLearningFile('admin-session',fileId),
    list:()=>context.listLearningFiles_('MPS-ABCDEF1234',false),
    stats:()=>({driveFileReads})
  };
}

test('member receives only Published private PDFs and direct download succeeds for listed item',()=>{
  const h=harness();
  assert.equal(h.list().files.length,1);
  assert.equal(h.member().base64,'UEZERg==');
  assert.equal(h.stats().driveFileReads,1);
});
test('direct member file ID cannot bypass authentication or Published catalog status',()=>{
  const unauth=harness({authorized:false});
  assert.throws(()=>unauth.member(),/MEMBER_AUTH_REQUIRED/);
  assert.equal(unauth.stats().driveFileReads,0);
  for(const status of ['Draft','Hidden','Unknown']){
    const h=harness({catalogStatus:status});
    assert.throws(()=>h.member(),/Materi tidak tersedia untuk member ini/);
    assert.equal(h.stats().driveFileReads,0);
  }
});
test('member file endpoint rejects non-private, misplaced, trashed, oversized, and non-PDF files',()=>{
  const cases=[
    [{privateFile:'ANYONE'},/tidak PRIVATE/],
    [{inFolder:false},/Akses file tidak diizinkan/],
    [{trashed:true},/File tidak tersedia/],
    [{mime:'image/png'},/File tidak tersedia/],
    [{bytes:[1,2,3,4,5]},/bukan PDF yang valid/],
    [{bytes:new Array(8*1024*1024+1).fill(1)},/File tidak tersedia/]
  ];
  for(const [options,pattern] of cases)assert.throws(()=>harness(options).member(),pattern);
});
test('ordinary Admin cannot use the Super Admin Learning file endpoint',()=>{
  const h=harness({adminRole:'ADMIN'});
  assert.throws(()=>h.admin(),/SUPER_ADMIN_REQUIRED/);
  assert.equal(h.stats().driveFileReads,0);
});
test('Super Admin can retrieve a private Learning PDF only from the configured folder',()=>{
  const h=harness();
  assert.equal(h.admin().ok,true);
  assert.equal(h.stats().driveFileReads,1);
  const misplaced=harness({inFolder:false});
  assert.throws(()=>misplaced.admin(),/Akses file tidak diizinkan/);
});
