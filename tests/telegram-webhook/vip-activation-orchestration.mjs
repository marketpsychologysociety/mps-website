/**
 * Synthetic VIP activation orchestration contract.
 * Models durable intent -> ordered member transition -> keyed ticker/audit effects -> completion.
 * In-memory stores only; not an Apps Script persistence adapter.
 */
const validId = value => typeof value === 'number'
  ? Number.isSafeInteger(value) && value >= 0
  : typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value);
const keyFor = (epoch, updateId, effect) => {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError('INVALID_UPDATE_EPOCH');
  if (!validId(updateId)) throw new TypeError('INVALID_UPDATE_ID');
  return 'telegram:' + String(epoch) + ':' + String(updateId) + ':' + effect;
};
function compareDecimalIds(leftValue, rightValue) {
  const left = String(leftValue), right = String(rightValue);
  if (left.length !== right.length) return left.length > right.length ? 1 : -1;
  return left === right ? 0 : left > right ? 1 : -1;
}
function compareSequence(a, b) {
  if (!b) return 1;
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? 1 : -1;
  return compareDecimalIds(a.updateId, b.updateId);
}
function sequenceOf(epoch, updateId, sourceDate, sourceType) {
  if (!Number.isSafeInteger(epoch) || epoch < 0) throw new TypeError('INVALID_UPDATE_EPOCH');
  if (sourceDate != null && (!Number.isSafeInteger(sourceDate) || sourceDate < 0)) throw new TypeError('INVALID_SOURCE_DATE');
  return { epoch, updateId: String(updateId), sourceDate: sourceDate == null ? null : sourceDate, sourceType: String(sourceType || 'UNKNOWN') };
}
function sameIntent(existing, input) {
  return existing.memberId === String(input.memberId) &&
    existing.epoch === input.epoch &&
    existing.sourceDate === (input.sourceDate == null ? null : input.sourceDate) &&
    existing.sourceType === String(input.sourceType || 'UNKNOWN') &&
    existing.tickerName === String(input.tickerName);
}

export class SharedActivationStore {
  constructor(shared) {
    this.data = shared ?? { members: new Map(), intents: new Map() };
    this.tail = Promise.resolve();
  }
  async atomic(fn) {
    let release;
    const prior = this.tail;
    this.tail = new Promise(resolve => { release = resolve; });
    await prior;
    try { return await fn(); } finally { release(); }
  }
  async member(id) {
    return structuredClone(this.data.members.get(String(id)) ??
      { status: 'LEFT', lastEvent: null });
  }
  async putMember(id, value) { this.data.members.set(String(id), structuredClone(value)); }
  async intent(key) { return structuredClone(this.data.intents.get(key) ?? null); }
  async putIntent(key, value) { this.data.intents.set(key, structuredClone(value)); }
  async pendingForMember(id) {
    const row = [...this.data.intents.values()].find(x =>
      x.memberId === String(id) && !['COMPLETED', 'SUPERSEDED'].includes(x.state));
    return structuredClone(row ?? null);
  }
}

export class SharedKeyedEffectStore {
  constructor(shared = new Map()) { this.rows = shared; this.tail = Promise.resolve(); }
  async appendOnce(key, payload) {
    let release;
    const prior = this.tail;
    this.tail = new Promise(resolve => { release = resolve; });
    await prior;
    try {
      const existing = this.rows.get(key);
      if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(payload)) return 'REVIEW_KEY_COLLISION';
        return 'ALREADY_APPENDED';
      }
      this.rows.set(key, structuredClone(payload));
      return 'APPENDED';
    } finally { release(); }
  }
}

