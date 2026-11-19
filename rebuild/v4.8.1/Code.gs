/**
 * MARKET PSYCHOLOGY SOCIETY — CLEAN REBUILD v4.8.1
 * Google Apps Script backend.
 *
 * SAFETY:
 * - Build/test only in a NEW standalone Apps Script project.
 * - No automatic deployment, webhook registration, trigger creation, or production migration.
 * - The legacy Database Member sheet is never cleared, reordered, or rewritten by provisioning.
 * - Configure Script Properties before use; see README-ISOLATED-RUNBOOK.md.
 */

const MPS = Object.freeze({
  VERSION: '4.8.1-rebuild',
  TZ: 'Asia/Jakarta',
  LEGACY_SHEET: 'Database Member',
  LEGACY_HEADERS: [
    'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara',
    'Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun',
    'Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit',
    'Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin',
    'Waktu Konfirmasi','Terakhir Diperbarui'
  ],
  LEGACY_EXTENDED_HEADERS: [
    'ID Member','Waktu Daftar','Nama Panggilan','Username Telegram','Negara',
    'Tujuan Bergabung','Catatan Member','Status Pendaftaran','Nama Sesuai Akun',
    'Login MT5','Jenis Akun','Deposit Pertama (IDR)','Tanggal Deposit',
    'Link Bukti Deposit','Status Verifikasi Deposit','Catatan Admin',
    'Waktu Konfirmasi','Terakhir Diperbarui','Telegram Chat ID',
    'Telegram Link Token','Telegram Linked At','PIN Hash','PIN Updated At',
    'Telegram Link Expires At','Application Ref','VIP Invite Link',
    'VIP Invite Expires At','VIP Joined At','VIP User ID','VIP Status'
  ],
  SHEETS: {
    applications: {name:'MPS Applications', headers:['Application Ref','Created At','Nickname','Telegram Username','Country','Goal','Note','Status','Member ID','Deposit Submitted At','Telegram Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']},
    deposits: {name:'MPS Deposit Applications', headers:['Application Ref','Submitted At','Account Name','MT5 Login','Account Type','Deposit Amount IDR','Deposit Date','Proof File ID','Proof URL','Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']},
    links: {name:'MPS Member Telegram Links', headers:['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At']},
    sessions: {name:'MPS Sessions', headers:['Session Hash','Role','Actor ID','Created At','Expires At','Last Seen At','Revoked At']},
    audit: {name:'MPS Audit Logs', headers:['Event ID','At','Actor Role','Actor ID','Action','Target Ref','Outcome','Details']},
    ledger: {name:'MPS Request Ledger', headers:['Request ID','Fingerprint','Status','Started At','Completed At','Action','Application Ref','Member ID','Result Status']},
    journal: {name:'MPS Telegram Update Journal', headers:['Update ID','Update Type','Payload SHA-256','State','First Seen At','Last Attempt At','Attempt Count','Lease Expires At','Claim Token','Completed At','Effect Keys JSON','Last Error Code','Payload JSON']},
    queue: {name:'MPS Telegram VIP Follow-up Queue', headers:['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','State','Attempts','Next Attempt At','Lease Until','Last Error Code','Created At','Updated At']},
    vip: {name:'MPS VIP Events', headers:['Event ID','Member ID','Nickname','Event Type','Telegram User ID','Occurred At','Verified','Public Display']},
    announcements: {name:'MPS Announcements', headers:['Announcement ID','Title','Body','Audience','Start At','End At','Active','Created At','Updated At']},
    learning: {name:'MPS Learning Content', headers:['Content ID','Created At','Updated At','Title','Category','Body','Resource URL','Published','Sort Order']},
    news: {name:'MPS News Content', headers:['Content ID','Created At','Updated At','Title','Topic','Body','Source Name','Source URL','Published At','Published']},
    membershipPlans: {name:'MPS Membership Plans', headers:['Application Ref','Plan','Created At','Monthly Fee IDR','IB Verification Status','Verified By','Verified At','Status']},
    regularPayments: {name:'MPS Regular Payments', headers:['Application Ref','Submitted At','Amount IDR','Payment Date','Proof File ID','Status','Admin Note','Reviewed At']},
    membershipLedger: {name:'MPS Membership Ledger', headers:['Member ID','Application Ref','Plan','Status','Started At','Expires At','Last Verified At','Verification Note']}
  }
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.health === '1') return json_({ok:true,service:'MPS Member Backend',version:MPS.VERSION,mode:'rebuild'});
  const page = String(p.page || 'home').toLowerCase();
  const allowed = ['home','register','deposit','member','dashboard','learning','pulse','calculator','vip','news','advertise','admin'];
  const t = HtmlService.createTemplateFromFile('Index');
  t.initialPage = allowed.includes(page) ? page : 'home';
  t.mpsVersion = MPS.VERSION;
  return t.evaluate().setTitle('Market Psychology Society')
    .addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
}

function doPost(e) {
  const path = String(e && e.pathInfo || '').replace(/^\/+|\/+$/g,'');
  const secret = prop_('MPS_TELEGRAM_WEBHOOK_SECRET');
  if (!secret || !constantTimeEquals_(path,secret)) return text_('Not Found');
  let update;
  try { update = JSON.parse(e && e.postData && e.postData.contents || '{}'); }
  catch (_) { return text_('Bad Request'); }
  try { processTelegramUpdate_(update); return text_('OK'); }
  catch (err) { console.error('TELEGRAM_UPDATE_FAILED '+String(err && err.message || err)); return text_('OK'); }
}
function validateMpsRebuildConfig() {
  const p = PropertiesService.getScriptProperties();
  const result = {
    ownerEmailConfigured: !!p.getProperty('MPS_REBUILD_OWNER_EMAIL'),
    spreadsheetConfigured: !!p.getProperty('MPS_SPREADSHEET_ID'),
    proofFolderConfigured: !!p.getProperty('MPS_PROOF_FOLDER_ID'),
    adminCredentialConfigured: !!p.getProperty('MPS_REBUILD_ADMIN_PASSWORD_HASH'),
    telegramBotConfigured: !!p.getProperty('MPS_TELEGRAM_BOT_TOKEN'),
    telegramChatConfigured: !!p.getProperty('MPS_TELEGRAM_CHAT_ID'),
    webhookSecretConfigured: !!p.getProperty('MPS_TELEGRAM_WEBHOOK_SECRET'),
    vipGroupConfigured: !!p.getProperty('MPS_VIP_GROUP_ID'),
    backupFolderConfigured: !!p.getProperty('MPS_BACKUP_FOLDER_ID'),
    telegramBotUsernameConfigured: !!p.getProperty('MPS_TELEGRAM_BOT_USERNAME'),
    spreadsheetReadable: false,
    legacySheetPresent: false,
    legacySchema: 'NOT_CHECKED',
    auxiliarySheetsPresent: 0,
    auxiliarySheetsExpected: Object.keys(MPS.SHEETS).length,
    proofFolderReadable: false,
    errors: [],
    note: 'Read-only validation. No sheets, rows, properties, triggers, or webhooks changed.'
  };
  try {
    const id = p.getProperty('MPS_SPREADSHEET_ID');
    if (!id) throw new Error('MPS_SPREADSHEET_ID belum diatur.');
    const ss = SpreadsheetApp.openById(id);
    result.spreadsheetReadable = true;
    const sh = ss.getSheetByName(MPS.LEGACY_SHEET);
    result.legacySheetPresent = !!sh;
    if (sh) {
      const width = sh.getLastColumn();
      const headers = sh.getRange(1,1,1,Math.max(width,MPS.LEGACY_HEADERS.length)).getDisplayValues()[0];
      if (JSON.stringify(headers.slice(0,MPS.LEGACY_HEADERS.length)) !== JSON.stringify(MPS.LEGACY_HEADERS)) {
        result.legacySchema = 'MISMATCH';
      } else if (width === MPS.LEGACY_HEADERS.length) {
        result.legacySchema = 'legacy-18';
      } else if (width === MPS.LEGACY_EXTENDED_HEADERS.length &&
          JSON.stringify(headers.slice(0,MPS.LEGACY_EXTENDED_HEADERS.length)) === JSON.stringify(MPS.LEGACY_EXTENDED_HEADERS)) {
        result.legacySchema = 'v4.8-30';
      } else {
        result.legacySchema = 'MISMATCH';
      }
    } else {
      result.legacySchema = 'MISSING';
    }
    result.auxiliarySheetsPresent = Object.keys(MPS.SHEETS).filter(k => !!ss.getSheetByName(MPS.SHEETS[k].name)).length;
  } catch (e) {
    result.errors.push('Spreadsheet: ' + String(e && e.message || e));
  }
  try {
    const folderId = p.getProperty('MPS_PROOF_FOLDER_ID');
    if (!folderId) throw new Error('MPS_PROOF_FOLDER_ID belum diatur.');
    DriveApp.getFolderById(folderId).getName();
    result.proofFolderReadable = true;
  } catch (e) {
    result.errors.push('Proof folder: ' + String(e && e.message || e));
  }
  const output = JSON.stringify(result);
  Logger.log('MPS_REBUILD_VALIDATION ' + output);
  console.log('MPS_REBUILD_VALIDATION ' + output);
  return result;
}

