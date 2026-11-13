import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function saveDeposit_(sheet, data, onFileCreated, onProofLinked, onCommitStarted) {');
const end=source.indexOf('function setupMPSStorage_(',start+1);
assert.ok(start>=0&&end>start,'saveDeposit_ source boundaries must exist');
const saveSource=source.slice(start,end);
const appRef='MPS-APP-0123456789ABCDEF0123';

function makeSheet(rows,label,{failAt='',state}={}) {
 return {
  getLastRow:()=>rows.length,
  getRange(r,c,nr=1,nc=1){return{
   getValues:()=>Array.from({length:nr},(_,ri)=>(rows[r-1+ri]||[]).slice(c-1,c-1+nc)),
   getDisplayValues:()=>Array.from({length:nr},(_,ri)=>(rows[r-1+ri]||[]).slice(c-1,c-1+nc).map(v=>String(v??''))),
   setValue(v){if(!rows[r-1])rows[r-1]=[];rows[r-1][c-1]=v;if((Array.isArray(state.failAt)?state.failAt.includes(label):state.failAt===label)&&!state.failed.has(label)){state.failed.add(label);throw new Error('INJECTED_'+label+'_WRITE');}},
   setValues(values){values.forEach((line,ri)=>{if(!rows[r-1+ri])rows[r-1+ri]=[];line.forEach((v,ci)=>rows[r-1+ri][c-1+ci]=v);});if((Array.isArray(state.failAt)?state.failAt.includes('oldLinkRollback'):state.failAt==='oldLinkRollback')&&label==='links'&&r===2&&values[0][3]==='Menunggu'&&!state.failed.has('oldLinkRollback')){state.failed.add('oldLinkRollback');throw new Error('INJECTED_oldLinkRollback');}if((Array.isArray(state.failAt)?state.failAt.includes(label):state.failAt===label)&&!state.failed.has(label)){state.failed.add(label);throw new Error('INJECTED_'+label+'_WRITE');}}
  };},
  appendRow(row){rows.push(row.slice());},
  deleteRow(row){rows.splice(row-1,1);}
 };
}
function depositHarness({failAt=''}={}) {
 const state={failAt,failed:new Set()},now=new Date('2026-11-12T00:00:00Z');
 const appsRows=[new Array(15).fill(''),[appRef,now,'Member Test','@member_test','ID','Trading','', 'Menunggu Deposit','','','','','','',now]];
 const depositsRows=[new Array(14).fill('')];
 const linksRows=[new Array(11).fill(''),['old-hash',now,new Date(now.getTime()+600000),'Menunggu','',appRef,'','','','','']];
 const apps=makeSheet(appsRows,'app',{state}),deposits=makeSheet(depositsRows,'deposit',{state}),links=makeSheet(linksRows,'links',{state});
 const file={trashed:false,setSharing(){},getSharingAccess:()=> 'PRIVATE',getUrl:()=> 'https://drive.google.test/private-proof',getId:()=> 'file-proof-123456789',setTrashed(v){this.trashed=v;}};
 const folder={getSharingAccess:()=> 'PRIVATE',createFile:()=>file};
 const context={
  MPS:{minDeposit:1000000,maxProofBytes:5242880},
  MPS_APPLICATIONS:{headers:new Array(15)},MPS_DEPOSITS:{headers:new Array(14)},MPS_MEMBER_LINKS:{headers:new Array(11)},
  clean_:v=>String(v??'').trim(),sheetText_:v=>String(v??''),validDate_:()=>true,isValidImageSignature_:()=>true,
  Utilities:{formatDate:()=> '2026-11-12',getUuid:()=> '12345678-1234-1234-1234-123456789abc',base64Decode:()=>new Uint8Array([1,2,3,4,5,6,7,8]),newBlob:()=>({getDataAsString:()=>''})},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='MPS_PROOF_FOLDER_ID'?'proof-folder':key==='MPS_LEARNING_FOLDER_ID'?'learning-folder':''})},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFolderById:()=>folder},
  getMpsApplicationsSheet_:()=>apps,findMpsApplicationRow_:()=>2,
  getMpsDepositsSheet_:()=>deposits,
  findMpsDepositRow_:(sheet,ref)=>{for(let i=1;i<depositsRows.length;i++)if(depositsRows[i][0]===ref)return i+1;return 0;},
  getMpsMemberLinksSheet_:()=>links,
  findMpsMemberLinkRow_:(sheet,hash)=>{for(let i=1;i<linksRows.length;i++)if(linksRows[i][0]===hash)return i+1;return 0;},
  createMemberTelegramLink_:(memberId,ref,onPrepared)=>{const row=linksRows.length+1,token='new-one-time-token';if(onPrepared)onPrepared({token,row});links.appendRow(['new-hash',now,new Date(now.getTime()+900000),'Menunggu',memberId,ref,'','','','','']);return{token,row,url:'https://t.me/MPSBot?start='+token,expiresAt:'12 Nov 2026',expiresIn:900};},
  expireOtherApplicationLinks_:(ref,keepRow)=>{for(let i=1;i<linksRows.length;i++)if(i+1!==keepRow&&linksRows[i][5]===ref&&linksRows[i][3]==='Menunggu')linksRows[i][3]='Diganti';},
  safeErrorMessage_:e=>String(e&&e.message||e),console
 };
 vm.createContext(context);vm.runInContext(saveSource,context,{timeout:1000});
 let uploaded=null,proofLinked=false;
 const payload={applicationRef:appRef,memberName:'Member Test',mt5Login:'12345678',accountType:'Standard',depositAmount:1000000,depositDate:'2026-11-11',proofMimeType:'image/png',proofBase64:'QUJDREVGR0g='};
 return {run:()=>context.saveDeposit_(null,payload,file=>{uploaded=file;},()=>{proofLinked=true;}),appsRows,depositsRows,linksRows,file,getUploaded:()=>uploaded,proofLinked:()=>proofLinked,state};
}
test('deposit success stores private proof, creates one-time link, and expires prior link',()=>{
 const h=depositHarness();const result=h.run();
 assert.equal(result.result.ok,true);assert.equal(h.proofLinked(),true);
 assert.equal(h.depositsRows.length,2);assert.equal(h.linksRows.length,3);
 assert.equal(h.linksRows[1][3],'Diganti');assert.equal(h.linksRows[2][3],'Menunggu');
 assert.equal(h.file.trashed,false);
});
test('deposit rollback restores prior application/deposit/link states and cancels new link',()=>{
 const h=depositHarness({failAt:'app'});
 assert.throws(()=>h.run(),/INJECTED_app_WRITE/);
 assert.equal(h.appsRows[1][7],'Menunggu Deposit');assert.equal(h.depositsRows.length,1);
 assert.equal(h.linksRows[1][3],'Menunggu');assert.equal(h.linksRows[2][3],'Dibatalkan');
 assert.equal(h.proofLinked(),false);assert.equal(h.state.failed.has('app'),true);
 const err={preserveProofFile:false};if(!err.preserveProofFile)h.file.setTrashed(true);
 assert.equal(h.file.trashed,true);
});
test('incomplete old-link rollback preserves private proof and flags operator reconciliation',()=>{
 const h=depositHarness({failAt:['app','oldLinkRollback']});
 assert.throws(()=>h.run(),err=>{
  assert.match(err.message,/Rollback tidak lengkap/);
  assert.equal(err.preserveProofFile,true);
  return true;
 });
 assert.equal(h.file.trashed,false);
 assert.equal(h.proofLinked(),false);
});
