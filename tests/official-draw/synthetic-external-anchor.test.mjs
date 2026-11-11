import test from 'node:test';
import assert from 'node:assert/strict';
import { SyntheticAnchorProvider, createSyntheticAnchor, verifySyntheticAnchors } from './synthetic-external-anchor.mjs';

const h = value => requireHash(value);
function requireHash(value) {
  return (awaitHash => awaitHash)(value);
}
const hash = value => {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(value).digest('hex');
};

test('create-only anchors chain ordered journal checkpoints and verify', async () => {
  const provider = new SyntheticAnchorProvider();
  const checkpoints = [hash('journal checkpoint 1'), hash('journal checkpoint 2')];
  const first = await createSyntheticAnchor(provider, { sequence: 1, journalHash: checkpoints[0], createdAt: '2026-11-11T00:00:00.000Z' });
  const second = await createSyntheticAnchor(provider, { sequence: 2, journalHash: checkpoints[1], previousAnchorHash: first.receipt_hash, createdAt: '2026-11-11T00:01:00.000Z' });
  assert.equal((await verifySyntheticAnchors(provider, checkpoints.map(journalHash => ({journalHash})))).valid, true);
  assert.equal(second.sequence, 2);
});

test('same checkpoint retry is idempotent; changed checkpoint cannot overwrite', async () => {
  const provider = new SyntheticAnchorProvider();
  const journalHash = hash('same checkpoint');
  const a = await createSyntheticAnchor(provider, { sequence: 1, journalHash });
  const b = await createSyntheticAnchor(provider, { sequence: 1, journalHash });
  assert.equal(a.receipt_hash, b.receipt_hash);
  await assert.rejects(createSyntheticAnchor(provider, { sequence: 1, journalHash: hash('different') }), {code:'ANCHOR_CONFLICT'});
  await assert.rejects(provider.createOnly('mps-anchor-000000000001', a), {code:'ANCHOR_ALREADY_EXISTS'});
});

test('missing predecessor and invalid input fail closed', async () => {
  const provider = new SyntheticAnchorProvider();
  await assert.rejects(createSyntheticAnchor(provider, {sequence:2,journalHash:hash('two'),previousAnchorHash:hash('missing')}), {code:'ANCHOR_CHAIN_GAP'});
  await assert.rejects(createSyntheticAnchor(provider, {sequence:1,journalHash:'not-a-hash'}), {code:'ANCHOR_INPUT_INVALID'});
});

test('tampered receipt and missing anchor are detected', async () => {
  const provider = new SyntheticAnchorProvider();
  const journalHash = hash('checkpoint');
  await createSyntheticAnchor(provider, {sequence:1,journalHash});
  provider.objects.set('mps-anchor-000000000001', {...provider.objects.get('mps-anchor-000000000001'),journal_hash:hash('tampered')});
  await assert.rejects(verifySyntheticAnchors(provider,[{journalHash}]), {code:'ANCHOR_INTEGRITY_ERROR'});
  provider.objects.clear();
  await assert.rejects(verifySyntheticAnchors(provider,[{journalHash}]), {code:'ANCHOR_COUNT_MISMATCH'});
});

test('unknown anchor fields are rejected', async () => {
  const provider = new SyntheticAnchorProvider();
  const journalHash = hash('checkpoint');
  const anchor = await createSyntheticAnchor(provider,{sequence:1,journalHash});
  provider.objects.set('mps-anchor-000000000001',{...anchor,participant_name:'PRIVATE CANARY'});
  await assert.rejects(verifySyntheticAnchors(provider,[{journalHash}]), {code:'ANCHOR_INTEGRITY_ERROR'});
});
