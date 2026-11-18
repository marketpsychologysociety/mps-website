/**
 * MARKET PSYCHOLOGY SOCIETY — CLEAN REBUILD v4.8.1
 * Google Apps Script backend.
 *
 * SAFETY:
 * - Build/test only in a NEW standalone Apps Script project.
 * - No automatic deployment, webhook registration, trigger creation, or production migration.
 * - The legacy Database Member sheet is never cleared, reordered, or rewritten by provisioning.
 * - Configure Script Properties before use; see docs/rebuild-v4.8.1-runbook.md.
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
  SHEETS: {
    applications: {name:'MPS Applications', headers:['Application Ref','Created At','Nickname','Telegram Username','Country','Goal','Note','Status','Member ID','Deposit Submitted At','Telegram Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']},
    deposits: {name:'MPS Deposit Applications', headers:['Application Ref','Submitted At','Account Name','MT5 Login','Account Type','Deposit Amount IDR','Deposit Date','Proof File ID','Proof URL','Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']},
    links: {name:'MPS Member Telegram Links', headers:['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At']},
    sessions: {name:'MPS Sessions', headers:['Session Hash','Role','Actor ID','Created At','Expires At','Last Seen At','Revoked At']},
    audit: {name:'MPS Audit Logs', headers:['Event ID','At','Actor Role','Actor ID','Action','Target Ref','Outcome','Details']},
    ledger: {name:'MPS Request Ledger', headers:['Request ID','Fingerprint','Status','Started At','Completed At','Action','Application Ref','Member ID','Result Status']},
    journal: {name:'MPS Telegram Update Journal', headers:['Update ID','Update Type','Payload SHA-256','State','First Seen At','Last Attempt At','Attempt Count','Lease Expires At','Claim Token','Completed At','Effect Keys JSON','Last Error Code']},
    queue: {name:'MPS Telegram VIP Follow-up Queue', headers:['Task Key','Intent Key','Action','Group ID','Telegram User ID','Invite Link','Alert Text','State','Attempts','Next Attempt At','Lease Until','Last Error Code','Created At','Updated At']},
    vip: {name:'MPS VIP Events', headers:['Event ID','Member ID','Nickname','Event Type','Telegram User ID','Occurred At','Verified','Public Display']},
    announcements: {name:'MPS Announcements', headers:['Announcement ID','Title','Body','Audience','Start At','End At','Active','Created At','Updated At']}
  }
});

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.health === '1') return json_({ok:true,service:'MPS Member Backend',version:MPS.VERSION,mode:'rebuild'});
  const page = String(p.page || 'home').toLowerCase();
  const allowed = ['home','register','deposit','dashboard','learning','pulse','calculator','news','advertise','admin'];
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
  try { update = JSON.parse(e.postData.contents || '{}'); }
  catch (_) { return text_('Bad Request'); }
  journalTelegramUpdate_(update);
  return text_('OK');
}

/** Validate configuration only. No storage mutation. */
function validateMpsRebuildConfig() {
  const p = PropertiesService.getScriptProperties();
  const result = {
    spreadsheetConfigured: !!p.getProperty('MPS_SPREADSHEET_ID'),
    proofFolderConfigured: !!p.getProperty('MPS_PROOF_FOLDER_ID'),
    adminCredentialConfigured: !!p.getProperty('MPS_REBUILD_ADMIN_PASSWORD_HASH'),
    telegramBotConfigured: !!p.getProperty('MPS_TELEGRAM_BOT_TOKEN'),
    telegramChatConfigured: !!p.getProperty('MPS_TELEGRAM_CHAT_ID'),
    webhookSecretConfigured: !!p.getProperty('MPS_TELEGRAM_WEBHOOK_SECRET'),
    note: 'Read-only validation. No sheets, properties, triggers, or webhooks changed.'
  };
  return result;
}

/**
 * Explicit isolated-project provisioning.
 * Requires MPS_REBUILD_ALLOW_PROVISION=true and an explicitly configured spreadsheet ID.
 * Existing legacy member data is not edited. Exact schema mismatch stops provisioning.
 */
