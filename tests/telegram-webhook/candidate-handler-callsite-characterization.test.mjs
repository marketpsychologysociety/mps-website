import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Always characterize the current candidate source; never silently test a stale copied snapshot.
const source = fs.readFileSync(path.join(here, '../../candidates/Code.gs'), 'utf8');

function extractFunction(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'missing candidate function ' + name);
  const end = source.indexOf('function ' + nextName + '(', start);
  assert.notEqual(end, -1, 'missing boundary function ' + nextName);
  return source.slice(start, end);
}

const ingressSource = extractFunction('processTelegramUpdate_', 'mpsTelegramUpdateErrorCode_');
const coreSource = extractFunction('processTelegramUpdateCore_', 'processVipJoinRequest_');
const joinRequestSource = extractFunction('processVipJoinRequest_', 'enqueueMpsVipJoinRequestNotice_');
const memberEventSource = extractFunction('processMpsVipChatMemberEvent_', 'inspectMpsVipTransitionStorageSchemas_');

function makeIngressContext({ claim = { outcome: 'CLAIMED', row: { claimToken: 'claim-1', updateType: 'MESSAGE', attemptCount: 1 } }, coreError = null } = {}) {
  const calls = [];
  const journal = {
    claim: (update, now) => { calls.push({ type: 'claim', update, now }); return claim; },
    finish: (...args) => calls.push({ type: 'finish', args }),
    retry: (...args) => calls.push({ type: 'retry', args }),
    review: (...args) => calls.push({ type: 'review', args })
  };
  const context = {
    Date,
    MPS_TELEGRAM_UPDATE_JOURNAL: { sheet: 'MPS Telegram Update Journal' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'MPS_SPREADSHEET_ID' ? 'isolated-sheet-id' : '' }) },
    createMpsTelegramGasJournal_: config => {
      calls.push({ type: 'journal-create', config });
      return journal;
    },
    processTelegramUpdateCore_: update => {
      calls.push({ type: 'core', update });
      if (coreError) throw coreError;
    },
    mpsTelegramUpdateErrorCode_: () => 'HANDLER_FAILED',
    enqueueMpsTelegramUpdateReview_: (...args) => calls.push({ type: 'review-alert', args })
  };
  vm.createContext(context);
  vm.runInContext(ingressSource, context, { timeout: 1000 });
  return { context, calls };
}

test('current webhook ingress claims the durable journal before the core handler and completes afterward', () => {
  const { context, calls } = makeIngressContext();
  const update = { update_id: '12345678901234567890', message: { text: 'hello' } };
  context.processTelegramUpdate_(update);
  assert.deepEqual(calls.map(x => x.type), ['journal-create', 'claim', 'core', 'finish']);
  assert.equal(calls[1].update.update_id, update.update_id);
  assert.equal(calls[2].update.update_id, update.update_id);
  assert.equal(calls[3].args[0], update.update_id);
  assert.equal(calls[3].args[1], 'claim-1');
});

test('completed duplicate updates never re-enter the core handler', () => {
  const { context, calls } = makeIngressContext({ claim: { outcome: 'DUPLICATE_DONE' } });
  context.processTelegramUpdate_({ update_id: 77, message: { text: 'hello' } });
  assert.deepEqual(calls.map(x => x.type), ['journal-create', 'claim']);
});

test('retryable handler failure releases the journal claim as RETRYABLE and propagates the error', () => {
  const error = new Error('temporary handler failure');
  const { context, calls } = makeIngressContext({ coreError: error });
  assert.throws(() => context.processTelegramUpdate_({ update_id: 78, message: { text: 'hello' } }), /temporary handler failure/);
  const retry = calls.find(x => x.type === 'retry');
  assert.ok(retry);
  assert.equal(retry.args[0], 78);
  assert.equal(retry.args[1], 'claim-1');
  assert.equal(retry.args[3], 'HANDLER_FAILED');
  assert.equal(calls.some(x => x.type === 'finish'), false);
});

test('ambiguous external outcome is quarantined and raises a durable review alert instead of retrying', () => {
  const error = new Error('telegram response lost');
  error.ambiguousExternalOutcome = true;
  const { context, calls } = makeIngressContext({ coreError: error });
  context.processTelegramUpdate_({ update_id: 79, message: { text: 'hello' } });
  assert.ok(calls.some(x => x.type === 'review' && x.args[0] === 79 && x.args[3] === 'AMBIGUOUS_EXTERNAL_OUTCOME'));
  assert.ok(calls.some(x => x.type === 'review-alert' && x.args[1] === 'AMBIGUOUS_EXTERNAL_OUTCOME'));
  assert.equal(calls.some(x => x.type === 'retry'), false);
  assert.equal(calls.some(x => x.type === 'finish'), false);
});

test('current core handler forwards the complete update to both join-request and chat_member handlers', () => {
  const calls = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => key === 'MPS_TELEGRAM_VIP_CHAT_ID' ? '-1001234567890' : '' }) },
    processVipJoinRequest_: (request, update) => calls.push({ type: 'join-request', request, update }),
    processMpsVipChatMemberEvent_: (update, memberUpdate) => calls.push({ type: 'chat-member', update, memberUpdate })
  };
  vm.createContext(context);
  vm.runInContext(coreSource, context, { timeout: 1000 });
  const joinRequest = { chat: { id: '-1001234567890' }, from: { id: 987654321 }, date: 1760000000 };
  const memberUpdate = { chat: { id: '-1001234567890' }, date: 1760000001, new_chat_member: { user: { id: 987654321 }, status: 'member' } };
  const update = { update_id: 123, chat_join_request: joinRequest, chat_member: memberUpdate };
  context.processTelegramUpdateCore_(update);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'join-request');
  assert.equal(calls[0].request.date, joinRequest.date);
  assert.equal(calls[0].update.update_id, update.update_id);
  assert.equal(calls[1].type, 'chat-member');
  assert.equal(calls[1].update.update_id, update.update_id);
  assert.equal(calls[1].memberUpdate.date, memberUpdate.date);
});

test('join-request notices derive their durable identity from the original request or update', () => {
  assert.match(joinRequestSource, /function processVipJoinRequest_\(request,update\)/);
  assert.match(joinRequestSource, /enqueueMpsVipJoinRequestNotice_\(request,update,true\)/);
  assert.match(joinRequestSource, /enqueueMpsVipJoinRequestNotice_\(request,update,false\)/);
  assert.match(joinRequestSource, /VIP_JOIN_NOTICE_QUEUE_FAILED/);
});

test('VIP chat_member processing uses the complete Telegram update and the durable transition orchestrator', () => {
  assert.match(memberEventSource, /function processMpsVipChatMemberEvent_\(update,memberUpdate\)/);
  assert.match(memberEventSource, /createMpsGasVipTransitionOrchestrator_/);
  assert.match(memberEventSource, /handler\.process\(update\)/);
  assert.match(memberEventSource, /afterTransition:/);
});

test('obsolete pre-journal status writer and non-keyed ticker writer are absent from the candidate', () => {
  assert.doesNotMatch(source, /function updateVipJoinStatus_\(/);
  assert.doesNotMatch(source, /function recordMpsVipTickerEvent_\(/);
});
