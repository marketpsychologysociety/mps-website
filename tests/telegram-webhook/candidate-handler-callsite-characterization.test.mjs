import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, 'fixtures/candidate-handler-callsite-snapshot.gs'), 'utf8');
const EXPECTED_SHA256 = '70a2fb84ecef7e01eb86dcd95f1481ca3857e7953c6fbae2362b3314dcb64441';
const actualSha256 = crypto.createHash('sha256').update(source).digest('hex');
assert.equal(actualSha256, EXPECTED_SHA256, 'normalized fixture digest changed; re-extract and re-audit before updating pin');

function extractFunction(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing function ' + name);
  const end = source.indexOf('function ' + nextName + '(', start);
  assert.notEqual(end, -1, 'missing boundary function ' + nextName);
  return source.slice(start, end);
}
const coreSource = extractFunction('processTelegramUpdateCore_', 'processVipJoinRequest_');
const joinRequestSource = extractFunction('processVipJoinRequest_', 'verifyTelegramLinkFromUpdate_');
const statusSource = extractFunction('updateVipJoinStatus_', 'kickMpsUnauthorizedUser_');
const auditSource = extractFunction('recordMpsAudit_', 'apiAdminCheckSystemConfiguration');

function makeJoinContext(fetchImpl) {
  const calls = [], memberId = 'MPS-ABCDEF12', userId = '987654321';
  const accessRow = [memberId, userId, userId], memberRow = [];
  const MPS_COL = { registrationStatus: 1, depositStatus: 2, accountName: 3, nickname: 4 };
  memberRow[0] = 'Berhasil'; memberRow[1] = 'Disetujui'; memberRow[2] = 'Test Member';
  const accessSheet = { getRange: () => ({ getValues: () => [accessRow] }) };
  const memberSheet = { getRange: () => ({ getValues: () => [memberRow] }) };
  const context = {
    console,
    MPS: { headers: Array(30).fill('x') }, MPS_COL,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({
      MPS_TELEGRAM_VIP_CHAT_ID: '-1001234567890',
      MPS_TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN_NOT_REAL'
    })[key] || '' }) },
    getTelegramAccessSheet_: () => accessSheet,
    findTelegramAccessByUserId_: () => 2,
    getMemberSheet_: () => memberSheet,
    findMemberById_: () => 2,
    UrlFetchApp: { fetch: (...args) => { calls.push({ type: 'fetch', args }); return fetchImpl(...args); } },
    parseTelegramResponse_: response => response,
    updateVipJoinStatus_: (...args) => calls.push({ type: 'status', args }),
    telegramSendToChat_: (...args) => { calls.push({ type: 'dm', args }); return { ok: true }; },
    recordMpsAudit_: (...args) => calls.push({ type: 'audit', args }),
    clean_: value => String(value),
    ...{}
  };
  vm.createContext(context);
  vm.runInContext(coreSource + '\n' + joinRequestSource, context, { timeout: 1000 });
  return { context, calls, memberId, userId };
}
const request = () => ({ chat: { id: '-1001234567890' }, from: { id: 987654321, is_bot: false }, user_chat_id: 987654321, date: 1760000000 });
const response = (status, ok = true) => ({ ok, result: { status, is_member: status === 'member' }, description: ok ? '' : 'temporary failure' });
const statusCalls = calls => calls.filter(x => x.type === 'status');

test('actual processTelegramUpdateCore_ chat_member branch omits update_id and event date', () => {
  const { context, calls } = makeJoinContext(() => response('left'));
  context.processTelegramUpdateCore_({ update_id: 123456, chat_member: {
    date: 1760000000, chat: { id: '-1001234567890' },
    new_chat_member: { user: { id: 987654321 }, status: 'member', is_member: true }
  }});
  assert.equal(statusCalls(calls).length, 1);
  assert.deepEqual(statusCalls(calls)[0].args, ['987654321', 'member', true]);
});

test('actual processVipJoinRequest_ pre-approval reconciliation omits update_id and request date', () => {
  const { context, calls } = makeJoinContext(() => response('member'));
  context.processVipJoinRequest_(request());
  assert.deepEqual(statusCalls(calls)[0].args, ['987654321', 'member', true]);
});

