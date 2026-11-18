import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../../candidates/Code.gs',import.meta.url),'utf8');
function extract(startText,endText){
  const start=code.indexOf(startText),end=code.indexOf(endText,start);
  assert.ok(start>=0&&end>start,'Missing source function: '+startText);
  return code.slice(start,end);
}

test('member intelligence ignores attacker-supplied identity and binds output to the server session',()=>{
  const source=extract('function apiGetMemberIntelligence(session) {','\nfunction apiAdminGetMemberIntelligence(');
  let captured=null;
  const context={
    requireMember_:session=>{if(session!=='valid-server-session')throw new Error('SESSION_INVALID');return{memberId:'MPS-AAAAAAAAAA',row:2};},
    consumeRateLimit_:()=>{},
    sha256_:value=>'synthetic-hash-'+String(value),
    requireVipMember_:()=>{throw new Error('NOT_VIP');},
    buildMpsMemberIntelligence_:(member,vip)=>{captured={memberId:member.memberId,vip};return captured;},
  };
  vm.createContext(context);vm.runInContext(source,context,{timeout:1000});
  const result=context.apiGetMemberIntelligence('valid-server-session','MPS-BBBBBBBBBB');
  assert.equal(result.memberId,'MPS-AAAAAAAAAA');
  assert.equal(captured.memberId,'MPS-AAAAAAAAAA');
  assert.equal(captured.vip,false);
  assert.throws(()=>context.apiGetMemberIntelligence('forged-session','MPS-BBBBBBBBBB'),/SESSION_INVALID/);
});

test('member and administrator session tokens are not persisted in browser storage',()=>{
  const indexHtml=fs.readFileSync(new URL('../../candidates/Index.html',import.meta.url),'utf8');
  assert.doesNotMatch(indexHtml,/localStorage\.(?:getItem|setItem)\(\s*['"]mps_(?:member|admin)_/i);
  assert.doesNotMatch(indexHtml,/sessionStorage\.(?:getItem|setItem)\(\s*['"]mps_(?:member|admin)_/i);
  assert.doesNotMatch(indexHtml,/localStorage\.[\s\S]{0,120}(?:memberSession|adminSession|memberPin|adminToken)/i);
  assert.doesNotMatch(indexHtml,/sessionStorage\.[\s\S]{0,120}(?:memberSession|adminSession|memberPin|adminToken)/i);
});

test('public Market Pulse preview contains only static placeholders, never the private dataset',()=>{
  const preview=fs.readFileSync(new URL('../../heatmap.html',import.meta.url),'utf8');
  assert.match(preview,/KHUSUS ANGGOTA/i);
  assert.match(preview,/XAUUSD[^<]{0,40}M5/i);
  assert.match(preview,/•••/);
  assert.doesNotMatch(preview,/const\s+D\s*=|rawData|\b\d{1,3}\.\d%/i);
});

test('candidate source files contain no common hard-coded API or bot credential patterns',()=>{
  const paths=['../../candidates/Code.gs','../../candidates/Index.html','../../index.html','../../heatmap.html','../../scripts/build-market-pulse-dataset.mjs'];
  const patterns=[/\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/,/AIza[0-9A-Za-z_-]{30,}/,/gh[pousr]_[A-Za-z0-9]{30,}/,/AKIA[0-9A-Z]{16}/,/sk-[A-Za-z0-9]{20,}/];
  for(const path of paths){
    const content=fs.readFileSync(new URL(path,import.meta.url),'utf8');
    for(const pattern of patterns)assert.doesNotMatch(content,pattern,path+' contains a credential-like literal');
  }
});

function uploadContext(){
  const context={
    MPS:{maxLearningFileBytes:8*1024*1024},
    requireSuperAdmin_:()=>({role:'SUPER_ADMIN'}),
    clean_:v=>String(v||''),
    cleanNewsText_:v=>String(v||''),
    Utilities:{base64Decode:v=>Array.from(Buffer.from(v,'base64'))},
    MimeType:{PDF:'application/pdf'},
    getLearningFolderId_:()=>{throw new Error('DRIVE_SHOULD_NOT_BE_ACCESSED');},
  };
  vm.createContext(context);
  vm.runInContext(extract('function apiAdminUploadLearningFile(session,payload) {','\nfunction apiAdminDeleteLearningFile('),context,{timeout:1000});
  return context;
}
function upload(context,pdf,extra={}){
  return context.apiAdminUploadLearningFile('valid-super-admin',{
    name:'member-guide.pdf',title:'Member Guide',category:'Guide',level:'All Levels',
    description:'Static PDF',status:'Draft',sortOrder:1,
    base64:Buffer.from(pdf,'binary').toString('base64'),...extra,
  });
}

test('PDF upload rejects invalid signatures and truncated documents before any Drive access',()=>{
  const c=uploadContext();
  assert.throws(()=>upload(c,'not-a-pdf\n%%EOF'),/File bukan PDF valid/);
  assert.throws(()=>upload(c,'%PDF-1.7\nvalid body without final marker'),/Struktur akhir PDF tidak valid/);
});

test('PDF upload blocks active actions, JavaScript, embedded files and launch features',()=>{
  const c=uploadContext();
  for(const marker of ['/JavaScript','/JS','/OpenAction','/AA','/Launch','/EmbeddedFile','/RichMedia','/XFA']){
    const malicious='%PDF-1.7\n'+marker+' (payload)\n%%EOF';
    assert.throws(()=>upload(c,malicious),/active content atau embedded action/,'blocked '+marker);
  }
});

test('oversized PDF base64 is rejected before decoding or Drive access',()=>{
  const c=uploadContext();
  const oversized='A'.repeat(Math.ceil((8*1024*1024)*4/3)+32);
  assert.throws(()=>c.apiAdminUploadLearningFile('valid-super-admin',{name:'large.pdf',base64:oversized}),/melebihi batas 8 MB/);
});

test('a minimal static PDF passes content screening but still cannot bypass the private Drive boundary',()=>{
  const c=uploadContext();
  assert.throws(()=>upload(c,'%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'),/DRIVE_SHOULD_NOT_BE_ACCESSED/);
});
