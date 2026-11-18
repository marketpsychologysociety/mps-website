import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileApplicationLinkReplay, reconcileLegacyLinkReplay,
  isVipActivationTransition, buildVipActivationEffectKeys,
  classifyVipMemberUpdate
} from './handler-reconciliation.mjs';

const applicationReplay = {
  linkStatus: 'Terverifikasi',
  applicationRef: 'APP-TEST-001',
  incomingUserId: '70001',
  incomingChatId: '70001',
  linkUserId: '70001',
  linkChatId: '70001',
  accessApplicationRef: 'APP-TEST-001',
  accessUserId: '70001',
  accessChatId: '70001',
  applicationStatus: 'Menunggu Validasi Admin'
};

const legacyReplay = {
  linkStatus: 'Terverifikasi',
  memberId: 'MPS-ABCDEF12',
  incomingUserId: '70001',
  incomingChatId: '70001',
  linkUserId: '70001',
  linkChatId: '70001',
  accessMemberId: 'MPS-ABCDEF12',
  accessUserId: '70001',
  accessChatId: '70001'
};

test('application link replay succeeds only for the exact persisted user/chat/application binding', () => {
  assert.deepEqual(reconcileApplicationLinkReplay(applicationReplay),
    { outcome: 'ALREADY_VERIFIED_SAME_IDENTITY' });
});

test('application link replay rejects a different Telegram user', () => {
  assert.equal(reconcileApplicationLinkReplay({
    ...applicationReplay, incomingUserId: '70002', incomingChatId: '70002'
  }).outcome, 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING');
});

test('application link replay rejects mismatched private chat even when user ID matches', () => {
  assert.equal(reconcileApplicationLinkReplay({
    ...applicationReplay, incomingChatId: '70002'
  }).outcome, 'REJECTED_PRIVATE_CHAT_REQUIRED');
});

test('application link replay rejects an access row bound to another application', () => {
  assert.equal(reconcileApplicationLinkReplay({
    ...applicationReplay, accessApplicationRef: 'APP-OTHER'
  }).outcome, 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING');
});

test('application link replay quarantines inconsistent application state', () => {
  assert.equal(reconcileApplicationLinkReplay({
    ...applicationReplay, applicationStatus: 'Ditolak'
  }).outcome, 'REVIEW_INCONSISTENT_APPLICATION_STATE');
});

test('pending application link continues through the first-use path', () => {
  assert.equal(reconcileApplicationLinkReplay({
    ...applicationReplay, linkStatus: 'Menunggu'
  }).outcome, 'NOT_CONSUMED');
});

test('legacy link replay succeeds only for the exact persisted member/user/chat binding', () => {
  assert.deepEqual(reconcileLegacyLinkReplay(legacyReplay),
    { outcome: 'ALREADY_VERIFIED_SAME_IDENTITY' });
});

test('legacy link replay rejects a different Telegram identity', () => {
  assert.equal(reconcileLegacyLinkReplay({
    ...legacyReplay, incomingUserId: '70002', incomingChatId: '70002'
  }).outcome, 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING');
});

test('legacy link replay rejects access row bound to another member', () => {
  assert.equal(reconcileLegacyLinkReplay({
    ...legacyReplay, accessMemberId: 'MPS-FFFFFFFF'
  }).outcome, 'REJECTED_DIFFERENT_IDENTITY_OR_BINDING');
});

test('legacy link replay rejects non-private chat', () => {
  assert.equal(reconcileLegacyLinkReplay({
    ...legacyReplay, incomingChatId: '-100123'
  }).outcome, 'REJECTED_PRIVATE_CHAT_REQUIRED');
});

test('VIP first transition to member creates deterministic ticker and audit keys', () => {
  const result = classifyVipMemberUpdate({
    previous: { status: 'left', isMember: false },
    next: { status: 'member', isMember: true },
    updateId: '123456'
  });
  assert.equal(result.outcome, 'NEW_ACTIVATION');
  assert.deepEqual(result.effectKeys, {
    ticker: 'telegram:123456:vip-activation:ticker',
    audit: 'telegram:123456:vip-activation:audit'
  });
});

test('VIP duplicate replay with unchanged active membership creates no new activation', () => {
  assert.equal(classifyVipMemberUpdate({
    previous: { status: 'member', isMember: true },
    next: { status: 'member', isMember: true },
    updateId: '123456'
  }).outcome, 'NO_NEW_ACTIVATION');
});

test('VIP reactivation after leaving is a new transition with a distinct update key', () => {
  const first = classifyVipMemberUpdate({
    previous: { status: 'left', isMember: false },
    next: { status: 'member', isMember: true },
    updateId: '123456'
  });
  const later = classifyVipMemberUpdate({
    previous: { status: 'left', isMember: false },
    next: { status: 'member', isMember: true },
    updateId: '123457'
  });
  assert.notEqual(first.effectKeys.ticker, later.effectKeys.ticker);
});

test('restricted membership counts only when Telegram confirms is_member true', () => {
  assert.equal(isVipActivationTransition(
    { status: 'left', isMember: false },
    { status: 'restricted', isMember: true }
  ), true);
  assert.equal(isVipActivationTransition(
    { status: 'left', isMember: false },
    { status: 'restricted', isMember: false }
  ), false);
});

test('invalid update IDs cannot create activation effect keys', () => {
  assert.throws(() => buildVipActivationEffectKeys('0123'), /INVALID_UPDATE_ID/);
  assert.throws(() => buildVipActivationEffectKeys('not-an-id'), /INVALID_UPDATE_ID/);
  assert.throws(() => buildVipActivationEffectKeys(Number.MAX_SAFE_INTEGER + 1), /INVALID_UPDATE_ID/);
});
