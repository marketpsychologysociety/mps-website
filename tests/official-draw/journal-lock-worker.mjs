/**
 * Child-process worker for cross-process journal lock tests.
 * TEST ONLY: synthetic operation metadata, disposable local directory.
 */
import { DurableAuditJournal } from './durable-audit-journal.mjs';
const [directory, prefix] = process.argv.slice(2);
if (!directory || !prefix || !/^[a-z0-9_-]{1,32}$/.test(prefix)) {
  throw new Error('Expected an absolute test directory and a safe synthetic worker prefix.');
}
const journal = await DurableAuditJournal.open(directory, { lockWaitMs: 15000, lockRetryMs: 5 });
try {
  for (let index = 0; index < 10; index++) {
    const operationId = 'op_' + prefix + '_' + index;
    const idempotencyKey = 'idem_' + prefix + '_' + index;
    const payloadDigest = (await import('node:crypto')).createHash('sha256').update(prefix + ':' + index).digest('hex');
    const intent = await journal.beginOperation({
      operationId, idempotencyKey, actorSubject: 'subject_synthetic_' + prefix,
      targetId: 'draw_synthetic_shared', payloadDigest
    });
    if (!intent.created) throw new Error('Unexpected duplicate intent in independent worker.');
    await journal.completeOperation({
      operationId,
      result: { state: 'RECORDED', synthetic: true, status: index }
    });
  }
} finally {
  await journal.close();
}
