import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../candidates/Index.html',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});

function functionSource(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'function '+name+' exists');
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?undefined:end);
}
function sheet(row){
  return {getRange(r,c,n=1,w=1){return {getValues:()=>[row.slice(c-1,c-1+w)],getDisplayValue:()=>String(row[c-1]??'')}}};
}
function entitlementContext({planStatus='Aktif',paymentStatus='Disetujui',expiry=new Date(Date.now()+86400000)}={}){
  const ref='MPS-APP-0123456789ABCDEF0123';
  const plan=[ref,'REGULAR',new Date(),100000,'NOT_REQUIRED','','',planStatus,new Date(),expiry,'',new Date()];
  const payment=['MPS-PAY-0123456789ABCDEF0123',ref,new Date(),100000,'2026-11-24','file-id','https://drive.google.com/file/d/file-id/view',paymentStatus,'Admin',new Date(),'',''];
  const ctx={
    Date,Number,
    MPS_MEMBERSHIP_PLANS:{headers:new Array(12)},MPS_REGULAR_PAYMENTS:{headers:new Array(12)},
    getMpsMembershipPlansSheet_:()=>sheet(plan),
    findMpsPlanRow_:()=>2,
    getMpsRegularPaymentsSheet_:()=>sheet(payment),
    findMpsRegularPaymentRow_:()=>2
  };
  vm.createContext(ctx);
  vm.runInContext(functionSource('mpsRegularMemberState_'),ctx);
  return {ctx,ref,plan,payment};
}

test('candidate Apps Script source parses after Regular QRIS integration',()=>{
  assert.doesNotThrow(()=>new vm.Script(source,{filename:'candidate/Code.gs'}));
});

test('Regular entitlement activates only after Admin-approved payment and unexpired plan',()=>{
  const {ctx,ref}=entitlementContext();
  const row=new Array(30).fill('');row[24]=ref;row[14]='Tidak Berlaku - Regular QRIS';
  const state=ctx.mpsRegularMemberState_(row,false);
  assert.equal(state.isRegular,true);
  assert.equal(state.active,true);
  assert.equal(state.approved,true);
  const expired=entitlementContext({expiry:new Date(Date.now()-1000)}).ctx;
  const expiredRow=new Array(30).fill('');expiredRow[24]=ref;
  const expiredState=expired.mpsRegularMemberState_(expiredRow,false);
  assert.equal(expiredState.active,false);
});

test('Regular payment approval may issue PIN while activation is pending, without treating QRIS as broker deposit',()=>{
  const {ctx,ref}=entitlementContext({planStatus:'Menunggu Aktivasi'});
  const row=new Array(30).fill('');row[24]=ref;row[14]='Tidak Berlaku - Regular QRIS';
  assert.equal(ctx.mpsRegularMemberState_(row,true).approved,true);
  assert.equal(ctx.mpsRegularMemberState_(row,false).active,false);
  const login=functionSource('apiMemberLogin');
  assert.match(login,/mpsRegularMemberState_\(r,false\)/);
  const issuePin=functionSource('apiAdminIssuePin');
  assert.match(issuePin,/memberHasApprovedPaymentForActivation_\(r\)/);
  assert.match(source,/row\[14\]='Tidak Berlaku - Regular QRIS'/);
});

test('Regular QRIS submission is fixed-fee, private-proof and isolated from Exness deposit storage',()=>{
  const submit=functionSource('apiSubmitRegularPayment');
  assert.match(submit,/amount!==100000/);
  assert.match(submit,/getMpsRegularPaymentsSheet_\(\)/);
  assert.match(submit,/MPS_MEMBERSHIP_PLANS/);
  assert.match(submit,/MPS_PROOF_FOLDER_ID/);
  assert.match(submit,/DriveApp\.Access\.PRIVATE/);
  assert.match(submit,/createMemberTelegramLink_/);
  assert.match(submit,/sendTelegram_\(adminTelegramMessage\)/);
  assert.match(submit,/telegramWarning/);
  assert.doesNotMatch(submit,/getMpsDepositsSheet_|MPS_DEPOSITS|saveDeposit_/);
});

