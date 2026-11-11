/**
 * Crash worker for journal lock recovery tests.
 * TEST ONLY: one synthetic intent in a disposable local directory.
 */
import { DurableAuditJournal } from './durable-audit-journal.mjs';
import { createHash } from 'node:crypto';

const directory = process.argv[2];
if (!directory || !directory.startsWith('/')) throw new Error('Expected an absolute disposable test directory.');
const payloadDigest = createHash('sha256').update('synthetic-crash-payload').digest('hex');
const journal = await DurableAuditJournal.open(directory, {
  lockWaitMs: 1000,
  faultInjector: stage => {
    if (stage === 'after_write_before_sync') process.exit(77);
    return false;
  }
});
await journal.beginOperation({
  operationId: 'op_crash_lock_001',
  idempotencyKey: 'idem_crash_lock_001',
  actorSubject: 'subject_synthetic_crash_worker',
  targetId: 'draw_synthetic_crash_001',
  payloadDigest
});
throw new Error('Crash injection did not trigger.');
