import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DurableEffectOutbox, SharedMemoryEffectStore, executeOutboxEffect
} from './durable-effect-outbox.mjs';

const makeOutbox = (store = new SharedMemoryEffectStore(), options = {}) =>
  new DurableEffectOutbox(store, options);
const effect = {
  effectKey: 'vip:member-42:activation-7:welcome',
  updateId: '12345',
  effectType: 'VIP_WELCOME_DM',
  payload: { chatId: '9988', template: 'VIP_WELCOME' }
};

test('enqueue persists only effect metadata and a payload digest', async () => {
  const store = new SharedMemoryEffectStore();
  const result = await makeOutbox(store).enqueue(effect, 1000);
  assert.equal(result.outcome, 'ENQUEUED');
  const row = await store.get(effect.effectKey);
  assert.equal(row.state, 'PENDING');
  assert.match(row.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(row).includes('VIP_WELCOME'), false);
  assert.equal(JSON.stringify(row).includes('9988'), false);
});

test('repeated enqueue of the same effect key is idempotent', async () => {
  const outbox = makeOutbox();
  assert.equal((await outbox.enqueue(effect, 1000)).outcome, 'ENQUEUED');
  assert.deepEqual(await outbox.enqueue(effect, 1010), { outcome: 'EXISTS', state: 'PENDING' });
});

test('effect-key collision with different content is quarantined', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  const collision = await outbox.enqueue({
    ...effect, payload: { chatId: 'different', template: 'VIP_WELCOME' }
  }, 1010);
  assert.equal(collision.outcome, 'MANUAL_REVIEW');
  assert.equal((await store.get(effect.effectKey)).state, 'REVIEW');
  assert.equal((await store.get(effect.effectKey)).lastErrorCode, 'EFFECT_KEY_COLLISION');
});

test('distinct activation transitions for one member receive independent effect keys', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  const later = { ...effect, effectKey: 'vip:member-42:activation-8:welcome', updateId: '12346' };
  assert.equal((await outbox.enqueue(later, 1010)).outcome, 'ENQUEUED');
  assert.equal(store.rows.size, 2);
});

test('concurrent claims acquire only one active lease', async () => {
  const outbox = makeOutbox();
  await outbox.enqueue(effect, 1000);
  const results = await Promise.all([
    outbox.claim(effect.effectKey, 1010), outbox.claim(effect.effectKey, 1010)
  ]);
  assert.deepEqual(results.map(x => x.outcome).sort(), ['BUSY', 'CLAIMED']);
});

test('successful delivery is marked SENT and never claimed again', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  const claim = await outbox.claim(effect.effectKey, 1010);
  await outbox.markSent(effect.effectKey, claim.row.claimToken, 1020, 'telegram-message-77');
  assert.equal((await outbox.claim(effect.effectKey, 1030)).outcome, 'ALREADY_SENT');
  assert.equal((await store.get(effect.effectKey)).providerReference, 'telegram-message-77');
});

test('expired PROCESSING effect is reconciled as already applied without resending', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store, { leaseMs: 100, tokenFactory: () => 'worker-a' });
  await outbox.enqueue(effect, 1000);
  await outbox.claim(effect.effectKey, 1010);
  let sendCount = 1;
  const result = await executeOutboxEffect(
    makeOutbox(store, { leaseMs: 100, tokenFactory: () => 'worker-b' }),
    effect.effectKey,
    {
      reconcile: async () => ({ status: 'APPLIED', providerReference: 'telegram-message-77' }),
      apply: async () => { sendCount++; }
    },
    1200
  );
  assert.equal(result, 'RECOVERED_ALREADY_APPLIED');
  assert.equal(sendCount, 1);
  assert.equal((await store.get(effect.effectKey)).state, 'SENT');
});

test('expired PROCESSING effect with unknown remote state moves to REVIEW, never resends', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store, { leaseMs: 100 });
  await outbox.enqueue(effect, 1000);
  await outbox.claim(effect.effectKey, 1010);
  let sendCount = 1;
  const result = await executeOutboxEffect(outbox, effect.effectKey, {
    reconcile: async () => ({ status: 'UNKNOWN' }),
    apply: async () => { sendCount++; }
  }, 1200);
  assert.equal(result, 'MANUAL_REVIEW');
  assert.equal(sendCount, 1);
  assert.equal((await store.get(effect.effectKey)).state, 'REVIEW');
});

