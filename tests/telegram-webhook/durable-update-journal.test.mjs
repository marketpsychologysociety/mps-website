import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DurableUpdateJournal, SharedMemoryJournalStore, executeWithReconciliation
} from './durable-update-journal.mjs';

const update = (id = 101) => ({ update_id: id, message: { chat: { id: 7 }, text: '/start' } });

test('completed update remains deduplicated across journal instance restart', async () => {
  const store = new SharedMemoryJournalStore();
  const first = new DurableUpdateJournal(store);
  const claim = await first.claim(update(), 1000);
  await first.finish(101, claim.row.claimToken, 1100, ['message:welcome']);
  const restarted = new DurableUpdateJournal(new SharedMemoryJournalStore(store.rows));
  assert.equal((await restarted.claim(update(), 1200)).outcome, 'DUPLICATE_DONE');
});

test('concurrent duplicate deliveries allow only one active lease', async () => {
  const journal = new DurableUpdateJournal(new SharedMemoryJournalStore());
  const results = await Promise.all([journal.claim(update(), 1000), journal.claim(update(), 1000)]);
  assert.deepEqual(results.map(x => x.outcome).sort(), ['BUSY', 'CLAIMED']);
});

test('cache eviction is irrelevant to durable journal state', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store);
  const claim = await journal.claim(update(), 1000);
  await journal.finish(101, claim.row.claimToken, 1100);
  assert.equal((await new DurableUpdateJournal(store).claim(update(), 1200)).outcome, 'DUPLICATE_DONE');
});

test('expired PROCESSING lease requires reconciliation before replay', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store, { leaseMs: 100 });
  await journal.claim(update(), 1000);
  let applyCount = 1;
  const result = await executeWithReconciliation(
    new DurableUpdateJournal(store, { leaseMs: 100 }),
    update(),
    { reconcile: async () => 'APPLIED', apply: async () => { applyCount++; } },
    1200
  );
  assert.equal(result, 'RECOVERED_ALREADY_APPLIED');
  assert.equal(applyCount, 1);
});

test('expired lease with confirmed no-side-effect state may safely retry', async () => {
  const store = new SharedMemoryJournalStore();
  await new DurableUpdateJournal(store, { leaseMs: 100 }).claim(update(), 1000);
  let applied = 0;
  const result = await executeWithReconciliation(
    new DurableUpdateJournal(store, { leaseMs: 100 }), update(),
    { reconcile: async () => 'NOT_APPLIED', apply: async () => { applied++; } }, 1200
  );
  assert.equal(result, 'PROCESSED');
  assert.equal(applied, 1);
});

test('ambiguous external state is quarantined and never blindly replayed', async () => {
  const store = new SharedMemoryJournalStore();
  await new DurableUpdateJournal(store, { leaseMs: 100 }).claim(update(), 1000);
  const journal = new DurableUpdateJournal(store, { leaseMs: 100 });
  const result = await executeWithReconciliation(journal, update(), {
    reconcile: async () => 'UNKNOWN', apply: async () => assert.fail('must not replay')
  }, 1200);
  assert.equal(result, 'MANUAL_REVIEW');
  assert.equal((await journal.claim(update(), 1300)).outcome, 'MANUAL_REVIEW');
});

test('ambiguous timeout during external mutation is quarantined', async () => {
  const journal = new DurableUpdateJournal(new SharedMemoryJournalStore());
  const result = await executeWithReconciliation(journal, update(), {
    reconcile: async () => 'NOT_APPLIED',
    apply: async () => { const error = new Error('timeout'); error.ambiguousExternalOutcome = true; throw error; }
  }, 1000);
  assert.equal(result, 'MANUAL_REVIEW');
  assert.equal((await journal.claim(update(), 1100)).outcome, 'MANUAL_REVIEW');
});

test('transient failure remains retryable', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store);
  const first = await journal.claim(update(), 1000);
  await journal.retry(101, first.row.claimToken, 1100, 'network_timeout');
  const retry = await journal.claim(update(), 1200);
  assert.equal(retry.outcome, 'CLAIMED');
  assert.equal(retry.recovered, true);
  assert.equal(retry.row.attemptCount, 2);
});