test('Regular Admin review requires Telegram and proof, then stores a separate entitlement',()=>{
  const review=functionSource('apiAdminReviewRegularPayment');
  assert.match(review,/appBefore\[10\].*Terverifikasi/);
  assert.match(review,/validateProofFileForApproval_/);
  assert.match(review,/MPS_REGULAR_PAYMENTS/);
  assert.match(review,/MPS_MEMBERSHIP_PLANS/);
  assert.match(review,/Tidak Berlaku - Regular QRIS/);
  assert.match(review,/apiAdminIssuePin\(session,memberId\)/);
  assert.match(review,/enqueueMpsAdminDecisionNotices_\(/);
  assert.doesNotMatch(review,/getMpsDepositsSheet_|MPS_DEPOSITS|depositRow/);
});

test('Regular activation grants 30 days only after PIN delivery confirmation and keeps broker deposit status separate',()=>{
  const activation=functionSource('activateMemberAfterPin_');
  assert.match(activation,/MPS_PIN_DELIVERED_/);
  assert.match(activation,/30\*86400000/);
  assert.match(activation,/planSheet\.getRange\(planRow,8\)\.setValue\('Aktif'\)/);
  assert.match(activation,/memberNext\[MPS_COL.registrationStatus-1\]='Berhasil'/);
  assert.doesNotMatch(activation,/memberNext\[MPS_COL.depositStatus-1\]\s*=\s*'Disetujui'/);
});

test('public registration, QRIS submission and Admin review controls are wired to the dedicated APIs',()=>{
  assert.match(html,/name="membershipPlan"/);
  assert.match(html,/id="regularPaymentForm"/);
  assert.match(html,/apiSubmitRegularPayment/);
  assert.match(html,/id="adminRegularPayments"/);
  assert.match(html,/apiAdminReviewRegularPayment/);
  assert.match(source,/regularPayments:regularPayments/);
  assert.match(source,/function apiAdminGetDepositProof/);
});

test('Regular QRIS may be resubmitted only after Admin rejection and entitlement reads the latest payment row',()=>{
  const submit=functionSource('apiSubmitRegularPayment');
  const lookup=functionSource('findMpsRegularPaymentRow_');
  assert.match(submit,/\['Menunggu Validasi','Disetujui','Berhasil'\]\.includes\(String\(previousPayment\[7\]/);
  assert.match(submit,/previousPayment\[7\]\|\|''\)!=='Ditolak'/);
  assert.match(lookup,/for\(let i=values\.length-1;i>=0;i--\)/);
  assert.match(source,/function findMpsRegularPaymentByRef_\(/);
  assert.match(submit,/findMpsRegularPaymentByRef_\(getMpsRegularPaymentsSheet_\(\),paymentRef\)/);
  assert.match(submit,/findMpsRegularPaymentByRef_\(payments,paymentRef\)/);
  assert.doesNotMatch(submit,/findMpsRegularPaymentRow_\(payments,ref\);if\(pr\)payments\.deleteRow/);
  assert.match(html,/BUAT ULANG LINK TELEGRAM/);
});

test('expired Regular member receives renewal-only login and content gates remain active',()=>{
  const login=functionSource('apiMemberLogin'),identity=functionSource('requireMemberSessionIdentity_'),guard=functionSource('requireMember_');
  assert.match(login,/renewalOnly=!activeEntitlement&&regularState\.isRegular&&regularState\.expired/);
  assert.match(login,/membershipPlan:regularState\.isRegular\?'REGULAR':'ACTIVE_IB'/);
  assert.ok(login.indexOf('verifyMemberPin_')<login.indexOf('mpsRegularMemberState_(r,false)'),'verify PIN before loading plan entitlement');
  assert.match(identity,/memberHasActiveEntitlement_|mpsRegularMemberState_/);
  assert.match(identity,/regularState\.active&&!state\.expired|!state\.active&&!state\.expired/);
  assert.match(guard,/memberHasActiveEntitlement_/);
  assert.match(functionSource('deliverMpsVipInviteTask_'),/memberHasActiveEntitlement_/);
  assert.match(functionSource('sendVipInvite_'),/memberHasActiveEntitlement_/);
  assert.match(functionSource('processMpsVipChatMemberEvent_'),/memberHasActiveEntitlement_/);
  assert.match(source,/function MPS_REGULAR_RENEWALS|const MPS_REGULAR_RENEWALS/);
});

test('Regular monthly renewal is session-bound, private, fixed-fee and pending Admin approval',()=>{
  const submit=functionSource('apiSubmitRegularRenewal'),info=functionSource('apiGetRegularRenewalInfo');
  assert.match(submit,/requireMemberSessionIdentity_\(session\)/);
  assert.match(submit,/amount!==100000/);
  assert.match(submit,/MPS_PROOF_FOLDER_ID/);
  assert.match(submit,/DriveApp\.Access\.PRIVATE/);
  assert.match(submit,/findPendingMpsRegularRenewalRow_/);
  assert.match(submit,/sendTelegram_\(adminTelegramMessage\)/);
  assert.match(submit,/telegramWarning/);
  assert.match(submit,/Menunggu Validasi/);
  assert.match(info,/pendingRef/);
  assert.doesNotMatch(submit,/getMpsDepositsSheet_|MPS_DEPOSITS|saveDeposit_/);
});

test('Admin renewal approval verifies proof and extends from the later of now or current expiry',()=>{
  const review=functionSource('apiAdminReviewRegularRenewal');
  assert.match(review,/validateProofFileForApproval_/);
  assert.match(review,/periodStart=expiry\.getTime\(\)>now\.getTime\(\)\?expiry:now/);
  assert.match(review,/periodEnd=new Date\(periodStart\.getTime\(\)\+30\*86400000\)/);
  assert.match(review,/setValue\('Aktif'\)|\['Aktif',now,periodEnd/);
  assert.match(review,/MPS_REGULAR_RENEWALS/);
  assert.match(review,/enqueueMpsRegularRenewalDecisionNotices_\(/);
  assert.match(html,/notificationWarning/);
  assert.doesNotMatch(review,/MPS_DEPOSITS|depositStatus-1\).*Disetujui/);
});

test('Admin renewal proof and queue APIs are exposed without exposing proof URLs in queue data',()=>{
  const queue=functionSource('apiAdminListRegularRenewals');
  assert.match(source,/MPS_REGULAR_RENEWALS,MPS_NEWS_ANALYSIS/);
  assert.match(source,/regularRenewals:regularRenewals/);
  assert.match(queue,/renewalRef/);
  assert.doesNotMatch(queue,/proofUrl|Proof URL|Proof File ID/);
  assert.match(source,/MPS-REN-\[A-F0-9\]\{20\}/);
});

test('renewal-only member portal is wired to private QRIS proof and separate Admin queue',()=>{
  const proof=functionSource('apiAdminGetDepositProof'),list=functionSource('apiAdminList');
  assert.match(proof,/MPS-REN-\[A-F0-9\]\{20\}/);
  assert.match(proof,/getMpsRegularRenewalsSheet_/);
  assert.match(list,/regularRenewals:regularRenewals/);
  assert.match(html,/id="page-regular-renewal"/);
  assert.match(html,/id="regularRenewalForm"/);
  assert.match(html,/apiSubmitRegularRenewal/);
  assert.match(html,/apiGetRegularRenewalInfo/);
  assert.match(html,/apiAdminReviewRegularRenewal/);
  assert.match(html,/id="adminRegularRenewals"/);
  assert.match(html,/https:\/\/one\.toexness\.com\/a\/bdthbxwb2q\?platform=mobile/);
  assert.match(html,/bukan dibayarkan kepada MPS/);
  assert.match(html,/QRIS statis/);
  assert.match(html,/tidak mendeteksi pembayaran otomatis/);
  assert.match(html,/renewalOnly/);
});
