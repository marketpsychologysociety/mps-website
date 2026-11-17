import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('candidates/Code.gs','utf8');
function extract(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing '+name);
  const end=source.indexOf('\nfunction ',start+10);
  return source.slice(start,end<0?source.length:end);
}

test('Admin PIN issuance quarantines the new verifier before Telegram delivery',()=>{
  const issue=extract('apiAdminIssuePin');
  const pending=issue.indexOf("props.setProperty('MPS_PIN_DELIVERY_STATE_'+memberKey,'PENDING_DELIVERY')");
  const store=issue.indexOf('storeMemberPin_(memberKey,pin)');
  const send=issue.indexOf('telegramSendToChat_(chatId');
  assert.ok(pending>=0&&store>pending&&send>store,'pending state must be persisted before verifier update and Telegram send');
});

test('ambiguous Telegram failure never restores the previous PIN verifier',()=>{
  const issue=extract('apiAdminIssuePin');
  const failure=issue.slice(issue.indexOf('if(!sent.ok){'),issue.indexOf('\n  let pinCurrent=false;'));
  assert.ok(failure.includes("setPinDeliveryState_(memberKey,'REVIEW_REQUIRED',pin)"));
  assert.ok(failure.includes('reconciliationRequired:true'));
  assert.ok(!failure.includes('previousPinRecord'));
  assert.ok(!failure.includes('props.setProperty(pinKey'));
  assert.ok(!failure.includes('props.deleteProperty(pinKey'));
  assert.ok(failure.includes('PIN lama tidak dipulihkan'));
});

test('member login fails closed while PIN delivery is pending or requires review',()=>{
  const login=extract('apiMemberLogin');
  const gate=login.indexOf("if (deliveryState && deliveryState !== 'ACTIVE')");
  const verify=login.indexOf('verifyMemberPin_(id, pinText, stored)');
  assert.ok(gate>=0&&verify>gate);
  assert.ok(login.includes("getProperty('MPS_PIN_DELIVERY_STATE_' + id)"));
});

test('confirmed admin delivery and member self-recovery both mark the PIN active',()=>{
  assert.ok(extract('markPinDeliveredIfCurrent_').includes("setProperty('MPS_PIN_DELIVERY_STATE_'+memberId,'ACTIVE')"));
  const recovery=extract('apiMemberRecoveryComplete');
  assert.ok(recovery.includes("setProperty('MPS_PIN_DELIVERY_STATE_' + member.memberId, 'ACTIVE')"));
});

test('quarantine cannot overwrite a newer PIN issuance verifier',()=>{
  const props=Object.create(null);
  let releases=0;
  const sandbox={
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){releases++;}})},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:key=>Object.prototype.hasOwnProperty.call(props,key)?props[key]:null,
      setProperty:(key,value)=>{props[key]=String(value);}
    })},
    pinPropertyKey_:id=>'PIN_'+id,
    verifyMemberPin_:(id,pin,stored)=>stored==='verifier:'+pin
  };
  vm.createContext(sandbox);
  vm.runInContext(extract('setPinDeliveryState_'),sandbox);
  props.PIN_MPS123='verifier:NEWER';
  props.MPS_PIN_DELIVERY_STATE_MPS123='ACTIVE';
  assert.equal(sandbox.setPinDeliveryState_('MPS123','REVIEW_REQUIRED','OLDER'),false);
  assert.equal(props.MPS_PIN_DELIVERY_STATE_MPS123,'ACTIVE');
  assert.equal(sandbox.setPinDeliveryState_('MPS123','REVIEW_REQUIRED','NEWER'),true);
  assert.equal(props.MPS_PIN_DELIVERY_STATE_MPS123,'REVIEW_REQUIRED');
  assert.equal(releases,2);
});

test('legacy approval delegates PIN delivery to the hardened issuance path',()=>{
  const legacy=extract('adminVerifyLegacy_');
  assert.ok(legacy.includes('apiAdminIssuePin(session,memberKey)'));
  assert.ok(!legacy.includes('telegramSendToChat_('),'legacy approval must not send a PIN before storing its verifier');
  assert.ok(!legacy.includes('storeMemberPin_('),'legacy approval must not bypass delivery-state quarantine');
  const issue=extract('apiAdminIssuePin');
  assert.ok(issue.indexOf("props.setProperty('MPS_PIN_DELIVERY_STATE_'+memberKey,'PENDING_DELIVERY')")<issue.indexOf('storeMemberPin_(memberKey,pin)'));
});
