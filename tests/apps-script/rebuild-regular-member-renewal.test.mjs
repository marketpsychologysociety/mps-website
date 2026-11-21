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
 const missing=ctx.calculateRenewalPeriod_('',now);
 assert.equal(missing.startAt.getTime(),now);
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
