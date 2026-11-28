/**
 * MPS Trading Journal API — add this as a separate Apps Script .gs file.
 * Requires the existing v4.8.1 helpers: openDatabase_, requireMember_,
 * consumeRateLimit_, recordMpsAudit_, sha256_, LockService, Utilities.
 * It does not replace Code.gs or modify legacy member columns.
 */

// Member-owned trading journal. This is an additive sheet; legacy member data is untouched.
const MPS_TRADING_JOURNAL = Object.freeze({
  sheet: 'MPS Trading Journal',
  headers: ['Journal ID','Member ID','Created At','Updated At','Trade Date','Instrument','Direction','Market Session','Entry Price','Stop Loss','Take Profit','Risk Percent','Setup Reason','Emotion','Result','Lesson','Status','Client Request ID'],
  maxRowsPerMember: 200,
  maxTextLength: 3000
});

/**
 * Trading Journal API — every operation revalidates the server-side member session
 * and current entitlement. Records are isolated by Member ID; no browser storage
 * or client-supplied member identity is trusted.
 */
function getMpsTradingJournalSheet_() {
  const ss = openDatabase_(); // Also verifies the database file remains PRIVATE.
  let sh = ss.getSheetByName(MPS_TRADING_JOURNAL.sheet);
  if (!sh) {
    sh = ss.insertSheet(MPS_TRADING_JOURNAL.sheet);
    sh.getRange(1, 1, 1, MPS_TRADING_JOURNAL.headers.length).setValues([MPS_TRADING_JOURNAL.headers]);
    sh.setFrozenRows(1);
    sh.setHiddenGridlines(true);
    sh.getRange(1, 1, 1, MPS_TRADING_JOURNAL.headers.length)
      .setBackground('#101f32').setFontColor('#38e1ff').setFontWeight('bold').setWrap(true);
  } else {
    if (sh.getLastRow() < 1 || sh.getLastColumn() < MPS_TRADING_JOURNAL.headers.length) {
      throw new Error('Skema MPS Trading Journal tidak lengkap. Akses penyimpanan dihentikan tanpa mengubah data.');
    }
    const actual = sh.getRange(1, 1, 1, MPS_TRADING_JOURNAL.headers.length).getDisplayValues()[0];
    if (MPS_TRADING_JOURNAL.headers.some(function(h, i) { return String(actual[i] || '').trim() !== h; })) {
      throw new Error('Header MPS Trading Journal tidak cocok. Tidak ada data yang diubah.');
    }
  }
  return sh;
}

function mpsJournalCleanText_(value, maxLength, fieldName, required) {
  const text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').trim();
  if (required && !text) throw new Error(fieldName + ' wajib diisi.');
  if (text.length > maxLength) throw new Error(fieldName + ' terlalu panjang.');
  // Prevent spreadsheet formula injection in text cells.
  return /^[=+@\-]/.test(text) ? "'" + text : text;
}

function mpsJournalFindRow_(sh, journalId) {
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0] || '') === journalId) return i + 2;
  return 0;
}

function mpsJournalNormalizePayload_(data) {
  data = data && typeof data === 'object' ? data : {};
  const tradeDate = String(data.tradeDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tradeDate)) throw new Error('Tanggal transaksi wajib valid.');
  const parsedDate = new Date(tradeDate + 'T00:00:00Z');
  if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== tradeDate) throw new Error('Tanggal transaksi tidak valid.');
  const instrument = mpsJournalCleanText_(data.instrument, 20, 'Instrumen', true).toUpperCase();
  if (!/^[A-Z0-9._\/-]{2,20}$/.test(instrument)) throw new Error('Format instrumen tidak valid.');
  const direction = String(data.direction || '').toUpperCase();
  if (['BUY', 'SELL'].indexOf(direction) < 0) throw new Error('Arah posisi tidak valid.');
  const marketSession = String(data.session || '');
  if (['Asia', 'London', 'New York', 'Overlap', 'Lainnya'].indexOf(marketSession) < 0) throw new Error('Sesi pasar tidak valid.');
  function decimal(value, label, required) {
    const raw = String(value == null ? '' : value).trim();
    if (!raw && !required) return '';
    if (!/^(?:\d{1,12})(?:\.\d{1,8})?$/.test(raw)) throw new Error(label + ' harus berupa angka positif yang valid.');
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) throw new Error(label + ' harus lebih besar dari nol.');
    return n;
  }
  const entry = decimal(data.entryPrice, 'Harga masuk', true);
  const stop = decimal(data.stopLoss, 'Stop Loss', false);
  const target = decimal(data.takeProfit, 'Take Profit', false);
  const riskRaw = String(data.riskPercent == null ? '' : data.riskPercent).trim();
  if (!riskRaw || !/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(riskRaw)) throw new Error('Risiko rencana wajib diisi dalam persen.');
  const risk = Number(riskRaw);
  if (!Number.isFinite(risk) || risk <= 0 || risk > 100) throw new Error('Risiko rencana harus lebih dari 0% dan maksimal 100%.');
  const emotion = String(data.emotion || '');
  if (['Tenang dan fokus', 'Ragu', 'Takut tertinggal (FOMO)', 'Ingin balas kerugian', 'Lelah atau terganggu'].indexOf(emotion) < 0) throw new Error('Kondisi emosi tidak valid.');
  const result = String(data.result || '');
  if (['Profit', 'Loss', 'Break Even', 'Belum ditutup'].indexOf(result) < 0) throw new Error('Hasil transaksi tidak valid.');
  return {
    tradeDate: tradeDate,
    instrument: instrument,
    direction: direction,
    marketSession: marketSession,
    entryPrice: entry,
    stopLoss: stop,
    takeProfit: target,
    riskPercent: risk,
    setupReason: mpsJournalCleanText_(data.setupReason, 2000, 'Alasan setup', true),
    emotion: emotion,
    result: result,
    lesson: mpsJournalCleanText_(data.lesson, 3000, 'Evaluasi', false)
  };
}

