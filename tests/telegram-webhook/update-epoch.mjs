export const TELEGRAM_UPDATE_ID_RESET_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pure ingress-epoch decision. The caller must run this while holding the
 * same durable journal lock used to append the update row and persist
 * nextStream. Replays must pass the epoch already stored on their journal row.
 */
export function assignIngressEpoch(stream, receivedAt, { storedEpoch, idleResetMs = TELEGRAM_UPDATE_ID_RESET_IDLE_MS } = {}) {
  const current = stream ?? { epoch: 0, lastIngressAt: 0 };
  if (!Number.isSafeInteger(current.epoch) || current.epoch < 0 ||
      !Number.isSafeInteger(current.lastIngressAt) || current.lastIngressAt < 0) {
    throw new TypeError('INVALID_STREAM_STATE');
  }
  if (!Number.isSafeInteger(idleResetMs) || idleResetMs <= 0) {
    throw new TypeError('INVALID_IDLE_RESET_WINDOW');
  }
  if (storedEpoch !== undefined && storedEpoch !== null) {
    if (!Number.isSafeInteger(storedEpoch) || storedEpoch < 0) {
      throw new TypeError('INVALID_STORED_EPOCH');
    }
    return {
      epoch: storedEpoch,
      reset: false,
      replay: true,
      nextStream: structuredClone(current)
    };
  }
  if (!Number.isSafeInteger(receivedAt) || receivedAt <= 0) {
    throw new TypeError('INVALID_RECEIVED_AT');
  }
  if (current.lastIngressAt && receivedAt < current.lastIngressAt) {
    throw new Error('INGRESS_CLOCK_REGRESSION');
  }
  const reset = current.lastIngressAt > 0 &&
    receivedAt - current.lastIngressAt >= idleResetMs;
  const epoch = current.epoch + (reset ? 1 : 0);
  return {
    epoch,
    reset,
    replay: false,
    nextStream: { epoch, lastIngressAt: receivedAt }
  };
}