test('invalid and unsafe numeric update IDs fail closed', async () => {
  const journal = new DurableUpdateJournal(new SharedMemoryJournalStore());
  await assert.rejects(() => journal.claim(update('1 OR 1=1'), 1000), /INVALID_UPDATE_ID/);
  await assert.rejects(() => journal.claim(update(Number.MAX_SAFE_INTEGER + 1), 1000), /INVALID_UPDATE_ID/);
});

test('payload hashing is stable across JSON object key order', async () => {
  const journal = new DurableUpdateJournal(new SharedMemoryJournalStore());
  const first = { update_id: 103, message: { chat: { id: 7, type: 'private' }, text: '/start' } };
  const reordered = { message: { text: '/start', chat: { type: 'private', id: 7 } }, update_id: 103 };
  assert.equal((await journal.claim(first, 1000)).outcome, 'CLAIMED');
  assert.equal((await journal.claim(reordered, 1100)).outcome, 'BUSY');
});

test('same update ID with different payload is quarantined', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store);
  await journal.claim(update(), 1000);
  const collision = await journal.claim({ update_id: 101, message: { text: 'different content' } }, 1100);
  assert.equal(collision.outcome, 'MANUAL_REVIEW');
  assert.equal((await store.get('101')).lastErrorCode, 'PAYLOAD_HASH_MISMATCH');
});

test('payload collision after DONE is quarantined without stale completion metadata', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store);
  const claim = await journal.claim(update(), 1000);
  await journal.finish(101, claim.row.claimToken, 1100);
  const collision = await journal.claim({ update_id: 101, message: { text: 'different completed payload' } }, 1200);
  assert.equal(collision.outcome, 'MANUAL_REVIEW');
  assert.equal((await store.get('101')).completedAt, null);
  assert.equal((await journal.claim(update(), 1300)).outcome, 'MANUAL_REVIEW');
});

test('stale worker cannot finish a lease reclaimed by a newer worker', async () => {
  const store = new SharedMemoryJournalStore();
  const firstJournal = new DurableUpdateJournal(store, { leaseMs: 100, tokenFactory: () => 'worker-A' });
  const first = await firstJournal.claim(update(), 1000);
  const secondJournal = new DurableUpdateJournal(store, { leaseMs: 100, tokenFactory: () => 'worker-B' });
  const second = await secondJournal.claim(update(), 1200);
  assert.equal(second.outcome, 'CLAIMED');
  await assert.rejects(
    () => firstJournal.finish(101, first.row.claimToken, 1210),
    /STALE_OR_INVALID_CLAIM/
  );
  await secondJournal.finish(101, second.row.claimToken, 1220);
  assert.equal((await store.get('101')).state, 'DONE');
});

test('expired lease cannot be completed even before another worker reclaims it', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store, { leaseMs: 100, tokenFactory: () => 'worker-expired' });
  const claim = await journal.claim(update(), 1000);
  await assert.rejects(
    () => journal.finish(101, claim.row.claimToken, 1100),
    /STALE_OR_INVALID_CLAIM/
  );
  assert.equal((await store.get('101')).state, 'PROCESSING');
});

test('journal stores a digest and allowlisted metadata, never raw message text', async () => {
  const store = new SharedMemoryJournalStore();
  const journal = new DurableUpdateJournal(store);
  await journal.claim({ update_id: 102, message: { text: 'private member data' } }, 1000);
  const row = await store.get('102');
  assert.match(row.payloadHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(row).includes('private member data'), false);
  assert.equal(row.updateType, 'MESSAGE');
});

test('journal outage fails closed instead of invoking handler', async () => {
  const broken = { atomic: async () => { throw new Error('STORE_UNAVAILABLE'); }, get: async () => null, put: async () => {} };
  const journal = new DurableUpdateJournal(broken);
  let invoked = false;
  await assert.rejects(() => executeWithReconciliation(journal, update(), {
    reconcile: async () => 'NOT_APPLIED', apply: async () => { invoked = true; }
  }, 1000), /STORE_UNAVAILABLE/);
  assert.equal(invoked, false);
});