/**
 * Explicit isolated-project provisioning.
 * Requires MPS_REBUILD_ALLOW_PROVISION=true and an explicitly configured spreadsheet ID.
 * Existing legacy member data is not edited. Exact schema mismatch stops provisioning.
 */
function provisionMpsRebuildStorage() {
  requireOwnerContext_();
  if (prop_('MPS_REBUILD_ALLOW_PROVISION') !== 'true')
    throw new Error('Provisioning terkunci. Aktifkan hanya pada spreadsheet sintetis di project test baru.');
  const ss = openDb_();
  const legacy = ss.getSheetByName(MPS.LEGACY_SHEET);
  if (!legacy) {
    const sh = ss.insertSheet(MPS.LEGACY_SHEET);
    sh.getRange(1,1,1,MPS.LEGACY_HEADERS.length).setValues([MPS.LEGACY_HEADERS]);
    sh.setFrozenRows(1);
  } else {
    const width=legacy.getLastColumn();
    const actual=legacy.getRange(1,1,1,Math.max(width,MPS.LEGACY_HEADERS.length)).getDisplayValues()[0];
    const first18=actual.slice(0,MPS.LEGACY_HEADERS.length);
    if (JSON.stringify(first18)!==JSON.stringify(MPS.LEGACY_HEADERS))
      throw new Error('18 header inti Database Member tidak cocok. Tidak ada perubahan dilakukan.');
    if (width>MPS.LEGACY_HEADERS.length) {
      const exact30=width===MPS.LEGACY_EXTENDED_HEADERS.length &&
        JSON.stringify(actual.slice(0,MPS.LEGACY_EXTENDED_HEADERS.length))===JSON.stringify(MPS.LEGACY_EXTENDED_HEADERS);
      if (!exact30) throw new Error('Skema tambahan bukan 30 kolom v4.8 yang dikenali. Tidak ada kolom/data yang diubah.');
    }
  }
  Object.keys(MPS.SHEETS).forEach(k => ensureSheet_(ss,MPS.SHEETS[k]));
  const result = {ok:true,version:MPS.VERSION,legacyHeaders:legacy.getLastColumn(),acceptedSchema:legacy.getLastColumn()===30?'v4.8-30':'legacy-18',auxiliarySheets:Object.keys(MPS.SHEETS).length};
  Logger.log('MPS_REBUILD_PROVISION ' + JSON.stringify(result));
  console.log('MPS_REBUILD_PROVISION ' + JSON.stringify(result));
  return result;
}

/** Public API: initial application only creates Application Ref, never Member ID. */
function apiRegister(input) {
  input = input || {};
  const nickname = clean_(input.nickname,60);
  const username = String(input.telegramUsername || '').trim().replace(/^@/,'').toLowerCase();
  const country = clean_(input.country,60);
  const goal = clean_(input.goal,160);
  const note = clean_(input.note,1000);
  const plan = String(input.plan || '').trim().toUpperCase();
  if (!['REGULAR','ACTIVE_IB'].includes(plan)) throw new Error('Pilih jenis keanggotaan MPS.');
  if (!nickname || !country || !goal) throw new Error('Lengkapi nama panggilan, negara, dan tujuan.');
  if (!/^[a-z][a-z0-9_]{4,31}$/.test(username)) throw new Error('Username Telegram harus 5–32 karakter, diawali huruf, dan hanya berisi huruf, angka, atau underscore.');
  if (!['Belajar money management','Membangun psikologi trading','Melatih disiplin trading','Belajar dan berdiskusi bersama'].includes(goal)) throw new Error('Tujuan bergabung tidak valid.');
  enforceRateLimit_('register', username, 3, 3600);
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = sheet_('applications');
    const duplicate=rows_(sh).some(r=>String(r[3]||'').toLowerCase()===username && !['Ditolak'].includes(String(r[7]||'')));
    if(duplicate) throw new Error('Username Telegram ini sudah memiliki pengajuan aktif atau keanggotaan MPS. Gunakan Application Ref yang sudah ada atau hubungi Admin.');
    const ref = 'MPS-APP-' + randomHex_(20);
    const now = new Date();
    sh.appendRow([ref,now,nickname,username,country,goal,note,'Menunggu Pendaftaran','','','Belum Terhubung','','','',''+now]);
    sheet_('membershipPlans').appendRow([ref,plan,now,plan==='REGULAR'?100000:0,plan==='ACTIVE_IB'?'Menunggu Verifikasi Manual':'TIDAK BERLAKU','','','Menunggu Pembayaran / Verifikasi']);
    audit_('PUBLIC','', 'APPLICATION_CREATED',ref,'SUCCESS','Plan='+plan+'; initial application only; no member ID issued.');
    return {ok:true,applicationRef:ref,status:'Menunggu Pendaftaran'};
  } finally { lock.releaseLock(); }
}

/** Public API: save proof privately; application ref is required. */
function apiSubmitDeposit(input) {
  input = input || {};
  const ref = clean_(input.applicationRef,40).toUpperCase();
  if (!/^MPS-APP-[A-F0-9]{20}$/.test(ref)) throw new Error('Application Ref tidak valid.');
  enforceRateLimit_('deposit', ref, 3, 3600);
  const account = clean_(input.accountName,100);
  const login = clean_(input.mt5Login,40);
  const type = clean_(input.accountType,40);
  const amount = Number(input.amount);
  const date = clean_(input.depositDate,20);
  if (!account || !login || !type || !Number.isFinite(amount) || amount < 500000 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error('Data deposit belum lengkap, tanggal tidak valid, atau nominal di bawah Rp500.000.');
  const depositDate = new Date(date+'T00:00:00+07:00');
  if (isNaN(depositDate.getTime()) || Utilities.formatDate(depositDate,MPS.TZ,'yyyy-MM-dd') !== date || depositDate.getTime() > Date.now()+24*60*60*1000)
    throw new Error('Tanggal deposit tidak valid atau berada di masa depan.');
  const mime = String(input.proofMime || '');
  if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('Bukti harus JPG, PNG, atau WEBP.');
  const raw = String(input.proofBase64 || '').replace(/^data:[^,]+,/,'');
  if (!raw || raw.length > 7 * 1024 * 1024) throw new Error('Ukuran bukti maksimal 5 MB.');
  const bytes = Utilities.base64Decode(raw);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran bukti maksimal 5 MB.');
  if (!isAllowedImageBytes_(bytes,mime)) throw new Error('Isi file tidak sesuai dengan format gambar yang dipilih.');
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const apps = sheet_('applications'), row = findRow_(apps,1,ref);
    if (!row) throw new Error('Application Ref tidak ditemukan.');
    const state = String(apps.getRange(row,8).getDisplayValue());
    if (!['Menunggu Pendaftaran','Menunggu Deposit'].includes(state))
      throw new Error('Pengajuan tidak berada pada tahap pengiriman deposit.');
    if (findRow_(sheet_('deposits'),1,ref))
      throw new Error('Bukti deposit untuk pengajuan ini sudah diterima. Hubungi admin jika perlu koreksi.');
    const folderId = prop_('MPS_PROOF_FOLDER_ID');
    if (!folderId) throw new Error('Folder bukti belum dikonfigurasi.');
    const folder = DriveApp.getFolderById(folderId);
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE)
      throw new Error('Folder bukti deposit harus privat. Periksa akses berbagi folder Drive.');
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const file = folder.createFile(Utilities.newBlob(bytes,mime,'MPS-PROOF-'+ref+'.'+ext));
    file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
    const now = new Date();
    sheet_('deposits').appendRow([ref,now,account,login,type,amount,date,file.getId(),'','Menunggu Validasi','','','','']);
    let linkInfo = {url:'',expiresAt:''};
    try { linkInfo = createTelegramLink_(ref,apps.getRange(row,4).getDisplayValue()); }
    catch (linkError) { audit_('SYSTEM','', 'TELEGRAM_LINK_CREATE_FAILED',ref,'WARNING',''); }
    apps.getRange(row,8).setValue('Deposit Dikirim');
    apps.getRange(row,10).setValue(now);
    apps.getRange(row,11).setValue('Menunggu Verifikasi Telegram');
    apps.getRange(row,15).setValue(now);
    audit_('PUBLIC','', 'DEPOSIT_SUBMITTED',ref,'SUCCESS','Proof saved privately; one-time Telegram link issued.');
    let adminBackupSent = false;
    const adminChat = prop_('MPS_TELEGRAM_CHAT_ID');
    if (adminChat) {
      const backupText = [
        'MPS — DATA PENDAFTARAN & DEPOSIT BARU',
        'Application Ref: '+ref,
        'Nama: '+clean_(apps.getRange(row,3).getDisplayValue(),60),
        'Telegram: @'+cleanUsername_(apps.getRange(row,4).getDisplayValue()),
        'Negara: '+clean_(apps.getRange(row,5).getDisplayValue(),60),
        'Tujuan: '+clean_(apps.getRange(row,6).getDisplayValue(),160),
        'Nama akun: '+account,
        'Login MT5: '+login,
        'Jenis akun: '+type,
        'Deposit: Rp'+amount.toLocaleString('id-ID'),
        'Tanggal deposit: '+date,
        'Status: Menunggu Validasi Admin'
      ].join('\n');
      try { adminBackupSent = sendTelegramMessage_(adminChat,backupText); }
      catch (notifyError) { audit_('SYSTEM','', 'DEPOSIT_BACKUP_FAILED',ref,'WARNING','Telegram backup delivery failed.'); }
    }
    return {ok:true,applicationRef:ref,status:'Menunggu Validasi Admin',telegramLink:linkInfo.url,telegramLinkExpiresAt:linkInfo.expiresAt,telegramLinkAvailable:!!linkInfo.url,adminBackupSent:adminBackupSent};
  } finally { lock.releaseLock(); }
}