export class VipActivationOrchestrator {
  constructor(store, effects, { failAt = null, onPhase = () => {} } = {}) {
    this.store = store;
    this.effects = effects;
    this.failAt = failAt;
    this.onPhase = onPhase;
  }
  crash(phase) {
    this.onPhase(phase);
    if (this.failAt === phase) throw new Error('SIMULATED_CRASH_' + phase);
  }
  async process({ updateId, epoch = 0, memberId, status, tickerName, sourceDate = null, sourceType = 'UNKNOWN', receivedAt = 1760000000 }) {
    if (!validId(updateId)) throw new TypeError('INVALID_UPDATE_ID');
    if (!memberId || !tickerName) throw new TypeError('INVALID_ACTIVATION_INPUT');
    if (!Number.isSafeInteger(receivedAt) || receivedAt <= 0) throw new TypeError('INVALID_RECEIVED_AT');
    const sequence = sequenceOf(epoch, updateId, sourceDate, sourceType);
    await this.recover(memberId);

    const isLeave = status === 'left' || status === 'kicked';
    const isActive = ['member', 'administrator', 'creator'].includes(status);
    if (!isLeave && !isActive) return 'IGNORED';

    if (isLeave) {
      return this.store.atomic(async () => {
        const member = await this.store.member(memberId);
        if (compareSequence(sequence, member.lastEvent) <= 0) return 'STALE_EVENT';
        await this.store.putMember(memberId, {
          ...member, status: 'LEFT', lastEvent: sequence,
          lastTransition: 'LEAVE'
        });
        return 'LEFT';
      });
    }

    const key = keyFor(epoch, updateId, 'vip_activation');
    const decision = await this.store.atomic(async () => {
      const existing = await this.store.intent(key);
      if (existing) {
        if (!sameIntent(existing, { memberId, epoch, sourceDate, sourceType, tickerName })) {
          return { outcome: 'REVIEW_COLLISION' };
        }
        if (existing.state === 'COMPLETED') return { outcome: 'DUPLICATE_UPDATE' };
        if (existing.state === 'SUPERSEDED') return { outcome: 'STALE_EVENT' };
        return { outcome: 'RESUME', intent: existing };
      }
      const member = await this.store.member(memberId);
      if (compareSequence(sequence, member.lastEvent) <= 0) {
        return { outcome: 'STALE_EVENT' };
      }
      if (member.status === 'ACTIVE') {
        await this.store.putMember(memberId, {
          ...member, lastEvent: sequence, lastTransition: 'ACTIVE_CONFIRMED'
        });
        return { outcome: 'ALREADY_ACTIVE' };
      }
      const intent = {
        key, epoch, updateId: String(updateId), memberId: String(memberId),
        tickerName: String(tickerName), sourceDate, sourceType: String(sourceType || 'UNKNOWN'),
        receivedAt, sequence,
        state: 'INTENT', tickerKey: keyFor(epoch, updateId, 'vip_ticker'),
        auditKey: keyFor(epoch, updateId, 'vip_audit')
      };
      await this.store.putIntent(key, intent);
      return { outcome: 'INTENT', intent };
    });

    if (decision.outcome === 'REVIEW_COLLISION') throw new Error('ACTIVATION_INTENT_COLLISION');
    if (decision.outcome !== 'INTENT' && decision.outcome !== 'RESUME') return decision.outcome;
    const applied = await this.finishIntent(decision.intent);
    return applied ? 'ACTIVATED' : 'STALE_EVENT';
  }

  async recover(memberId) {
    const pending = await this.store.pendingForMember(memberId);
    if (pending) await this.finishIntent(pending);
  }

  async finishIntent(initial) {
    let intent = await this.store.intent(initial.key);
    if (!intent || ['COMPLETED', 'SUPERSEDED'].includes(intent.state)) return false;
    if (intent.state === 'INTENT') {
      const applied = await this.store.atomic(async () => {
        const latestIntent = await this.store.intent(intent.key);
        if (!latestIntent) return false;
        if (latestIntent.state === 'STATUS_APPLIED' || latestIntent.state === 'COMPLETED') return true;
        if (latestIntent.state !== 'INTENT') return false;
        const member = await this.store.member(intent.memberId);
        if (compareSequence(latestIntent.sequence, member.lastEvent) <= 0) {
          await this.store.putIntent(intent.key, { ...latestIntent, state: 'SUPERSEDED' });
          return false;
        }
        await this.store.putMember(intent.memberId, {
          ...member, status: 'ACTIVE', activatedBy: intent.updateId,
          lastEvent: latestIntent.sequence, lastTransition: 'ACTIVATION'
        });
        await this.store.putIntent(intent.key, { ...latestIntent, state: 'STATUS_APPLIED' });
        return true;
      });
      if (!applied) return false;
      this.crash('AFTER_STATUS');
    }
    intent = await this.store.intent(initial.key);
    if (!intent) return false;
    if (intent.state === 'COMPLETED') return true;
    if (intent.state !== 'STATUS_APPLIED') return false;
    const ticker = {
      eventId: 'VIP-' + intent.epoch + '-' + intent.updateId, createdAt: intent.receivedAt,
      memberId: intent.memberId, memberName: intent.tickerName,
      eventText: 'joined MPS VIP Community', status: 'Visible'
    };
    const tickerResult = await this.effects.appendOnce(intent.tickerKey, ticker);
    if (tickerResult === 'REVIEW_KEY_COLLISION') throw new Error('EFFECT_KEY_COLLISION_TICKER');
    this.crash('AFTER_TICKER');
    const audit = {
      timestamp: intent.receivedAt, actor: intent.memberId,
      action: 'VIP_JOIN_APPROVED', target: intent.memberId,
      result: 'SUCCESS', details: 'Approved Telegram VIP activation'
    };
    const auditResult = await this.effects.appendOnce(intent.auditKey, audit);
    if (auditResult === 'REVIEW_KEY_COLLISION') throw new Error('EFFECT_KEY_COLLISION_AUDIT');
    this.crash('AFTER_AUDIT');
    await this.store.atomic(async () => {
      const latest = await this.store.intent(intent.key);
      if (latest?.state === 'STATUS_APPLIED') {
        await this.store.putIntent(intent.key, { ...latest, state: 'COMPLETED' });
      }
    });
    this.crash('AFTER_COMPLETE');
    return true;
  }
}
