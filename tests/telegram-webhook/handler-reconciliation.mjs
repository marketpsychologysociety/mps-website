const ACTIVE = new Set(['member', 'administrator', 'creator']);

function clean(value) {
  return String(value ?? '').trim();
}

function canonicalUpdateId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }
  return typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value) ? value : null;
}

function activeMembership(status, isMember) {
  const normalized = clean(status).toLowerCase();
  return ACTIVE.has(normalized) || (normalized === 'restricted' && isMember === true);
}

/**
 * Classify a consumed application-link replay. Never treats a matching user
 * ID alone as sufficient: the private chat and application binding must match.
 */
export function reconcileApplicationLinkReplay(record) {
  const status = clean(record?.linkStatus);
  if (status === 'Menunggu') return { outcome: 'NOT_CONSUMED' };
  if (status !== 'Terverifikasi') return { outcome: 'REJECTED_TERMINAL_LINK' };

  const userId = clean(record?.incomingUserId);
  const chatId = clean(record?.incomingChatId);
  if (!userId || userId !== chatId) return { outcome: 'REJECTED_PRIVATE_CHAT_REQUIRED' };

  const exactBinding =
    clean(record?.linkUserId) === userId &&
    clean(record?.linkChatId) === chatId &&
    clean(record?.accessApplicationRef) === clean(record?.applicationRef) &&
    clean(record?.accessUserId) === userId &&
    clean(record?.accessChatId) === chatId;

  if (!exactBinding) return { outcome: 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING' };
  if (!['Menunggu Validasi Admin', 'Berhasil'].includes(clean(record?.applicationStatus))) {
    return { outcome: 'REVIEW_INCONSISTENT_APPLICATION_STATE' };
  }
  return { outcome: 'ALREADY_VERIFIED_SAME_IDENTITY' };
}

/** Same-user replay classifier for the legacy member-link path. */
export function reconcileLegacyLinkReplay(record) {
  const status = clean(record?.linkStatus);
  if (status === 'Menunggu') return { outcome: 'NOT_CONSUMED' };
  if (status !== 'Terverifikasi') return { outcome: 'REJECTED_TERMINAL_LINK' };

  const userId = clean(record?.incomingUserId);
  const chatId = clean(record?.incomingChatId);
  if (!userId || userId !== chatId) return { outcome: 'REJECTED_PRIVATE_CHAT_REQUIRED' };

  const exactBinding =
    clean(record?.linkUserId) === userId &&
    clean(record?.linkChatId) === chatId &&
    clean(record?.accessMemberId) === clean(record?.memberId) &&
    clean(record?.accessUserId) === userId &&
    clean(record?.accessChatId) === chatId;

  return exactBinding
    ? { outcome: 'ALREADY_VERIFIED_SAME_IDENTITY' }
    : { outcome: 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING' };
}

/**
 * VIP activation is a state transition, not a permanent member-level event.
 * Update ID makes replay stable while a later reactivation gets a new key.
 */
export function isVipActivationTransition(previous, next) {
  return !activeMembership(previous?.status, previous?.isMember) &&
    activeMembership(next?.status, next?.isMember);
}

export function buildVipActivationEffectKeys(updateId) {
  const id = canonicalUpdateId(updateId);
  if (id === null) throw new TypeError('INVALID_UPDATE_ID');
  return {
    ticker: `telegram:${id}:vip-activation:ticker`,
    audit: `telegram:${id}:vip-activation:audit`
  };
}

export function classifyVipMemberUpdate({ previous, next, updateId }) {
  if (!activeMembership(next?.status, next?.isMember)) {
    return { outcome: 'NOT_ACTIVE' };
  }
  if (!isVipActivationTransition(previous, next)) {
    return { outcome: 'NO_NEW_ACTIVATION' };
  }
  return {
    outcome: 'NEW_ACTIVATION',
    effectKeys: buildVipActivationEffectKeys(updateId)
  };
}