/** Admin login uses a salted SHA-256 hash in Script Properties; plaintext password is never stored. */
function apiAdminLogin(password, totpCode) {
  const expected = prop_('MPS_REBUILD_ADMIN_PASSWORD_HASH');
  const salt = prop_('MPS_REBUILD_ADMIN_PASSWORD_SALT');
  if (!expected || !salt) throw new Error('Kredensial admin belum disiapkan di project test.');
  enforceRateLimit_('admin-login', 'global', 8, 900);
  const actual = sha256_(salt + String(password || ''));
  if (!constantTimeEquals_(actual,expected)) {
    audit_('UNKNOWN','', 'ADMIN_LOGIN','', 'DENIED','Invalid password.');
    throw new Error('Password admin tidak valid.');
  }
  if (!verifyMpsTotp_('MPS_REBUILD_ADMIN_TOTP_SECRET',totpCode)) {
    audit_('UNKNOWN','', 'ADMIN_LOGIN','', 'DENIED','Invalid or replayed TOTP.');
    throw new Error('Kode Google Authenticator Admin tidak valid atau sudah digunakan.');
  }
  return createSession_('ADMIN','admin');
}

function apiSuperAdminLogin(password, totpCode) {
  const expected = prop_('MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH');
  const salt = prop_('MPS_REBUILD_SUPER_ADMIN_PASSWORD_SALT');
  if (!expected || !salt) throw new Error('Kredensial Super Admin belum disiapkan.');
  enforceRateLimit_('super-login', 'global', 5, 900);
  if (!constantTimeEquals_(sha256_(salt + String(password || '')),expected)) {
    audit_('UNKNOWN','', 'SUPER_ADMIN_LOGIN','', 'DENIED','Invalid password.');
    throw new Error('Password Super Admin tidak valid.');
  }
  if (!verifyMpsTotp_('MPS_REBUILD_SUPER_ADMIN_TOTP_SECRET',totpCode)) {
    audit_('UNKNOWN','', 'SUPER_ADMIN_LOGIN','', 'DENIED','Invalid or replayed TOTP.');
    throw new Error('Kode Google Authenticator Super Admin tidak valid atau sudah digunakan.');
  }
  return createSession_('SUPER_ADMIN','super-admin');
}


/**
 * Run manually from the Apps Script editor by the project owner in the isolated project.
 * Creates Google Authenticator secrets once and returns provisioning URIs to the editor.
 * Never expose this function through a public web endpoint or share its return value.
 */
function initializeMpsTotpSecrets() {
  requireOwnerContext_();
  const props = PropertiesService.getScriptProperties();
  const adminKey = 'MPS_REBUILD_ADMIN_TOTP_SECRET';
  const superKey = 'MPS_REBUILD_SUPER_ADMIN_TOTP_SECRET';
  if (props.getProperty(adminKey) || props.getProperty(superKey))
    throw new Error('TOTP sudah pernah diinisialisasi. Tidak ada secret yang dirotasi.');
  const adminSecret = base32Encode_(Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''));
  const superSecret = base32Encode_(Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,''));
  props.setProperties({[adminKey]:adminSecret,[superKey]:superSecret},false);
  return {
    adminOtpAuthUri: 'otpauth://totp/MPS%20Admin?secret='+adminSecret+'&issuer=MPS&algorithm=SHA1&digits=6&period=30',
    superAdminOtpAuthUri: 'otpauth://totp/MPS%20Super%20Admin?secret='+superSecret+'&issuer=MPS&algorithm=SHA1&digits=6&period=30',
    warning: 'Tambahkan kedua akun di Google Authenticator. Simpan backup secara offline. URI ini hanya ditampilkan sekali oleh fungsi inisialisasi.'
  };
}

function verifyMpsTotp_(propertyKey, code) {
  const secret = prop_(propertyKey);
  const value = String(code || '').replace(/\s/g,'');
  if (!secret || !/^\d{6}$/.test(value)) return false;
  const roleKey = propertyKey === 'MPS_REBUILD_SUPER_ADMIN_TOTP_SECRET' ? 'SUPER_ADMIN' : 'ADMIN';
  const lastStepKey = 'MPS_REBUILD_' + roleKey + '_TOTP_LAST_STEP';
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const now = Math.floor(Date.now()/1000/30);
    const lastAccepted = Number(prop_(lastStepKey) || -1);
    for (let drift=-1;drift<=1;drift++) {
      const step = now + drift;
      if (step <= lastAccepted) continue;
      if (constantTimeEquals_(totpCode_(secret,step),value)) {
        PropertiesService.getScriptProperties().setProperty(lastStepKey,String(step));
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

function totpCode_(base32Secret, counter) {
  const key = base32Decode_(base32Secret);
  const msg = [];
  let n = counter;
  for (let i=7;i>=0;i--) { msg[i]=n & 255; n=Math.floor(n/256); }
  const hmac = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1,msg,key);
  const offset = hmac[hmac.length-1] & 15;
  const binary = ((hmac[offset]&127)<<24) | ((hmac[offset+1]&255)<<16) | ((hmac[offset+2]&255)<<8) | (hmac[offset+3]&255);
  return ('000000'+String(binary%1000000)).slice(-6);
}

/** Manual deterministic checks for pure crypto helpers; safe to run in the isolated Apps Script project. */
function runMpsCryptoSelfTests() {
  const checks = [];
  checks.push({name:'SHA-256 known vector',ok:sha256_('abc')==='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'});
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const vectors = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
    [20000000000, '353130']
  ];
  vectors.forEach(v=>checks.push({name:'RFC 6238 SHA-1 vector '+v[0],ok:totpCode_(secret,Math.floor(v[0]/30))===v[1]}));
  checks.push({name:'Base32 decode byte count',ok:base32Decode_(secret).length===20});
  return {ok:checks.every(x=>x.ok),checks:checks};
}

function base32Encode_(input) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='',out='';
  for (let i=0;i<input.length;i++) bits+=('00000000'+input.charCodeAt(i).toString(2)).slice(-8);
  for (let i=0;i<bits.length;i+=5) out+=alphabet[parseInt((bits.slice(i,i+5)+'0000').slice(0,5),2)];
  return out;
}
function base32Decode_(input) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='',out=[];
  String(input).replace(/=+$/,'').split('').forEach(ch=>{
    const n=alphabet.indexOf(ch);
    if(n<0) throw new Error('TOTP secret format invalid.');
    bits+=('00000'+n.toString(2)).slice(-5);
  });
  for(let i=0;i+8<=bits.length;i+=8) out.push(parseInt(bits.slice(i,i+8),2));
  return out;
}

function apiAdminList(session) {
  requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const apps = sheet_('applications'), deps = sheet_('deposits'), plans = rows_(sheet_('membershipPlans'));
  const a = rows_(apps), d = rows_(deps);
  return a.map(r => {
    const dep = d.find(x => x[0] === r[0]) || [];
    const plan = plans.find(x => x[0] === r[0]) || [];
    return {applicationRef:r[0],createdAt:r[1],nickname:r[2],telegramUsername:r[3],country:r[4],goal:r[5],status:r[7],telegramStatus:r[10]||'Belum Terhubung',memberId:r[8]||'',plan:plan[1]||'BELUM DIPILIH',monthlyFee:plan[3]||0,ibVerificationStatus:plan[4]||'',accountName:dep[2]||'',mt5Login:dep[3]||'',accountType:dep[4]||'',amount:dep[5]||'',depositDate:dep[6]||'',proofFileId:dep[7]||'',depositStatus:dep[9]||'',adminNote:r[13]||''};
  }).reverse();
}

