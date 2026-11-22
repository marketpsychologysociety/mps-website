import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Index.html',import.meta.url)),'utf8');
new vm.Script(code,{filename:'Code.gs'});
function body(name){
 const start=code.indexOf('function '+name+'(');
 assert.ok(start>=0,'function '+name+' exists');
 const end=code.indexOf('\nfunction ',start+1);
 return code.slice(start,end<0?undefined:end);
}
test('renewal period extends from future expiry, never shortens paid time',()=>{
 const ctx={Date,Number,Math};vm.createContext(ctx);vm.runInContext(body('calculateRenewalPeriod_'),ctx);
 const now=Date.parse('2026-11-21T00:00:00Z'),future=Date.parse('2026-12-01T00:00:00Z');
 const early=ctx.calculateRenewalPeriod_(new Date(future),now);
 assert.equal(early.startAt.getTime(),future);
 assert.equal(early.endAt.getTime(),future+30*86400000);
 const late=ctx.calculateRenewalPeriod_(new Date(now-90*86400000),now);
 assert.equal(late.startAt.getTime(),now);
 assert.equal(late.endAt.getTime(),now+30*86400000);
 assert.throws(()=>ctx.calculateRenewalPeriod_('',now),/tanggal masa aktif/i);
});
test('renewal schema is included in isolated provisioning and has fixed audit columns',()=>{
 assert.match(code,/renewals:\s*\{name:'MPS Membership Renewals', headers:\['Renewal Ref','Member ID','Submitted At','Amount IDR','Payment Date','Proof File ID','Status','Admin Note','Reviewed At','Period Start','Period End'\]\}/);
 assert.match(code,/Object\.keys\(MPS\.SHEETS\)\.forEach/);
});
test('expired Regular member login is renewal-only; member content still enforces entitlement',()=>{
 const login=body('apiMemberLogin'),state=body('memberRenewalAccessState_'),content=body('apiGetMemberContent');
 assert.match(login,/memberRenewalAccessState_\(id,Date\.now\(\)\)/);
 assert.match(login,/if\(!renewalState\.eligible \|\| !renewalState\.expired\) assertMembershipEntitlement_\(id\)/);
 assert.match(state,/status==='Kedaluwarsa'/);
 assert.match(state,/Number\.isFinite\(expiry\)/);
 assert.match(content,/assertMembershipEntitlement_\(actor\.actorId\)/);
});
test('renewal submission binds member to authenticated session and rejects duplicate pending requests',()=>{
 const submit=body('apiSubmitMemberRenewal');
 assert.match(submit,/requireSession_\(session,\['MEMBER'\]\)/);
 assert.match(submit,/actor\.actorId/);
 assert.doesNotMatch(submit,/input\.memberId/);
 assert.match(submit,/amount!==100000/);
 assert.match(submit,/image\/jpeg','image\/png','image\/webp/);
 assert.match(submit,/bytes\.length>5\*1024\*1024/);
 assert.match(submit,/enforceRateLimit_\('member-renewal',actor\.actorId,3,3600\)/);
 assert.match(submit,/LockService\.getScriptLock/);
 assert.match(submit,/Menunggu Validasi/);
 assert.match(submit,/setSharing\(DriveApp\.Access\.PRIVATE/);
 assert.match(submit,/proofFile\.setTrashed\(true\)/);
 assert.match(submit,/appendRow may commit remotely/);
 assert.match(submit,/lookupVerified/);
 assert.match(submit,/jangan kirim ulang sebelum Admin merekonsiliasi/);
 assert.match(submit,/auditWarning/);
});
test('Admin renewal approval is idempotent, proof-verified, atomic and preserves member ID',()=>{
 const review=body('apiAdminReviewRenewal');
 assert.match(review,/requireSession_\(session,\['ADMIN','SUPER_ADMIN'\]\)/);
 assert.ok(review.includes("if(!/^MPS-REN-"));
 assert.match(review,/Menunggu Validasi/);
 assert.match(review,/decision==='APPROVE'/);
 assert.match(review,/assertMpsDriveFolderTreePrivate_/);
 assert.match(review,/paymentDateValue=new Date\(paymentDate\+'T00:00:00\+07:00'\)/);
 assert.match(review,/Utilities\.formatDate\(paymentDateValue,MPS\.TZ,'yyyy-MM-dd'\)/);
 assert.match(review,/proof\.getMimeType\(\)/);
 assert.match(review,/proof\.getSize\(\)/);
 assert.match(review,/proof\.getBlob\(\)\.getBytes\(\)/);
 assert.match(review,/isAllowedImageBytes_\(proofBytes,proofMime\)/);
 assert.match(review,/ledgerSnapshot\[2\].*REGULAR/);
 assert.match(review,/calculateRenewalPeriod_\(ledgerSnapshot\[5\],now\.getTime\(\)\)/);
 assert.match(review,/ledger\.getRange\(ledgerRow,4\)\.setValue\('Aktif'\)/);
 assert.match(review,/ledger\.getRange\(ledgerRow,6\)\.setValue\(period\.endAt\)/);
 assert.match(review,/rollbackErrors/);
 assert.doesNotMatch(review,/appendRow\(\[memberId/);
});
test('Admin can reject without requiring valid proof, but approval cannot',()=>{
 const review=body('apiAdminReviewRenewal');
 const proofCheck=review.indexOf("if(decision==='APPROVE')");
 const proofLookup=review.indexOf('DriveApp.getFileById',proofCheck);
 const decisionWrite=review.indexOf("sh.getRange(row,7).setValue");
 assert.ok(proofCheck>=0&&proofLookup>proofCheck&&decisionWrite>proofLookup);
 assert.match(review,/decision==='APPROVE'\?'Disetujui':'Ditolak'/);
});
test('renewal info endpoint and Admin list are role-gated',()=>{
 assert.match(body('apiGetMemberRenewalInfo'),/requireSession_\(session,\['MEMBER'\]\)/);
 assert.match(body('apiAdminListRenewals'),/requireSession_\(session,\['ADMIN','SUPER_ADMIN'\]\)/);
});
test('member UI offers renewal and Admin UI can review it even with no initial applications',()=>{
 assert.match(html,/id="memberRenewalForm"/);
 assert.match(html,/apiGetMemberRenewalInfo/);
 assert.match(html,/apiSubmitMemberRenewal/);
 assert.match(html,/apiAdminListRenewals/);
 assert.match(html,/apiAdminReviewRenewal/);
 assert.match(html,/await loadAdminRenewals\(\);if\(!items\.length\)/);
});

test('renewal auditWarning reflects actual append success or failure',()=>{
 const audit=body('audit_');
 assert.match(audit,/return true/);
 assert.match(audit,/return false/);
 assert.match(body('apiSubmitMemberRenewal'),/const auditWarning=!audit_\(/);
 assert.match(body('apiAdminReviewRenewal'),/const auditWarning=!audit_\(/);
});


test('invalid or missing membership expiry fails closed instead of granting a fresh 30 days',()=>{
 const ctx={Date,Number,Math};vm.createContext(ctx);vm.runInContext(body('calculateRenewalPeriod_'),ctx);
 const now=Date.parse('2026-11-21T00:00:00Z');
 for(const invalid of ['',null,'not-a-date',new Date(NaN)])
  assert.throws(()=>ctx.calculateRenewalPeriod_(invalid,now),/tanggal masa aktif/i);
 assert.throws(()=>ctx.calculateRenewalPeriod_(new Date(now),NaN),/tanggal masa aktif/i);
});
test('renewal eligibility requires a valid expiry timestamp even when ledger status says expired',()=>{
 const state=body('memberRenewalAccessState_');
 assert.ok(state.indexOf('if(!Number.isFinite(expiry)') < state.indexOf("const expired=status==='Kedaluwarsa'"));
 assert.match(state,/Number\.isFinite\(Number\(nowMs\)\)/);
 assert.match(state,/status==='Kedaluwarsa' \|\| \(status==='Aktif' && expiry<=Number\(nowMs\)\)/);
});


test('renewal access state accepts valid expired Regular member but rejects malformed ledger rows',()=>{
 const stateSource=body('memberRenewalAccessState_');
 function run(options={}){
  const plan=options.plan||'REGULAR';
  const status=options.status||'Kedaluwarsa';
  const expiry=Object.prototype.hasOwnProperty.call(options,'expiry')?options.expiry:new Date('2026-10-01T00:00:00Z');
  const memberStatus=options.memberStatus||'Berhasil';
  const legacy={getRange:()=>({getDisplayValue:()=>memberStatus})};
  const ledger={getRange:()=>({getValues:()=>[['MPS-ABCDEF1234','APP-1',plan,status,new Date('2026-09-01T00:00:00Z'),expiry,'','']]})};
  const ctx={Date,Number,legacySheet_:()=>legacy,sheet_:()=>ledger,findRow_:()=>2};
  vm.createContext(ctx);vm.runInContext(stateSource,ctx);
  return ctx.memberRenewalAccessState_('MPS-ABCDEF1234',Date.parse('2026-11-21T00:00:00Z'));
 }
 assert.equal(run().eligible,true);
 assert.equal(run({status:'Aktif',expiry:new Date('2026-12-01T00:00:00Z')}).expired,false);
 assert.throws(()=>run({expiry:null}),/tanggal kedaluwarsa/i);
 assert.throws(()=>run({expiry:''}),/tanggal kedaluwarsa/i);
 assert.throws(()=>run({expiry:'rusak'}),/tanggal kedaluwarsa/i);
 assert.equal(run({plan:'ACTIVE_IB'}).eligible,false);
 assert.throws(()=>run({memberStatus:'Ditolak'}),/status member tidak aktif/i);
});