function mpsJournalRowToClient_(row) {
  return {
    journalId: String(row[0] || ''),
    createdAt: row[2] instanceof Date ? row[2].toISOString() : String(row[2] || ''),
    updatedAt: row[3] instanceof Date ? row[3].toISOString() : String(row[3] || ''),
    tradeDate: String(row[4] || ''), instrument: String(row[5] || ''),
    direction: String(row[6] || ''), session: String(row[7] || ''),
    entryPrice: String(row[8] == null ? '' : row[8]), stopLoss: String(row[9] == null ? '' : row[9]),
    takeProfit: String(row[10] == null ? '' : row[10]), riskPercent: String(row[11] == null ? '' : row[11]),
    setupReason: String(row[12] || '').replace(/^'(?=[=+@\-])/, ''), emotion: String(row[13] || ''),
    result: String(row[14] || ''), lesson: String(row[15] || '').replace(/^'(?=[=+@\-])/, '')
  };
}

function apiGetTradingJournal(session) {
  const member = requireMember_(session);
  consumeRateLimit_('mps_journal_read_' + sha256_(member.memberId).slice(0, 20), 60, 60, 'Permintaan jurnal terlalu sering. Coba lagi sebentar.');
  const sh = getMpsTradingJournalSheet_();
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, entries: [], total: 0, limit: MPS_TRADING_JOURNAL.maxRowsPerMember };
  const rows = sh.getRange(2, 1, last - 1, MPS_TRADING_JOURNAL.headers.length).getValues();
  const mine = rows.filter(function(row) { return String(row[1] || '') === member.memberId && String(row[16] || '') === 'Aktif'; })
    .sort(function(a, b) { return new Date(b[3] || b[2]).getTime() - new Date(a[3] || a[2]).getTime(); });
  const entries = mine.slice(0, MPS_TRADING_JOURNAL.maxRowsPerMember).map(mpsJournalRowToClient_);
  return { ok: true, entries: entries, total: mine.length, limit: MPS_TRADING_JOURNAL.maxRowsPerMember, truncated: mine.length > entries.length };
}

function apiSaveTradingJournal(session, data) {
  let member = requireMember_(session);
  consumeRateLimit_('mps_journal_write_' + sha256_(member.memberId).slice(0, 20), 30, 300, 'Penyimpanan jurnal terlalu sering. Coba lagi 5 menit.');
  const normalized = mpsJournalNormalizePayload_(data);
  const requestedId = String(data && data.journalId || '').trim();
  if (requestedId && !/^MPS-JRN-[A-F0-9]{20}$/.test(requestedId)) throw new Error('ID jurnal tidak valid.');
  const requestKey = String(data && data.clientRequestId || '').trim();
  if (!requestedId && !/^[A-F0-9]{24,64}$/.test(requestKey)) throw new Error('Kunci permintaan jurnal tidak valid. Muat ulang formulir dan coba kembali.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let journalId = requestedId;
  try {
    member = requireMember_(session); // Recheck entitlement after lock acquisition.
    const sh = getMpsTradingJournalSheet_();
    const last = sh.getLastRow();
    let rowNumber = journalId ? mpsJournalFindRow_(sh, journalId) : 0;
    if (!journalId && last >= 2) {
      const prior = sh.getRange(2, 1, last - 1, MPS_TRADING_JOURNAL.headers.length).getValues();
      for (let i = 0; i < prior.length; i++) {
        if (String(prior[i][1] || '') === member.memberId && String(prior[i][17] || '') === requestKey) {
          return { ok: true, journalId: String(prior[i][0]), duplicate: true, message: 'Jurnal sudah tersimpan.' };
        }
      }
    }
    const now = new Date();
    if (rowNumber) {
      const existing = sh.getRange(rowNumber, 1, 1, MPS_TRADING_JOURNAL.headers.length).getValues()[0];
      if (String(existing[1] || '') !== member.memberId) throw new Error('Jurnal tidak ditemukan atau bukan milik sesi ini.');
      if (String(existing[16] || '') !== 'Aktif') throw new Error('Jurnal yang sudah dihapus tidak dapat diubah.');
      const updated = [existing[0], member.memberId, existing[2] || now, now, normalized.tradeDate, normalized.instrument,
        normalized.direction, normalized.marketSession, normalized.entryPrice, normalized.stopLoss, normalized.takeProfit,
        normalized.riskPercent, normalized.setupReason, normalized.emotion, normalized.result, normalized.lesson, 'Aktif', existing[17] || ''];
      sh.getRange(rowNumber, 1, 1, updated.length).setValues([updated]);
    } else {
      const memberRows = last >= 2 ? sh.getRange(2, 2, last - 1, 1).getDisplayValues().filter(function(r) { return r[0] === member.memberId; }).length : 0;
      if (memberRows >= MPS_TRADING_JOURNAL.maxRowsPerMember) throw new Error('Batas 200 catatan jurnal per member tercapai.');
      journalId = 'MPS-JRN-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20).toUpperCase();
      const values = [journalId, member.memberId, now, now, normalized.tradeDate, normalized.instrument, normalized.direction,
        normalized.marketSession, normalized.entryPrice, normalized.stopLoss, normalized.takeProfit, normalized.riskPercent,
        normalized.setupReason, normalized.emotion, normalized.result, normalized.lesson, 'Aktif', requestKey];
      sh.appendRow(values);
    }
  } finally {
    lock.releaseLock();
  }
  let auditWarning = '';
  try {
    recordMpsAudit_('MEMBER', member.memberId, requestedId ? 'TRADING_JOURNAL_UPDATED' : 'TRADING_JOURNAL_CREATED', journalId, 'SUCCESS', 'Catatan jurnal disimpan tanpa menyalin isi privat ke audit log.');
  } catch (auditError) {
    auditWarning = 'Catatan tersimpan, tetapi audit log perlu diperiksa Admin.';
    console.error('MPS trading journal audit deferred: ' + String(auditError && auditError.message || auditError));
  }
  return { ok: true, journalId: journalId, message: requestedId ? 'Jurnal berhasil diperbarui.' : 'Jurnal berhasil disimpan.', auditWarning: auditWarning };
}

function apiDeleteTradingJournal(session, journalId) {
  let member = requireMember_(session);
  const id = String(journalId || '').trim();
  if (!/^MPS-JRN-[A-F0-9]{20}$/.test(id)) throw new Error('ID jurnal tidak valid.');
  consumeRateLimit_('mps_journal_delete_' + sha256_(member.memberId).slice(0, 20), 20, 300, 'Terlalu banyak permintaan hapus jurnal. Coba lagi.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    member = requireMember_(session);
    const sh = getMpsTradingJournalSheet_();
    const row = mpsJournalFindRow_(sh, id);
    if (!row) throw new Error('Jurnal tidak ditemukan.');
    const record = sh.getRange(row, 1, 1, MPS_TRADING_JOURNAL.headers.length).getValues()[0];
    if (String(record[1] || '') !== member.memberId) throw new Error('Jurnal tidak ditemukan atau bukan milik sesi ini.');
    if (String(record[16] || '') !== 'Aktif') return { ok: true, message: 'Jurnal sudah dihapus.' };
    sh.getRange(row, 4).setValue(new Date());
    sh.getRange(row, 17).setValue('Dihapus');
  } finally {
    lock.releaseLock();
  }
  recordMpsAudit_('MEMBER', member.memberId, 'TRADING_JOURNAL_DELETED', id, 'SUCCESS', 'Catatan jurnal dihapus secara soft-delete.');
  return { ok: true, message: 'Jurnal berhasil dihapus.' };
}