/** Approval creates the member ID only after explicit admin approval. */
function apiAdminReview(session, applicationRef, decision, note) {
  const actor = requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const ref = clean_(applicationRef,40).toUpperCase();
  if (!['APPROVE','REJECT'].includes(decision)) throw new Error('Keputusan tidak valid.');
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const apps = sheet_('applications'), ar = findRow_(apps,1,ref);
    if (!ar) throw new Error('Application Ref tidak ditemukan.');
    const app = apps.getRange(ar,1,15).getValues()[0];
    const deps = sheet_('deposits'), dr = findRow_(deps,1,ref);
    if (!dr) throw new Error('Data deposit belum tersedia.');
    if (app[7] === 'Disetujui' || app[7] === 'Ditolak') throw new Error('Pengajuan sudah diputuskan.');
    const dep = deps.getRange(dr,1,14).getValues()[0];
    const now = new Date(), adminNote = clean_(note,500);
    if (decision === 'APPROVE' && apps.getRange(ar,11).getDisplayValue() !== 'Terhubung')
      throw new Error('Verifikasi Telegram harus berhasil sebelum pengajuan dapat disetujui.');
    if (decision === 'APPROVE' && (Number(dep[5]) < 500000 || !dep[7] || dep[9] !== 'Menunggu Validasi'))
      throw new Error('Deposit belum memenuhi nominal minimum, bukti tidak tersedia, atau status deposit tidak valid.');
    if (decision === 'APPROVE') {
      if (!app[11] || !app[12] || String(dep[10]||'')!==String(app[11]) || String(dep[11]||'')!==String(app[12]))
        throw new Error('Ikatan Telegram pada aplikasi dan data deposit tidak cocok. Pengajuan tidak dapat disetujui.');
      const proof=DriveApp.getFileById(String(dep[7]));
      if (proof.isTrashed() || proof.getSharingAccess()!==DriveApp.Access.PRIVATE)
        throw new Error('File bukti deposit tidak tersedia atau tidak privat.');
      const proofFolder=prop_('MPS_PROOF_FOLDER_ID');
      if (!proofFolder || !proof.getParents().hasNext())
        throw new Error('Lokasi file bukti deposit tidak dapat diverifikasi.');
      const parents=proof.getParents(); let inExpectedFolder=false;
      while(parents.hasNext()) if(parents.next().getId()===proofFolder) inExpectedFolder=true;
      if(!inExpectedFolder) throw new Error('Bukti deposit tidak berada di folder bukti resmi MPS.');
    }
    if (decision === 'REJECT') {
      apps.getRange(ar,8).setValue('Ditolak'); apps.getRange(ar,14).setValue(adminNote);
      deps.getRange(dr,10).setValue('Ditolak'); deps.getRange(dr,13).setValue(adminNote);
      audit_(actor.role,actor.actorId,'APPLICATION_REJECTED',ref,'SUCCESS','');
      return {ok:true,status:'Ditolak'};
    }
    const memberId = 'MPS-' + randomHex_(10);
    const memberSheet = legacySheet_();
    const row = [memberId,app[1],app[2],app[3],app[4],app[5],app[6],'Berhasil',dep[2],dep[3],dep[4],dep[5],dep[6],'', 'Disetujui',adminNote,now,now];
    memberSheet.appendRow(row);
    apps.getRange(ar,8).setValue('Disetujui'); apps.getRange(ar,9).setValue(memberId); apps.getRange(ar,14).setValue(adminNote); apps.getRange(ar,15).setValue(now);
    deps.getRange(dr,10).setValue('Disetujui'); deps.getRange(dr,13).setValue(adminNote); deps.getRange(dr,14).setValue(now);
    enqueueVipInvite_(memberId,ref,String(apps.getRange(ar,12).getDisplayValue()||''),String(apps.getRange(ar,13).getDisplayValue()||''));
    audit_(actor.role,actor.actorId,'APPLICATION_APPROVED',ref,'SUCCESS','Member ID issued after approval; VIP invite queued.');
    return {ok:true,status:'Disetujui',memberId:memberId,pinSetupRequired:true,vipInviteQueued:true};
  } finally { lock.releaseLock(); }
}


/**
 * Admin-only one-time PIN enrollment/rotation.
 * PIN is returned only in this authenticated admin response and is never stored in plaintext.
 * Admin must deliver it through a separately verified private channel; Telegram delivery is not yet integrated.
 */
/** Admin can reissue an expired/missing Telegram link without resubmitting deposit proof. */
function apiAdminReissueTelegramLink(session, applicationRef) {
  const actor = requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const ref = clean_(applicationRef,40).toUpperCase();
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const apps = sheet_('applications'), row = findRow_(apps,1,ref);
    if (!row) throw new Error('Application Ref tidak ditemukan.');
    const status = apps.getRange(row,8).getDisplayValue();
    if (['Disetujui','Ditolak'].includes(status)) throw new Error('Pengajuan yang sudah diputuskan tidak dapat menerima link baru.');
    if (!findRow_(sheet_('deposits'),1,ref)) throw new Error('Deposit belum dikirim.');
    const link = createTelegramLink_(ref,apps.getRange(row,4).getDisplayValue());
    if (!link.url) throw new Error('MPS_TELEGRAM_BOT_USERNAME belum dikonfigurasi dengan benar.');
    apps.getRange(row,11).setValue('Menunggu Verifikasi Telegram');
    apps.getRange(row,15).setValue(new Date());
    audit_(actor.role,actor.actorId,'TELEGRAM_LINK_REISSUED',ref,'SUCCESS','Previous pending links expired.');
    return {ok:true,telegramLink:link.url,expiresAt:link.expiresAt};
  } finally { lock.releaseLock(); }
}

function apiAdminIssuePin(session, memberId) {
  const actor = requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const id = clean_(memberId,20).toUpperCase();
  if (!/^MPS-[A-F0-9]{10}$/.test(id)) throw new Error('ID Member tidak valid.');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = legacySheet_(), row = findRow_(sh,1,id);
    if (!row || sh.getRange(row,8).getDisplayValue() !== 'Berhasil')
      throw new Error('PIN hanya dapat dibuat untuk member yang sudah aktif.');
    const pin = randomPin_(), salt = randomHex_(32), props = PropertiesService.getScriptProperties();
    props.setProperty('MPS_PIN_SALT_'+id,salt);
    props.setProperty('MPS_PIN_HASH_'+id,sha256_(salt+pin));
    const apps=sheet_('applications'), appRow=findRow_(apps,9,id);
    const chatId=appRow?String(apps.getRange(appRow,13).getDisplayValue()||''):'';
    if(appRow && chatId && apps.getRange(appRow,11).getDisplayValue()==='Terhubung') {
      try {
        sendTelegramMessage_(chatId,'PIN akses MPS Anda: '+pin+'\\nJangan bagikan PIN ini kepada siapa pun. MPS tidak akan meminta PIN atau OTP Anda.');
        audit_(actor.role,actor.actorId,'MEMBER_PIN_ISSUED',id,'SUCCESS','PIN delivered to verified Telegram chat.');
        return {ok:true,memberId:id,pinDelivered:true,delivery:'Telegram terverifikasi'};
      } catch(sendError) {
        audit_(actor.role,actor.actorId,'MEMBER_PIN_DELIVERY_FAILED',id,'WARNING','Admin fallback required.');
      }
    }
    audit_(actor.role,actor.actorId,'MEMBER_PIN_ISSUED',id,'SUCCESS','One-time PIN shown to authenticated admin for private manual delivery.');
    return {ok:true,memberId:id,pin:pin,pinDelivered:false,delivery:'Kirim secara pribadi setelah verifikasi identitas.'};
  } finally { lock.releaseLock(); }
}
function randomPin_() {
  const raw = Utilities.getUuid().replace(/-/g,'').toUpperCase();
  let out = '';
  for (let i=0;i<6;i++) out += String(parseInt(raw.charAt(i),16)%10);
  return out;
}

function apiMemberLogin(memberId,pin) {
  const id = clean_(memberId,20).toUpperCase(), p = String(pin || '');
  enforceRateLimit_('member-login', id || 'invalid', 8, 900);
  if (!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(id) || !/^\d{6}$/.test(p))
    throw new Error('ID Member atau PIN tidak valid.');
  const sh = legacySheet_(), row = findRow_(sh,1,id);
  if (!row || sh.getRange(row,8).getDisplayValue() !== 'Berhasil') throw new Error('Akses member belum aktif.');
  const pinHash = prop_('MPS_PIN_HASH_'+id);
  const salt = prop_('MPS_PIN_SALT_'+id);
  if (!pinHash || !salt || !constantTimeEquals_(sha256_(salt+p),pinHash)) throw new Error('PIN tidak valid.');
  return createSession_('MEMBER',id);
}

function apiGetAnnouncements(session) {
  let audience='PUBLIC';
  if (session) {
    const actor=requireSession_(session,['MEMBER','ADMIN','SUPER_ADMIN']);
    audience=actor.role==='MEMBER'?'MEMBER':'ADMIN';
  }
  const now=Date.now();
  return rows_(sheet_('announcements')).filter(r=>{
    const active=String(r[6]).toLowerCase()==='true' || r[6]===true;
    const start=new Date(r[4]).getTime(), end=new Date(r[5]).getTime();
    const visible=active && start<=now && end>=now;
    const allowed=audience==='ADMIN' || r[3]==='PUBLIC' || (audience==='MEMBER' && r[3]==='MEMBER');
    return visible && allowed;
  }).sort((a,b)=>new Date(b[4]).getTime()-new Date(a[4]).getTime()).map(r=>({
    id:String(r[0]),title:clean_(r[1],120),body:clean_(r[2],1200),audience:String(r[3]),
    startAt:new Date(r[4]).toISOString(),endAt:new Date(r[5]).toISOString(),active:true
  }));
}

function apiAdminListContent(session,section) {
  requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const key=String(section||'').toLowerCase();
  if (!['learning','news'].includes(key)) throw new Error('Bagian konten tidak valid.');
  return rows_(sheet_(key)).map(r=>key==='learning'?{
    id:String(r[0]),title:String(r[3]),category:String(r[4]),body:String(r[5]),resourceUrl:String(r[6]||''),published:r[7]===true||String(r[7]).toLowerCase()==='true',sortOrder:Number(r[8]||0)
  }:{
    id:String(r[0]),title:String(r[3]),topic:String(r[4]),body:String(r[5]),sourceName:String(r[6]||''),sourceUrl:String(r[7]||''),publishedAt:r[8] instanceof Date?r[8].toISOString():String(r[8]||''),published:r[9]===true||String(r[9]).toLowerCase()==='true'
  }).reverse();
}