test('expired PROCESSING effect retries only after authoritative NOT_APPLIED reconciliation', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store, { leaseMs: 100 });
  await outbox.enqueue(effect, 1000);
  await outbox.claim(effect.effectKey, 1010);
  let sendCount = 0;
  const result = await executeOutboxEffect(outbox, effect.effectKey, {
    reconcile: async () => ({ status: 'NOT_APPLIED' }),
    apply: async () => { sendCount++; return { providerReference: 'telegram-message-78' }; }
  }, 1200);
  assert.equal(result, 'SENT');
  assert.equal(sendCount, 1);
});

test('ambiguous send timeout is quarantined instead of blindly retried', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  let sendCount = 0;
  const result = await executeOutboxEffect(outbox, effect.effectKey, {
    reconcile: async () => ({ status: 'NOT_APPLIED' }),
    apply: async () => { sendCount++; throw new Error('socket timeout after request write'); }
  }, 1010);
  assert.equal(result, 'MANUAL_REVIEW');
  assert.equal(sendCount, 1);
  assert.equal((await store.get(effect.effectKey)).state, 'REVIEW');
});

test('only explicitly confirmed no-effect failures are retryable', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  const result = await executeOutboxEffect(outbox, effect.effectKey, {
    reconcile: async () => ({ status: 'NOT_APPLIED' }),
    apply: async () => {
      const error = new Error('provider rejected before accepting request');
      error.retryableNoEffect = true;
      error.code = 'RATE_LIMIT_REJECTED';
      throw error;
    }
  }, 1010);
  assert.equal(result, 'RETRYABLE');
  assert.equal((await store.get(effect.effectKey)).state, 'RETRYABLE');
});

test('expired worker is fenced out after a newer worker claims the effect', async () => {
  const store = new SharedMemoryEffectStore();
  const firstOutbox = makeOutbox(store, { leaseMs: 100, tokenFactory: () => 'worker-old' });
  await firstOutbox.enqueue(effect, 1000);
  const first = await firstOutbox.claim(effect.effectKey, 1010);
  const secondOutbox = makeOutbox(store, { leaseMs: 100, tokenFactory: () => 'worker-new' });
  const second = await secondOutbox.claim(effect.effectKey, 1200);
  await assert.rejects(
    () => firstOutbox.markSent(effect.effectKey, first.row.claimToken, 1210),
    /STALE_OR_INVALID_CLAIM/
  );
  await secondOutbox.markSent(effect.effectKey, second.row.claimToken, 1220);
  assert.equal((await store.get(effect.effectKey)).state, 'SENT');
});

test('expired lease cannot be completed even before a replacement claim', async () => {
  const outbox = makeOutbox(new SharedMemoryEffectStore(), { leaseMs: 100 });
  await outbox.enqueue(effect, 1000);
  const claim = await outbox.claim(effect.effectKey, 1010);
  await assert.rejects(
    () => outbox.markSent(effect.effectKey, claim.row.claimToken, 1110),
    /STALE_OR_INVALID_CLAIM/
  );
});

test('REVIEW effects cannot be automatically claimed again', async () => {
  const store = new SharedMemoryEffectStore();
  const outbox = makeOutbox(store);
  await outbox.enqueue(effect, 1000);
  const claim = await outbox.claim(effect.effectKey, 1010);
  await outbox.review(effect.effectKey, claim.row.claimToken, 1020, 'AMBIGUOUS_SEND');
  assert.equal((await outbox.claim(effect.effectKey, 1030)).outcome, 'MANUAL_REVIEW');
});

test('invalid effect keys and unsafe provider references fail closed', async () => {
  const outbox = makeOutbox();
  await assert.rejects(() => outbox.enqueue({ ...effect, effectKey: 'bad key' }, 1000), /INVALID_EFFECT_KEY/);
  await outbox.enqueue(effect, 1000);
  const claim = await outbox.claim(effect.effectKey, 1010);
  await assert.rejects(
    () => outbox.markSent(effect.effectKey, claim.row.claimToken, 1020, 'private phone 0812'),
    /INVALID_PROVIDER_REFERENCE/
  );
});
