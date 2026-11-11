/**
 * MPS Telegram durable journal adapter — isolated Apps Script candidate.
 *
 * IMPORTANT:
 * - This adapter is not wired into doPost/processTelegramUpdate_.
 * - It requires an explicitly supplied isolated spreadsheet ID.
 * - It never creates a spreadsheet or tab and never reads Script Properties.
 * - Google Sheets + ScriptLock is a serialized journal adapter, not a DB transaction.
 *   Any malformed/duplicate row fails closed and must be reviewed.
 */
function createMpsTelegramGasJournal_(config) {
  config = config || {};
  var spreadsheetId = String(config.spreadsheetId || '').trim();
  var sheetName = String(config.sheetName || 'MPS Telegram Update Journal');
  var lockWaitMs = Number(config.lockWaitMs || 10000);
  var leaseMs = Number(config.leaseMs || 600000);
  if (!spreadsheetId) throw new Error('JOURNAL_SPREADSHEET_ID_REQUIRED');
  if (!/^[A-Za-z0-9 _-]{1,120}$/.test(sheetName)) throw new Error('INVALID_JOURNAL_SHEET_NAME');
  if (!(lockWaitMs > 0 && lockWaitMs <= 30000) || !(leaseMs >= 60000 && leaseMs <= 1800000)) {
    throw new Error('INVALID_JOURNAL_TIMING');
  }

  var headers = [
    'Update ID', 'Update Type', 'Payload SHA-256', 'State',
    'First Seen At', 'Last Attempt At', 'Attempt Count',
    'Lease Expires At', 'Claim Token', 'Completed At',
    'Effect Keys JSON', 'Last Error Code'
  ];
  var allowedStates = { RECEIVED: true, PROCESSING: true, RETRYABLE: true, DONE: true, REVIEW: true };
  var allowedUpdateTypes = { CHAT_JOIN_REQUEST: true, CHAT_MEMBER: true, BOT_CHAT_MEMBER: true, MESSAGE: true, OTHER: true };

  function withLock_(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(lockWaitMs);
    try { return fn(); } finally { lock.releaseLock(); }
  }

  function getSheet_() {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss && ss.getSheetByName(sheetName);
    if (!sheet) throw new Error('JOURNAL_SHEET_MISSING');
    var actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (actual.join('\u001f') !== headers.join('\u001f')) throw new Error('JOURNAL_SCHEMA_MISMATCH');
    return sheet;
  }

  function validateId_(value) {
    if (typeof value === 'number') {
      if (!isFinite(value) || Math.floor(value) !== value || value < 0 || value > 9007199254740991) {
        throw new Error('INVALID_UPDATE_ID');
      }
      return String(value);
    }
    var id = String(value == null ? '' : value);
    if (!/^(0|[1-9]\d{0,19})$/.test(id)) throw new Error('INVALID_UPDATE_ID');
    return id;
  }

  function canonicalize_(value) {
    if (Array.isArray(value)) return value.map(canonicalize_);
    if (value && typeof value === 'object') {
      var normalized = {};
      Object.keys(value).sort().forEach(function(key) { normalized[key] = canonicalize_(value[key]); });
      return normalized;
    }
    return value;
  }

  function digest_(value) {
    var raw;
    try { raw = JSON.stringify(canonicalize_(value)); } catch (err) { throw new Error('INVALID_UPDATE_PAYLOAD'); }
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
    return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }

  function classify_(update) {
    if (update.chat_join_request) return 'CHAT_JOIN_REQUEST';
    if (update.chat_member) return 'CHAT_MEMBER';
    if (update.my_chat_member) return 'BOT_CHAT_MEMBER';
    if (update.message) return 'MESSAGE';
    return 'OTHER';
  }

  function sanitizeCode_(code) {
    var value = String(code == null ? '' : code).toUpperCase();
    return /^[A-Z0-9_]{1,40}$/.test(value) ? value : 'UNCLASSIFIED';
  }

  function normalizeEffects_(keys) {
    if (!Array.isArray(keys)) throw new Error('INVALID_EFFECT_KEYS');
    var clean = [];
    keys.forEach(function(key) {
      var value = String(key == null ? '' : key);
      if (!/^[A-Za-z0-9:_-]{1,80}$/.test(value)) throw new Error('INVALID_EFFECT_KEY');
      if (clean.indexOf(value) < 0) clean.push(value);
    });
    return clean.slice(-20);
  }

  function findRow_(sheet, id) {
    var last = sheet.getLastRow();
    if (last < 2) return 0;
    var ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
    var found = 0;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === id) {
        if (found) throw new Error('JOURNAL_DUPLICATE_UPDATE_ID');
        found = i + 2;
      }
    }
    return found;
  }

  function readRecord_(sheet, row) {
    var v = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    var record = {
      updateId: String(v[0] || ''),
      updateType: String(v[1] || ''),
      payloadHash: String(v[2] || ''),
      state: String(v[3] || ''),
      firstSeenAt: Number(v[4] || 0),
      lastAttemptAt: Number(v[5] || 0),
      attemptCount: Number(v[6] || 0),
      leaseExpiresAt: Number(v[7] || 0),
      claimToken: String(v[8] || ''),
      completedAt: Number(v[9] || 0),
      effectKeys: [],
      lastErrorCode: String(v[11] || '')
    };
    try { record.effectKeys = normalizeEffects_(v[10] ? JSON.parse(String(v[10])) : []); } catch (err) {
      throw new Error('JOURNAL_EFFECT_KEYS_CORRUPT');
    }
    var validId = false;
    try { validId = validateId_(record.updateId) === record.updateId; } catch (idErr) { validId = false; }
    var processingValid = record.state !== 'PROCESSING' ||
      (!!record.claimToken && record.leaseExpiresAt > record.lastAttemptAt);
    var terminalValid = record.state === 'PROCESSING' ||
      (!record.claimToken && record.leaseExpiresAt === 0);
    var completionValid = record.state === 'DONE' ? record.completedAt > 0 : record.completedAt === 0;
    var errorValid = !record.lastErrorCode || /^[A-Z0-9_]{1,40}$/.test(record.lastErrorCode);
    if (!validId || !/^[a-f0-9]{64}$/.test(record.payloadHash) ||
        !allowedStates[record.state] || !allowedUpdateTypes[record.updateType] ||
        !isFinite(record.firstSeenAt) || record.firstSeenAt <= 0 ||
        !isFinite(record.lastAttemptAt) || record.lastAttemptAt <= 0 ||
        !isFinite(record.leaseExpiresAt) || !isFinite(record.completedAt) ||
        !isFinite(record.attemptCount) || Math.floor(record.attemptCount) !== record.attemptCount ||
        record.attemptCount < 1 || !processingValid || !terminalValid || !completionValid || !errorValid) {
      throw new Error('JOURNAL_ROW_CORRUPT');
    }
    return record;
  }

  function writeRecord_(sheet, row, record) {
    var values = [[
      record.updateId, record.updateType, record.payloadHash, record.state,
      record.firstSeenAt, record.lastAttemptAt, record.attemptCount,
      record.leaseExpiresAt, record.claimToken || '', record.completedAt || '',
      JSON.stringify(record.effectKeys || []), record.lastErrorCode || ''
    ]];
    var target = row || (sheet.getLastRow() + 1);
    sheet.getRange(target, 1, 1, 1).setNumberFormat('@');
    sheet.getRange(target, 1, 1, headers.length).setValues(values);
    SpreadsheetApp.flush();
  }

  function claim(update, now) {
    now = now == null ? Date.now() : Number(now);
    if (!isFinite(now)) throw new Error('INVALID_TIMESTAMP');
    if (!update || typeof update !== 'object') throw new Error('INVALID_UPDATE_PAYLOAD');
    var id = validateId_(update.update_id);
    var hash = digest_(update);
    return withLock_(function() {
      var sheet = getSheet_();
      var rowNumber = findRow_(sheet, id);
      var existing = rowNumber ? readRecord_(sheet, rowNumber) : null;
      if (existing && existing.payloadHash !== hash) {
        existing.state = 'REVIEW';
        existing.leaseExpiresAt = 0;
        existing.claimToken = '';
        existing.lastErrorCode = 'PAYLOAD_HASH_MISMATCH';
        writeRecord_(sheet, rowNumber, existing);
        return { outcome: 'MANUAL_REVIEW' };
      }
      if (existing && existing.state === 'DONE') return { outcome: 'DUPLICATE_DONE' };
      if (existing && existing.state === 'REVIEW') return { outcome: 'MANUAL_REVIEW' };
      if (existing && existing.state === 'PROCESSING' && existing.leaseExpiresAt > now) {
        return { outcome: 'BUSY' };
      }
      var recovered = !!(existing && (existing.state === 'PROCESSING' || existing.state === 'RETRYABLE'));
      var record = {
        updateId: id,
        updateType: classify_(update),
        payloadHash: hash,
        state: 'PROCESSING',
        firstSeenAt: existing ? existing.firstSeenAt : now,
        lastAttemptAt: now,
        attemptCount: existing ? existing.attemptCount + 1 : 1,
        leaseExpiresAt: now + leaseMs,
        claimToken: String(Utilities.getUuid()),
        completedAt: 0,
        effectKeys: existing ? existing.effectKeys : [],
        lastErrorCode: ''
      };
      if (!record.claimToken) throw new Error('CLAIM_TOKEN_UNAVAILABLE');
      writeRecord_(sheet, rowNumber, record);
      return { outcome: 'CLAIMED', recovered: recovered, row: record };
    });
  }

  function transition_(idValue, claimToken, now, state, errorCode, effectKeys) {
    var id = validateId_(idValue);
    now = now == null ? Date.now() : Number(now);
    if (!isFinite(now)) throw new Error('INVALID_TIMESTAMP');
    return withLock_(function() {
      var sheet = getSheet_();
      var rowNumber = findRow_(sheet, id);
      if (!rowNumber) throw new Error('STALE_OR_INVALID_CLAIM');
      var record = readRecord_(sheet, rowNumber);
      if (record.state !== 'PROCESSING' || !claimToken ||
          record.claimToken !== String(claimToken) || record.leaseExpiresAt <= now) {
        throw new Error('STALE_OR_INVALID_CLAIM');
      }
      record.state = state;
      record.leaseExpiresAt = 0;
      record.claimToken = '';
      if (state === 'DONE') {
        record.completedAt = now;
        record.effectKeys = normalizeEffects_(record.effectKeys.concat(effectKeys || []));
        record.lastErrorCode = '';
      } else {
        record.lastErrorCode = sanitizeCode_(errorCode);
      }
      writeRecord_(sheet, rowNumber, record);
      return record;
    });
  }

  return {
    claim: claim,
    finish: function(id, token, now, effectKeys) {
      return transition_(id, token, now, 'DONE', '', effectKeys || []);
    },
    retry: function(id, token, now, errorCode) {
      return transition_(id, token, now, 'RETRYABLE', errorCode || 'TRANSIENT', []);
    },
    review: function(id, token, now, errorCode) {
      return transition_(id, token, now, 'REVIEW', errorCode || 'AMBIGUOUS', []);
    }
  };
}