function apiAdminSaveContent(session,section,input) {
  const actor=requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const key=String(section||'').toLowerCase(), data=input||{};
  if (!['learning','news'].includes(key)) throw new Error('Bagian konten tidak valid.');
  const id=clean_(data.id,40), title=clean_(data.title,160), body=clean_(data.body,6000);
  const published=data.published===true || String(data.published).toLowerCase()==='true';
  if (!title || !body) throw new Error('Judul dan isi konten wajib diisi.');
  const sh=sheet_(key), now=new Date(), target=id||('MPS-'+(key==='learning'?'LEARN':'NEWS')+'-'+randomHex_(12));
  const row=findRow_(sh,1,target);
  if (key==='learning') {
    const category=clean_(data.category,80), resource=clean_(data.resourceUrl,500);
    if (resource && !/^https:\/\//i.test(resource)) throw new Error('Tautan materi harus menggunakan HTTPS.');
    const created=row?sh.getRange(row,2).getValue():now;
    const values=[target,created,now,title,category,body,resource,published,Number(data.sortOrder||0)];
    if(row)sh.getRange(row,1,1,9).setValues([values]);else sh.appendRow(values);
  } else {
    const topic=clean_(data.topic,80), sourceName=clean_(data.sourceName,120), sourceUrl=clean_(data.sourceUrl,500);
    const publishedAt=new Date(String(data.publishedAt||now.toISOString()));
    if (sourceUrl && !/^https:\/\//i.test(sourceUrl)) throw new Error('URL sumber berita harus menggunakan HTTPS.');
    if (published && (!sourceName || !sourceUrl)) throw new Error('Berita yang diterbitkan wajib mencantumkan nama dan URL sumber yang dapat diverifikasi.');
    if (isNaN(publishedAt.getTime())) throw new Error('Tanggal publikasi berita tidak valid.');
    const created=row?sh.getRange(row,2).getValue():now;
    const values=[target,created,now,title,topic,body,sourceName,sourceUrl,publishedAt,published];
    if(row)sh.getRange(row,1,1,10).setValues([values]);else sh.appendRow(values);
  }
  audit_(actor.role,actor.actorId,'CONTENT_SAVED',target,'SUCCESS',key+'; published='+published);
  return {ok:true,id:target,published:published};
}

function fetchBinancePaxgM5_() {
  const cache=CacheService.getScriptCache(), cached=cache.get('MPS_PAXG_M5_CACHE');
  if(cached) return JSON.parse(cached);
  const url='https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=5m&limit=100';
  const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true});
  if(response.getResponseCode()<200 || response.getResponseCode()>=300) throw new Error('BINANCE_HTTP_ERROR');
  const raw=JSON.parse(response.getContentText()||'[]');
  if(!Array.isArray(raw) || !raw.length) throw new Error('BINANCE_EMPTY_RESPONSE');
  const data=raw.map(k=>({time:new Date(Number(k[0])).toISOString(),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])}));
  cache.put('MPS_PAXG_M5_CACHE',JSON.stringify(data),60);
  return data;
}

function apiAdminListAnnouncements(session) {
  requireSession_(session,['ADMIN','SUPER_ADMIN']);
  return rows_(sheet_('announcements')).map(r=>({
    id:String(r[0]),title:String(r[1]),body:String(r[2]),audience:String(r[3]),
    startAt:new Date(r[4]).toISOString(),endAt:new Date(r[5]).toISOString(),
    active:String(r[6]).toLowerCase()==='true' || r[6]===true
  })).reverse();
}

function apiAdminSaveAnnouncement(session,input) {
  const actor=requireSession_(session,['ADMIN','SUPER_ADMIN']);
  input=input||{};
  const id=clean_(input.id,40);
  const title=clean_(input.title,120), body=clean_(input.body,1200);
  const audience=String(input.audience||'PUBLIC').toUpperCase();
  const start=new Date(String(input.startAt||'')), end=new Date(String(input.endAt||''));
  const active=input.active===true || String(input.active).toLowerCase()==='true';
  if (!title || !body || !['PUBLIC','MEMBER'].includes(audience) || isNaN(start.getTime()) || isNaN(end.getTime()) || end<=start)
    throw new Error('Judul, isi, audiens, dan rentang jadwal pengumuman harus valid.');
  const sh=sheet_('announcements'), now=new Date(), target=id||('MPS-ANN-'+randomHex_(12));
  const row=findRow_(sh,1,target);
  const values=[target,title,body,audience,start,end,active,now,now];
  if (row) {
    const created=sh.getRange(row,8).getValue()||now; values[7]=created;
    sh.getRange(row,1,1,9).setValues([values]);
  } else sh.appendRow(values);
  audit_(actor.role,actor.actorId,'ANNOUNCEMENT_SAVED',target,'SUCCESS',audience+'; active='+active);
  return {ok:true,id:target,active:active};
}

function apiGetMemberContent(session, section) {
  const actor = requireSession_(session,['MEMBER','ADMIN','SUPER_ADMIN']);
  const key = clean_(section,30).toLowerCase();
  if (!['learning','pulse','news','dashboard'].includes(key)) throw new Error('Menu tidak tersedia.');
  if (actor.role === 'MEMBER') {
    const sh = legacySheet_(), row = findRow_(sh,1,actor.actorId);
    if (!row || sh.getRange(row,8).getDisplayValue() !== 'Berhasil') throw new Error('Akses member tidak aktif.');
  }
  if (key === 'pulse') {
    const raw = prop_('MPS_MARKET_PULSE_JSON');
    let data = null;
    if (raw) { try { data=JSON.parse(raw); } catch (_) { throw new Error('Konfigurasi Market Pulse JSON tidak valid.'); } }
    else { try { data=fetchBinancePaxgM5_(); } catch (err) { return {section:key,source:'Binance Spot PAXGUSDT — gold-market proxy',timeframe:'M5',timezone:'WIB',data:null,error:'Feed belum dapat diambil. Coba kembali beberapa saat lagi.'}; } }
    return {section:key,source:'Binance Spot PAXGUSDT — gold-market proxy',timeframe:'M5',timezone:'WIB',disclaimer:'Proxy pasar emas; bukan feed XAUUSD broker Forex.',data:data};
  }
  if (key === 'learning' || key === 'news') {
    const items=rows_(sheet_(key)).filter(r=>r[key==='learning'?7:9]===true || String(r[key==='learning'?7:9]).toLowerCase()==='true');
    items.sort((a,b)=>key==='learning'?Number(a[8]||0)-Number(b[8]||0):new Date(b[8]).getTime()-new Date(a[8]).getTime());
    return {section:key,items:items.map(r=>key==='learning'?{
      id:String(r[0]),title:String(r[3]),category:String(r[4]),body:String(r[5]),resourceUrl:String(r[6]||'')
    }:{
      id:String(r[0]),title:String(r[3]),topic:String(r[4]),body:String(r[5]),sourceName:String(r[6]||''),sourceUrl:String(r[7]||''),publishedAt:r[8] instanceof Date?r[8].toISOString():String(r[8]||'')
    })};
  }
  return {section:key,content:[]};
}

function apiLogout(session) {
  const hash = sha256_(String(session || ''));
  const sh = sheet_('sessions'), row = findRow_(sh,1,hash);
  if (row) sh.getRange(row,7).setValue(new Date());
  return {ok:true};
}

function createSession_(role,actorId) {
  const token = randomHex_(48), now = new Date(), expires = new Date(now.getTime()+8*60*60*1000);
  sheet_('sessions').appendRow([sha256_(token),role,actorId,now,expires,now,'']);
  audit_(role,actorId,'SESSION_CREATED','', 'SUCCESS','');
  return {ok:true,session:token,role:role,expiresAt:expires.toISOString()};
}

function requireSession_(token,roles) {
  if (!token) throw new Error('Sesi tidak valid. Silakan masuk kembali.');
  const sh = sheet_('sessions'), row = findRow_(sh,1,sha256_(String(token)));
  if (!row) throw new Error('Sesi tidak ditemukan.');
  const v = sh.getRange(row,1,7).getValues()[0], now = new Date();
  if (v[6] || new Date(v[4]).getTime() < now.getTime() || !roles.includes(v[1]))
    throw new Error('Sesi berakhir atau tidak memiliki izin.');
  sh.getRange(row,6).setValue(now);
  return {role:v[1],actorId:v[2]};
}

function sanitizeTelegramUpdateForJournal_(update) {
  const copy=JSON.parse(JSON.stringify(update||{}));
  if(copy.message && typeof copy.message.text==='string')
    copy.message.text=copy.message.text.replace(/^(\/start(?:@\w+)?\s+)[A-Fa-f0-9]{32}$/,'$1[REDACTED]');
  return copy;
}