function provisionMpsRebuildStorage() {
  if (prop_('MPS_REBUILD_ALLOW_PROVISION') !== 'true')
    throw new Error('Provisioning terkunci. Aktifkan hanya pada spreadsheet sintetis di project test baru.');
  const ss = openDb_();
  const legacy = ss.getSheetByName(MPS.LEGACY_SHEET);
  if (!legacy) {
    const sh = ss.insertSheet(MPS.LEGACY_SHEET);
    sh.getRange(1,1,1,MPS.LEGACY_HEADERS.length).setValues([MPS.LEGACY_HEADERS]);
    sh.setFrozenRows(1);
  } else {
    const actual = legacy.getRange(1,1,1,Math.max(legacy.getLastColumn(),MPS.LEGACY_HEADERS.length)).getDisplayValues()[0];
    const first18 = actual.slice(0,MPS.LEGACY_HEADERS.length);
    if (JSON.stringify(first18) !== JSON.stringify(MPS.LEGACY_HEADERS))
      throw new Error('Header Database Member tidak cocok. Tidak ada perubahan dilakukan.');
    if (legacy.getLastColumn() > MPS.LEGACY_HEADERS.length) {
      const trailing = legacy.getRange(1,MPS.LEGACY_HEADERS.length+1,Math.max(1,legacy.getLastRow()),legacy.getLastColumn()-MPS.LEGACY_HEADERS.length).getDisplayValues();
      if (trailing.some(r => r.some(v => v !== '')))
        throw new Error('Kolom tambahan berisi data. Provisioning dihentikan tanpa perubahan.');
    }
  }
  Object.keys(MPS.SHEETS).forEach(k => ensureSheet_(ss,MPS.SHEETS[k]));
  return {ok:true,version:MPS.VERSION,legacyHeaders:MPS.LEGACY_HEADERS.length,auxiliarySheets:Object.keys(MPS.SHEETS).length};
}

/** Public API: initial application only creates Application Ref, never Member ID. */
function apiRegister(input) {
  input = input || {};
  const nickname = clean_(input.nickname,60);
  const username = cleanUsername_(input.telegramUsername);
  const country = clean_(input.country,60);
  const goal = clean_(input.goal,160);
  const note = clean_(input.note,1000);
  if (!nickname || !username || !country || !goal) throw new Error('Lengkapi nama panggilan, username Telegram, negara, dan tujuan.');
  enforceRateLimit_('register', username, 3, 3600);
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    const sh = sheet_('applications');
    const ref = 'MPS-APP-' + randomHex_(20);
    const now = new Date();
    sh.appendRow([ref,now,nickname,username,country,goal,note,'Menunggu Pendaftaran','','','Belum Terhubung','','','',''+now]);
    audit_('PUBLIC','', 'APPLICATION_CREATED',ref,'SUCCESS','Initial application only; no member ID issued.');
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
  if (!account || !login || !type || !Number.isFinite(amount) || amount < 500000 || !date)
    throw new Error('Data deposit belum lengkap atau nominal di bawah Rp500.000.');
  const mime = String(input.proofMime || '');
  if (!['image/jpeg','image/png','image/webp'].includes(mime)) throw new Error('Bukti harus JPG, PNG, atau WEBP.');
  const raw = String(input.proofBase64 || '').replace(/^data:[^,]+,/,'');
  if (!raw || raw.length > 7 * 1024 * 1024) throw new Error('Ukuran bukti maksimal 5 MB.');
  const bytes = Utilities.base64Decode(raw);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran bukti maksimal 5 MB.');
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
    const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
    const file = folder.createFile(Utilities.newBlob(bytes,mime,'MPS-PROOF-'+ref+'.'+ext));
    file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
    const now = new Date();
    sheet_('deposits').appendRow([ref,now,account,login,type,amount,date,file.getId(),'','Menunggu Validasi','','','','']);
    apps.getRange(row,8).setValue('Deposit Dikirim');
    apps.getRange(row,10).setValue(now);
    apps.getRange(row,15).setValue(now);
    audit_('PUBLIC','', 'DEPOSIT_SUBMITTED',ref,'SUCCESS','Proof saved to configured private folder.');
    return {ok:true,applicationRef:ref,status:'Menunggu Validasi Admin'};
  } finally { lock.releaseLock(); }
}

/** Admin login uses a salted SHA-256 hash in Script Properties; plaintext password is never stored. */
function apiAdminLogin(password, totpCode) {
  const expected = prop_('MPS_REBUILD_ADMIN_PASSWORD_HASH');
  const salt = prop_('MPS_REBUILD_ADMIN_PASSWORD_SALT');
  if (!expected || !salt) throw new Error('Kredensial admin belum disiapkan di project test.');
  enforceRateLimit_('admin-login', 'global', 8, 900);
  if (!verifyMpsTotp_('MPS_REBUILD_ADMIN_TOTP_SECRET',totpCode)) throw new Error('Kode Google Authenticator Admin tidak valid.');
  const actual = sha256_(salt + String(password || ''));
  if (!constantTimeEquals_(actual,expected)) {
    audit_('UNKNOWN','', 'ADMIN_LOGIN','', 'DENIED','Invalid credentials.');
    throw new Error('Password admin tidak valid.');
  }
  return createSession_('ADMIN','admin');
}

function apiSuperAdminLogin(password, totpCode) {
  const expected = prop_('MPS_REBUILD_SUPER_ADMIN_PASSWORD_HASH');
  const salt = prop_('MPS_REBUILD_SUPER_ADMIN_PASSWORD_SALT');
  if (!expected || !salt) throw new Error('Kredensial Super Admin belum disiapkan.');
  enforceRateLimit_('super-login', 'global', 5, 900);
  if (!verifyMpsTotp_('MPS_REBUILD_SUPER_ADMIN_TOTP_SECRET',totpCode)) throw new Error('Kode Google Authenticator Super Admin tidak valid.');
  if (!constantTimeEquals_(sha256_(salt + String(password || '')),expected))
    throw new Error('Password Super Admin tidak valid.');
  return createSession_('SUPER_ADMIN','super-admin');
}


