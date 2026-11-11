/**
 * MPS external journal-anchor contract simulator.
 * TEST ONLY: in-memory provider; this is NOT an external or immutable anchor.
 */
import { createHash } from 'node:crypto';

const HASH_RE = /^[a-f0-9]{64}$/;
const FIELDS = ['anchor_id','sequence','journal_hash','previous_anchor_hash','created_at','receipt_hash'];
const GENESIS = 'GENESIS';

function fail(code, message) { return Object.assign(new Error(message), { code }); }
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function canonical(anchor) {
  return JSON.stringify({
    anchor_id: anchor.anchor_id,
    sequence: anchor.sequence,
    journal_hash: anchor.journal_hash,
    previous_anchor_hash: anchor.previous_anchor_hash,
    created_at: anchor.created_at
  });
}

export class SyntheticAnchorProvider {
  constructor() { this.objects = new Map(); }

  async createOnly(key, body) {
    if (typeof key !== 'string' || !/^mps-anchor-[0-9]{1,12}$/.test(key)) {
      throw fail('ANCHOR_KEY_INVALID', 'Anchor key is invalid.');
    }
    if (this.objects.has(key)) throw fail('ANCHOR_ALREADY_EXISTS', 'Anchor objects are create-only.');
    const stored = structuredClone(body);
    this.objects.set(key, stored);
    return structuredClone(stored);
  }

  async read(key) {
    const value = this.objects.get(key);
    return value ? structuredClone(value) : null;
  }

  async list() {
    return [...this.objects.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => ({key,body:structuredClone(value)}));
  }
}

export async function createSyntheticAnchor(provider, { sequence, journalHash, previousAnchorHash = GENESIS, createdAt = new Date().toISOString() }) {
  if (!(provider instanceof SyntheticAnchorProvider)) throw fail('ANCHOR_PROVIDER_INVALID', 'Only the explicit synthetic provider is supported by this test module.');
  if (!Number.isSafeInteger(sequence) || sequence < 1 || !HASH_RE.test(journalHash) ||
      !(previousAnchorHash === GENESIS || HASH_RE.test(previousAnchorHash)) ||
      typeof createdAt !== 'string' || Number.isNaN(Date.parse(createdAt))) {
    throw fail('ANCHOR_INPUT_INVALID', 'Anchor input violates the exact contract.');
  }
  const key = 'mps-anchor-' + String(sequence).padStart(12, '0');
  const existing = await provider.read(key);
  if (existing) {
    if (existing.journal_hash === journalHash && existing.previous_anchor_hash === previousAnchorHash) return existing;
    throw fail('ANCHOR_CONFLICT', 'Sequence is already anchored to a different journal checkpoint.');
  }
  const prior = sequence === 1 ? null : await provider.read('mps-anchor-' + String(sequence - 1).padStart(12, '0'));
  if (sequence > 1 && (!prior || prior.receipt_hash !== previousAnchorHash)) {
    throw fail('ANCHOR_CHAIN_GAP', 'Previous anchor is missing or does not match.');
  }
  if (sequence === 1 && previousAnchorHash !== GENESIS) throw fail('ANCHOR_CHAIN_GAP', 'Genesis anchor must use GENESIS.');
  const draft = {
    anchor_id: key,
    sequence,
    journal_hash: journalHash,
    previous_anchor_hash: previousAnchorHash,
    created_at: createdAt
  };
  const receipt = { ...draft, receipt_hash: hash(canonical(draft)) };
  return provider.createOnly(key, receipt);
}

export async function verifySyntheticAnchors(provider, expectedCheckpoints) {
  if (!(provider instanceof SyntheticAnchorProvider)) throw fail('ANCHOR_PROVIDER_INVALID', 'Only the explicit synthetic provider is supported by this test module.');
  if (!Array.isArray(expectedCheckpoints)) throw fail('ANCHOR_EXPECTED_INVALID', 'Expected checkpoints must be an array.');
  const stored = await provider.list();
  if (stored.length !== expectedCheckpoints.length) throw fail('ANCHOR_COUNT_MISMATCH', 'Stored anchor count differs from expected checkpoints.');
  let previous = GENESIS;
  for (let index = 0; index < expectedCheckpoints.length; index++) {
    const expected = expectedCheckpoints[index];
    const item = stored[index];
    const body = item.body;
    if (item.key !== 'mps-anchor-' + String(index + 1).padStart(12, '0') ||
        Object.keys(body).sort().join(',') !== [...FIELDS].sort().join(',') ||
        body.sequence !== index + 1 || body.journal_hash !== expected.journalHash ||
        body.previous_anchor_hash !== previous ||
        body.receipt_hash !== hash(canonical(body))) {
      throw fail('ANCHOR_INTEGRITY_ERROR', 'Anchor sequence, schema, checkpoint, or receipt hash is invalid.');
    }
    previous = body.receipt_hash;
  }
  return { valid: true, anchor_count: stored.length, latest_receipt_hash: previous };
}