test('actual processVipJoinRequest_ failed-approval retry reconciliation omits update_id and request date', () => {
  let n = 0;
  const { context, calls } = makeJoinContext(() => (++n === 1 ? response('left') : n === 2 ? response('', false) : response('member')));
  context.processVipJoinRequest_(request());
  assert.deepEqual(statusCalls(calls)[0].args, ['987654321', 'member', true]);
});

test('actual processVipJoinRequest_ successful approval omits update_id and request date', () => {
  let n = 0;
  const { context, calls } = makeJoinContext(() => (++n === 1 ? response('left') : { ok: true, result: true }));
  context.processVipJoinRequest_(request());
  assert.deepEqual(statusCalls(calls)[0].args, ['987654321', 'member', true]);
});

test('actual updateVipJoinStatus_ mutates member/access sheets before ticker and audit while owning one ScriptLock', () => {
  const events = [], lock = { held: false, acquisitions: 0, releases: 0 };
  const accessRow = ['MPS-ABCDEF12', '987654321', '987654321'];
  const memberRow = ['Berhasil', 'Disetujui', 'Test Member'];
  const accessSheet = { getRange: (...args) => ({
    getValues: () => [accessRow],
    getDisplayValue: () => '',
    setValue: value => events.push({ type: 'access-write', value, held: lock.held })
  })};
  const memberSheet = { getRange: (...args) => ({
    getValues: () => [memberRow],
    setValues: values => events.push({ type: 'member-write', values, held: lock.held })
  })};
  const context = {
    console, MPS: { headers: Array(30).fill('x') },
    MPS_COL: { registrationStatus: 1, depositStatus: 2, accountName: 3, nickname: 4 },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => '-1001234567890' }) },
    LockService: { getScriptLock: () => ({
      waitLock: () => { lock.acquisitions++; lock.held = true; },
      releaseLock: () => { lock.releases++; lock.held = false; }
    })},
    getTelegramAccessSheet_: () => accessSheet,
    findTelegramAccessByUserId_: () => 2,
    getMemberSheet_: () => memberSheet,
    findMemberById_: () => 2,
    recordMpsVipTickerEvent_: (...args) => events.push({ type: 'ticker', args, held: lock.held }),
    recordMpsAudit_: (...args) => events.push({ type: 'audit', args, held: lock.held }),
    clean_: value => String(value),
    ...{}
  };
  vm.createContext(context);
  vm.runInContext(statusSource, context, { timeout: 1000 });
  context.updateVipJoinStatus_('987654321', 'member', true);
  assert.equal(lock.acquisitions, 1);
  assert.equal(lock.releases, 1);
  const types = events.map(x => x.type);
  assert.ok(types.indexOf('access-write') < types.indexOf('ticker'));
  assert.ok(types.indexOf('member-write') < types.indexOf('ticker'));
  assert.ok(types.indexOf('ticker') < types.indexOf('audit'));
  assert.ok(events.every(x => x.held === true), 'all local writes/effects are invoked while the status lock is held');
});

test('actual recordMpsAudit_ swallows persistence failures instead of propagating them', () => {
  const logged = [];
  const context = {
    console: { error: value => logged.push(String(value)) },
    getMpsContentSheet_: () => { throw new Error('SHEET_WRITE_FAILED'); },
    clean_: value => String(value),
    sheetText_: value => value,
    cleanNewsText_: value => value
  };
  vm.createContext(context);
  vm.runInContext(auditSource, context, { timeout: 1000 });
  assert.doesNotThrow(() => context.recordMpsAudit_('TELEGRAM', 'MPS-ABCDEF12', 'VIP_JOIN_APPROVED', 'MPS-ABCDEF12', 'SUCCESS', 'test'));
  assert.equal(logged.length, 1);
  assert.match(logged[0], /MPS audit log write failed/);
});

test('fixture provenance remains pinned to exact candidate Code.gs SHA-256', () => {
  assert.equal(actualSha256, EXPECTED_SHA256);
  assert.match(source, /function updateVipJoinStatus_\(userId,status,isMember\)/);
  assert.match(source, /function recordMpsAudit_\(role,actorRef,action,targetRef,result,details\)/);
});
