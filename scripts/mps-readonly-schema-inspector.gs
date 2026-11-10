/**
 * MPS v4.8 — strictly read-only schema inspector.
 *
 * Run only from an explicitly selected, authorized Spreadsheet object:
 *   const report = mpsInspectSchemaReadOnly_(spreadsheet);
 * This routine does not open a spreadsheet, create sheets, write cells,
 * change formatting, or read member rows. It reads header rows and row counts only.
 */
const MPS_READONLY_SCHEMA = Object.freeze({
  'Database Member': Object.freeze([
    'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram',
    'Negara','Tujuan Bergabung','Catatan Member','Status Pendaftaran',
    'Nama Sesuai Akun','Login MT5','Jenis Akun','Deposit Pertama (IDR)',
    'Tanggal Deposit','Link Bukti Deposit','Status Verifikasi Deposit',
    'Catatan Admin','Waktu Konfirmasi','Terakhir Diperbarui',
    'Telegram Chat ID','Telegram Link Token','Telegram Linked At','PIN Hash',
    'PIN Updated At','Telegram Link Expires At','Application Ref','VIP Invite Link',
    'VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'
  ]),
  'MPS Applications': Object.freeze([
    'Application Ref','Created At','Nickname','Telegram Username','Country',
    'Goal','Note','Status','Member ID','Deposit Submitted At','Telegram Status',
    'Telegram User ID','Telegram Chat ID','Admin Note','Updated At'
  ]),
  'MPS Deposit Applications': Object.freeze([
    'Application Ref','Submitted At','Account Name','MT5 Login','Account Type',
    'Deposit Amount IDR','Deposit Date','Proof File ID','Proof URL','Status',
    'Telegram User ID','Telegram Chat ID','Admin Note','Updated At'
  ]),
  'MPS Member Telegram Links': Object.freeze([
    'Token Hash','Created At','Expires At','Status','Member ID','Application Ref',
    'Telegram User ID','Chat ID','Username','First Name','Consumed At'
  ])
});

/**
 * Returns metadata-only diagnostics. No member data or cell values outside row 1
 * are read. Missing auxiliary sheets are reported, never initialized.
 */
function mpsInspectSchemaReadOnly_(spreadsheet) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== 'function') {
    throw new Error('Berikan objek Spreadsheet yang dipilih secara eksplisit.');
  }
  const report = {
    mode: 'READ_ONLY',
    checkedAt: new Date().toISOString(),
    spreadsheetId: typeof spreadsheet.getId === 'function' ? spreadsheet.getId() : null,
    sheets: []
  };
  Object.keys(MPS_READONLY_SCHEMA).forEach(function(name) {
    const expected = MPS_READONLY_SCHEMA[name];
    const sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      report.sheets.push({
        name: name, status: 'MISSING', expectedHeaders: expected.length,
        actualHeaders: 0, lastRow: 0, firstMismatchColumn: null
      });
      return;
    }
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    const actual = lastRow > 0 && lastColumn > 0
      ? sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
      : [];
    let mismatch = null;
    const compareCount = Math.max(expected.length, actual.length);
    for (let i = 0; i < compareCount; i++) {
      if (String(actual[i] == null ? '' : actual[i]).trim() !==
          String(expected[i] == null ? '' : expected[i])) {
        mismatch = i + 1;
        break;
      }
    }
    report.sheets.push({
      name: name,
      status: actual.length === 0 ? 'EMPTY' :
        (mismatch === null ? 'MATCH' : 'MISMATCH'),
      expectedHeaders: expected.length,
      actualHeaders: actual.length,
      lastRow: lastRow,
      firstMismatchColumn: mismatch
    });
  });
  report.ok = report.sheets.every(function(item) { return item.status === 'MATCH'; });
  return report;
}
