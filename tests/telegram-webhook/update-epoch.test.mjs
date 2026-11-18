import test from 'node:test';
import assert from 'node:assert/strict';
import { assignIngressEpoch, TELEGRAM_UPDATE_ID_RESET_IDLE_MS } from './update-epoch.mjs';

const day = 24 * 60 * 60 * 1000;
const start = 1_800_000_000_000;

test('first newly received update starts local epoch zero', () => {
  const result = assignIngressEpoch(null, start);
  assert.equal(result.epoch, 0);
  assert.equal(result.reset, false);
  assert.deepEqual(result.nextStream, { epoch: 0, lastIngressAt: start });
});

test('updates arriving before seven idle days remain in the same epoch', () => {
  const first = assignIngressEpoch(null, start);
  const next = assignIngressEpoch(first.nextStream, start + 7 * day - 1);
  assert.equal(next.epoch, 0);
  assert.equal(next.reset, false);
});

test('exactly seven idle days starts a new local epoch', () => {
  const first = assignIngressEpoch(null, start);
  const next = assignIngressEpoch(first.nextStream, start + TELEGRAM_UPDATE_ID_RESET_IDLE_MS);
  assert.equal(next.epoch, 1);
  assert.equal(next.reset, true);
});

test('a longer idle period starts exactly one new epoch', () => {
  const first = assignIngressEpoch(null, start);
  const next = assignIngressEpoch(first.nextStream, start + 30 * day);
  assert.equal(next.epoch, 1);
  assert.equal(next.reset, true);
});

test('new epoch assignment is independent of whether Telegram update_id rises or falls', () => {
  const first = assignIngressEpoch(null, start);
  const afterGap = assignIngressEpoch(first.nextStream, start + 8 * day);
  assert.equal(afterGap.epoch, 1);
  // update_id is intentionally not an input to epoch allocation; it is compared inside the assigned epoch.
});

test('journal replay retains its originally persisted epoch after the stream has advanced', () => {
  const current = { epoch: 4, lastIngressAt: start + 30 * day };
  const replay = assignIngressEpoch(current, start + 31 * day, { storedEpoch: 2 });
  assert.equal(replay.epoch, 2);
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.nextStream, current);
});

test('clock regression fails closed instead of silently rolling stream state backward', () => {
  const current = { epoch: 3, lastIngressAt: start + day };
  assert.throws(() => assignIngressEpoch(current, start), /INGRESS_CLOCK_REGRESSION/);
});

test('invalid received time, stream state, stored epoch, and reset window fail closed', () => {
  assert.throws(() => assignIngressEpoch(null, 0), /INVALID_RECEIVED_AT/);
  assert.throws(() => assignIngressEpoch({ epoch: -1, lastIngressAt: 0 }, start), /INVALID_STREAM_STATE/);
  assert.throws(() => assignIngressEpoch({ epoch: 0, lastIngressAt: 0 }, start, { storedEpoch: -1 }), /INVALID_STORED_EPOCH/);
  assert.throws(() => assignIngressEpoch(null, start, { idleResetMs: 0 }), /INVALID_IDLE_RESET_WINDOW/);
});
