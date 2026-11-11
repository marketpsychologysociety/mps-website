/**
 * Synthetic VIP activation orchestration contract.
 * This models durable intent -> member status -> keyed ticker/audit effects -> completion.
 * In-memory stores only; not an Apps Script persistence adapter.
 */
const validId = value => /^(0|[1-9]\d{0,19})$/.test(String(value));
const keyFor = (updateId, effect) => {
  if (!validId(updateId)) throw new TypeError('INVALID_UPDATE_ID');
  return 'telegram:' + String(updateId) + ':' + effect;
};

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
  async member(id) { return structuredClone(this.data.members.get(String(id)) ?? { status: 'LEFT' }); }
  async putMember(id, value) { this.data.members.set(String(id), structuredClone(value)); }
  async intent(key) { return structuredClone(this.data.intents.get(key) ?? null); }
  async putIntent(key, value) { this.data.intents.set(key, structuredClone(value)); }
  async pendingForMember(id) {
    const row = [...this.data.intents.values()].find(x => x.memberId === String(id) && x.state !== 'COMPLETED');
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
  async process({ updateId, memberId, status, tickerName, occurredAt }) {
    if (!validId(updateId)) throw new TypeError('INVALID_UPDATE_ID');
    if (!memberId || !tickerName || !Number.isFinite(occurredAt)) throw new TypeError('INVALID_ACTIVATION_INPUT');
    await this.recover(memberId);
    if (status === 'left' || status === 'kicked') {
      await this.store.atomic(async () => {
        const member = await this.store.member(memberId);
        await this.store.putMember(memberId, { ...member, status: 'LEFT' });
      });
      return 'LEFT';
    }
    if (!['member', 'administrator', 'creator'].includes(status)) return 'IGNORED';
    const key = keyFor(updateId, 'vip_activation');
    const intent = await this.store.atomic(async () => {
      const existing = await this.store.intent(key);
      if (existing) return existing.state === 'COMPLETED' ? null : existing;
      const member = await this.store.member(memberId);
      if (member.status === 'ACTIVE') return null;
      const next = {
        key, updateId: String(updateId), memberId: String(memberId),
        tickerName: String(tickerName), occurredAt,
        state: 'INTENT', tickerKey: keyFor(updateId, 'vip_ticker'),
        auditKey: keyFor(updateId, 'vip_audit')
      };
      await this.store.putIntent(key, next);
      return next;
    });
    if (!intent) return 'ALREADY_ACTIVE';
    await this.finishIntent(intent);
    return 'ACTIVATED';
  }
  async recover(memberId) {
    const pending = await this.store.pendingForMember(memberId);
    if (pending) await this.finishIntent(pending);
  }
  async finishIntent(initial) {
    let intent = await this.store.intent(initial.key);
    if (!intent || intent.state === 'COMPLETED') return;
    if (intent.state === 'INTENT') {
      await this.store.atomic(async () => {
        const member = await this.store.member(intent.memberId);
        await this.store.putMember(intent.memberId, { ...member, status: 'ACTIVE', activatedBy: intent.updateId });
        await this.store.putIntent(intent.key, { ...intent, state: 'STATUS_APPLIED' });
      });
      this.crash('AFTER_STATUS');
    }
    intent = await this.store.intent(initial.key);
    const ticker = {
      eventId: 'VIP-' + intent.updateId, createdAt: intent.occurredAt,
      memberId: intent.memberId, memberName: intent.tickerName,
      eventText: 'joined MPS VIP Community', status: 'Visible'
    };
    const tickerResult = await this.effects.appendOnce(intent.tickerKey, ticker);
    if (tickerResult === 'REVIEW_KEY_COLLISION') throw new Error('EFFECT_KEY_COLLISION_TICKER');
    this.crash('AFTER_TICKER');
    const audit = {
      timestamp: intent.occurredAt, actor: intent.memberId,
      action: 'VIP_JOIN_APPROVED', target: intent.memberId,
      result: 'SUCCESS', details: 'Approved Telegram VIP activation'
    };
    const auditResult = await this.effects.appendOnce(intent.auditKey, audit);
    if (auditResult === 'REVIEW_KEY_COLLISION') throw new Error('EFFECT_KEY_COLLISION_AUDIT');
    this.crash('AFTER_AUDIT');
    await this.store.atomic(async () => {
      const latest = await this.store.intent(intent.key);
      await this.store.putIntent(intent.key, { ...latest, state: 'COMPLETED' });
    });
    this.crash('AFTER_COMPLETE');
  }
}