function processTelegramUpdate_(update) {
  const id = String(update && update.update_id || '');
  if (!/^\d+$/.test(id)) throw new Error('Telegram update_id invalid.');
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  let row;
  try {
    const sh = sheet_('journal'); row = findRow_(sh,1,id);
    if (row) {
      if (sh.getRange(row,4).getDisplayValue() === 'COMPLETED') return;
      sh.getRange(row,4).setValue('PROCESSING');
      sh.getRange(row,6).setValue(new Date());
      sh.getRange(row,7).setValue(Number(sh.getRange(row,7).getValue() || 0)+1);
    } else {
      const type = update.message ? 'message' : update.chat_member ? 'chat_member' : 'other';
      sh.appendRow([id,type,sha256_(JSON.stringify(update)),'PROCESSING',new Date(),new Date(),1,'','','','[]','',JSON.stringify(sanitizeTelegramUpdateForJournal_(update))]);
      row = sh.getLastRow();
    }
  } finally { lock.releaseLock(); }
  try {
    if (update.message) handleTelegramStart_(update.message);
    if (update.chat_member) handleTelegramChatMember_(update.chat_member);
    if (update.chat_join_request) handleTelegramJoinRequest_(update.chat_join_request);
    const sh = sheet_('journal'); sh.getRange(row,4).setValue('COMPLETED');
    sh.getRange(row,10).setValue(new Date()); sh.getRange(row,12).setValue('');
  } catch (err) {
    const sh = sheet_('journal'); sh.getRange(row,4).setValue('FAILED');
    sh.getRange(row,12).setValue('PROCESSING_ERROR'); throw err;
  }
}

/** Issue a 24-hour single-use Telegram deep link; only its hash is stored. */
/** Admin retry tool for failed/stale Telegram updates; payloads remain in the isolated journal. */
function apiAdminRetryTelegramFailures(session) {
  const actor=requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const sh=sheet_('journal'), all=rows_(sh), results=[];
  const now=Date.now();
  for(let i=0;i<all.length && results.length<10;i++) {
    const r=all[i], state=String(r[3]||'');
    const stale=state==='PROCESSING' && new Date(r[5]).getTime()<now-10*60*1000;
    if(state!=='FAILED' && !stale) continue;
    const raw=String(r[12]||'');
    if(!raw) { sh.getRange(i+2,12).setValue('PAYLOAD_MISSING'); continue; }
    if (/^\/start(?:@\w+)?\s+\[REDACTED\]$/.test(String((()=>{try{return JSON.parse(raw).message?.text||''}catch(_){return ''}})()))) {
      sh.getRange(i+2,4).setValue('NOT_RETRYABLE');
      sh.getRange(i+2,12).setValue('TOKEN_REDACTED_REISSUE_LINK');
      results.push({updateId:String(r[0]),status:'NOT_RETRYABLE'});
      continue;
    }
    try {
      processTelegramUpdate_(JSON.parse(raw));
      results.push({updateId:String(r[0]),status:'COMPLETED'});
    } catch(err) {
      results.push({updateId:String(r[0]),status:'FAILED'});
    }
  }
  audit_(actor.role,actor.actorId,'TELEGRAM_RETRY_BATCH','', 'SUCCESS','Processed '+results.length+' failed/stale updates.');
  return {ok:true,processed:results.length,results:results};
}

function createTelegramLink_(applicationRef, expectedUsername) {
  const bot = String(prop_('MPS_TELEGRAM_BOT_USERNAME') || '').replace(/^@/,'').trim();
  if (!/^[A-Za-z0-9_]{5,32}$/.test(bot)) return {url:'',expiresAt:''};
  const token = randomHex_(32), now = new Date(), expires = new Date(now.getTime()+24*60*60*1000);
  const links = sheet_('links');
  const existing = rows_(links);
  existing.forEach((r,i)=>{ if (r[5] === applicationRef && r[3] === 'PENDING') links.getRange(i+2,4).setValue('EXPIRED'); });
  links.appendRow([sha256_(token),now,expires,'PENDING','',applicationRef,'','','','','']);
  return {url:'https://t.me/'+bot+'?start='+token,expiresAt:expires.toISOString()};
}

/** /start token is accepted only from the username recorded during registration. */
function handleTelegramStart_(message) {
  const textValue = String(message.text || '').trim();
  const match = textValue.match(/^\/start(?:@\w+)?\s+([A-Fa-f0-9]{32})$/);
  const chatId = String(message.chat && message.chat.id || '');
  if (!match) {
    if (/^\/start(?:@\w+)?$/.test(textValue)) sendTelegramMessage_(chatId,'Untuk menghubungkan akun, gunakan tombol/link verifikasi yang diberikan setelah pengiriman deposit.');
    return;
  }
  const tokenHash = sha256_(match[1].toUpperCase()), links = sheet_('links'), row = findRow_(links,1,tokenHash);
  if (!row) { sendTelegramMessage_(chatId,'Link MPS tidak valid atau sudah tidak tersedia. Silakan minta tautan baru kepada Admin.'); return; }
  const values = links.getRange(row,1,11).getValues()[0];
  if (values[3] === 'VERIFIED') { sendTelegramMessage_(chatId,'Akun Telegram Anda sudah terhubung ke MPS.'); return; }
  if (values[3] !== 'PENDING' || new Date(values[2]).getTime() < Date.now()) {
    links.getRange(row,4).setValue('EXPIRED');
    sendTelegramMessage_(chatId,'Link verifikasi MPS sudah kedaluwarsa. Silakan hubungi Admin.'); return;
  }
  const apps = sheet_('applications'), appRow = findRow_(apps,1,values[5]);
  if (!appRow) throw new Error('Application Ref for Telegram link not found.');
  const expected = cleanUsername_(apps.getRange(appRow,4).getDisplayValue());
  const actual = cleanUsername_(message.from && message.from.username || '');
  if (!expected || !actual || expected !== actual) {
    sendTelegramMessage_(chatId,'Username Telegram tidak cocok dengan data pendaftaran. Gunakan akun Telegram dengan username yang sama seperti saat mendaftar.');
    audit_('TELEGRAM','', 'TELEGRAM_LINK_USERNAME_MISMATCH',values[5],'DENIED',''); return;
  }
  const userId = String(message.from && message.from.id || '');
  if (!userId || !chatId) throw new Error('Telegram user/chat identifier missing.');
  const otherLinked=rows_(apps).some((r,i)=>i+2!==appRow && String(r[11]||'')===userId && r[7]!=='Ditolak' && ['Terhubung','Disetujui'].includes(String(r[10]||'')));
  if(otherLinked) {
    sendTelegramMessage_(chatId,'Akun Telegram ini sudah terhubung dengan pengajuan atau keanggotaan MPS lain. Hubungi Admin jika Anda perlu pemulihan akun.');
    audit_('TELEGRAM',userId,'TELEGRAM_ACCOUNT_ALREADY_LINKED',values[5],'DENIED','');
    return;
  }
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if (links.getRange(row,4).getDisplayValue() !== 'PENDING') return;
    links.getRange(row,4).setValue('VERIFIED');
    links.getRange(row,7).setValue(userId); links.getRange(row,8).setValue(chatId);
    links.getRange(row,9).setValue(actual); links.getRange(row,10).setValue(clean_(message.from.first_name || '',80));
    links.getRange(row,11).setValue(new Date());
    apps.getRange(appRow,11).setValue('Terhubung'); apps.getRange(appRow,12).setValue(userId);
    apps.getRange(appRow,13).setValue(chatId); apps.getRange(appRow,15).setValue(new Date());
    const deps = sheet_('deposits'), depRow = findRow_(deps,1,values[5]);
    if (depRow) { deps.getRange(depRow,11).setValue(userId); deps.getRange(depRow,12).setValue(chatId); }
    audit_('TELEGRAM',userId,'TELEGRAM_LINK_VERIFIED',values[5],'SUCCESS','Username matched registration.');
  } finally { lock.releaseLock(); }
  sendTelegramMessage_(chatId,'Akun Telegram berhasil diverifikasi dan terhubung dengan pendaftaran MPS. Status deposit tetap menunggu pemeriksaan Admin.');
}

/** Outbound Telegram is invoked only while processing an inbound webhook update. */
/** Queue the VIP invite after Admin approval; delivery happens after the approval call. */
function enqueueVipInvite_(memberId,applicationRef,telegramUserId,chatId) {
  const queue = sheet_('queue'), intent = 'VIP_INVITE:'+memberId;
  if (findRow_(queue,2,intent)) return;
  const now = new Date(), groupId = prop_('MPS_VIP_GROUP_ID');
  queue.appendRow([randomHex_(16),intent,'CREATE_AND_SEND_INVITE',groupId,telegramUserId,'','',
    'PENDING',0,now,'','',now,now]);
}