/**
 * Run manually from the Apps Script editor by the project owner in the isolated project.
 * Creates Google Authenticator secrets once and returns provisioning URIs to the editor.
 * Never expose this function through a public web endpoint or share its return value.
 */
function initializeMpsTotpSecrets() {
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
  const value = String(code || '').replace(/\\s/g,'');
  if (!secret || !/^\\d{6}$/.test(value)) return false;
  const now = Math.floor(Date.now()/1000/30);
  for (let drift=-1;drift<=1;drift++) {
    if (constantTimeEquals_(totpCode_(secret,now+drift),value)) return true;
  }
  return false;
}

function totpCode_(base32Secret, counter) {
  const key = base32Decode_(base32Secret);
  const msg = [];
  let n = counter;
  for (let i=7;i>=0;i--) { msg[i]=n & 255; n=Math.floor(n/256); }
  const hmac = Utilities.computeHmacSha1Signature(msg,key);
  const offset = hmac[hmac.length-1] & 15;
  const binary = ((hmac[offset]&127)<<24) | ((hmac[offset+1]&255)<<16) | ((hmac[offset+2]&255)<<8) | (hmac[offset+3]&255);
  return ('000000'+String(binary%1000000)).slice(-6);
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
  const apps = sheet_('applications'), deps = sheet_('deposits');
  const a = rows_(apps), d = rows_(deps);
  return a.map(r => {
    const dep = d.find(x => x[0] === r[0]) || [];
    return {applicationRef:r[0],createdAt:r[1],nickname:r[2],telegramUsername:r[3],country:r[4],goal:r[5],status:r[7],memberId:r[8]||'',accountName:dep[2]||'',mt5Login:dep[3]||'',accountType:dep[4]||'',amount:dep[5]||'',depositDate:dep[6]||'',proofFileId:dep[7]||'',depositStatus:dep[9]||'',adminNote:r[13]||''};
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
    audit_(actor.role,actor.actorId,'APPLICATION_APPROVED',ref,'SUCCESS','Member ID issued after approval.');
    return {ok:true,status:'Disetujui',memberId:memberId,pinSetupRequired:true};
  } finally { lock.releaseLock(); }
}


/**
 * Admin-only one-time PIN enrollment/rotation.
 * PIN is returned only in this authenticated admin response and is never stored in plaintext.
 * Admin must deliver it through a separately verified private channel; Telegram delivery is not yet integrated.
 */
function apiAdminIssuePin(session, memberId) {
  const actor = requireSession_(session,['ADMIN','SUPER_ADMIN']);
  const id = clean_(memberId,20).toUpperCase();
  if (!/^MPS-[A-F0-9]{10}$/.test(id)) throw new Error('ID Member tidak valid.');
  const sh = legacySheet_(), row = findRow_(sh,1,id);
  if (!row || sh.getRange(row,8).getDisplayValue() !== 'Berhasil')
    throw new Error('PIN hanya dapat dibuat untuk member yang sudah aktif.');
  const pin = randomPin_(), salt = randomHex_(32);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('MPS_PIN_SALT_'+id,salt);
  props.setProperty('MPS_PIN_HASH_'+id,sha256_(salt+pin));
  audit_(actor.role,actor.actorId,'MEMBER_PIN_ISSUED',id,'SUCCESS','One-time PIN shown to authenticated admin only.');
  return {ok:true,memberId:id,pin:pin,delivery:'Admin must send privately after verifying the member identity.'};
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
    return {section:key,source:'Binance Spot PAXGUSDT — gold-market proxy',timeframe:'M5',timezone:'WIB',data:raw ? JSON.parse(raw) : null};
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

function journalTelegramUpdate_(update) {
  const id = String(update.update_id || '');
  if (!/^\d+$/.test(id)) throw new Error('Telegram update_id invalid.');
  const sh = sheet_('journal');
  if (findRow_(sh,1,id)) return;
  const type = update.message ? 'message' : update.chat_member ? 'chat_member' : 'other';
  sh.appendRow([id,type,sha256_(JSON.stringify(update)),'RECEIVED',new Date(),new Date(),1,'','','','[]','']);
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
function clean_(v,max) { return String(v == null ? '' : v).replace(/[<>]/g,'').trim().slice(0,max); }
function cleanUsername_(v) { return clean_(v,40).replace(/^@/,'').toLowerCase().replace(/[^a-z0-9_]/g,''); }
function randomHex_(n) { let s=''; while(s.length<n){s+=Utilities.getUuid().replace(/-/g,'');} return s.slice(0,n).toUpperCase(); }
function sha256_(v) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(v),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join(''); }
function constantTimeEquals_(a,b) { a=String(a);b=String(b);let d=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)d|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return d===0; }
function json_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
function text_(v) { return ContentService.createTextOutput(v).setMimeType(ContentService.MimeType.TEXT); }
