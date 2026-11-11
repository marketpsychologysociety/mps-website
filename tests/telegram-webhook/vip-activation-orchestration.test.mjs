import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedActivationStore, SharedKeyedEffectStore, VipActivationOrchestrator } from './vip-activation-orchestration.mjs';

const event = (updateId=100, status='member') => ({
  updateId, memberId:'MPS-ABCDEF12', status, tickerName:'Test Member',
  occurredAt: 1760000000000
});
function setup(options={}) {
  const store = new SharedActivationStore();
  const effects = new SharedKeyedEffectStore();
  return {store,effects,make:opts=>new VipActivationOrchestrator(new SharedActivationStore(store.data),new SharedKeyedEffectStore(effects.rows),opts)};
}

test('activation writes durable intent before status and effects', async () => {
  const s=setup(), phases=[];
  const result=await s.make({onPhase:p=>phases.push(p)}).process(event());
  assert.equal(result,'ACTIVATED');
  assert.deepEqual(phases,['AFTER_STATUS','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']);
  assert.equal((await s.store.member(event().memberId)).status,'ACTIVE');
  assert.equal(s.effects.rows.size,2);
});

for (const phase of ['AFTER_STATUS','AFTER_TICKER','AFTER_AUDIT','AFTER_COMPLETE']) {
  test('crash at '+phase+' recovers without duplicate ticker/audit', async () => {
    const s=setup();
    await assert.rejects(()=>s.make({failAt:phase}).process(event()),new RegExp('SIMULATED_CRASH_'+phase));
    const recovered=s.make();
    await recovered.process({...event(),updateId:101});
    assert.equal(s.effects.rows.size,2);
    assert.equal([...s.effects.rows.keys()].filter(k=>k.endsWith(':vip_ticker')).length,1);
    assert.equal([...s.effects.rows.keys()].filter(k=>k.endsWith(':vip_audit')).length,1);
    const intent=[...s.store.data.intents.values()][0];
    assert.equal(intent.state,'COMPLETED');
    assert.equal(intent.updateId,'100');
  });
}

test('same update replay is idempotent', async () => {
  const s=setup(), first=s.make();
  await first.process(event());
  assert.equal(await s.make().process(event()),'ALREADY_ACTIVE');
  assert.equal(s.effects.rows.size,2);
});

test('a distinct update while already active does not create another activation', async () => {
  const s=setup();
  await s.make().process(event(200));
  assert.equal(await s.make().process(event(201)),'ALREADY_ACTIVE');
  assert.equal(s.store.data.intents.size,1);
  assert.equal(s.effects.rows.size,2);
});

test('leave then rejoin with a new update creates a new activation event', async () => {
  const s=setup();
  await s.make().process(event(300));
  await s.make().process(event(301,'left'));
  assert.equal((await s.store.member(event().memberId)).status,'LEFT');
  await s.make().process(event(302));
  assert.equal(s.store.data.intents.size,2);
  assert.equal(s.effects.rows.size,4);
});

test('pending activation is recovered before a later leave update', async () => {
  const s=setup();
  await assert.rejects(()=>s.make({failAt:'AFTER_STATUS'}).process(event(400)));
  await s.make().process(event(401,'left'));
  assert.equal(s.effects.rows.size,2);
  assert.equal((await s.store.member(event().memberId)).status,'LEFT');
  assert.equal([...s.store.data.intents.values()][0].state,'COMPLETED');
});

test('same effect key with changed deterministic payload fails for review', async () => {
  const s=setup();
  await s.make().process(event(500));
  const key='telegram:500:vip_ticker';
  const outcome=await s.effects.appendOnce(key,{different:true});
  assert.equal(outcome,'REVIEW_KEY_COLLISION');
});

test('missing or malformed Telegram update ID fails closed', async () => {
  const s=setup();
  await assert.rejects(()=>s.make().process({...event(),updateId:'001'}),/INVALID_UPDATE_ID/);
  await assert.rejects(()=>s.make().process({...event(),updateId:undefined}),/INVALID_UPDATE_ID/);
});

test('concurrent deliveries create one intent and one set of effects', async () => {
  const s=setup();
  const results=await Promise.all([s.make().process(event(600)),s.make().process(event(600))]);
  assert.equal(s.store.data.intents.size,1);
  assert.equal(s.effects.rows.size,2);
  assert.ok(results.every(x=>['ACTIVATED','ALREADY_ACTIVE'].includes(x)));
});