/** Admin-triggered worker; safe to retry because an intent is unique per member. */
function apiAdminProcessVipQueue(session) {
  const actor=requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const queue=sheet_('queue'), results=[], all=rows_(queue), now=Date.now();
  for(let i=0;i<all.length && results.length<5;i++) {
    const r=all[i], row=i+2, state=String(r[7]||'');
    const staleProcessing=state==='PROCESSING' && new Date(r[13]).getTime()<now-10*60*1000;
    if(!['PENDING','RETRY'].includes(state) && !staleProcessing) continue;
    const lock=LockService.getScriptLock();
    lock.waitLock(10000);
    let claimed=false, current;
    try {
      current=String(queue.getRange(row,8).getDisplayValue()||'');
      const updated=queue.getRange(row,14).getValue();
      const stale=current==='PROCESSING' && new Date(updated).getTime()<Date.now()-10*60*1000;
      if(current==='PENDING' || current==='RETRY' || stale) {
        queue.getRange(row,8).setValue('PROCESSING');
        queue.getRange(row,14).setValue(new Date());
        claimed=true;
      }
    } finally { lock.releaseLock(); }
    if(!claimed) continue;
    try {
      const invite=String(queue.getRange(row,6).getDisplayValue()||'') ||
        createVipInvite_(String(r[3]||prop_('MPS_VIP_GROUP_ID')),String(r[4]||''));
      queue.getRange(row,6).setValue(invite);
      const memberId=String(r[1]||'').replace('VIP_INVITE:','');
      const appRow=findRow_(sheet_('applications'),9,memberId);
      const app=appRow?sheet_('applications').getRange(appRow,1,1,15).getValues()[0]:null;
      const chatId=app?String(app[12]||''):'';
      if(!app || app[7]!=='Disetujui' || !app[8] || !chatId || String(app[11]||'')!==String(r[4]||''))
        throw new Error('APPROVED_MEMBER_TELEGRAM_BINDING_NOT_VALID');
      sendTelegramMessage_(chatId,'Pendaftaran MPS Anda disetujui. Berikut tautan undangan VIP pribadi (berlaku 48 jam, memerlukan persetujuan bot): '+invite);
      queue.getRange(row,8).setValue('SENT');
      queue.getRange(row,9).setValue(Number(queue.getRange(row,9).getValue()||0)+1);
      queue.getRange(row,12).setValue('');
      queue.getRange(row,14).setValue(new Date());
      results.push({intent:r[1],status:'SENT'});
      audit_(actor.role,actor.actorId,'VIP_INVITE_SENT',r[1],'SUCCESS','');
    } catch(err) {
      queue.getRange(row,8).setValue('RETRY');
      queue.getRange(row,9).setValue(Number(queue.getRange(row,9).getValue()||0)+1);
      queue.getRange(row,12).setValue(String(err.message||'VIP_DELIVERY_FAILED').slice(0,80));
      queue.getRange(row,14).setValue(new Date());
      results.push({intent:r[1],status:'RETRY'});
      audit_(actor.role,actor.actorId,'VIP_INVITE_FAILED',r[1],'WARNING',String(err.message||'').slice(0,160));
    }
  }
  return {ok:true,processed:results.length,results:results};
}

function createVipInvite_(groupId,userId) {
  const token = prop_('MPS_TELEGRAM_BOT_TOKEN');
  if (!token || !groupId || !userId) throw new Error('VIP_BOT_GROUP_OR_USER_NOT_CONFIGURED');
  const payload = {chat_id:groupId,creates_join_request:true,expire_date:Math.floor(Date.now()/1000)+48*60*60,name:'MPS VIP'};
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/createChatInviteLink',{
    method:'post',contentType:'application/json',payload:JSON.stringify(payload),muteHttpExceptions:true
  });
  const result = JSON.parse(response.getContentText()||'{}');
  if (response.getResponseCode()<200 || response.getResponseCode()>=300 || !result.ok || !result.result || !result.result.invite_link)
    throw new Error('VIP_INVITE_CREATE_FAILED');
  return result.result.invite_link;
}

/** Approve join requests only when the Telegram user ID matches the linked member. */
function handleTelegramJoinRequest_(request) {
  const groupId=prop_('MPS_VIP_GROUP_ID');
  if (!groupId || String(request.chat && request.chat.id || '')!==String(groupId)) return;
  const invite=String(request.invite_link && request.invite_link.invite_link || '');
  const queue=sheet_('queue'), row=findRow_(queue,6,invite);
  const userId=String(request.from && request.from.id || '');
  if (!row) { telegramJoinRequestAction_('declineChatJoinRequest',groupId,userId); return; }
  const intent=String(queue.getRange(row,2).getValue()||'');
  const memberId=intent.replace(/^VIP_INVITE:/,'');
  const expected=String(queue.getRange(row,5).getDisplayValue()||'');
  const appRow=findRow_(sheet_('applications'),9,memberId);
  const app=appRow?sheet_('applications').getRange(appRow,1,1,15).getValues()[0]:null;
  const valid=!!(userId && userId===expected && app && app[7]==='Disetujui' && String(app[11]||'')===userId);
  if (!valid) {
    telegramJoinRequestAction_('declineChatJoinRequest',groupId,userId);
    if (userId) sendTelegramMessage_(userId,'Permintaan masuk VIP ditolak karena undangan tidak cocok dengan akun member MPS yang aktif.');
    audit_('TELEGRAM',userId,'VIP_JOIN_REQUEST_DENIED',intent,'DENIED','Invite owner/member status verification failed.');
    return;
  }
  telegramJoinRequestAction_('approveChatJoinRequest',groupId,userId);
  audit_('TELEGRAM',userId,'VIP_JOIN_REQUEST_APPROVED',String(queue.getRange(row,2).getValue()),'SUCCESS','Invite owner matched linked Telegram user ID.');
}

function telegramJoinRequestAction_(method,groupId,userId) {
  const token=prop_('MPS_TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN_NOT_CONFIGURED');
  const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{
    method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:groupId,user_id:userId}),muteHttpExceptions:true
  });
  const result=JSON.parse(response.getContentText()||'{}');
  if (response.getResponseCode()<200 || response.getResponseCode()>=300 || !result.ok)
    throw new Error('TELEGRAM_'+method.toUpperCase()+'_FAILED');
  return true;
}

/** Only confirmed joins of approved members are published to the public ticker. */
function handleTelegramChatMember_(event) {
  const groupId = prop_('MPS_VIP_GROUP_ID');
  if (!groupId || String(event.chat && event.chat.id || '') !== String(groupId)) return;
  const member = event.new_chat_member || {}, oldMember = event.old_chat_member || {};
  const userId = String(member.user && member.user.id || '');
  if (!userId) return;
  const isActive = ['member','administrator','creator'].includes(String(member.status||'')) || (String(member.status||'')==='restricted' && member.is_member===true);
  const wasActive = ['member','administrator','creator'].includes(String(oldMember.status||'')) || (String(oldMember.status||'')==='restricted' && oldMember.is_member===true);
  if (isActive === wasActive) return;
  const apps = sheet_('applications'), all = rows_(apps);
  const index = all.findIndex(r=>String(r[11]||'')===userId);
  if (index<0) return;
  const app = all[index], appRow=index+2, memberId=String(app[8]||'');
  if (app[7] !== 'Disetujui' || !memberId) return;
  const legacy=legacySheet_(), legacyRow=findRow_(legacy,1,memberId);
  if (!legacyRow || legacy.getRange(legacyRow,8).getDisplayValue()!=='Berhasil') return;
  const events=sheet_('vip'), now=new Date();
  if (isActive) {
    const already=rows_(events).some(r=>r[1]===memberId && r[3]==='JOINED' && String(r[6])==='true' && (r[7]===true || String(r[7]).toLowerCase()==='true'));
    if (!already) events.appendRow([randomHex_(16),memberId,app[2],'JOINED',userId,now,true,true]);
    const queue=sheet_('queue'), qrow=findRow_(queue,2,'VIP_INVITE:'+memberId);
    if (qrow) { queue.getRange(qrow,8).setValue('JOINED'); queue.getRange(qrow,14).setValue(now); }
    audit_('TELEGRAM',userId,'VIP_MEMBER_JOINED',memberId,'SUCCESS','Telegram chat_member update verified.');
  } else {
    const existing=rows_(events);
    existing.forEach((r,i)=>{if(r[1]===memberId && r[3]==='JOINED' && String(r[6])==='true') events.getRange(i+2,8).setValue(false);});
    events.appendRow([randomHex_(16),memberId,app[2],'LEFT',userId,now,true,false]);
    audit_('TELEGRAM',userId,'VIP_MEMBER_LEFT',memberId,'SUCCESS','Public ticker entry disabled.');
  }
}

function apiAdminSystemHealth(session) {
  requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const app=rows_(sheet_('applications')), queue=rows_(sheet_('queue')), journal=rows_(sheet_('journal'));
  const activeMembers=legacySheet_().getLastRow()>1?legacySheet_().getLastRow()-1:0;
  const count=(items,stateIndex,state)=>items.filter(r=>String(r[stateIndex])===state).length;
  return {
    version:MPS.VERSION,checkedAt:new Date().toISOString(),
    applications:{total:app.length,pending:count(app,7,'Menunggu Pendaftaran')+count(app,7,'Deposit Dikirim')+count(app,7,'Menunggu Deposit')},
    memberRows:activeMembers,
    vipQueue:{pending:count(queue,7,'PENDING'),processing:count(queue,7,'PROCESSING'),retry:count(queue,7,'RETRY'),sent:count(queue,7,'SENT'),joined:count(queue,7,'JOINED')},
    telegram:{failedUpdates:count(journal,3,'FAILED'),processingUpdates:count(journal,3,'PROCESSING')},
    configuration:{telegramBot:!!prop_('MPS_TELEGRAM_BOT_TOKEN'),telegramBotUsername:!!prop_('MPS_TELEGRAM_BOT_USERNAME'),telegramAdminBackup:!!prop_('MPS_TELEGRAM_CHAT_ID'),telegramWebhook:!!prop_('MPS_TELEGRAM_WEBHOOK_SECRET'),vipGroup:!!prop_('MPS_VIP_GROUP_ID'),backupFolder:!!prop_('MPS_BACKUP_FOLDER_ID'),weeklyBackupTrigger:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='createMpsScheduledBackup_')},
    note:'Health summary only; no secrets, IDs, proof links, or member personal details are returned.'
  };
}

