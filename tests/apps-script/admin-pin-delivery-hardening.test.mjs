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

test('ambiguous recovery-code delivery preserves the exact challenge for a possibly delivered code',()=>{
  const recovery=extract('apiMemberRecoveryStart');
  const stored=recovery.indexOf('props.setProperty(propertyKey, JSON.stringify(challenge))');
  const send=recovery.indexOf('sent = telegramSendToChat_(chatId');
  assert.ok(stored>=0&&send>stored,'challenge must be durable before Telegram delivery');
  const failure=recovery.slice(recovery.indexOf('if (!sent || !sent.ok) {',send));
  assert.ok(failure.includes('DELIVERY_UNCONFIRMED'));
  assert.ok(!failure.includes('props.deleteProperty(propertyKey)'),'ambiguous delivery must not invalidate a possibly delivered code');
});

test('runtime keeps a possibly delivered recovery challenge after Telegram response loss and releases ScriptLock',()=>{
  const props=Object.create(null),audit=[];
  const uuid=['A1B2C3D4-E5F6-7890-ABCD-1234567890AB','11111111-2222-3333-4444-555555555555'];
  let lockHeld=false,releases=0;
  const sandbox={
    consumeRateLimit_:()=>true,
    getMemberSheet_:()=>({}),
    findActiveMemberForRecovery_:()=>({memberId:'MPS-ABCDEF12'}),
    getTelegramAccessSheet_:()=>({}),
    findUniqueTelegramAccessForRecovery_:()=>({chatId:'123456789'}),
    sha256_:value=>'digest:'+String(value),
    Utilities:{getUuid:()=>uuid.shift()},
    mpsRecoveryPropertyKey_:mt5=>'MPS_RECOVERY_'+mt5,
    PropertiesService:{getScriptProperties:()=>({
      setProperty:(key,value)=>{props[key]=String(value);},
      getProperty:key=>Object.prototype.hasOwnProperty.call(props,key)?props[key]:null,
      deleteProperty:key=>{delete props[key];}
    })},
    LockService:{getScriptLock:()=>({
      waitLock:()=>{assert.equal(lockHeld,false);lockHeld=true;},
      releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;releases++;}
    })},
    telegramSendToChat_:()=>({ok:false,error:'response timeout'}),
    recordMpsAudit_:(...args)=>{audit.push(args);return true;},
    safeErrorMessage_:error=>String(error&&error.message||error)
  };
  vm.createContext(sandbox);
  vm.runInContext(extract('apiMemberRecoveryStart'),sandbox,{timeout:1000});
  const result=sandbox.apiMemberRecoveryStart('12345678901','PIN');
  const raw=props.MPS_RECOVERY_12345678901;
  assert.ok(raw,'ambiguous Telegram outcome must preserve the durable challenge');
  const challenge=JSON.parse(raw);
  assert.equal(challenge.memberId,'MPS-ABCDEF12');
  assert.equal(challenge.action,'PIN');
  assert.equal(challenge.chatId,'123456789');
  assert.equal(challenge.attempts,0);
  assert.ok(challenge.expiresAt>Date.now());
  assert.equal(result.ok,true,'public response remains generic');
  assert.ok(!JSON.stringify(result).includes('A1B2C3D4'),'recovery code must not be returned to the browser');
  assert.equal(lockHeld,false,'ScriptLock must always be released');
  assert.equal(releases,1);
  assert.equal(audit.at(-1)[4],'DELIVERY_UNCONFIRMED');
});

test('late success from an older PIN issuance cannot clear the newer delivery marker',()=>{
  const props={PIN_MPS123:'verifier:NEWER',MPS_PIN_DELIVERED_MPS123:'1',MPS_PIN_DELIVERY_STATE_MPS123:'ACTIVE'};
  let releases=0;
  const sandbox={
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){releases++;}})},
    PropertiesService:{getScriptProperties:()=>({
      getProperty:key=>Object.prototype.hasOwnProperty.call(props,key)?props[key]:null,
      setProperty:(key,value)=>{props[key]=String(value);},
      deleteProperty:key=>{delete props[key];}
    })},
    pinPropertyKey_:id=>'PIN_'+id,
    verifyMemberPin_:(id,pin,stored)=>stored==='verifier:'+pin
  };
  vm.createContext(sandbox);
  vm.runInContext(extract('markPinDeliveredIfCurrent_'),sandbox);
  assert.equal(sandbox.markPinDeliveredIfCurrent_('MPS123','OLDER'),false);
  assert.equal(props.MPS_PIN_DELIVERED_MPS123,'1');
  assert.equal(props.MPS_PIN_DELIVERY_STATE_MPS123,'ACTIVE');
  assert.equal(releases,1);
});
