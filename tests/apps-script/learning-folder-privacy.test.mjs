import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../candidates/Code.gs', import.meta.url), 'utf8');

function load(folder, properties={MPS_LEARNING_FOLDER_ID:'learning-folder',MPS_PROOF_FOLDER_ID:'proof-folder'}) {
  const helperStart=source.indexOf('function assertMpsDriveFolderTreePrivate_(');
  const helperEnd=source.indexOf('\nfunction ',helperStart+20);
  const fnStart=source.indexOf('function getLearningFolderId_()');
  const fnEnd=source.indexOf('\nfunction ',fnStart+20);
  assert.ok(helperStart>=0&&helperEnd>helperStart,'folder ACL helper must exist');
  assert.ok(fnStart>=0&&fnEnd>fnStart,'Learning folder resolver must exist');
  const context={
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFolderById:id=>{assert.equal(id,'learning-folder');return folder;}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]||''})}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(helperStart,helperEnd)+'\n'+source.slice(fnStart,fnEnd),context,{timeout:1000});
  return context.getLearningFolderId_;
}
function iterator(items=[]) {let i=0;return{hasNext:()=>i<items.length,next:()=>items[i++]};}
function folder(id,access='PRIVATE',parents=[]) {
  return {getId:()=>id,getSharingAccess:()=>access,getParents:()=>iterator(parents)};
}

test('Learning folder accepts a private folder tree',()=>{
  const root=folder('root'),parent=folder('parent','PRIVATE',[root]),leaf=folder('learning-folder','PRIVATE',[parent]);
  assert.equal(load(leaf)(),'learning-folder');
});
test('Learning folder rejects a publicly shared direct folder',()=>{
  const leaf=folder('learning-folder','ANYONE');
  assert.throws(()=>load(leaf)(),/tidak PRIVATE/);
});
test('Learning folder rejects a shared ancestor even when its own ACL is private',()=>{
  const root=folder('root','DOMAIN_WITH_LINK'),parent=folder('parent','PRIVATE',[root]),leaf=folder('learning-folder','PRIVATE',[parent]);
  assert.throws(()=>load(leaf)(),/tidak PRIVATE/);
});
test('Learning folder fails closed if folder ancestry cannot be inspected',()=>{
  const leaf={getId:()=> 'learning-folder',getSharingAccess:()=> 'PRIVATE'};
  assert.throws(()=>load(leaf)(),/tidak dapat diverifikasi/);
});
test('Learning folder cannot reuse the deposit proof folder',()=>{
  const leaf=folder('learning-folder');
  assert.throws(()=>load(leaf,{MPS_LEARNING_FOLDER_ID:'proof-folder',MPS_PROOF_FOLDER_ID:'proof-folder'})(),/wajib terpisah/);
});
