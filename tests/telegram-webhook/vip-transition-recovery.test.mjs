import test from 'node:test';
import assert from 'node:assert/strict';
import {SharedVipTransitionStore,VipTransitionOrchestrator} from './vip-transition-recovery.mjs';

const input=(updateId,targetState,epoch=0,sourceDate=1800000000)=>({updateId,targetState,epoch,sourceDate,memberId:'MPS-ABCDEF12',receivedAt:1800000000000});
function setup(){const base=new SharedVipTransitionStore();return{base,make:opts=>new VipTransitionOrchestrator(new SharedVipTransitionStore(base.data),opts)};}

for(const targetState of ['ACTIVE','LEFT']) {
  const phases=targetState==='ACTIVE'
    ? ['AFTER_STATUS_A','AFTER_STATUS_B','AFTER_CURSOR','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']
    : ['AFTER_STATUS_A','AFTER_STATUS_B','AFTER_CURSOR','AFTER_AUDIT','AFTER_COMPLETE'];
  for(const phase of phases) test(targetState+' transition recovers crash at '+phase+' without duplicate effects',async()=>{
    const s=setup();
    await assert.rejects(()=>s.make({failAt:phase}).process(input(100,targetState)),new RegExp('SIMULATED_CRASH_'+phase));
    const restarted=s.make();
    await restarted.recover('MPS-ABCDEF12');
    const member=s.base.member('MPS-ABCDEF12');
    assert.equal(member.statusA,targetState);
    assert.equal(member.statusB,targetState);
    assert.deepEqual(member.cursor,{epoch:0,sourceDate:1800000000,updateId:'100'});
    const intent=s.base.intent('telegram:0:100:vip_transition');
    assert.equal(intent.state,'COMPLETED');
    assert.equal(s.base.data.effects.size,targetState==='ACTIVE'?2:1);
    await restarted.recover('MPS-ABCDEF12');
    assert.equal(s.base.data.effects.size,targetState==='ACTIVE'?2:1);
  });
}

test('pending older transition is recovered before a newer opposite transition',async()=>{
  const s=setup();
  await assert.rejects(()=>s.make({failAt:'AFTER_STATUS_A'}).process(input(200,'ACTIVE')),/SIMULATED_CRASH/);
  assert.equal(await s.make().process(input(201,'LEFT')),'LEFT');
  const member=s.base.member('MPS-ABCDEF12');
  assert.equal(member.statusA,'LEFT');
  assert.equal(member.statusB,'LEFT');
  assert.deepEqual(member.cursor,{epoch:0,sourceDate:1800000000,updateId:'201'});
  assert.equal(s.base.intent('telegram:0:200:vip_transition').state,'COMPLETED');
  assert.equal(s.base.intent('telegram:0:201:vip_transition').state,'COMPLETED');
});

test('delayed old transition is stale after a newer opposite transition',async()=>{
  const s=setup();
  await s.make().process(input(301,'LEFT'));
  assert.equal(await s.make().process(input(300,'ACTIVE')),'STALE');
  assert.equal(s.base.member('MPS-ABCDEF12').statusA,'LEFT');
});

test('same transition replay is deduplicated and payload collision is quarantined',async()=>{
  const s=setup();
  await s.make().process(input(400,'ACTIVE'));
  assert.equal(await s.make().process(input(400,'ACTIVE')),'DUPLICATE');
  await assert.rejects(()=>s.make().process(input(400,'LEFT')),/TRANSITION_INTENT_COLLISION/);
});

test('a newer ingress epoch accepts a lower update ID',async()=>{
  const s=setup();
  await s.make().process(input('999999999999','LEFT',0));
  assert.equal(await s.make().process(input('10','ACTIVE',1)),'ACTIVE');
});

test('source event date outranks a larger update ID within the same ingress epoch',async()=>{
  const s=setup();
  await s.make().process(input(900,'LEFT',0,1800000002));
  assert.equal(await s.make().process(input(901,'ACTIVE',0,1800000001)),'STALE');
  assert.equal(s.base.member('MPS-ABCDEF12').statusA,'LEFT');
});