function apiAdminGetAudit(session) {
  requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const all=rows_(sheet_('audit')).slice(-50).reverse();
  return all.map(r=>({at:r[1] instanceof Date?r[1].toISOString():String(r[1]||''),role:String(r[2]),actor:String(r[3]),action:String(r[4]),target:String(r[5]),outcome:String(r[6]),details:clean_(r[7],240)}));
}

/** Owner-run manual snapshot. No automatic copies or retention deletion are performed. */
function requireEffectiveOwnerContext_() {
  const expected=prop_('MPS_REBUILD_OWNER_EMAIL').trim().toLowerCase();
  const actual=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(!expected || !actual || actual!==expected)
    throw new Error('Scheduled backup must execute under the configured isolated-project owner account.');
}

function createMpsScheduledBackup_() {
  requireEffectiveOwnerContext_();
  return createMpsBackupSnapshotCore_();
}

function installMpsWeeklyBackupTrigger() {
  requireOwnerContext_();
  const folderId=prop_('MPS_BACKUP_FOLDER_ID');
  if(!folderId || folderId===prop_('MPS_PROOF_FOLDER_ID')) throw new Error('Folder backup privat yang terpisah wajib dikonfigurasi.');
  const folder=DriveApp.getFolderById(folderId);
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE) throw new Error('Folder backup harus PRIVATE.');
  const existing=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='createMpsScheduledBackup_');
  if(existing.length) return {ok:true,installed:false,message:'Trigger backup mingguan sudah ada.',count:existing.length};
  ScriptApp.newTrigger('createMpsScheduledBackup_').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
  audit_('OWNER','OWNER','WEEKLY_BACKUP_TRIGGER_INSTALLED','', 'SUCCESS','Weekly backup Sunday around 03:00 project timezone.');
  return {ok:true,installed:true,message:'Backup mingguan dijadwalkan hari Minggu sekitar pukul 03.00 zona waktu project.'};
}

function createMpsBackupSnapshotCore_() {
  const dbId=prop_('MPS_SPREADSHEET_ID'), folderId=prop_('MPS_BACKUP_FOLDER_ID');
  if(!dbId || !folderId) throw new Error('MPS_SPREADSHEET_ID dan MPS_BACKUP_FOLDER_ID wajib diatur.');
  if(folderId===prop_('MPS_PROOF_FOLDER_ID')) throw new Error('Folder backup tidak boleh sama dengan folder bukti deposit.');
  const folder=DriveApp.getFolderById(folderId);
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE) throw new Error('Folder backup harus memiliki akses PRIVATE.');
  const stamp=Utilities.formatDate(new Date(),MPS.TZ,'yyyyMMdd-HHmmss');
  const copy=DriveApp.getFileById(dbId).makeCopy('MPS-v4.8.1-backup-'+stamp,folder);
  copy.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  return {ok:true,name:copy.getName(),fileId:copy.getId(),url:copy.getUrl(),createdAt:new Date().toISOString(),note:'Backup dibuat di folder privat. Tidak ada file lama yang dihapus.'};
}

function createMpsBackupSnapshot() {
  requireOwnerContext_();
  return createMpsBackupSnapshotCore_();
}

function apiGetPublicVipTicker() {
  const events=rows_(sheet_('vip'));
  const latest=events.filter(r=>r[3]==='JOINED' && (r[6]===true || String(r[6]).toLowerCase()==='true') && (r[7]===true || String(r[7]).toLowerCase()==='true'))
    .slice(-20).reverse().slice(0,8)
    .map(r=>({nickname:clean_(r[2],60),joinedAt:r[5] instanceof Date?r[5].toISOString():String(r[5]||'')}));
  return latest;
}

function sendTelegramMessage_(chatId, messageText) {
  const token = prop_('MPS_TELEGRAM_BOT_TOKEN');
  if (!token || !chatId) return false;
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
    method:'post',contentType:'application/json',payload:JSON.stringify({chat_id:chatId,text:String(messageText).slice(0,3500)}),
    muteHttpExceptions:true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('Telegram sendMessage HTTP failure.');
  const result = JSON.parse(response.getContentText() || '{}');
  if (!result.ok) throw new Error('Telegram Bot API rejected sendMessage.');
  return true;
}
function ensureSheet_(ss, spec) {
  let sh = ss.getSheetByName(spec.name);
  if (!sh) sh = ss.insertSheet(spec.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);
    sh.setFrozenRows(1);
    return;
  }
  const actual = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),spec.headers.length)).getDisplayValues()[0].slice(0,spec.headers.length);
  if (JSON.stringify(actual) !== JSON.stringify(spec.headers))
    throw new Error('Header sheet '+spec.name+' tidak cocok. Tidak diubah.');
}

function legacySheet_() {
  const sh = openDb_().getSheetByName(MPS.LEGACY_SHEET);
  if (!sh || sh.getLastColumn() < 18) throw new Error('Database Member belum tersedia atau belum lengkap.');
  const h = sh.getRange(1,1,1,18).getDisplayValues()[0];
  if (JSON.stringify(h) !== JSON.stringify(MPS.LEGACY_HEADERS)) throw new Error('Skema Database Member tidak cocok.');
  return sh;
}
function sheet_(key) {
  const spec = MPS.SHEETS[key]; if (!spec) throw new Error('Sheet key tidak dikenal.');
  const sh = openDb_().getSheetByName(spec.name);
  if (!sh) throw new Error('Sheet '+spec.name+' belum diprovision.');
  const h = sh.getRange(1,1,1,spec.headers.length).getDisplayValues()[0];
  if (JSON.stringify(h) !== JSON.stringify(spec.headers)) throw new Error('Header '+spec.name+' tidak cocok.');
  return sh;
}
function openDb_() {
  const id = prop_('MPS_SPREADSHEET_ID');
  if (!id) throw new Error('MPS_SPREADSHEET_ID belum diatur.');
  return SpreadsheetApp.openById(id);
}
function requireOwnerContext_() {
  const expected = prop_('MPS_REBUILD_OWNER_EMAIL').trim().toLowerCase();
  // In Apps Script editor executions, getActiveUser() may return an empty
  // email for consumer accounts due to identity disclosure restrictions.
  // getEffectiveUser() is the executing account for this owner-run setup.
  const actual = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  if (!expected)
    throw new Error('MPS_REBUILD_OWNER_EMAIL belum diatur pada Script Properties project ini.');
  if (!actual)
    throw new Error('Email akun eksekutor tidak tersedia. Jalankan fungsi dari Apps Script Editor dengan akun pemilik project.');
  if (actual !== expected)
    throw new Error('Akun eksekutor tidak cocok dengan MPS_REBUILD_OWNER_EMAIL. Periksa akun Google yang aktif di Apps Script.');
}
function prop_(key) { return PropertiesService.getScriptProperties().getProperty(key) || ''; }

/**
 * Temporary per-identifier abuse throttle.
 * Defense-in-depth only; it is not a substitute for edge/WAF controls.
 */
function enforceRateLimit_(scope, identifier, limit, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const key = 'MPS_RL_' + sha256_(scope + '|' + String(identifier)).slice(0,32);
  const current = Number(cache.get(key) || 0);
  if (current >= limit) {
    audit_('SYSTEM','', 'RATE_LIMIT_BLOCK',scope,'DENIED','Temporary request throttle triggered.');
    throw new Error('Terlalu banyak percobaan. Tunggu beberapa saat lalu coba kembali.');
  }
  cache.put(key, String(current + 1), windowSeconds);
}
function findRow_(sh,col,value) {
  if (sh.getLastRow()<2) return 0;
  const found=sh.getRange(2,col,sh.getLastRow()-1,1).createTextFinder(String(value)).matchEntireCell(true).findNext();
  return found ? found.getRow() : 0;
}
function rows_(sh) { return sh.getLastRow()<2 ? [] : sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues(); }
function audit_(role,actor,action,target,outcome,details) {
  try { sheet_('audit').appendRow([randomHex_(16),new Date(),role,actor,action,target,outcome,clean_(details,500)]); }
  catch (e) { console.error('AUDIT_WRITE_FAILED '+String(e.message||e)); }
}
function isAllowedImageBytes_(bytes,mime) {
  const u=i=>(bytes[i]||0)&255;
  if (mime==='image/jpeg') return bytes.length>=3 && u(0)===0xFF && u(1)===0xD8 && u(2)===0xFF;
  if (mime==='image/png') return bytes.length>=8 && [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A].every((v,i)=>u(i)===v);
  if (mime==='image/webp') return bytes.length>=12 && String.fromCharCode(u(0),u(1),u(2),u(3))==='RIFF' && String.fromCharCode(u(8),u(9),u(10),u(11))==='WEBP';
  return false;
}
function clean_(v,max) { return String(v == null ? '' : v).replace(/[<>]/g,'').trim().slice(0,max); }
function cleanUsername_(v) { return clean_(v,40).replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
function randomHex_(n) { let s=''; while(s.length<n){s+=Utilities.getUuid().replace(/-/g,'');} return s.slice(0,n).toUpperCase(); }
function sha256_(v) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join(''); }
function constantTimeEquals_(a,b) { a=String(a);b=String(b);let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0; }
function json_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
function text_(v) { return ContentService.createTextOutput(v).setMimeType(ContentService.MimeType.TEXT); }
