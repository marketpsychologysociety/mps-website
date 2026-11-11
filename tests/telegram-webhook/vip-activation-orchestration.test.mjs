import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedActivationStore, SharedKeyedEffectStore, VipActivationOrchestrator } from './vip-activation-orchestration.mjs';

const event = (updateId=100, status='member', occurredAt=1760000000) => ({
  updateId, memberId:'MPS-ABCDEF12', status, tickerName:'Test Member', occurredAt
});
function setup() {
  const store = new SharedActivationStore();
  const effects = new SharedKeyedEffectStore();
  return {store,effects,make:opts=>new VipActivationOrchestrator(
    new SharedActivationStore(store.data),new SharedKeyedEffectStore(effects.rows),opts
  )};
}

test('activation persists intent before status and effects, then persists sequence cursor', async () => {
  const s=setup(), phases=[];
  const result=await s.make({onPhase:p=>phases.push(p)}).process(event());
  assert.equal(result,'ACTIVATED');
  assert.deepEqual(phases,['AFTER_STATUS','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']);
  const member=await s.store.member(event().memberId);
  assert.equal(member.status,'ACTIVE');
  assert.deepEqual(member.lastEvent,{occurredAt:1760000000,updateId:'100'});
  assert.equal(s.effects.rows.size,2);
});

for (const phase of ['AFTER_STATUS','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']) {
  test('crash at '+phase+' recovers without duplicate ticker/audit', async () => {
    const s=setup();
    await assert.rejects(()=>s.make({failAt:phase}).process(event()),new RegExp('SIMULATED_CRASH_'+phase));
    await s.make().process(event(101,'member',1760000001));
    assert.equal(s.effects.rows.size,2);
    assert.equal([...s.effects.rows.keys()].filter(k=>k.endsWith(':vip_ticker')).length,1);
    assert.equal([...s.effects.rows.keys()].filter(k=>k.endsWith(':vip_audit')).length,1);
    const intent=[...s.store.data.intents.values()][0];
    assert.equal(intent.state,'COMPLETED');
    assert.equal(intent.updateId,'100');
  });
}

test('same update replay is deduplicated by its completed intent key', async () => {
  const s=setup();
  await s.make().process(event());
  assert.equal(await s.make().process(event()),'DUPLICATE_UPDATE');
  assert.equal(s.effects.rows.size,2);
});

test('a distinct update while already active advances cursor without another activation', async () => {
  const s=setup();
  await s.make().process(event(200));
  assert.equal(await s.make().process(event(201,'member',1760000001)),'ALREADY_ACTIVE');
  assert.equal(s.store.data.intents.size,1);
  assert.equal((await s.store.member(event().memberId)).lastEvent.updateId,'201');
  assert.equal(s.effects.rows.size,2);
});

test('leave then rejoin with newer event creates a new activation event', async () => {
  const s=setup();
  await s.make().process(event(300));
  await s.make().process(event(301,'left',1760000001));
  assert.equal((await s.store.member(event().memberId)).status,'LEFT');
  await s.make().process(event(302,'member',1760000002));
  assert.equal(s.store.data.intents.size,2);
  assert.equal(s.effects.rows.size,4);
  assert.equal((await s.store.member(event().memberId)).status,'ACTIVE');
});

test('pending activation is recovered before a later leave event', async () => {
  const s=setup();
  await assert.rejects(()=>s.make({failAt:'AFTER_STATUS'}).process(event(400)),/SIMULATED_CRASH_AFTER_STATUS/);
  assert.equal(await s.make().process(event(401,'left',1760000001)),'LEFT');
  assert.equal(s.effects.rows.size,2);
  const member=await s.store.member(event().memberId);
  assert.equal(member.status,'LEFT');
  assert.equal(member.lastEvent.updateId,'401');
  assert.equal([...s.store.data.intents.values()][0].state,'COMPLETED');
});

test('delayed old leave cannot overwrite a newer rejoin', async () => {
  const s=setup();
  await s.make().process(event(700,'left',1760000000));
  assert.equal(await s.make().process(event(701,'member',1760000001)),'ACTIVATED');
  assert.equal(await s.make().process(event(699,'left',1759999999)),'STALE_EVENT');
  const member=await s.store.member(event().memberId);
  assert.equal(member.status,'ACTIVE');
  assert.equal(member.lastEvent.updateId,'701');
  assert.equal(s.effects.rows.size,2);
});

test('delayed old activation cannot overwrite a newer leave', async () => {
  const s=setup();
  await s.make().process(event(800,'left',1760000001));
  assert.equal(await s.make().process(event(799,'member',1760000000)),'STALE_EVENT');
  assert.equal((await s.store.member(event().memberId)).status,'LEFT');
  assert.equal(s.store.data.intents.size,0);
  assert.equal(s.effects.rows.size,0);
});

test('same-second event order uses update ID as a deterministic tie-break', async () => {
  const s=setup();
  await s.make().process(event(900,'member',1760000000));
  assert.equal(await s.make().process(event(899,'left',1760000000)),'STALE_EVENT');
  assert.equal((await s.store.member(event().memberId)).status,'ACTIVE');
});

test('later Telegram event timestamp permits update ID reset after inactivity', async () => {
  const s=setup();
  await s.make().process(event('999999999999','left',1760000000));
  assert.equal(await s.make().process(event('10','member',1760000001)),'ACTIVATED');
  assert.equal((await s.store.member(event().memberId)).status,'ACTIVE');
});

test('stale event comparison survives adapter recreation via persisted member cursor', async () => {
  const s=setup();
  await s.make().process(event(1000,'member',1760000000));
  const restarted= s.make();
  assert.equal(await restarted.process(event(999,'left',1759999999)),'STALE_EVENT');
  assert.equal((await s.store.member(event().memberId)).status,'ACTIVE');
});

test('same effect key with changed deterministic payload fails for review', async () => {
  const s=setup();
  await s.make().process(event(500));
  assert.equal(await s.effects.appendOnce('telegram:500:vip_ticker',{different:true}),'REVIEW_KEY_COLLISION');
});

test('same update ID with different intent payload is quarantined', async () => {
  const s=setup();
  await s.make().process(event(501));
  await assert.rejects(()=>s.make().process({...event(501),tickerName:'Different Name'}),/ACTIVATION_INTENT_COLLISION/);
});

test('missing, malformed, or unsafe update IDs fail closed', async () => {
  const s=setup();
  await assert.rejects(()=>s.make().process({...event(),updateId:'001'}),/INVALID_UPDATE_ID/);
  await assert.rejects(()=>s.make().process({...event(),updateId:undefined}),/INVALID_UPDATE_ID/);
  await assert.rejects(()=>s.make().process({...event(),updateId:Number.MAX_SAFE_INTEGER+1}),/INVALID_UPDATE_ID/);
});

test('missing or invalid event timestamp fails closed', async () => {
  const s=setup();
  await assert.rejects(()=>s.make().process({...event(),occurredAt:undefined}),/INVALID_EVENT_TIMESTAMP/);
  await assert.rejects(()=>s.make().process({...event(),occurredAt:-1}),/INVALID_EVENT_TIMESTAMP/);
});

test('concurrent duplicate deliveries create one intent and one set of effects', async () => {
  const s=setup();
  const results=await Promise.all([s.make().process(event(600)),s.make().process(event(600))]);
  assert.equal(s.store.data.intents.size,1);
  assert.equal(s.effects.rows.size,2);
  assert.ok(results.every(x=>['ACTIVATED','DUPLICATE_UPDATE'].includes(x)));
});
