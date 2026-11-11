/**
 * MPS v4.8 isolated Google Apps Script runtime acceptance harness.
 *
 * IMPORTANT:
 * - Import the candidate Code.gs into a NEW, standalone Apps Script project.
 * - Add this file as a separate .gs file in that isolated project.
 * - Never run this from the production Apps Script project.
 * - This harness creates its own private synthetic spreadsheet and trashes it
 *   in a finally block. It does not accept or read a spreadsheet ID from users.
 * - It temporarily changes only MPS_SPREADSHEET_ID and
 *   MPS_TELEGRAM_VIP_CHAT_ID in THIS script project's Script Properties, then
 *   restores their original values.
 * - It does not configure a bot token, call Telegram, create triggers, deploy,
 *   or touch production Drive/Sheets/Script Properties.
 */

var MPS_V480_ISOLATED_CONFIRMATION_ = 'I_CONFIRM_THIS_IS_A_NEW_STANDALONE_TEST_PROJECT';

function runMpsV480IsolatedGasAcceptance(confirmation) {
  if (confirmation !== MPS_V480_ISOLATED_CONFIRMATION_) {
    throw new Error('DIBLOKIR: jalankan hanya dari project Apps Script BARU dan standalone dengan argumen konfirmasi yang tepat.');
  }

  var props = PropertiesService.getScriptProperties();
  var oldSpreadsheetId = props.getProperty('MPS_SPREADSHEET_ID');
  var oldVipChatId = props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID');
  var existingBotToken = props.getProperty('MPS_TELEGRAM_BOT_TOKEN');
  var existingWebhookSecret = props.getProperty('MPS_TELEGRAM_WEBHOOK_SECRET');
  var synthetic = null;
  var failure = null;
  var cleanupErrors = [];
  var report = {
    suite: 'MPS v4.8 isolated Google Apps Script acceptance',
    environment: 'new standalone Apps Script project + private synthetic spreadsheet',
    networkCalls: 0,
    productionResourcesUsed: false,
    checks: []
  };

  function assert_(condition, message) {
    if (!condition) throw new Error('ASSERTION_FAILED: ' + message);
    report.checks.push({ name: message, passed: true });
  }
  function makeSheet_(book, name, headers, row) {
    var sh = book.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (row) sh.getRange(2, 1, 1, row.length).setValues([row]);
    return sh;
  }
  function event_(updateId, date, oldStatus, newStatus) {
    var user = { id: 700000001, is_bot: false, first_name: 'Synthetic', last_name: 'Member', username: 'mps_synthetic_test' };
    return {
      update_id: updateId,
      chat_member: {
        chat: { id: -1000000000001, title: 'MPS ISOLATED TEST GROUP', type: 'supergroup' },
        from: { id: 700000099, is_bot: false, first_name: 'Synthetic Admin' },
        date: date,
        old_chat_member: { user: user, status: oldStatus },
        new_chat_member: { user: user, status: newStatus }
      }
    };
  }
  function values_(sheet, row, col, width) {
    return sheet.getRange(row, col, 1, width).getValues()[0];
  }

  try {
    if (oldSpreadsheetId || oldVipChatId || existingBotToken || existingWebhookSecret) {
      throw new Error('DIBLOKIR: Script Properties sudah berisi konfigurasi MPS/Telegram. Gunakan project standalone baru yang kosong; tidak ada properti yang diubah.');
    }
    synthetic = SpreadsheetApp.create('MPS_ISOLATED_ACCEPTANCE_' + new Date().getTime());
    var spreadsheetId = synthetic.getId();
    var defaultSheet = synthetic.getSheets()[0];
    synthetic.deleteSheet(defaultSheet);

    var memberHeaders = [
      'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran',
      'Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit',
      'Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui','Telegram Chat ID','Telegram Link Token','Telegram Linked At','PIN Hash',
      'PIN Updated At','Telegram Link Expires At','Application Ref','VIP Invite Link','VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'
    ];
    var memberRow = new Array(30).fill('');
    memberRow[0] = 'MPS-A1B2C3D4';
    memberRow[1] = new Date();
    memberRow[2] = 'Synthetic Member';
    memberRow[3] = 'mps_synthetic_test';
    memberRow[7] = 'Berhasil';
    memberRow[8] = 'Synthetic Member';
    memberRow[14] = 'Disetujui';
    makeSheet_(synthetic, 'Database Member', memberHeaders, memberRow);

    var accessHeaders = ['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'];
    var accessRow = ['MPS-A1B2C3D4','700000001','700000001','mps_synthetic_test','Synthetic','Ya','Menunggu','','','',''];
    var accessSheet = makeSheet_(synthetic, 'VIP Access', accessHeaders, accessRow);

    var auditHeaders = ['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details'];
    var tickerHeaders = ['Event ID','Created At','Member ID','Member Name','Event Text','Status'];
    var auditSheet = makeSheet_(synthetic, 'MPS Audit Logs', auditHeaders);
    var tickerSheet = makeSheet_(synthetic, 'MPS VIP Ticker Events', tickerHeaders);
    var intentHeaders = ['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
    var cursorHeaders = ['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];
    var intentSheet = makeSheet_(synthetic, 'MPS Telegram VIP Transition Intents', intentHeaders);
    var cursorSheet = makeSheet_(synthetic, 'MPS Telegram VIP Member Cursor', cursorHeaders);

    props.setProperty('MPS_SPREADSHEET_ID', spreadsheetId);
    props.setProperty('MPS_TELEGRAM_VIP_CHAT_ID', '-1000000000001');

    // Exercise the candidate's real effect-ledger migration adapter on the
    // synthetic audit/ticker tabs. No provisioning API or production ID used.
    var ledger = createMpsGasEffectLedger_({ spreadsheetId: spreadsheetId });
    ledger.runExclusive(function (tx) {
      tx.migrate('audit');
      tx.migrate('ticker');
    });
    SpreadsheetApp.flush();
    assert_(auditSheet.getLastColumn() === 8 && auditSheet.getRange(1, 8).getDisplayValue() === 'Effect Key', 'Synthetic audit Effect Key schema migrated');
    assert_(tickerSheet.getLastColumn() === 7 && tickerSheet.getRange(1, 7).getDisplayValue() === 'Effect Key', 'Synthetic ticker Effect Key schema migrated');

    var baseDate = Math.floor(new Date().getTime() / 1000) - 120;
    var activation = event_(980000001, baseDate, 'left', 'member');
    var activationResult = processMpsVipChatMemberEvent_(activation, activation.chat_member);
    SpreadsheetApp.flush();
    assert_(activationResult === 'ACTIVE', 'Real candidate handler processes synthetic activation');
    assert_(accessSheet.getRange(2, 7).getDisplayValue() === 'Aktif', 'Activation updates VIP Access status');
    var activatedMember = values_(synthetic.getSheetByName('Database Member'), 2, 28, 3);
    assert_(activatedMember[0] instanceof Date && String(activatedMember[1]) === '700000001' && activatedMember[2] === 'Aktif', 'Activation updates Database Member columns 28–30');
    assert_(intentSheet.getLastRow() === 2 && intentSheet.getRange(2, 12).getDisplayValue() === 'COMPLETED', 'Activation persists a completed durable intent');
    assert_(cursorSheet.getLastRow() === 2 && cursorSheet.getRange(2, 4).getDisplayValue() === '980000001', 'Activation persists member cursor');
    assert_(tickerSheet.getLastRow() === 2 && auditSheet.getLastRow() === 2, 'Activation appends exactly one ticker and one audit effect');

    var replayResult = processMpsVipChatMemberEvent_(activation, activation.chat_member);
    SpreadsheetApp.flush();
    assert_(replayResult === 'DUPLICATE', 'Exact activation replay is recognized as duplicate');
    assert_(tickerSheet.getLastRow() === 2 && auditSheet.getLastRow() === 2 && intentSheet.getLastRow() === 2, 'Exact replay creates no duplicate intent, ticker, or audit rows');

    var leave = event_(980000002, baseDate + 60, 'member', 'left');
    var leaveResult = processMpsVipChatMemberEvent_(leave, leave.chat_member);
    SpreadsheetApp.flush();
    assert_(leaveResult === 'LEFT', 'Real candidate handler processes synthetic leave');
    assert_(accessSheet.getRange(2, 7).getDisplayValue() === 'Keluar', 'Leave updates VIP Access status');
    assert_(synthetic.getSheetByName('Database Member').getRange(2, 30).getDisplayValue() === 'Keluar', 'Leave updates Database Member VIP status');
    assert_(tickerSheet.getLastRow() === 2 && auditSheet.getLastRow() === 3, 'Leave adds an audit effect but no second join ticker');
    assert_(intentSheet.getLastRow() === 3 && intentSheet.getRange(3, 12).getDisplayValue() === 'COMPLETED', 'Leave persists a second completed durable intent');
    assert_(cursorSheet.getRange(2, 3).getValue() === baseDate + 60 && cursorSheet.getRange(2, 4).getDisplayValue() === '980000002', 'Cursor advances to the leave event');

    var roleOnly = event_(980000003, baseDate + 90, 'member', 'administrator');
    var roleResult = processMpsVipChatMemberEvent_(roleOnly, roleOnly.chat_member);
    SpreadsheetApp.flush();
    assert_(roleResult === 'IGNORED', 'Member-to-admin role-only change is ignored');
    assert_(intentSheet.getLastRow() === 3 && tickerSheet.getLastRow() === 2 && auditSheet.getLastRow() === 3, 'Role-only change creates no durable effects');
    assert_(accessSheet.getRange(2, 7).getDisplayValue() === 'Keluar' && synthetic.getSheetByName('Database Member').getRange(2, 30).getDisplayValue() === 'Keluar', 'Role-only change does not overwrite the latest leave state');

    report.checkCount = report.checks.length;
    report.result = 'PASS';
  } catch (err) {
    failure = err;
    report.result = 'FAIL';
    report.error = String(err && err.stack || err);
  } finally {
    try {
      if (oldSpreadsheetId === null) props.deleteProperty('MPS_SPREADSHEET_ID');
      else props.setProperty('MPS_SPREADSHEET_ID', oldSpreadsheetId);
      if (oldVipChatId === null) props.deleteProperty('MPS_TELEGRAM_VIP_CHAT_ID');
      else props.setProperty('MPS_TELEGRAM_VIP_CHAT_ID', oldVipChatId);
    } catch (restoreError) {
      cleanupErrors.push('Script Properties restore failed: ' + restoreError);
    }
    try {
      if (synthetic) DriveApp.getFileById(synthetic.getId()).setTrashed(true);
    } catch (trashError) {
      cleanupErrors.push('Synthetic spreadsheet cleanup failed: ' + trashError);
    }
  }

  if (cleanupErrors.length) report.cleanupErrors = cleanupErrors;
  Logger.log(JSON.stringify(report, null, 2));
  if (failure) throw failure;
  if (cleanupErrors.length) throw new Error('ACCEPTANCE_PASSED_BUT_CLEANUP_FAILED: ' + cleanupErrors.join(' | '));
  return report;
}
