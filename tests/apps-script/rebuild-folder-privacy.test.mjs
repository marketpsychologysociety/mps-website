import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'rebuild/v4.8.1/Code.gs'});
const start=source.indexOf('function assertMpsDriveFolderTreePrivate_(folder,label) {');
const end=source.indexOf('\nfunction validateMpsRebuildConfig_(',start+1);
assert.ok(start>=0&&end>start,'folder privacy helper source boundaries must exist');
const helperSource=source.slice(start,end);
function folder(id,access,parents=[]){
  return {getId:()=>id,getSharingAccess:()=>access,getParents:()=>{let i=0;return{hasNext:()=>i<parents.length,next:()=>parents[i++]};}};
}
function check(root){
  const ctx={DriveApp:{Access:{PRIVATE:'PRIVATE'}}};
  vm.createContext(ctx);vm.runInContext(helperSource,ctx,{timeout:1000});
  return ctx.assertMpsDriveFolderTreePrivate_(root,'synthetic proof folder');
}

test('private folder with only private ancestors passes the access guard',()=>{
  const root=folder('child','PRIVATE',[folder('parent','PRIVATE',[folder('root','PRIVATE')])]);
  assert.equal(check(root),true);
});

test('a public ancestor blocks access even when the proof folder itself is private',()=>{
  const root=folder('child','PRIVATE',[folder('parent','ANYONE_WITH_LINK')]);
  assert.throws(()=>check(root),/folder induknya tidak PRIVATE/);
});

test('a missing or unreadable folder ancestry fails closed',()=>{
  assert.throws(()=>check({getId:()=> 'child',getSharingAccess:()=> 'PRIVATE'}),/tidak dapat diverifikasi/);
  assert.throws(()=>check(folder('child','DOMAIN',[folder('parent','PRIVATE')])),/tidak PRIVATE/);
});

test('cyclic or repeated parent references do not loop indefinitely',()=>{
  const a=folder('a','PRIVATE'),b=folder('b','PRIVATE');
  a.getParents=()=>{let i=0;return{hasNext:()=>i<1,next:()=>b};};
  b.getParents=()=>{let i=0;return{hasNext:()=>i<1,next:()=>a};};
  assert.equal(check(a),true);
});

test('all proof upload, approval, validation, and backup paths enforce ancestor privacy',()=>{
  assert.match(source,/assertMpsDriveFolderTreePrivate_\(folder,'folder bukti deposit'\)/);
  assert.match(source,/assertMpsDriveFolderTreePrivate_\(folder,'folder bukti pembayaran QRIS'\)/);
  assert.match(source,/assertMpsDriveFolderTreePrivate_\(DriveApp\.getFolderById\(expectedFolder\),'folder bukti QRIS'\)/);
  assert.match(source,/assertMpsDriveFolderTreePrivate_\(DriveApp\.getFolderById\(proofFolder\),'folder bukti deposit'\)/);
  assert.match(source,/assertMpsDriveFolderTreePrivate_\(backupFolder,'folder backup'\)/);
  assert.match(source,/proofFolderPrivate/);
  assert.match(source,/backupFolderPrivate/);
});
