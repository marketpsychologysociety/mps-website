/**
 * WORKBENCH CANDIDATE — derived from Library Code.gs SHA-256 c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba.
 * Isolated VIP transition integration; do not deploy without owner approval and live GAS acceptance tests.
 */
/**
 * MARKET PSYCHOLOGY SOCIETY — Backend v4.8.0 (reconstructed)
 * Rekonstruksi v4.8.0 berbasis source kompatibilitas v4.7.0 dan kandidat integrasi Calculator VIP. Mempertahankan spreadsheet, sheet, folder bukti,
 * Script Properties, dan integrasi Telegram yang sudah ada.
 * Local static review and syntax checks are being performed; Apps Script runtime and Telegram delivery have not been tested.
 * Mempertahankan 30 kolom Database Member yang sudah ada; data deposit pending baru dipisahkan dari tabel member. Endpoint pembersihan data uji
 * dinonaktifkan secara fail-closed; backup menu admin hanya mencakup spreadsheet database.
 * Web App: Execute as Me; akses Anyone. Semua API sensitif memakai sesi.
 */

const MPS = Object.freeze({
  version: '4.8.0',
  sheetName: 'Database Member',
  summarySheetName: 'Ringkasan',
  headers: [
    'ID Member', 'Waktu Daftar', 'Nama Panggilan', 'Username Telegram',
    'Negara', 'Tujuan Bergabung', 'Catatan Member', 'Status Pendaftaran',
    'Nama Sesuai Akun', 'Login MT5', 'Jenis Akun', 'Deposit Pertama (IDR)',
    'Tanggal Deposit', 'Link Bukti Deposit', 'Status Verifikasi Deposit',
    'Catatan Admin', 'Waktu Konfirmasi', 'Terakhir Diperbarui',
    'Telegram Chat ID', 'Telegram Link Token', 'Telegram Linked At', 'PIN Hash', 'PIN Updated At',
    'Telegram Link Expires At', 'Application Ref', 'VIP Invite Link', 'VIP Invite Expires At',
    'VIP Joined At', 'VIP User ID', 'VIP Status'
  ],
  minDeposit: 1000000,
  maxProofBytes: 5 * 1024 * 1024,
  maxLearningFileBytes: 8 * 1024 * 1024,
  maxPulseDataBytes: 1024 * 1024,
  requestCacheSeconds: 21600,
  sessionSeconds: 21600,
  loginWindowSeconds: 900,
  loginMaxAttempts: 8,
  submitWindowSeconds: 600,
  submitMaxAttempts: 8,
  adminWindowSeconds: 900,
  adminMaxAttempts: 20
});

const MPS_COL = Object.freeze({
  id: 1, registeredAt: 2, nickname: 3, telegram: 4, country: 5, goal: 6,
  note: 7, registrationStatus: 8, accountName: 9, mt5: 10, accountType: 11,
  amount: 12, depositDate: 13, proofUrl: 14, depositStatus: 15,
  adminNote: 16, confirmedAt: 17, updatedAt: 18
});

// Application records are kept separately until a deposit is submitted.
// Candidate v4.8 uses 30 columns: the legacy 18 fields plus 12 appended fields. The live v4.6.1 sheet requires explicit admin migration; no automatic migration is performed. Pending deposits remain in separate sheets.
const MPS_APPLICATIONS = Object.freeze({
  sheet: 'MPS Applications',
  headers: ['Application Ref','Created At','Nickname','Telegram Username','Country','Goal','Note','Status','Member ID','Deposit Submitted At','Telegram Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']
});
const MPS_DEPOSITS = Object.freeze({
  sheet: 'MPS Deposit Applications',
  headers: ['Application Ref','Submitted At','Account Name','MT5 Login','Account Type','Deposit Amount IDR','Deposit Date','Proof File ID','Proof URL','Status','Telegram User ID','Telegram Chat ID','Admin Note','Updated At']
});
const MPS_MEMBER_LINKS = Object.freeze({
  sheet: 'MPS Member Telegram Links',
  headers: ['Token Hash','Created At','Expires At','Status','Member ID','Application Ref','Telegram User ID','Chat ID','Username','First Name','Consumed At']
});

/** Web app entry point. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.health === '1' || p.format === 'json') {
    return json_({ service: 'MPS Member Backend', status: 'ready', version: MPS.version });
  }
  if (p.action === 'status') {
    const requestId = cleanRequestId_(p.requestId);
    if (!requestId) return json_({ ok: false, error: 'requestId tidak valid.' });
    const cached = CacheService.getScriptCache().get('mps_req_' + requestId);
    // Endpoint status publik tidak mengembalikan payload hasil pendaftaran/deposit.
    return json_(cached ? { ok: true, pending: false, status: 'Selesai diproses' } : {
      ok: false, pending: true, status: 'Masih diproses'
    });
  }
  // Parameter page hanya memilih tab awal; seluruh konten privat tetap dilindungi sesi.
  const requestedPage = String(p.page || 'home').toLowerCase();
  // Whitelist hanya memilih panel awal; seluruh data privat tetap melewati sesi/API backend.
  const allowedPages = ['home', 'register', 'deposit', 'heatmap', 'dashboard', 'learning', 'pulse', 'calculator', 'news', 'advertise', 'admin'];
  const initialPage = allowedPages.indexOf(requestedPage) >= 0 ? requestedPage : 'home';
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialPage = initialPage;
  return template.evaluate()
    .setTitle('Market Psychology Society')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Backward-compatible POST endpoint; frontend utama memakai apiSubmit(). */
function doPost(e) {
  const params = (e && e.parameter) || {};
  if (Object.prototype.hasOwnProperty.call(params, 'tg')) {
    const expected = PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_WEBHOOK_SECRET') || '';
    if (!expected || !constantTimeEquals_(String(params.tg || ''), expected)) {
      return HtmlService.createHtmlOutput('Forbidden');
    }
    try {
      const update = JSON.parse((e && e.postData && e.postData.contents) || '{}');
      processTelegramUpdate_(update);
      // HtmlService dipakai khusus webhook agar tidak memakai redirect ContentService.
      return HtmlService.createHtmlOutput('OK');
    } catch (err) {
      console.error('Telegram webhook: ' + safeErrorMessage_(err));
      throw err;
    }
  }
  let data;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8000000) throw new Error('Payload kosong atau terlalu besar.');
    data = JSON.parse(raw);
  } catch (err) {
    return json_({ ok: false, error: 'Payload tidak valid atau terlalu besar.' });
  }
  return json_(submitCore_(data));
}

/** Buat tautan verifikasi Telegram sekali pakai untuk pendaftaran publik. */
function apiCreateTelegramLink(session, applicationRef) {
  requireAdmin_(session);
  const key=clean_(applicationRef,40).toUpperCase();
  consumeRateLimit_('mps_tg_link_create_'+sha256_(key).slice(0,20),3,900,'Tautan Telegram terlalu sering dibuat. Coba lagi 15 menit.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    if(/^MPS-APP-[A-F0-9]{20}$/.test(key)){
      const apps=getMpsApplicationsSheet_(),ar=findMpsApplicationRow_(apps,key);if(!ar)throw new Error('Application Ref tidak ditemukan.');
      const app=apps.getRange(ar,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];if(!['Deposit Dikirim','Menunggu Validasi Admin'].includes(String(app[7]||'')))throw new Error('Tautan hanya dapat dibuat untuk pengajuan deposit yang menunggu verifikasi.');
      const link=createMemberTelegramLink_('',key);expireOtherApplicationLinks_(key,link.row);recordMpsAudit_(adminRole_(session),adminActorRef_(session),'TELEGRAM_LINK_RENEWED',key,'SUCCESS','Tautan Telegram pendaftaran diterbitkan ulang.');return link;
    }
    const id=key;if(!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(id))throw new Error('ID Member atau Application Ref tidak valid.');
    const sheet=getMemberSheet_(),row=findMemberById_(sheet,id);if(!row)throw new Error('Member tidak ditemukan.');
    const status=sheet.getRange(row,MPS_COL.registrationStatus,1,8).getDisplayValues()[0];if(status[0]==='Berhasil'||status[7]==='Disetujui')throw new Error('Member ini sudah aktif.');
    const appSheet=getMpsApplicationsSheet_(),appRow=findMpsApplicationRowByMember_(appSheet,id),appRef=appRow?String(appSheet.getRange(appRow,1).getDisplayValue()||''):'';
    const link=createMemberTelegramLink_(id,appRef);expireOtherMemberLinks_(id,link.row);recordMpsAudit_(adminRole_(session),adminActorRef_(session),'TELEGRAM_LINK_RENEWED',id,'SUCCESS','Tautan Telegram sekali pakai diterbitkan ulang.');return link;
  }finally{lock.releaseLock();}
}

function getMpsApplicationsSheet_() {
  const ss = openDatabase_();
  let sh = ss.getSheetByName(MPS_APPLICATIONS.sheet);
  if (!sh) sh = ss.insertSheet(MPS_APPLICATIONS.sheet);
  if (sh.getLastRow() === 0) { sh.getRange(1,1,1,MPS_APPLICATIONS.headers.length).setValues([MPS_APPLICATIONS.headers]); sh.setFrozenRows(1); sh.setHiddenGridlines(true); }
  const actual = sh.getRange(1,1,1,MPS_APPLICATIONS.headers.length).getDisplayValues()[0];
  MPS_APPLICATIONS.headers.forEach(function(h,i){if(String(actual[i]||'').trim()!==h)throw new Error('Header sheet '+MPS_APPLICATIONS.sheet+' tidak sesuai pada kolom '+(i+1)+'.');});
  return sh;
}
function findMpsApplicationRow_(sh,ref) {
  if (!ref || sh.getLastRow()<2) return 0;
  const vals=sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0]).toUpperCase()===String(ref).toUpperCase()) return i+2;
  return 0;
}
function findMpsApplicationRowByMember_(sh,id) {
  if (!id || sh.getLastRow()<2) return 0;
  const vals=sh.getRange(2,9,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0]).toUpperCase()===String(id).toUpperCase()) return i+2;
  return 0;
}
function getMpsMemberLinksSheet_() {
  const ss=openDatabase_(); let sh=ss.getSheetByName(MPS_MEMBER_LINKS.sheet);
  if(!sh) sh=ss.insertSheet(MPS_MEMBER_LINKS.sheet);
  if(sh.getLastRow()===0){sh.getRange(1,1,1,MPS_MEMBER_LINKS.headers.length).setValues([MPS_MEMBER_LINKS.headers]);sh.setFrozenRows(1);sh.setHiddenGridlines(true);}
  const actual=sh.getRange(1,1,1,MPS_MEMBER_LINKS.headers.length).getDisplayValues()[0];
  MPS_MEMBER_LINKS.headers.forEach(function(h,i){if(String(actual[i]||'').trim()!==h)throw new Error('Header sheet '+MPS_MEMBER_LINKS.sheet+' tidak sesuai pada kolom '+(i+1)+'.');});
  return sh;
}
function createMemberTelegramLink_(memberId,applicationRef,onPrepared) {
  const sh=getMpsMemberLinksSheet_();
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'').slice(0,12);
  const now=new Date(),expires=new Date(now.getTime()+15*60*1000),hash=sha256_(token),linkRow=sh.getLastRow()+1;
  const prepared={token:token,row:linkRow};
  if(typeof onPrepared==='function')onPrepared(prepared);
  const values=[hash,now,expires,'Menunggu',memberId,applicationRef,'','','','', ''];
  sh.appendRow(values);
  const bot=PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_BOT_USERNAME')||'MPS_Notificationnew_bot';
  return {ok:true,token:token,row:linkRow,url:'https://t.me/'+bot.replace(/^@/,'')+'?start='+token,expiresAt:formatDateForClient_(expires),expiresIn:900};
}
function findMpsMemberLinkRow_(sh,hash) {
  if(sh.getLastRow()<2)return 0;const vals=sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++)if(String(vals[i][0])===hash)return i+2;return 0;
}
function expireOtherMemberLinks_(memberId,keepRow) {
  const sh=getMpsMemberLinksSheet_();if(sh.getLastRow()<2)return;
  const rows=sh.getRange(2,1,sh.getLastRow()-1,MPS_MEMBER_LINKS.headers.length).getValues();
  rows.forEach(function(r,i){const row=i+2;if(row!==keepRow&&String(r[4])===String(memberId)&&String(r[3])==='Menunggu')sh.getRange(row,4).setValue('Diganti');});
}

function expireOtherApplicationLinks_(applicationRef,keepRow) {
  const sh=getMpsMemberLinksSheet_();if(sh.getLastRow()<2)return;
  const rows=sh.getRange(2,1,sh.getLastRow()-1,MPS_MEMBER_LINKS.headers.length).getValues();
  rows.forEach(function(r,i){const row=i+2;if(row!==keepRow&&String(r[5]||'').toUpperCase()===String(applicationRef).toUpperCase()&&String(r[3])==='Menunggu')sh.getRange(row,4).setValue('Diganti');});
}

function apiCheckTelegramLink(token) {
  const t = String(token || '').trim();
  if (!/^[A-Fa-f0-9]{40,64}$/.test(t)) return { ok: false, verified: false };
  const tokenHash = sha256_(t);
  // Current v4.8.0 registrations store link state in MPS Member Telegram Links.
  // Check this source first; retain the legacy Telegram Links fallback below.
  const memberLinks = getMpsMemberLinksSheet_();
  const memberLinkRow = findMpsMemberLinkRow_(memberLinks, tokenHash);
  if (memberLinkRow) {
    const current = memberLinks.getRange(memberLinkRow, 1, 1, MPS_MEMBER_LINKS.headers.length).getValues()[0];
    const expires = current[2] instanceof Date ? current[2].getTime() : 0;
    if (current[3] === 'Terverifikasi' && expires > Date.now()) {
      return {ok:true,verified:true,username:String(current[8]||'')};
    }
    return {ok:true,verified:false,expired:!!expires&&expires<=Date.now(),consumed:current[3]!=='Menunggu'&&current[3]!=='Terverifikasi'};
  }
  const cache = CacheService.getScriptCache();
  const cached = cache.get('mps_tg_link_' + tokenHash);
  if (cached && cached.indexOf('VERIFIED:') === 0) {
    const parts = cached.slice(9).split(':');
    const expiry = Number(parts[0]);
    return expiry > Date.now() ? { ok: true, verified: true, username: parts[1] || '' } : { ok: true, verified: false, expired: true };
  }
  if (cached === 'CONSUMED') return { ok: true, verified: false, consumed: true };
  if (cached && cached.indexOf('PENDING:') === 0) {
    const expiry = Number(cached.slice(8));
    if (expiry && expiry <= Date.now()) return { ok: true, verified: false, expired: true };
    return { ok: true, verified: false };
  }
  const sheet = getTelegramLinksSheet_();
  const row = findTelegramLinkRow_(sheet, tokenHash);
  if (!row) return { ok: false, verified: false };
  const v = sheet.getRange(row, 1, 1, 9).getValues()[0];
  if (v[3] === 'Terverifikasi' && v[2] instanceof Date && v[2].getTime() > Date.now()) return { ok: true, verified: true, username: String(v[6] || '') };
  return { ok: true, verified: false, expired: v[2] instanceof Date && v[2].getTime() <= Date.now(), consumed: v[3] === 'Dipakai' };
}

/** API submit yang dipanggil dari Index.html melalui google.script.run. */
function apiSubmit(data) {
  return submitCore_(data || {});
}

function submitCore_(data) {
  data = data && typeof data === 'object' ? data : {};
  let lock = null;
  let uploadedFile = null;
  let proofLinkedToSheet = false;
  let result;
  let telegramMessage = '';
  let action = '';
  const requestId = cleanRequestId_(data.requestId);
  const cache = CacheService.getScriptCache();
  const replayPayload=Object.assign({},data);delete replayPayload.requestId;const requestFingerprint=sha256_(JSON.stringify(replayPayload));
  try {
    if (data.website) return { ok: true, ignored: true };
    if (requestId) {
      const prior = cache.get('mps_req_' + requestId);
      if (prior) { const saved=safeParseJson_(prior,null);if(!saved||saved.fingerprint!==requestFingerprint)throw new Error('Request ID sudah digunakan untuk data yang berbeda. Muat ulang formulir sebelum mencoba lagi.');const replay=saved.result||{};return {ok:!!replay.ok,replayed:true,status:replay.status||'Permintaan sebelumnya sudah diproses.',applicationRef:replay.applicationRef||'',memberId:replay.memberId||''}; }
    }
    action = String(data.action || '').toLowerCase();
    if (action !== 'register' && action !== 'deposit') throw new Error('Jenis permintaan tidak dikenal.');
    consumeRateLimit_('mps_submit_global_' + action, 600, MPS.submitWindowSeconds, 'Terlalu banyak pengiriman ke MPS. Coba lagi beberapa menit.');
    const throttleIdentity = action === 'register' ? String(data.telegram || (String(data.nickname||'')+'|'+String(data.country||'')) || 'registration') : String(data.applicationRef || 'deposit');
    const submitRateKey = 'submit_' + action + '_' + sha256_(throttleIdentity || 'unknown').slice(0, 20);
    consumeRateLimit_(submitRateKey, MPS.submitMaxAttempts, MPS.submitWindowSeconds, 'Terlalu banyak pengiriman untuk referensi ini. Coba lagi beberapa menit.');

    lock = LockService.getScriptLock();
    lock.waitLock(20000);
    if (requestId) {
      const afterLock = cache.get('mps_req_' + requestId);
      if (afterLock) { const saved=safeParseJson_(afterLock,null);if(!saved||saved.fingerprint!==requestFingerprint)throw new Error('Request ID sudah digunakan untuk data yang berbeda.');const replay=saved.result||{};return {ok:!!replay.ok,replayed:true,status:replay.status||'Permintaan sebelumnya sudah diproses.',applicationRef:replay.applicationRef||'',memberId:replay.memberId||''}; }
    }
    if (action === 'register') {
      const registration = registerMember_(null, data);
      result = registration.result;
      telegramMessage = registration.telegramMessage;
    } else {
      const sheet = getMemberSheet_();
      const deposit = saveDeposit_(sheet, data, function(file) { uploadedFile = file; }, function() {
        proofLinkedToSheet = true;
      });
      result = deposit.result;
      telegramMessage = deposit.telegramMessage;
    }
    if (result && result.ok) cache.remove('mps_public_dashboard_v480');
    if (requestId) {
      result.requestId = requestId;
      if (result.ok) cache.put('mps_req_' + requestId, JSON.stringify({fingerprint:requestFingerprint,result:{ok:true,status:result.status||'',applicationRef:result.applicationRef||'',memberId:result.memberId||''}}), MPS.requestCacheSeconds);
    }
  } catch (err) {
    let cleanupWarning='';
    if (uploadedFile && !proofLinkedToSheet && err.preserveProofFile!==true) {
      try { uploadedFile.setTrashed(true); } catch (cleanupErr) { cleanupWarning='File bukti privat mungkin masih tersimpan karena pembersihan otomatis gagal. Super Admin perlu memeriksa folder bukti.'; }
    } else if(uploadedFile&&err.preserveProofFile===true) cleanupWarning='File bukti dipertahankan dalam folder privat karena rollback database tidak lengkap. Super Admin wajib merekonsiliasi data sebelum percobaan ulang.';
    result = { ok: false, error: safeErrorMessage_(err)+(cleanupWarning?' '+cleanupWarning:'') };
    if (requestId) result.requestId = requestId;
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (ignored) {} }
  }
  // Telegram sengaja dikirim setelah lock dilepas agar proses database tidak terkunci lama.
  if (result && result.ok && telegramMessage) {
    const tg = sendTelegram_(telegramMessage);
    result.telegramNotified = !!tg.ok;
    if (!tg.ok) result.telegramWarning = 'Data tersimpan, tetapi notifikasi Telegram gagal dikirim.';
    if (requestId) {
      try { cache.put('mps_req_' + requestId, JSON.stringify({fingerprint:requestFingerprint,result:{ok:true,status:result.status||'',applicationRef:result.applicationRef||'',memberId:result.memberId||''}}), MPS.requestCacheSeconds); } catch (ignored) {}
    }
  }
  if(result&&result.ok){
    if(action==='register')recordMpsAudit_('PUBLIC','APPLICATION','REGISTRATION_SUBMITTED',result.applicationRef,'SUCCESS','Pendaftaran awal disimpan; belum ada Member ID dan tidak ada notifikasi Telegram admin.');
    else if(action==='deposit')recordMpsAudit_('PUBLIC','APPLICATION','DEPOSIT_SUBMITTED',result.applicationRef,'SUCCESS','Konfirmasi deposit dan bukti tersimpan; Member ID belum diterbitkan, tautan Telegram dibuat.');
  }
  return result || { ok: false, error: 'Permintaan tidak dapat diproses.' };
}

function registerMember_(sheet, data) {
  const nickname = clean_(data.nickname, 60);
  const telegram = normalizeTelegram_(data.telegram);
  const country = clean_(data.country, 60);
  const goal = clean_(data.goal, 100);
  const note = clean_(data.note, 500);
  if (!nickname || !country || !goal) throw new Error('Lengkapi nama panggilan, negara, dan tujuan bergabung.');
  if (telegram && !/^@[A-Za-z0-9_]{5,32}$/.test(telegram)) throw new Error('Username Telegram tidak valid.');
  const apps = getMpsApplicationsSheet_();
  if(telegram){
    const memberSheet=getMemberSheet_(),existingMember=findMemberRow_(memberSheet,telegram);
    if(existingMember)throw new Error('Username Telegram sudah terhubung dengan data member MPS. Hubungi admin jika perlu memperbarui pendaftaran.');
    if(apps.getLastRow()>1){const pending=apps.getRange(2,4,apps.getLastRow()-1,5).getDisplayValues();for(let i=0;i<pending.length;i++){const saved=normalizeTelegram_(pending[i][0]),status=String(pending[i][4]||'');if(saved&&saved.toLowerCase()===telegram.toLowerCase()&&!['Deposit Ditolak','Ditolak','Dibatalkan'].includes(status))throw new Error('Username Telegram sudah digunakan pada pengajuan MPS yang masih berjalan.');}}
  }
  const applicationRef = 'MPS-APP-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20).toUpperCase();
  const now = new Date();
  apps.appendRow([applicationRef, now, sheetText_(nickname), sheetText_(telegram), sheetText_(country),
    sheetText_(goal), sheetText_(note), 'Menunggu Deposit', '', '', 'Belum Terhubung', '', '', '', now]);
  return {
    result: { ok: true, applicationRef: applicationRef, status: 'Pendaftaran tersimpan. Silakan lanjutkan konfirmasi deposit menggunakan Application Ref ini.' },
    telegramMessage: ''
  };
}

function saveDeposit_(sheet, data, onFileCreated, onProofLinked) {
  const applicationRef=clean_(data.applicationRef,40).toUpperCase(),accountName=clean_(data.memberName,80),mt5=clean_(data.mt5Login,20),accountType=clean_(data.accountType,40),amount=Number(data.depositAmount),dateText=clean_(data.depositDate,10);
  if(!/^MPS-APP-[A-F0-9]{20}$/.test(applicationRef)||!accountName||!/^[0-9]{4,20}$/.test(mt5)||!accountType||!Number.isSafeInteger(amount)||amount<MPS.minDeposit||!validDate_(dateText))throw new Error('Data konfirmasi tidak valid. Periksa Application Ref, nama akun, login MT5, jenis akun, tanggal, dan minimum deposit Rp1.000.000.');
  const today=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd');if(dateText>today)throw new Error('Tanggal deposit tidak boleh berada di masa depan.');
  const apps=getMpsApplicationsSheet_(),appRow=findMpsApplicationRow_(apps,applicationRef);if(!appRow)throw new Error('Application Ref tidak ditemukan. Periksa kembali pendaftaran MPS.');
  const app=apps.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0],appStatus=String(app[7]||'');
  if(!['Menunggu Deposit','Deposit Ditolak'].includes(appStatus))throw new Error('Status pendaftaran tidak mengizinkan konfirmasi deposit atau pengajuan sudah diproses.');
  const deposits=getMpsDepositsSheet_(),existing=findMpsDepositRow_(deposits,applicationRef);
  if(existing){const old=deposits.getRange(existing,1,1,MPS_DEPOSITS.headers.length).getValues()[0];if(['Menunggu Telegram','Menunggu Validasi Admin','Disetujui','Menunggu Aktivasi','Berhasil'].includes(String(old[9]||'')))throw new Error('Konfirmasi deposit untuk Application Ref ini sudah tercatat.');}
  let mime=String(data.proofMimeType||'').toLowerCase().trim(),base64=String(data.proofBase64||'').trim(),match=base64.match(/^data:([^;,]+);base64,(.*)$/s);
  if(match){if(!mime)mime=match[1].toLowerCase();base64=match[2];}
  if(!/^image\/(jpeg|png|webp)$/.test(mime)||!base64||base64.length>7200000)throw new Error('Bukti harus JPG, PNG, atau WEBP maksimal 5 MB.');
  let bytes;try{bytes=Utilities.base64Decode(base64);}catch(e){throw new Error('File bukti tidak dapat dibaca. Unggah ulang gambar.');}
  if(!bytes||!bytes.length||bytes.length>MPS.maxProofBytes||!isValidImageSignature_(bytes,mime))throw new Error('Ukuran atau isi file bukti tidak valid.');
  const props=PropertiesService.getScriptProperties(),folderId=props.getProperty('MPS_PROOF_FOLDER_ID'),learningId=props.getProperty('MPS_LEARNING_FOLDER_ID');
  if(!folderId||folderId===learningId)throw new Error('Folder bukti belum dikonfigurasi secara terpisah dari folder Learning.');
  const folder=DriveApp.getFolderById(folderId);if(String(folder.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Folder bukti deposit tidak PRIVATE. Upload dihentikan.');
  const ext=mime==='image/jpeg'?'.jpg':mime==='image/png'?'.png':'.webp',file=folder.createFile(Utilities.newBlob(bytes,mime,'MPS-'+applicationRef+'-'+Utilities.getUuid()+ext));onFileCreated(file);
  file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
  if(String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Izin privat file bukti tidak dapat dipastikan.');
  const now=new Date(),depositDate=new Date(dateText+'T00:00:00'),fileUrl=file.getUrl();
  let link=null,oldDeposit=null,oldApp=app.slice(),oldLinkSnapshots=[];
  try{
    const row=[applicationRef,now,sheetText_(accountName),sheetText_(mt5),sheetText_(accountType),amount,depositDate,file.getId(),fileUrl,'Menunggu Telegram','','','',now];
    if(existing){oldDeposit=deposits.getRange(existing,1,1,MPS_DEPOSITS.headers.length).getValues()[0];deposits.getRange(existing,1,1,row.length).setValues([row]);}
    else deposits.appendRow(row);
    const linksBefore=getMpsMemberLinksSheet_();if(linksBefore.getLastRow()>1){const linkRows=linksBefore.getRange(2,1,linksBefore.getLastRow()-1,MPS_MEMBER_LINKS.headers.length).getValues();linkRows.forEach(function(v,i){if(String(v[5]||'').toUpperCase()===applicationRef&&String(v[3])==='Menunggu')oldLinkSnapshots.push({row:i+2,values:v.slice()});});}
    link=createMemberTelegramLink_('',applicationRef,function(prepared){link=prepared;});expireOtherApplicationLinks_(applicationRef,link.row);
    apps.getRange(appRow,8).setValue('Deposit Dikirim');apps.getRange(appRow,15).setValue(now);
    onProofLinked();
  }catch(err){
    const rollbackErrors=[];
    if(existing&&oldDeposit)try{deposits.getRange(existing,1,1,oldDeposit.length).setValues([oldDeposit]);}catch(e){rollbackErrors.push('baris deposit: '+safeErrorMessage_(e));}
    else {const dr=findMpsDepositRow_(deposits,applicationRef);if(dr)try{deposits.deleteRow(dr);}catch(e){rollbackErrors.push('baris deposit baru: '+safeErrorMessage_(e));}}
    try{apps.getRange(appRow,1,oldApp.length).setValues([oldApp]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
    if(link&&link.row)try{const links=getMpsMemberLinksSheet_();if(link.row<=links.getLastRow())links.getRange(link.row,4).setValue('Dibatalkan');}catch(e){rollbackErrors.push('tautan Telegram baru: '+safeErrorMessage_(e));}
    if(oldLinkSnapshots.length){let links=null;try{links=getMpsMemberLinksSheet_();}catch(e){rollbackErrors.push('sheet tautan Telegram: '+safeErrorMessage_(e));}if(links)for(let i=oldLinkSnapshots.length-1;i>=0;i--){const snap=oldLinkSnapshots[i];try{links.getRange(snap.row,1,1,snap.values.length).setValues([snap.values]);}catch(e){rollbackErrors.push('tautan Telegram lama baris '+snap.row+': '+safeErrorMessage_(e));}}}
    if(rollbackErrors.length){const failure=new Error('Penyimpanan deposit gagal: '+safeErrorMessage_(err)+'. Rollback tidak lengkap ('+rollbackErrors.join('; ')+'). File bukti tetap privat; lakukan rekonsiliasi sebelum percobaan ulang.');failure.preserveProofFile=true;throw failure;}
    throw err;
  }
  return {result:{ok:true,applicationRef:applicationRef,memberId:'',status:'Konfirmasi deposit tersimpan. Member ID baru diterbitkan setelah admin menyetujui pendaftaran.',telegramUrl:link.url,telegramExpiresAt:link.expiresAt},telegramMessage:''};
}

function setupMPSStorage_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('MPS_SPREADSHEET_ID');
  const proofFolderId = props.getProperty('MPS_PROOF_FOLDER_ID');
  if (!spreadsheetId || !proofFolderId) throw new Error('MPS_SPREADSHEET_ID atau MPS_PROOF_FOLDER_ID belum terisi.');
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(MPS.sheetName);
  if (!sheet) throw new Error('Sheet Database Member tidak ditemukan. Tidak ada sheet baru yang dibuat.');
  validateHeaders_(sheet);
  const proofFolder = DriveApp.getFolderById(proofFolderId);
  let learningFolderName = 'Belum dikonfigurasi';
  const learningFolderId = props.getProperty('MPS_LEARNING_FOLDER_ID');
  if (learningFolderId) {
    if (learningFolderId === proofFolderId) throw new Error('Folder Learning wajib terpisah dari folder bukti deposit.');
    learningFolderName = DriveApp.getFolderById(learningFolderId).getName();
  }
  return {
    ok: true,
    version: MPS.version,
    spreadsheetUrl: ss.getUrl(),
    proofFolderUrl: proofFolder.getUrl(),
    learningFolder: learningFolderName,
    memberRows: sheet.getLastRow()>1?sheet.getRange(2,MPS_COL.id,sheet.getLastRow()-1,1).getDisplayValues().filter(function(r){return /^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(String(r[0]||'').trim());}).length:0,
    summarySheetExists: !!ss.getSheetByName(MPS.summarySheetName)
  };
}

function getMemberSheet_() {
  const ss = openDatabase_();
  const sheet = ss.getSheetByName(MPS.sheetName);
  if (!sheet) throw new Error('Tab Database Member tidak ditemukan. Minta admin memeriksa spreadsheet dan Script Properties melalui editor Apps Script.');
  validateHeaders_(sheet);
  return sheet;
}

function openDatabase_() {
  const id=PropertiesService.getScriptProperties().getProperty('MPS_SPREADSHEET_ID');
  if(!id)throw new Error('MPS_SPREADSHEET_ID tidak ditemukan di Script Properties.');
  const file=DriveApp.getFileById(id);
  if(String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Database spreadsheet tidak PRIVATE. Akses API dihentikan sampai admin mengamankan file database.');
  return SpreadsheetApp.openById(id);
}

function validateHeaders_(sheet) {
  if (sheet.getLastRow() === 0) throw new Error('Database Member kosong; header lama tidak ditemukan. Tidak ada data yang diubah.');
  if (sheet.getLastColumn() < MPS.headers.length) throw new Error('Database Member belum memiliki seluruh 30 kolom yang diharapkan. Tidak ada data yang diubah.');
  const current = sheet.getRange(1, 1, 1, MPS.headers.length).getDisplayValues()[0];
  for (let i = 0; i < MPS.headers.length; i++) {
    if (String(current[i] || '').trim() !== MPS.headers[i]) {
      throw new Error('Header Database Member berbeda pada kolom ' + (i + 1) + '. Tidak ada data yang diubah.');
    }
  }
}

function findMemberRow_(sheet, telegram) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const target = normalizeTelegram_(telegram).replace(/^@/, '').toLowerCase();
  const values = sheet.getRange(2, MPS_COL.telegram, last - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeTelegram_(values[i][0]).replace(/^@/, '').toLowerCase() === target) return i + 2;
  }
  return 0;
}

function findMemberById_(sheet, memberId) {
  const id = clean_(memberId, 40).toUpperCase();
  const last = sheet.getLastRow();
  if (!id || last < 2) return 0;
  const values = sheet.getRange(2, MPS_COL.id, last - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) if (String(values[i][0]).trim().toUpperCase() === id) return i + 2;
  return 0;
}

function ensureUniqueMt5_(sheet, mt5, ownRow) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const values = sheet.getRange(2, MPS_COL.mt5, last - 1, 1).getDisplayValues();
  for (let i = 0; i < values.length; i++) {
    const row = i + 2;
    if (row !== ownRow && String(values[i][0] || '').trim() === mt5) {
      throw new Error('Login MT5 tersebut sudah tercatat pada member lain. Periksa kembali datanya.');
    }
  }
}

/** ADMIN API — role disimpan di Cache server, tidak pernah dipercaya dari browser. */
function getMpsDepositsSheet_() {
  const ss=openDatabase_();let sh=ss.getSheetByName(MPS_DEPOSITS.sheet);
  if(!sh){sh=ss.insertSheet(MPS_DEPOSITS.sheet);sh.getRange(1,1,1,MPS_DEPOSITS.headers.length).setValues([MPS_DEPOSITS.headers]);sh.setFrozenRows(1);sh.setHiddenGridlines(true);}
  if(sh.getLastRow()<1)sh.getRange(1,1,1,MPS_DEPOSITS.headers.length).setValues([MPS_DEPOSITS.headers]);
  const actual=sh.getRange(1,1,1,MPS_DEPOSITS.headers.length).getDisplayValues()[0];
  MPS_DEPOSITS.headers.forEach(function(h,i){if(String(actual[i]||'').trim()!==h)throw new Error('Header sheet '+MPS_DEPOSITS.sheet+' tidak sesuai pada kolom '+(i+1)+'.');});
  return sh;
}
function findMpsDepositRow_(sh,ref) {
  if(!ref||sh.getLastRow()<2)return 0;const values=sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues();
  for(let i=0;i<values.length;i++)if(String(values[i][0]||'').toUpperCase()===String(ref).toUpperCase())return i+2;return 0;
}
function activateMemberAfterPin_(memberId) {
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  let memberSheet=null,memberRow=0,memberBefore=null,apps=null,appRow=0,appSnapshot=null,depSheet=null,depRow=0,depSnapshot=null;
  try{
    memberSheet=getMemberSheet_();memberRow=findMemberById_(memberSheet,memberId);
    if(!memberRow)throw new Error('Data member tidak ditemukan saat aktivasi.');
    memberBefore=memberSheet.getRange(memberRow,1,1,MPS.headers.length).getValues()[0];
    if(String(memberBefore[MPS_COL.depositStatus-1])!=='Disetujui')throw new Error('Deposit belum disetujui; aktivasi ditolak.');
    if(PropertiesService.getScriptProperties().getProperty('MPS_PIN_DELIVERED_'+memberId)!=='1')throw new Error('Pengiriman PIN belum terkonfirmasi.');
    const memberApplicationRef=String(memberBefore[24]||'');
    const existingApplicationSheet=openDatabase_().getSheetByName(MPS_APPLICATIONS.sheet);
    if(existingApplicationSheet){apps=getMpsApplicationsSheet_();appRow=findMpsApplicationRowByMember_(apps,memberId);}
    if(memberApplicationRef&&!appRow)throw new Error('Data aplikasi member tidak ditemukan; aktivasi dibatalkan tanpa mengubah status member.');
    if(appRow){
      appSnapshot=apps.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];
      if(String(appSnapshot[8]||'')!==memberId)throw new Error('Relasi aplikasi dan member tidak cocok; aktivasi dibatalkan.');
      if(!['Menunggu Aktivasi','Berhasil'].includes(String(appSnapshot[7]||'')))throw new Error('Status aplikasi tidak mengizinkan aktivasi member.');
      const applicationRef=String(appSnapshot[0]||memberApplicationRef);
      if(memberApplicationRef&&applicationRef!==memberApplicationRef)throw new Error('Application Ref pada database dan sheet aplikasi tidak cocok.');
      if(applicationRef){
        depSheet=getMpsDepositsSheet_();depRow=findMpsDepositRow_(depSheet,applicationRef);
        if(!depRow&&memberApplicationRef)throw new Error('Data deposit tidak ditemukan; aktivasi dibatalkan tanpa mengubah status member.');
        if(depRow){
          depSnapshot=depSheet.getRange(depRow,1,1,MPS_DEPOSITS.headers.length).getValues()[0];
          if(!['Menunggu Aktivasi','Menunggu Validasi Admin','Disetujui','Berhasil'].includes(String(depSnapshot[9]||'')))throw new Error('Status deposit tidak mengizinkan aktivasi member.');
        }
      }
    }
    const now=new Date(),memberNext=memberBefore.slice();
    memberNext[MPS_COL.registrationStatus-1]='Berhasil';memberNext[17]=now;
    memberNext[21]=PropertiesService.getScriptProperties().getProperty(pinPropertyKey_(memberId))||'';
    memberNext[22]=now;
    if(!['Aktif','Undangan Dikirim'].includes(String(memberNext[29]||'')))memberNext[29]='Menunggu Undangan';
    try{
      memberSheet.getRange(memberRow,1,1,MPS.headers.length).setValues([memberNext]);
      if(appRow){apps.getRange(appRow,8).setValue('Berhasil');apps.getRange(appRow,15).setValue(now);}
      if(depRow){depSheet.getRange(depRow,10).setValue('Berhasil');depSheet.getRange(depRow,14).setValue(now);}
    }catch(writeErr){
      const rollbackErrors=[];
      if(depRow&&depSnapshot)try{depSheet.getRange(depRow,1,1,depSnapshot.length).setValues([depSnapshot]);}catch(e){rollbackErrors.push('deposit: '+safeErrorMessage_(e));}
      if(appRow&&appSnapshot)try{apps.getRange(appRow,1,1,appSnapshot.length).setValues([appSnapshot]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
      if(memberRow&&memberBefore)try{memberSheet.getRange(memberRow,1,1,MPS.headers.length).setValues([memberBefore]);}catch(e){rollbackErrors.push('member: '+safeErrorMessage_(e));}
      if(rollbackErrors.length)throw new Error('Aktivasi gagal dan rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Hentikan pemrosesan ulang dan lakukan rekonsiliasi manual.');
      throw writeErr;
    }
    CacheService.getScriptCache().remove('mps_public_dashboard_v480');
    return true;
  }finally{lock.releaseLock();}
}

function apiAdminLogin(roleOrPassword, maybePassword) {
  const role = maybePassword === undefined ? 'ADMIN' : String(roleOrPassword || '').toUpperCase();
  const supplied = String(maybePassword === undefined ? roleOrPassword : maybePassword || '');
  if (!['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Jenis akun administrator tidak valid.');
  const propertyKey = role === 'SUPER_ADMIN' ? 'MPS_SUPER_ADMIN_TOKEN' : 'MPS_ADMIN_TOKEN';
  const allProps=PropertiesService.getScriptProperties(),expected=allProps.getProperty(propertyKey)||'',adminToken=allProps.getProperty('MPS_ADMIN_TOKEN')||'',superToken=allProps.getProperty('MPS_SUPER_ADMIN_TOKEN')||'';
  if(adminToken&&superToken&&constantTimeEquals_(adminToken,superToken))throw new Error('Kredensial Admin dan Super Admin harus berbeda. Minta Super Admin mengganti salah satunya.');
  const key = 'mps_admin_login_' + role;
  if (!expected || !constantTimeEquals_(expected, supplied)) {
    consumeRateLimit_(key, MPS.adminMaxAttempts, MPS.adminWindowSeconds, 'Terlalu banyak percobaan login. Coba lagi 15 menit.');
    throw new Error(role === 'SUPER_ADMIN' && !expected ? 'Akun Super Admin belum diaktifkan. Atur MPS_SUPER_ADMIN_TOKEN pada Script Properties terlebih dahulu.' : 'Login administrator gagal. Periksa jenis akun dan kata sandi.');
  }
  CacheService.getScriptCache().remove(key);
  const session = Utilities.getUuid() + Utilities.getUuid();
  const sessionData = {role:role,actorId:role,credentialHash:sha256_(expected).slice(0,32),createdAt:new Date().toISOString()};
  CacheService.getScriptCache().put('mps_admin_' + sha256_(session), JSON.stringify(sessionData), MPS.sessionSeconds);
  recordMpsAudit_(role,role,'ADMIN_LOGIN','CONTROL_ROOM','SUCCESS',role+' berhasil membuka sesi.');
  return {ok:true,session:session,role:role,actorId:role,expiresIn:MPS.sessionSeconds};
}

function getAdminSession_(session) {
  const s=String(session||'');
  if(!s) throw new Error('Sesi admin berakhir. Silakan login kembali.');
  const stored=CacheService.getScriptCache().get('mps_admin_'+sha256_(s));
  if(!stored) throw new Error('Sesi admin berakhir atau kredensial admin telah diperbarui. Silakan login kembali.');
  const props=PropertiesService.getScriptProperties();
  let data=null;
  try { data=JSON.parse(stored); } catch(ignore) {}
  // Kompatibilitas aman untuk sesi Admin lama yang dibuat sebelum pemisahan role.
  if(!data || !data.role) {
    const legacy=props.getProperty('MPS_ADMIN_TOKEN')||'';
    if(legacy && constantTimeEquals_(stored,sha256_(legacy).slice(0,32))) return {role:'ADMIN',actorId:'ADMIN'};
    throw new Error('Sesi admin tidak valid. Silakan login kembali.');
  }
  if(!['ADMIN','SUPER_ADMIN'].includes(data.role)) throw new Error('Role sesi administrator tidak valid.');
  const propertyKey=data.role==='SUPER_ADMIN'?'MPS_SUPER_ADMIN_TOKEN':'MPS_ADMIN_TOKEN';
  const expected=props.getProperty(propertyKey)||'';
  if(!expected || !constantTimeEquals_(data.credentialHash,sha256_(expected).slice(0,32))) throw new Error('Sesi admin berakhir atau kredensial admin telah diperbarui. Silakan login kembali.');
  return {role:data.role,actorId:data.actorId||data.role};
}
function adminRole_(session) { return getAdminSession_(session).role; }
function adminActorRef_(session) { return getAdminSession_(session).actorId; }
function requireAdmin_(session) { return getAdminSession_(session); }
function requireSuperAdmin_(session) {
  const info=getAdminSession_(session);
  if(info.role!=='SUPER_ADMIN') throw new Error('Akses ditolak. Tindakan ini hanya tersedia untuk Super Admin.');
  return info;
}

function apiAdminLogout(session) {
  if(session) {
    const key='mps_admin_'+sha256_(String(session));
    if(CacheService.getScriptCache().get(key)) {
      try { const info=getAdminSession_(session);recordMpsAudit_(info.role,info.actorId,'ADMIN_LOGOUT','CONTROL_ROOM','SUCCESS','Administrator menutup sesi.'); } catch(ignore) {}
    }
    CacheService.getScriptCache().remove(key);
  }
  return {ok:true};
}

/** Data Control Room: antrean registrasi, antrean deposit, dan riwayat member. */
function apiAdminList(session) {
  requireAdmin_(session);
  const sheet=getMemberSheet_(),apps=getMpsApplicationsSheet_(),depositsSheet=getMpsDepositsSheet_(),vip=getTelegramAccessSheet_();
  const appRows=apps.getLastRow()>1?apps.getRange(2,1,apps.getLastRow()-1,MPS_APPLICATIONS.headers.length).getValues().filter(a=>/^MPS-APP-[A-F0-9]{20}$/.test(String(a[0]||''))):[];
  const appByRef={},registrations=[];
  appRows.forEach(a=>{const ref=String(a[0]||''),item={applicationRef:ref,registeredAt:formatDateForClient_(a[1]),nickname:String(a[2]||''),telegram:String(a[3]||''),country:String(a[4]||''),goal:String(a[5]||''),adminNote:String(a[13]||''),status:String(a[7]||''),memberId:String(a[8]||''),telegramStatus:String(a[10]||'Belum Terhubung')};appByRef[ref]=item;if(['Menunggu Deposit','Deposit Ditolak'].includes(item.status))registrations.push(item);});
  const accessById={};if(vip.getLastRow()>1)vip.getRange(2,1,vip.getLastRow()-1,11).getValues().forEach((a,i)=>{const id=String(a[0]||'').toUpperCase();if(id)accessById[id]={row:i+2,data:a};});
  const deposits=[];if(depositsSheet.getLastRow()>1){depositsSheet.getRange(2,1,depositsSheet.getLastRow()-1,MPS_DEPOSITS.headers.length).getValues().forEach(d=>{
    const ref=String(d[0]||''),app=appByRef[ref];if(!app||!['Menunggu Telegram','Menunggu Validasi Admin'].includes(String(d[9]||'')))return;
    const access=accessById[ref.toUpperCase()];
    deposits.push({applicationRef:ref,memberId:ref,issuedMemberId:'',registeredAt:app.registeredAt,nickname:app.nickname,telegram:app.telegram,country:app.country,goal:app.goal,accountName:String(d[2]||''),mt5Login:String(d[3]||''),accountType:String(d[4]||''),amount:Number(d[5]||0),depositDate:formatDateForClient_(d[6]),proofUrl:String(d[8]||''),depositStatus:String(d[9]||''),registrationStatus:String(app.status||''),adminNote:String(d[12]||app.adminNote||''),telegramStatus:access?'Terverifikasi':'Belum Terhubung',vipStatus:access?String(access.data[6]||'Menunggu'):'Belum terhubung'});
  });}
  const history=[],last=sheet.getLastRow(),rows=last>1?sheet.getRange(2,1,last-1,MPS.headers.length).getValues():[];
  rows.forEach((r,i)=>{const id=String(r[MPS_COL.id-1]||'').trim();if(!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(id))return;
    const appRef=String(r[24]||''),app=appByRef[appRef]||{},access=accessById[id.toUpperCase()];
    const member={row:i+2,applicationRef:appRef,memberId:id,registeredAt:formatDateForClient_(r[1]),nickname:String(r[2]||''),telegram:String(r[3]||''),country:String(r[4]||''),goal:String(r[5]||''),registrationStatus:String(r[7]||''),accountName:String(r[8]||''),mt5Login:String(r[9]||''),accountType:String(r[10]||''),amount:Number(r[11]||0),depositDate:formatDateForClient_(r[12]),proofUrl:String(r[13]||''),depositStatus:String(r[14]||''),adminNote:String(r[15]||''),confirmedAt:formatDateForClient_(r[16]),updatedAt:formatDateForClient_(r[17]),telegramStatus:access?'Terverifikasi':'Belum Terhubung',vipStatus:access?String(access.data[6]||'Menunggu'):'Belum terhubung'};
    history.push(member);if(member.depositStatus==='Menunggu verifikasi')deposits.push(member);
  });
  registrations.reverse();deposits.reverse();history.reverse();
  return {ok:true,registrations:registrations,deposits:deposits,members:deposits,history:history,totalMembers:history.length,totalApplications:appRows.length};
}

function apiAdminTelegramSetup(session) {
  requireSuperAdmin_(session);
  try {
    const result = setupTelegram_();
    return { ok: true, message: result.message || 'Telegram berhasil terhubung.' };
  } catch (err) {
    const detail = String(err && err.message || err || '');
    let message = safeErrorMessage_(err);
    if (/MPS_TELEGRAM_BOT_TOKEN|Token bot/i.test(detail)) {
      message = 'Token bot belum tersimpan dengan benar. Periksa Script Properties; jangan bagikan token kepada siapa pun.';
    } else if (/webhook|Conflict/i.test(detail)) {
      message = 'Webhook Telegram belum dapat diaktifkan. Periksa URL Web App dan konfigurasi Telegram.';
    } else if (/Buka bot MPS|Chat ID/i.test(detail)) {
      message = 'Chat ID belum ditemukan. Buka bot MPS, kirim /start, lalu coba hubungkan kembali.';
    }
    return { ok: false, message: message };
  }
}

/** Tampilkan kandidat grup Telegram; kandidat belum dipercaya sebelum dikonfirmasi admin. */
function apiAdminGetTelegramCandidate(session) {
  requireSuperAdmin_(session);
  const props = PropertiesService.getScriptProperties();
  return {
    ok: true,
    candidateId: String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_ID') || ''),
    candidateTitle: String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_TITLE') || ''),
    configuredVipChatId: String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID') || '')
  };
}

/** Hanya admin yang dapat mengaktifkan kandidat; ID harus sama dengan kandidat webhook terbaru. */
function apiAdminConfirmVipChat(session, candidateId) {
  requireSuperAdmin_(session);
  const id = String(candidateId || '').trim();
  if (!/^-?\d+$/.test(id)) throw new Error('ID grup kandidat tidak valid.');
  const props = PropertiesService.getScriptProperties();
  const candidate = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_ID') || '');
  const title = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_TITLE') || '').trim().toLowerCase();
  if (!candidate || candidate !== id || title !== 'mps vip community') throw new Error('Kandidat grup berubah atau tidak cocok. Kirim ulang /start dari grup resmi.');
  const token = props.getProperty('MPS_TELEGRAM_BOT_TOKEN');
  if (!token || token.indexOf(':') < 1) throw new Error('Token bot belum dikonfigurasi.');
  const base = 'https://api.telegram.org/bot' + token + '/';
  const chatResp = UrlFetchApp.fetch(base + 'getChat', { method: 'post', payload: { chat_id: id }, muteHttpExceptions: true });
  const chatData = parseTelegramResponse_(chatResp);
  if (!chatData.ok || !chatData.result || !['group','supergroup'].includes(String(chatData.result.type || '')) || String(chatData.result.title || '').trim().toLowerCase() !== 'mps vip community') {
    throw new Error('Telegram tidak mengonfirmasi bahwa kandidat ini adalah grup MPS VIP Community.');
  }
  const meResp = UrlFetchApp.fetch(base + 'getMe', { muteHttpExceptions: true });
  const meData = parseTelegramResponse_(meResp);
  if (!meData.ok || !meData.result || !meData.result.id) throw new Error('Identitas bot tidak dapat diverifikasi.');
  const memberResp = UrlFetchApp.fetch(base + 'getChatMember', { method: 'post', payload: { chat_id: id, user_id: String(meData.result.id) }, muteHttpExceptions: true });
  const memberData = parseTelegramResponse_(memberResp);
  const botStatus = memberData.ok && memberData.result ? String(memberData.result.status || '') : '';
  if (botStatus === 'administrator' && memberData.result.can_invite_users !== true) throw new Error('Bot belum memiliki izin Invite Users di grup VIP.');
  if (botStatus === 'administrator' && memberData.result.can_restrict_members !== true) throw new Error('Bot belum memiliki izin Restrict Members untuk memverifikasi join request VIP.');
  if (botStatus !== 'administrator' && botStatus !== 'creator') throw new Error('Bot harus menjadi admin atau pemilik grup VIP.');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const latestCandidate = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_ID') || '');
    const latestTitle = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_TITLE') || '').trim().toLowerCase();
    if (latestCandidate !== id || latestTitle !== 'mps vip community') throw new Error('Kandidat grup berubah saat konfirmasi. Periksa ulang dari panel admin.');
    props.setProperty('MPS_TELEGRAM_VIP_CHAT_ID', id);
    props.deleteProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_ID');
    props.deleteProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_TITLE');
  } finally { lock.releaseLock(); }
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'VIP_GROUP_CONFIGURED',id,'SUCCESS','Grup VIP dikonfirmasi dan izin bot diperiksa.');
  return { ok: true, message: 'ID grup VIP dikonfirmasi dan diaktifkan.' };
}

/** Kirim ulang notifikasi pendaftaran yang sebelumnya gagal, tanpa membuat baris member baru. */
function apiAdminResendRegistrationNotice(session, memberId) {
  requireAdmin_(session);
  const memberKey = clean_(memberId, 40).toUpperCase();
  if (!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(memberKey)) throw new Error('ID Member tidak valid.');
  consumeRateLimit_('mps_reg_notice_' + sha256_(memberKey).slice(0, 24), 3, MPS.adminWindowSeconds, 'Notifikasi untuk member ini terlalu sering dikirim. Coba lagi 15 menit.');
  const sheet = getMemberSheet_();
  const row = findMemberById_(sheet, memberKey);
  if (!row) throw new Error('Data member tidak ditemukan.');
  const r = sheet.getRange(row, 1, 1, MPS.headers.length).getValues()[0];
  if (String(r[MPS_COL.depositStatus - 1] || '') !== 'Menunggu verifikasi' && String(r[MPS_COL.depositStatus - 1] || '') !== 'Disetujui') {
    throw new Error('Arsip Telegram hanya dikirim setelah konfirmasi deposit diterima.');
  }
  const message = '💳 ARSIP KONFIRMASI DEPOSIT MPS\nNama: ' + r[MPS_COL.nickname - 1] +
    '\nTelegram: ' + r[MPS_COL.telegram - 1] + '\nNegara: ' + r[MPS_COL.country - 1] +
    '\nTujuan: ' + r[MPS_COL.goal - 1] + '\nID Member: ' + memberKey +
    '\nStatus: ' + r[MPS_COL.registrationStatus - 1];
  const result = sendTelegram_(message);
  return { ok: !!result.ok, message: result.ok ? 'Notifikasi pendaftaran berhasil dikirim ulang.' : (result.error || 'Notifikasi gagal dikirim.') };
}

function validateProofFileForApproval_(proofUrl) {
  const url=String(proofUrl||'').trim(),match=url.match(/^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{15,})/i);
  if(!match)throw new Error('Bukti deposit tidak memiliki tautan Google Drive yang valid. Admin tidak dapat menyetujui deposit tanpa bukti.');
  const proofFolderId=String(PropertiesService.getScriptProperties().getProperty('MPS_PROOF_FOLDER_ID')||''),learningFolderId=String(PropertiesService.getScriptProperties().getProperty('MPS_LEARNING_FOLDER_ID')||'');
  if(!proofFolderId||proofFolderId===learningFolderId)throw new Error('Folder bukti deposit belum dikonfigurasi terpisah dari folder Learning.');
  const folder=DriveApp.getFolderById(proofFolderId);if(String(folder.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Folder bukti deposit tidak PRIVATE. Amankan folder sebelum menyetujui member.');
  const file=DriveApp.getFileById(match[1]);if(file.isTrashed()||file.getSize()>MPS.maxProofBytes||!/^image\/(jpeg|png|webp)$/.test(String(file.getMimeType()||'')))throw new Error('File bukti deposit tidak tersedia, terlalu besar, atau formatnya tidak sesuai.');
  if(String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('File bukti deposit tidak PRIVATE. Admin harus mengamankan file sebelum menyetujui member.');
  let inFolder=false,parents=file.getParents();while(parents.hasNext())if(parents.next().getId()===proofFolderId)inFolder=true;
  if(!inFolder)throw new Error('File bukti tidak berada di folder bukti deposit yang dikonfigurasi.');
  return {fileId:file.getId(),name:file.getName(),size:file.getSize()};
}

function adminVerifyLegacy_(session, memberId, decision, adminNote) {
  requireAdmin_(session);
  const action=String(decision||'').toLowerCase();
  if(action!=='approve'&&action!=='reject')throw new Error('Keputusan verifikasi tidak valid.');
  const memberKey=clean_(memberId,40).toUpperCase(),note=clean_(adminNote,500);
  let memberChatId='',pin='',telegramMessage='',result;
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  let sheet=null,row=0,current=null,appSheet=null,appRow=0,appCurrent=null,accessSheet=null,accessRow=0,accessCurrent=null,accessWritten=false,dbWritten=false,appWritten=false;
  try{
    sheet=getMemberSheet_();row=findMemberById_(sheet,memberKey);
    if(!row)throw new Error('Data member tidak ditemukan.');
    current=sheet.getRange(row,1,1,MPS.headers.length).getValues()[0];
    if(String(current[MPS_COL.depositStatus-1]||'')!=='Menunggu verifikasi')throw new Error('Deposit ini sudah diproses atau tidak lagi menunggu verifikasi.');
    if(action==='approve')validateProofFileForApproval_(current[MPS_COL.proofUrl-1]);
    accessSheet=getTelegramAccessSheet_();accessRow=findTelegramAccessByMemberId_(accessSheet,memberKey);
    if(accessRow)accessCurrent=accessSheet.getRange(accessRow,1,1,11).getValues()[0];
    if(action==='approve'){
      if(!accessRow)throw new Error('Member belum menghubungkan Telegram. Verifikasi Telegram wajib sebelum persetujuan.');
      const av=accessCurrent;
      memberChatId=String(av[2]||'');const memberTelegramId=String(av[1]||'');
      if(!memberChatId||!memberTelegramId||memberChatId!==memberTelegramId)throw new Error('Data Telegram member belum lengkap atau tidak cocok.');
    }
    appSheet=getMpsApplicationsSheet_();appRow=findMpsApplicationRowByMember_(appSheet,memberKey);
    if(!appRow)throw new Error('Application Ref terkait member tidak ditemukan.');
    if(action==='approve'&&String(appSheet.getRange(appRow,11).getDisplayValue()||'')!=='Terverifikasi')throw new Error('Verifikasi Telegram belum tercatat pada aplikasi ini.');
    appCurrent=appSheet.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];
    const amount=Number(current[MPS_COL.amount-1]||0);
    if(action==='approve'&&(!Number.isSafeInteger(amount)||amount<MPS.minDeposit))throw new Error('Deposit tidak memenuhi minimum Rp1.000.000.');
    const now=new Date(),block=current.slice(MPS_COL.registrationStatus-1,MPS_COL.updatedAt);
    block[0]=action==='approve'?'Menunggu Aktivasi':'Ditolak';block[7]=action==='approve'?'Disetujui':'Ditolak';block[8]=sheetText_(note);block[9]=now;block[10]=now;
    dbWritten=true;sheet.getRange(row,MPS_COL.registrationStatus,1,block.length).setValues([block]);
    const appBlock=appCurrent.slice(7,15);
    appBlock[0]=action==='approve'?'Menunggu Aktivasi':'Deposit Ditolak';appBlock[6]=sheetText_(note);appBlock[7]=now;
    appWritten=true;appSheet.getRange(appRow,8,1,8).setValues([appBlock]);
    if(action==='reject'&&accessRow){accessWritten=true;accessSheet.getRange(accessRow,7).setValue('Akses Ditolak');}
    if(action==='approve'){
      pin=generatePin_();
      CacheService.getScriptCache().put('mps_pin_pending_'+sha256_(memberKey).slice(0,24),JSON.stringify({pin:pin,createdAt:Date.now()}),600);
      telegramMessage='✅ DEPOSIT MEMBER MPS DISETUJUI\nID: '+memberKey+'\nNama: '+current[MPS_COL.nickname-1]+'\nPersetujuan admin tersimpan. Status aktivasi bergantung pada konfirmasi pengiriman PIN.';
      result={ok:true,status:'Member berhasil diverifikasi. PIN dan undangan VIP sedang dikirim langsung ke Telegram member.',memberId:memberKey};
    }else{
      telegramMessage='❌ DEPOSIT MEMBER MPS DITOLAK\nID: '+memberKey+'\nNama: '+current[MPS_COL.nickname-1]+(note?'\nCatatan: '+note:'');
      result={ok:true,status:'Deposit ditolak.'};
    }
    try{formatMemberRow_(sheet,row);}catch(e){console.error('Format row verification: '+safeErrorMessage_(e));}
    CacheService.getScriptCache().remove('mps_public_dashboard_v480');
  }catch(err){
    const rollbackErrors=[];
    if(accessWritten&&accessCurrent)try{accessSheet.getRange(accessRow,1,1,11).setValues([accessCurrent]);}catch(e){rollbackErrors.push('akses Telegram: '+safeErrorMessage_(e));}
    if(appWritten&&appCurrent)try{appSheet.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).setValues([appCurrent]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
    if(dbWritten&&current)try{sheet.getRange(row,1,1,MPS.headers.length).setValues([current]);}catch(e){rollbackErrors.push('member: '+safeErrorMessage_(e));}
    if(rollbackErrors.length)throw new Error('Verifikasi member gagal: '+safeErrorMessage_(err)+'. Rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Hentikan pemrosesan ulang dan lakukan rekonsiliasi manual.');
    throw err;
  }finally{lock.releaseLock();}
  let auditResult='SUCCESS';
  let auditDetails=action==='approve'?'Persetujuan deposit tersimpan; akun masih Menunggu Aktivasi sampai pengiriman PIN terkonfirmasi.':'Penolakan deposit berhasil disimpan.';
  if(action==='approve'&&result&&result.ok){
    let pinDm={ok:false,error:'Telegram tidak dapat dihubungi.'};
    try{pinDm=telegramSendToChat_(memberChatId,'🔐 PIN AKSES MPS\nID Member: '+memberKey+'\nPIN: '+pin+'\nJangan bagikan PIN ini kepada siapa pun.');}
    catch(sendErr){pinDm={ok:false,error:safeErrorMessage_(sendErr)};}
    let pinStored=false,pinStorageError='';
    if(pinDm.ok){try{storeMemberPin_(memberKey,pin);pinStored=true;}catch(storeErr){pinStorageError=safeErrorMessage_(storeErr);}}
    let pinCurrent=false,pinMarkError='';
    if(pinStored){try{pinCurrent=markPinDeliveredIfCurrent_(memberKey,pin);}catch(markErr){pinMarkError=safeErrorMessage_(markErr);}}
    result.pinDelivered=!!pinCurrent;
    if(pinCurrent){try{activateMemberAfterPin_(memberKey);}catch(activeErr){pinCurrent=false;result.pinWarning='PIN terkirim tetapi status aktivasi belum tersimpan. Admin perlu mengirim ulang PIN.';auditResult='PARTIAL';auditDetails+=' Aktivasi database gagal: '+safeErrorMessage_(activeErr);}}
    if(pinCurrent)CacheService.getScriptCache().remove('mps_pin_pending_'+sha256_(memberKey).slice(0,24));
    if(pinCurrent){result.status='Member aktif. PIN berhasil dikirim dan disimpan.';auditDetails='Persetujuan deposit tersimpan dan PIN berhasil dikirim; status member Berhasil.';
      let invite;try{invite=sendVipInvite_(memberKey);}catch(inviteErr){invite={ok:false,error:safeErrorMessage_(inviteErr)};}
      result.vipInviteSent=!!invite.ok;
      if(!invite.ok){result.vipInviteWarning=invite.error||'Undangan VIP belum dapat dikirim.';auditResult='PARTIAL';auditDetails+=' PIN tersimpan dan terkirim; undangan VIP belum berhasil dikirim.';}
    }else{
      result.status='Persetujuan tersimpan; status member Menunggu Aktivasi sampai PIN berhasil dikirim dan dikonfirmasi.';
      result.vipInviteSent=false;
      if(pinDm.ok&&!result.pinWarning){
        result.pinWarning='PIN terkirim ke Telegram, tetapi penyimpanan/konfirmasi PIN gagal. Member jangan login dahulu; admin perlu memeriksa dan menerbitkan ulang PIN.';
        auditDetails+=' PIN DM terkirim, tetapi penyimpanan atau konfirmasi PIN gagal.'+(pinStorageError?' Detail: '+pinStorageError:'')+(pinMarkError?' Detail: '+pinMarkError:'');
      }else{
        result.pinWarning='Pengiriman PIN gagal. PIN sebelumnya tetap berlaku; undangan VIP ditahan sampai PIN berhasil dikirim.';
        auditDetails+=' Status database sudah disetujui, tetapi pengiriman PIN gagal; undangan VIP ditahan.';
      }
      auditResult='PARTIAL';
    }
  }
  if(telegramMessage){
    let tg={ok:false};try{tg=sendTelegram_(telegramMessage);}catch(tgErr){console.error('Admin archive notification: '+safeErrorMessage_(tgErr));}
    if(!tg.ok){result.telegramWarning='Perubahan tersimpan, tetapi notifikasi arsip admin gagal dikirim.';auditResult='PARTIAL';auditDetails+=' Notifikasi arsip admin gagal dikirim.';}
  }
  if(!recordMpsAudit_(adminRole_(session),adminActorRef_(session),action==='approve'?'MEMBER_APPROVED':'MEMBER_REJECTED',memberKey,auditResult,auditDetails))result.auditWarning='Perubahan tersimpan, tetapi audit log gagal ditulis. Super Admin perlu memeriksa MPS Audit Logs.';
  return result;
}



function apiAdminVerify(session, applicationRefOrMemberId, decision, adminNote) {
  requireAdmin_(session);
  const key=clean_(applicationRefOrMemberId,48).toUpperCase(),action=String(decision||'').toLowerCase(),note=clean_(adminNote,500);
  if(!['approve','reject'].includes(action))throw new Error('Keputusan verifikasi tidak valid.');
  if(/^MPS-APP-[A-F0-9]{20}$/.test(key))return adminVerifyApplication_(session,key,action,note);
  return adminVerifyLegacy_(session,key,action,note);
}
function adminVerifyApplication_(session,applicationRef,action,note) {
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  let memberId='',chatId='',nickname='',telegramMessage='',createdRow=0,depositRow=0,appRow=0,db=null,apps=null,ds=null,appSnapshot=null,depositSnapshot=null,access=null,accessRow=0,accessSnapshot=null,rejectedLinks=null,rejectedLinkSnapshots=[],rejectedAccess=null,rejectedAccessRow=0,rejectedAccessSnapshot=null;
  try{
    apps=getMpsApplicationsSheet_();appRow=findMpsApplicationRow_(apps,applicationRef);if(!appRow)throw new Error('Application Ref tidak ditemukan.');
    const app=apps.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];appSnapshot=app.slice();if(!['Deposit Dikirim','Menunggu Validasi Admin'].includes(String(app[7]||'')))throw new Error('Status aplikasi tidak mengizinkan approval deposit.');
    ds=getMpsDepositsSheet_();depositRow=findMpsDepositRow_(ds,applicationRef);if(!depositRow)throw new Error('Data konfirmasi deposit tidak ditemukan.');
    const dep=ds.getRange(depositRow,1,1,MPS_DEPOSITS.headers.length).getValues()[0];depositSnapshot=dep.slice();
    if(!['Menunggu Telegram','Menunggu Validasi Admin'].includes(String(dep[9]||'')))throw new Error('Pengajuan deposit sudah diproses atau tidak lagi menunggu verifikasi.');
    if(action==='approve'){
      if(String(app[10]||'')!=='Terverifikasi')throw new Error('Telegram pendaftar belum terverifikasi.');
      if(!dep[10]||!dep[11]||String(dep[10])!==String(dep[11])||String(app[11]||'')!==String(dep[10])||String(app[12]||'')!==String(dep[11]))throw new Error('Identitas Telegram belum cocok dengan catatan aplikasi dan chat pribadi bot.');
      const proofCheck=validateProofFileForApproval_(dep[8]);if(!dep[7]||String(proofCheck.fileId)!==String(dep[7]))throw new Error('File bukti deposit tidak cocok dengan ID file yang tersimpan pada pengajuan.');
      const amount=Number(dep[5]||0);if(!Number.isSafeInteger(amount)||amount<MPS.minDeposit)throw new Error('Deposit tidak memenuhi minimum Rp1.000.000.');
      db=getMemberSheet_();ensureUniqueMt5_(db,String(dep[3]||''),0);
      memberId='MPS-'+Utilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase();if(findMemberById_(db,memberId))throw new Error('Terjadi benturan ID Member. Ulangi persetujuan.');
      access=getTelegramAccessSheet_();accessRow=findTelegramAccessByMemberId_(access,applicationRef);if(!accessRow)throw new Error('Relasi Telegram pendaftar tidak ditemukan.');accessSnapshot=access.getRange(accessRow,1,1,11).getValues()[0];
      const now=new Date(),row=new Array(MPS.headers.length).fill('');
      row[0]=memberId;row[1]=app[1];row[2]=sheetText_(app[2]);row[3]=sheetText_(app[3]||'');row[4]=sheetText_(app[4]);row[5]=sheetText_(app[5]);row[6]=sheetText_(app[6]);row[7]='Menunggu Aktivasi';
      row[8]=sheetText_(dep[2]);row[9]=sheetText_(dep[3]);row[10]=sheetText_(dep[4]);row[11]=Number(dep[5]);row[12]=dep[6];row[13]=dep[8];row[14]='Disetujui';row[15]=sheetText_(note);row[16]=now;row[17]=now;
      row[18]=String(dep[11]);row[20]=now;row[24]=applicationRef;row[29]='Menunggu Aktivasi';
      db.appendRow(row);createdRow=db.getLastRow();
      access.getRange(accessRow,1).setValue(memberId);
      apps.getRange(appRow,8).setValue('Menunggu Aktivasi');apps.getRange(appRow,9).setValue(memberId);apps.getRange(appRow,14).setValue(sheetText_(note));apps.getRange(appRow,15).setValue(now);
      ds.getRange(depositRow,10).setValue('Menunggu Aktivasi');ds.getRange(depositRow,13).setValue(sheetText_(note));ds.getRange(depositRow,14).setValue(now);
      nickname=String(app[2]||'');chatId=String(dep[11]||'');
    }else{
      const now=new Date();apps.getRange(appRow,8).setValue('Deposit Ditolak');apps.getRange(appRow,14).setValue(sheetText_(note));apps.getRange(appRow,15).setValue(now);
      ds.getRange(depositRow,10).setValue('Ditolak');ds.getRange(depositRow,13).setValue(sheetText_(note));ds.getRange(depositRow,14).setValue(now);
      rejectedLinks=getMpsMemberLinksSheet_();if(rejectedLinks.getLastRow()>1){const vals=rejectedLinks.getRange(2,1,rejectedLinks.getLastRow()-1,MPS_MEMBER_LINKS.headers.length).getValues();vals.forEach((v,i)=>{if(String(v[5]||'')===applicationRef&&String(v[3])==='Menunggu'){const row=i+2;rejectedLinkSnapshots.push({row:row,values:v.slice()});rejectedLinks.getRange(row,4).setValue('Ditolak');}});}
      nickname=String(app[2]||'');chatId=String(dep[11]||'');rejectedAccess=getTelegramAccessSheet_();rejectedAccessRow=findTelegramAccessByMemberId_(rejectedAccess,applicationRef);if(rejectedAccessRow){rejectedAccessSnapshot=rejectedAccess.getRange(rejectedAccessRow,1,1,11).getValues()[0];rejectedAccess.getRange(rejectedAccessRow,7).setValue('Akses Ditolak');}
    }
    CacheService.getScriptCache().remove('mps_public_dashboard_v480');
  }catch(err){
    const rollbackErrors=[];
    if(createdRow&&db)try{db.deleteRow(createdRow);}catch(e){rollbackErrors.push('baris member: '+safeErrorMessage_(e));}
    if(accessRow&&accessSnapshot&&access)try{access.getRange(accessRow,1,1,11).setValues([accessSnapshot]);}catch(e){rollbackErrors.push('relasi Telegram approval: '+safeErrorMessage_(e));}
    if(rejectedAccessRow&&rejectedAccessSnapshot&&rejectedAccess)try{rejectedAccess.getRange(rejectedAccessRow,1,1,11).setValues([rejectedAccessSnapshot]);}catch(e){rollbackErrors.push('akses Telegram penolakan: '+safeErrorMessage_(e));}
    for(let i=rejectedLinkSnapshots.length-1;i>=0;i--){const snap=rejectedLinkSnapshots[i];try{rejectedLinks.getRange(snap.row,1,1,snap.values.length).setValues([snap.values]);}catch(e){rollbackErrors.push('tautan member baris '+snap.row+': '+safeErrorMessage_(e));}}
    if(appRow&&appSnapshot&&apps)try{apps.getRange(appRow,1,1,appSnapshot.length).setValues([appSnapshot]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
    if(depositRow&&depositSnapshot&&ds)try{ds.getRange(depositRow,1,1,depositSnapshot.length).setValues([depositSnapshot]);}catch(e){rollbackErrors.push('deposit: '+safeErrorMessage_(e));}
    if(rollbackErrors.length)throw new Error('Transaksi verifikasi gagal: '+safeErrorMessage_(err)+'. Rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Hentikan pemrosesan ulang dan lakukan rekonsiliasi manual.');
    throw err;
  }finally{lock.releaseLock();}
  let result;
  if(action==='approve'){
    try{result=apiAdminIssuePin(session,memberId);}catch(pinErr){result={ok:false,delivered:false,message:'Persetujuan dan penerbitan Member ID tersimpan, tetapi proses pengiriman PIN belum berhasil dijalankan: '+safeErrorMessage_(pinErr)};}
    if(result.ok){result.status='Pendaftaran disetujui. Member ID diterbitkan: '+memberId+'. PIN terkirim dan akun aktif.';if(result.inviteSent===false)result.vipInviteWarning=result.message||'PIN terkirim, tetapi undangan VIP belum berhasil dikirim.';}
    else {result.status='Persetujuan admin tersimpan dan Member ID diterbitkan: '+memberId+'. Aktivasi masih tertunda; gunakan Kirim Ulang PIN setelah memeriksa Telegram.';result.pinWarning=result.message||'Pengiriman PIN belum terkonfirmasi.';}
    result.memberId=memberId;
    telegramMessage='✅ PENGAJUAN MPS DISETUJUI\nApplication Ref: '+applicationRef+'\nMember ID: '+memberId+'\nNama: '+nickname+'\nStatus aktivasi: '+(result.ok?'Berhasil':'Menunggu Aktivasi');
  }else{
    result={ok:true,status:'Pengajuan deposit ditolak. Member ID tidak diterbitkan.',applicationRef:applicationRef};
    telegramMessage='❌ PENGAJUAN DEPOSIT MPS DITOLAK\nApplication Ref: '+applicationRef+'\nNama: '+nickname+(note?'\nCatatan: '+note:'');
  }
  if(chatId){try{const dm=telegramSendToChat_(chatId,action==='approve'?'Keputusan admin MPS sudah diproses. Periksa pesan PIN terpisah dari bot MPS.':'Pengajuan MPS belum dapat disetujui.'+(note?' Catatan admin: '+note:''));if(!dm.ok)result.memberNoticeWarning='Pesan pemberitahuan ke pendaftar gagal dikirim.';}catch(e){result.memberNoticeWarning='Pesan pemberitahuan ke pendaftar gagal dikirim.';}}
  try{const tg=sendTelegram_(telegramMessage);if(!tg.ok)result.telegramWarning='Notifikasi arsip admin gagal dikirim.';}catch(e){result.telegramWarning='Notifikasi arsip admin gagal dikirim.';}
  const auditStatus=action==='reject'?'SUCCESS':(result.ok&&result.inviteSent!==false?'SUCCESS':'PARTIAL');
  const auditDetails=action==='approve'?'Member ID '+memberId+' diterbitkan setelah approval; aktivasi PIN '+(result.ok?'selesai':'tertunda')+'; undangan VIP '+(result.inviteSent?'berhasil':'belum berhasil atau belum dikonfirmasi')+'.':'Pengajuan ditolak tanpa menerbitkan Member ID.';
  if(!recordMpsAudit_(adminRole_(session),adminActorRef_(session),action==='approve'?'APPLICATION_APPROVED':'APPLICATION_REJECTED',applicationRef,auditStatus,auditDetails))result.auditWarning='Perubahan tersimpan, tetapi audit log gagal ditulis. Super Admin perlu memeriksa MPS Audit Logs.';
  return result;
}

function apiAdminRetryVipInvite(session, memberId) {
  requireAdmin_(session);
  const memberKey=clean_(memberId,40).toUpperCase();if(!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(memberKey))throw new Error('ID Member tidak valid.');
  consumeRateLimit_('mps_vip_retry_'+sha256_(memberKey).slice(0,24),3,MPS.adminWindowSeconds,'Undangan VIP terlalu sering dicoba. Coba lagi 15 menit.');
  const sheet = getMemberSheet_();
  const row = findMemberById_(sheet, memberKey);
  if (!row) throw new Error('Member tidak ditemukan.');
  const r = sheet.getRange(row,1,1,MPS.headers.length).getValues()[0];
  if (String(r[MPS_COL.registrationStatus-1]) !== 'Berhasil' || String(r[MPS_COL.depositStatus-1]) !== 'Disetujui') throw new Error('Undangan VIP hanya dapat dikirim untuk member yang sudah Berhasil.');
  let result;try{result=sendVipInvite_(memberKey);}catch(err){result={ok:false,error:safeErrorMessage_(err)};}
  const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'VIP_INVITE_RETRY',memberKey,result.ok?'SUCCESS':'DELIVERY_FAILED','Pengiriman undangan VIP dicoba ulang.');
  return { ok: !!result.ok, message: result.ok ? 'Undangan VIP berhasil dikirim.' : (result.error || 'Undangan VIP gagal dikirim.'), auditWarning:auditWritten?'':'Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.' };
}

function apiAdminIssuePin(session, memberId) {
  requireAdmin_(session);
  const memberKey=clean_(memberId,40).toUpperCase();
  if(!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(memberKey))throw new Error('ID Member tidak valid.');
  consumeRateLimit_('mps_pin_issue_'+sha256_(memberKey).slice(0,24),3,MPS.adminWindowSeconds,'Penerbitan PIN untuk member ini terlalu sering. Coba lagi 15 menit.');
  let pin='',chatId='';
  const pendingKey='mps_pin_pending_'+sha256_(memberKey).slice(0,24);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    const sheet=getMemberSheet_(),row=findMemberById_(sheet,memberKey);if(!row)throw new Error('Member tidak ditemukan.');
    const r=sheet.getRange(row,1,1,MPS.headers.length).getValues()[0];
    if(!['Berhasil','Menunggu Aktivasi'].includes(String(r[MPS_COL.registrationStatus-1]))||String(r[MPS_COL.depositStatus-1])!=='Disetujui')throw new Error('PIN hanya dapat diterbitkan untuk member yang disetujui admin dan deposit Disetujui.');
    const access=getTelegramAccessSheet_(),ar=findTelegramAccessByMemberId_(access,memberKey);if(!ar)throw new Error('Telegram member belum terhubung.');
    const telegramRow=access.getRange(ar,1,1,11).getValues()[0];chatId=String(telegramRow[2]||'');if(!chatId||String(telegramRow[1]||'')!==chatId)throw new Error('Identitas Telegram member tidak cocok.');
    const cached=CacheService.getScriptCache().get(pendingKey);
    if(cached){try{const pending=JSON.parse(cached);if(pending&&/^\d{6}$/.test(String(pending.pin||''))&&Date.now()-Number(pending.createdAt)<600000)pin=String(pending.pin);}catch(ignore){}}
    if(!pin){pin=generatePin_();CacheService.getScriptCache().put(pendingKey,JSON.stringify({pin:pin,createdAt:Date.now()}),600);}
  }finally{lock.releaseLock();}
  let sent={ok:false,error:'Telegram tidak dapat dihubungi.'};try{sent=telegramSendToChat_(chatId,'🔐 PIN AKSES MPS DIPERBARUI\nID Member: '+memberKey+'\nPIN baru: '+pin+'\nJangan bagikan PIN ini kepada siapa pun.');}catch(sendErr){sent={ok:false,error:safeErrorMessage_(sendErr)};}
  if(!sent.ok){
    const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'PIN_REISSUED',memberKey,'DELIVERY_FAILED','Pengiriman PIN gagal; PIN lama tetap berlaku dan PIN sementara dapat dicoba ulang.');
    return {ok:false,delivered:false,message:'Telegram gagal mengirim PIN. PIN sebelumnya tetap berlaku. Tekan kirim ulang untuk mencoba kembali.',auditWarning:auditWritten?'':'Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.'};
  }
  try{storeMemberPin_(memberKey,pin);}catch(storeErr){
    const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'PIN_REISSUED',memberKey,'DELIVERY_FAILED','PIN terkirim ke Telegram, tetapi penyimpanan PIN gagal; PIN lama dipertahankan bila penulisan gagal.');
    return {ok:false,delivered:false,message:'Telegram mengirim PIN, tetapi penyimpanan PIN di backend gagal. Member jangan login dahulu; admin perlu memeriksa dan mencoba ulang.',auditWarning:auditWritten?'':'Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.'};
  }
  let pinCurrent=false;try{pinCurrent=markPinDeliveredIfCurrent_(memberKey,pin);}catch(markErr){console.error('PIN delivery confirmation: '+safeErrorMessage_(markErr));}
  if(pinCurrent){CacheService.getScriptCache().remove(pendingKey);try{activateMemberAfterPin_(memberKey);}catch(activeErr){pinCurrent=false;console.error('Member activation after PIN: '+safeErrorMessage_(activeErr));}}
  let inviteResult=null;if(pinCurrent){try{inviteResult=sendVipInvite_(memberKey);}catch(inviteErr){inviteResult={ok:false,error:safeErrorMessage_(inviteErr)};}}
  const pinAuditResult=!pinCurrent?'DELIVERY_FAILED':(inviteResult&&inviteResult.ok?'SUCCESS':'PARTIAL');
  const pinAuditDetails='PIN baru dikirim dan penyimpanannya '+(pinCurrent?'terkonfirmasi':'belum terkonfirmasi')+'; '+(inviteResult&&inviteResult.ok?'undangan VIP berhasil dikirim.':'undangan VIP belum berhasil dikirim atau belum dapat dipastikan.')+' Isi PIN tidak dicatat dalam audit.';
  const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'PIN_REISSUED',memberKey,pinAuditResult,pinAuditDetails);
  const response={ok:!!pinCurrent,delivered:!!pinCurrent,inviteSent:!!(inviteResult&&inviteResult.ok),message:pinCurrent?'PIN baru berhasil dikirim secara privat ke Telegram member.'+(inviteResult&&inviteResult.ok?' Undangan VIP juga dikirim.':inviteResult?' PIN terkirim, tetapi undangan belum berhasil: '+inviteResult.error:''):'PIN terkirim, tetapi verifikasi penyimpanan PIN belum berhasil. Hubungi admin untuk pemeriksaan.'};
  if(!auditWritten)response.auditWarning='Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.';
  return response;
}

/** MEMBER API */
function apiMemberLogin(memberId, pin) {
  const id = clean_(memberId, 40).toUpperCase();
  const pinText = String(pin || '').trim();
  if (!id || !/^\d{6}$/.test(pinText)) throw new Error('ID Member atau PIN tidak valid.');
  const key = 'mps_member_login_' + sha256_(id).slice(0, 24);
  const sheet = getMemberSheet_();
  const row = findMemberById_(sheet, id);
  if (!row) {
    recordMemberLoginFailure_(key);
    throw new Error('ID Member atau PIN salah, atau akses belum aktif.');
  }
  const r = sheet.getRange(row, 1, 1, MPS.headers.length).getValues()[0];
  if (String(r[MPS_COL.registrationStatus - 1]) !== 'Berhasil' || String(r[MPS_COL.depositStatus - 1]) !== 'Disetujui') {
    recordMemberLoginFailure_(key);
    throw new Error('ID Member atau PIN salah, atau akses belum aktif.');
  }
  const stored = PropertiesService.getScriptProperties().getProperty(pinPropertyKey_(id));
  if (!stored || !verifyMemberPin_(id, pinText, stored)) {
    recordMemberLoginFailure_(key);
    throw new Error('ID Member atau PIN salah, atau akses belum aktif.');
  }
  // Keberhasilan login hanya mereset penghitung ID itu sendiri.
  // Jangan reset penghitung global: akun valid tidak boleh menjadi jalan pintas
  // untuk menghapus pembatasan percobaan lintas-ID.
  CacheService.getScriptCache().remove(key);
  const session = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('mps_member_' + sha256_(session), id+'|'+sha256_(stored).slice(0,32), MPS.sessionSeconds);
  recordMpsAudit_('MEMBER',id,'MEMBER_LOGIN','MEMBER_ROOM','SUCCESS','Member berhasil membuka sesi.');
  return { ok: true, session: session, member: { memberId: id, nickname: String(r[MPS_COL.nickname - 1] || '') }, expiresIn: MPS.sessionSeconds };
}


function recordMemberLoginFailure_(memberKey) {
  // Pembatasan per-ID mencegah brute force tanpa memberi penyerang kemampuan
  // mengunci seluruh komunitas melalui penghitung global.
  consumeRateLimit_(memberKey,MPS.loginMaxAttempts,MPS.loginWindowSeconds,'Terlalu banyak percobaan login untuk ID ini. Coba lagi 15 menit.');
}

function requireMember_(session) {
  const s=String(session||''),sessionValue=s?CacheService.getScriptCache().get('mps_member_'+sha256_(s)):'';
  const parts=String(sessionValue||'').split('|'),id=parts[0]||'',pinRecord=id?PropertiesService.getScriptProperties().getProperty(pinPropertyKey_(id)):'';
  if(!id||!parts[1]||!pinRecord||parts[1]!==sha256_(pinRecord).slice(0,32))throw new Error('Sesi member berakhir atau PIN telah diperbarui. Silakan login kembali.');
  const sheet = getMemberSheet_();
  const row = findMemberById_(sheet, id);
  if (!row) throw new Error('Akses member tidak ditemukan.');
  const r = sheet.getRange(row, MPS_COL.registrationStatus, 1, 8).getDisplayValues()[0];
  if (r[0] !== 'Berhasil' || r[7] !== 'Disetujui') throw new Error('Akses Learning tidak aktif.');
  return { memberId: id, row: row };
}

/** Strict VIP gate: member session + approved account + synchronized VIP state + live Telegram membership. */
function requireVipMember_(session) {
  const member = requireMember_(session);
  const db = getMemberSheet_();
  const record = db.getRange(member.row, 1, 1, MPS.headers.length).getValues()[0];
  const joinedAt = record[27];
  const telegramUserId = String(record[28] || '').trim();
  const vipStatus = String(record[29] || '').trim();
  if (vipStatus !== 'Aktif' || !(joinedAt instanceof Date) || !telegramUserId || !/^\d{3,20}$/.test(telegramUserId)) {
    throw new Error('Calculator ini khusus member MPS VIP yang sudah bergabung dan terverifikasi.');
  }

  const props = PropertiesService.getScriptProperties();
  const groupId = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID') || '').trim();
  const botToken = String(props.getProperty('MPS_TELEGRAM_BOT_TOKEN') || '').trim();
  if (!groupId || !botToken) throw new Error('Verifikasi VIP sedang tidak tersedia. Hubungi admin MPS.');

  // Cross-check the dedicated VIP Access record without creating or modifying sheets.
  const accessSheet = openDatabase_().getSheetByName('VIP Access');
  if (!accessSheet || accessSheet.getLastRow() < 2) throw new Error('Data verifikasi VIP tidak ditemukan. Hubungi admin MPS.');
  const expectedHeaders = ['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'];
  const actualHeaders = accessSheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
  if (expectedHeaders.some(function(header, i) { return actualHeaders[i] !== header; })) {
    throw new Error('Struktur verifikasi VIP tidak sesuai. Akses Calculator dihentikan sementara.');
  }
  const accessRows = accessSheet.getRange(2, 1, accessSheet.getLastRow() - 1, 7).getDisplayValues();
  if (!isVerifiedVipDatabaseState_(record, member.memberId, accessRows)) {
    throw new Error('Status VIP belum aktif atau data Telegram tidak cocok.');
  }

  // Do not trust a stale spreadsheet flag alone: confirm current membership with Telegram.
  let telegramResult;
  try {
    const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + botToken + '/getChatMember', {
      method: 'post', payload: { chat_id: groupId, user_id: telegramUserId }, muteHttpExceptions: true
    });
    telegramResult = parseTelegramResponse_(response);
  } catch (err) {
    console.error('VIP calculator membership verification: ' + safeErrorMessage_(err));
    throw new Error('Keanggotaan VIP belum dapat diverifikasi saat ini. Coba lagi beberapa saat.');
  }
  if (!telegramResult.ok || !telegramResult.result) throw new Error('Keanggotaan VIP belum dapat diverifikasi saat ini. Coba lagi beberapa saat.');
  const status = String(telegramResult.result.status || '');
  if (!isTelegramVipStatusActive_(status, telegramResult.result.is_member === true)) {
    throw new Error('Akses Calculator dinonaktifkan karena akun Telegram tidak lagi terdaftar di grup VIP.');
  }

  return { memberId: member.memberId, row: member.row, telegramUserId: telegramUserId };
}

/** Pure checks are separated so the VIP gate can be regression-tested without Apps Script services. */
function isVerifiedVipDatabaseState_(record, memberId, accessRows) {
  if (!Array.isArray(record) || record.length < 30 || !Array.isArray(accessRows)) return false;
  const joinedAt = record[27], userId = String(record[28] || '').trim(), status = String(record[29] || '').trim();
  if (status !== 'Aktif' || !(joinedAt instanceof Date) || !userId || !/^\d{3,20}$/.test(userId)) return false;
  return accessRows.some(function(row) {
    return Array.isArray(row) && String(row[0] || '').toUpperCase() === String(memberId || '').toUpperCase() &&
      String(row[1] || '') === userId && String(row[2] || '') === userId && String(row[6] || '') === 'Aktif';
  });
}

function isTelegramVipStatusActive_(status, isMember) {
  return status === 'member' || status === 'administrator' || status === 'creator' ||
    (status === 'restricted' && isMember === true);
}

/** Source is stored as a private Apps Script HTML file and is released only after the strict VIP gate. */
function apiGetVipCalculatorHtml(session) {
  const basicMember = requireMember_(session);
  consumeRateLimit_('mps_vip_calculator_' + sha256_(basicMember.memberId).slice(0, 24), 20, 60,
    'Permintaan Calculator terlalu sering. Tunggu satu menit lalu coba kembali.');
  const member = requireVipMember_(session);
  const html = MPS_VIP_CALCULATOR_HTML;  if (!html || html.length > 100000) throw new Error('File Calculator VIP tidak tersedia atau melebihi batas ukuran.');
  recordMpsAudit_('MEMBER', member.memberId, 'VIP_CALCULATOR_ACCESS', 'VIP_CALCULATOR', 'SUCCESS',
    'Akses Calculator diberikan setelah status member, database VIP, dan keanggotaan Telegram terverifikasi.');
  return { ok: true, html: html, expiresIn: MPS.sessionSeconds };
}

/** Re-check active VIP entitlement while the calculator remains open. */
function apiCheckVipCalculatorAccess(session) {
  const basicMember = requireMember_(session);
  consumeRateLimit_('mps_vip_calculator_check_' + sha256_(basicMember.memberId).slice(0, 24), 5, 60,
    'Pemeriksaan akses Calculator terlalu sering. Tunggu sebentar lalu coba kembali.');
  const member = requireVipMember_(session);
  return { ok: true, memberId: member.memberId, checkedAt: new Date().toISOString() };
}

function apiMemberLogout(session) {
  if(session){const key='mps_member_'+sha256_(String(session)),value=CacheService.getScriptCache().get(key),id=String(value||'').split('|')[0];if(id)recordMpsAudit_('MEMBER',id,'MEMBER_LOGOUT','MEMBER_ROOM','SUCCESS','Member menutup sesi.');CacheService.getScriptCache().remove(key);}
  return {ok:true};
}

function apiGetLearningList(session) {
  const member=requireMember_(session);
  return listLearningFiles_(member.memberId,false);
}
function listLearningFiles_(memberId,isAdmin) {
  const folderId=getLearningFolderId_(),folder=DriveApp.getFolderById(folderId),files=folder.getFiles();
  const catalogRows=readMpsContentRows_(MPS_LEARNING_CATALOG.sheet,MPS_LEARNING_CATALOG.headers),catalog={};catalogRows.forEach(r=>{catalog[String(r['File ID'])]=r;});
  const progressRows=memberId&&memberId!=='ADMIN-PREVIEW'?readMpsContentRows_(MPS_LEARNING_PROGRESS.sheet,MPS_LEARNING_PROGRESS.headers):[],progress={};
  progressRows.forEach(r=>{if(String(r['Member ID'])===String(memberId))progress[String(r['File ID'])]=r;});
  const items=[];while(files.hasNext()){
    const f=files.next();if(f.getMimeType()!==MimeType.PDF||f.isTrashed()||f.getSize()>MPS.maxLearningFileBytes||String(f.getSharingAccess())!==String(DriveApp.Access.PRIVATE))continue;
    const id=f.getId(),meta=catalog[id]||{},status=String(meta.Status||'Draft');if(!isAdmin&&status!=='Published')continue;
    const pr=progress[id]||{};items.push({id:id,name:String(meta.Title||f.getName()),originalName:f.getName(),size:f.getSize(),updated:formatDateForClient_(f.getLastUpdated()),category:String(meta.Category||'Uncategorized'),level:String(meta.Level||'All Levels'),description:String(meta.Description||''),sortOrder:Number(meta['Sort Order']||999),status:status,completed:String(pr.Completed)==='true'||pr.Completed===true});
  }
  items.sort((a,b)=>a.sortOrder-b.sortOrder||a.category.localeCompare(b.category)||a.name.localeCompare(b.name));return {ok:true,files:items};
}

function apiAdminGetLearningList(session) {
  requireSuperAdmin_(session);
  return listLearningFiles_('ADMIN-PREVIEW',true);
}
function apiAdminSaveLearningCatalog(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const fileId=String(payload.fileId||'').trim(),title=clean_(payload.title,140),category=clean_(payload.category,60),level=clean_(payload.level||'All Levels',40),description=cleanNewsText_(payload.description,700),status=String(payload.status||'Draft'),order=Number(payload.sortOrder||999);
  if(!/^[A-Za-z0-9_-]{15,}$/.test(fileId)||!title||!category||!['Published','Draft','Hidden'].includes(status)||!Number.isFinite(order)||order<0)throw new Error('Data katalog Learning tidak valid.');
  const folderId=getLearningFolderId_(),file=DriveApp.getFileById(fileId);
  if(file.isTrashed()||file.getMimeType()!==MimeType.PDF||file.getSize()>MPS.maxLearningFileBytes||String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('File harus berupa PDF aktif maksimal 8 MB dan berstatus PRIVATE.');
  let inFolder=false,parents=file.getParents();while(parents.hasNext())if(parents.next().getId()===folderId)inFolder=true;
  if(!inFolder)throw new Error('PDF harus berada di folder Learning privat MPS.');
  const sh=getMpsContentSheet_(MPS_LEARNING_CATALOG.sheet,MPS_LEARNING_CATALOG.headers,true);
  upsertMpsContentRow_(sh,fileId,[fileId,sheetText_(title),sheetText_(category),sheetText_(level),sheetText_(description),Math.round(order),status,new Date()]);recordMpsAudit_(adminRole_(session),adminActorRef_(session),'LEARNING_CATALOG_UPDATED',fileId,'SUCCESS','Katalog materi '+status+'.');
  return {ok:true,message:'Katalog materi Learning diperbarui.'};
}
function apiAdminUploadLearningFile(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const name=clean_(payload.name,120).replace(/[\\/:*?"<>|]/g,'_');
  const title=clean_(payload.title||name.replace(/\.pdf$/i,''),140),category=clean_(payload.category||'Other',60),level=clean_(payload.level||'All Levels',40),description=cleanNewsText_(payload.description,700),status=String(payload.status||'Draft'),order=Number(payload.sortOrder||999);
  if(!/\.pdf$/i.test(name)||!title||!['Published','Draft','Hidden'].includes(status)||!Number.isFinite(order)||order<0)throw new Error('Nama file, judul, status, atau urutan PDF tidak valid.');
  const encoded=String(payload.base64||'');if(!encoded||encoded.length>Math.ceil(MPS.maxLearningFileBytes*4/3)+16)throw new Error('Data PDF kosong atau melebihi batas 8 MB.');
  let bytes;try{bytes=Utilities.base64Decode(encoded);}catch(e){throw new Error('Isi PDF tidak dapat dibaca.');}
  if(!bytes||bytes.length<8||bytes.length>MPS.maxLearningFileBytes)throw new Error('Ukuran PDF harus maksimal 8 MB.');
  const prefix=bytes.slice(0,5).map(function(b){return (b+256)%256;}).join(',');if(prefix!=='37,80,68,70,45')throw new Error('File bukan PDF valid.');
  const rawPdf=bytes.map(function(b){return String.fromCharCode((b+256)%256);}).join('');
  const tail=rawPdf.slice(-2048);if(tail.indexOf('%%EOF')<0)throw new Error('Struktur akhir PDF tidak valid.');
  if(/\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA)\b/i.test(rawPdf))throw new Error('PDF memuat penanda active content atau embedded action yang tidak diizinkan. Ekspor ulang sebagai PDF statis.');
  const folderId=getLearningFolderId_(),folder=DriveApp.getFolderById(folderId),blob=Utilities.newBlob(bytes,MimeType.PDF,name);let file=null;
  let catalogSheet=null,catalogRow=0;
  try{
    file=folder.createFile(blob);
    file.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
    catalogSheet=getMpsContentSheet_(MPS_LEARNING_CATALOG.sheet,MPS_LEARNING_CATALOG.headers,true);
    const row=[file.getId(),sheetText_(title),sheetText_(category),sheetText_(level),sheetText_(description),Math.round(order),status,new Date()];
    upsertMpsContentRow_(catalogSheet,file.getId(),row);
  }catch(err){
    const rollbackErrors=[];
    if(catalogSheet&&file)try{catalogRow=findMpsContentRow_(catalogSheet,file.getId());if(catalogRow)catalogSheet.deleteRow(catalogRow);}catch(e){rollbackErrors.push('metadata katalog: '+safeErrorMessage_(e));}
    if(file)try{file.setTrashed(true);}catch(e){rollbackErrors.push('file PDF privat: '+safeErrorMessage_(e));}
    if(rollbackErrors.length)throw new Error('Upload Learning gagal dan rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Super Admin perlu memeriksa folder Learning dan katalog sebelum mencoba ulang.');
    throw new Error('Upload Learning gagal; file sementara dan perubahan katalog berhasil dibatalkan: '+safeErrorMessage_(err));
  }
  const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'LEARNING_PDF_UPLOADED',file.getId(),'SUCCESS','PDF privat diunggah ke folder Learning; ukuran '+bytes.length+' byte.');
  return {ok:true,fileId:file.getId(),name:file.getName(),message:'PDF berhasil diunggah ke folder Learning privat dan masuk katalog.',auditWarning:auditWritten?'':'Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.'};
}

function apiAdminDeleteLearningFile(session,fileId) {
  requireSuperAdmin_(session);
  const id=String(fileId||'').trim();if(!/^[A-Za-z0-9_-]{15,}$/.test(id))throw new Error('File ID tidak valid.');
  const folderId=getLearningFolderId_(),file=DriveApp.getFileById(id);
  if(file.isTrashed()||file.getMimeType()!==MimeType.PDF)throw new Error('File bukan PDF Learning aktif.');
  let inFolder=false,parents=file.getParents();while(parents.hasNext())if(parents.next().getId()===folderId)inFolder=true;
  if(!inFolder)throw new Error('File berada di luar folder Learning; penghapusan ditolak.');
  const name=file.getName();if(/^MPS Market Pulse/i.test(name))throw new Error('File Market Pulse dan backup-nya dilindungi dari Learning Manager.');
  file.setTrashed(true);
  // Keep catalog metadata/status so restoring from Drive Trash preserves Draft/Hidden/Published state.
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'LEARNING_PDF_TRASHED',id,'SUCCESS','PDF dipindahkan ke Trash Drive; metadata katalog dipertahankan agar status akses tetap sama jika file dipulihkan.');
  return {ok:true,message:'PDF dipindahkan ke Trash Drive. File dapat dipulihkan dari Trash.'};
}

function apiAdminValidateMarketPulseUpload(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const name=clean_(payload.name,120);if(!/\.html?$/i.test(name))throw new Error('Pilih file HTML Market Pulse yang asli.');
  const encoded=String(payload.base64||'');if(!encoded||encoded.length>Math.ceil(MPS.maxPulseDataBytes*4/3)+16)throw new Error('File Market Pulse kosong atau melebihi batas 1 MB.');
  let bytes,source;try{bytes=Utilities.base64Decode(encoded);source=Utilities.newBlob(bytes,'text/html',name).getDataAsString('UTF-8');}catch(e){throw new Error('File HTML tidak dapat dibaca.');}
  if(!bytes||bytes.length>MPS.maxPulseDataBytes)throw new Error('Ukuran file Market Pulse maksimal 1 MB.');
  const checked=validateMarketPulseSource_(source);
  return {ok:true,name:name,size:bytes.length,stats:checked.stats,groups:checked.groups,endDates:checked.endDates,threshold:checked.threshold,message:'Validasi berhasil. Dataset belum dipublikasikan.'};
}

function apiAdminUploadMarketPulse(session,payload) {
  requireSuperAdmin_(session);
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{return adminUploadMarketPulseCore_(session,payload);}finally{lock.releaseLock();}
}
function adminUploadMarketPulseCore_(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const name=clean_(payload.name,120);if(!/\.html?$/i.test(name))throw new Error('Pilih file HTML Market Pulse yang asli.');
  const encoded=String(payload.base64||'');if(!encoded||encoded.length>Math.ceil(MPS.maxPulseDataBytes*4/3)+16)throw new Error('File Market Pulse kosong atau melebihi batas 1 MB.');
  let bytes,source;try{bytes=Utilities.base64Decode(encoded);source=Utilities.newBlob(bytes,'text/html',name).getDataAsString('UTF-8');}catch(e){throw new Error('File HTML tidak dapat dibaca.');}
  if(!bytes||bytes.length>MPS.maxPulseDataBytes)throw new Error('Ukuran file Market Pulse maksimal 1 MB.');
  const validated=validateMarketPulseSource_(source);
  const folderId=getLearningFolderId_(),folder=DriveApp.getFolderById(folderId),matches=folder.getFilesByName('MPS Market Pulse Data.html');
  let oldFile=null;if(matches.hasNext()){oldFile=matches.next();if(matches.hasNext())throw new Error('Ada lebih dari satu file aktif Pulse. Bereskan duplikasi sebelum upload baru.');if(String(oldFile.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('File Pulse lama tidak PRIVATE. Amankan file sebelum menggantinya.');}
  const stamp=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,6);
  const backupName='MPS Market Pulse Backup '+stamp+'.html';let newFile=null,oldRenamed=false;
  try{
    if(oldFile){oldFile.setName(backupName);oldRenamed=true;}
    newFile=folder.createFile(Utilities.newBlob(bytes,'text/html','MPS Market Pulse Data.html'));
    newFile.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);
    if(newFile.getSize()!==bytes.length)throw new Error('Ukuran file baru tidak cocok setelah disimpan.');
  }catch(err){
    const rollbackErrors=[];
    if(newFile)try{newFile.setTrashed(true);}catch(cleanupErr){rollbackErrors.push('file baru tidak berhasil dipindahkan ke Trash: '+safeErrorMessage_(cleanupErr));}
    if(oldFile&&oldRenamed)try{oldFile.setName('MPS Market Pulse Data.html');}catch(restoreErr){rollbackErrors.push('nama versi sebelumnya gagal dipulihkan; file masih bernama '+backupName+': '+safeErrorMessage_(restoreErr));}
    if(rollbackErrors.length)throw new Error('Publikasi Market Pulse gagal dan rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Periksa folder Learning sebelum mencoba ulang.');
    throw new Error('Publikasi Market Pulse gagal; versi sebelumnya berhasil dipulihkan: '+safeErrorMessage_(err));
  }
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'MARKET_PULSE_DATA_PUBLISHED',newFile.getId(),'SUCCESS','Dataset tervalidasi dipublikasikan; akhir data '+validated.data.XAUUSD.end+'; versi sebelumnya '+(oldFile?backupName:'tidak ada')+'.');
  return {ok:true,fileId:newFile.getId(),endDate:validated.data.XAUUSD.end,slots:validated.stats.totalSlots,emptySlots:validated.stats.emptySlots,backup:oldFile?backupName:'',message:'Dataset Market Pulse lolos validasi dan berhasil dipublikasikan. Versi sebelumnya disimpan sebagai backup privat.'};
}



function apiMemberSetLearningProgress(session,fileId,completed) {
  const member=requireMember_(session),id=String(fileId||'').trim();if(!/^[A-Za-z0-9_-]{15,}$/.test(id))throw new Error('File materi tidak valid.');
  const visible=listLearningFiles_(member.memberId,false).files.some(f=>f.id===id);if(!visible)throw new Error('Materi tidak tersedia untuk member ini.');
  const sh=getMpsContentSheet_(MPS_LEARNING_PROGRESS.sheet,MPS_LEARNING_PROGRESS.headers,true),done=completed===true||String(completed)==='true',now=new Date(),record=[member.memberId,id,done,done?now:'',now];
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{let row=0;if(sh.getLastRow()>1){const vals=sh.getRange(2,1,sh.getLastRow()-1,2).getDisplayValues();for(let i=0;i<vals.length;i++)if(vals[i][0]===member.memberId&&vals[i][1]===id){row=i+2;break;}}
    if(row)sh.getRange(row,1,1,5).setValues([record]);else sh.appendRow(record);
  }finally{lock.releaseLock();}
  return {ok:true,completed:done,message:done?'Materi ditandai selesai.':'Status progres diperbarui.'};
}

function apiGetLearningFile(session, fileId) {
  const member=requireMember_(session);
  const id = String(fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('File materi tidak valid.');
  // Direct API calls must obey the same Published catalog filter as the visible list.
  const visible=listLearningFiles_(member.memberId,false).files.some(function(item){return item.id===id;});
  if(!visible)throw new Error('Materi tidak tersedia untuk member ini.');
  const folderId = getLearningFolderId_();
  const file = DriveApp.getFileById(id);
  if (file.isTrashed() || file.getMimeType() !== MimeType.PDF || file.getSize() > MPS.maxLearningFileBytes || String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE)) {
    throw new Error('File tidak tersedia atau melebihi batas ukuran 8 MB.');
  }
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('Akses file tidak diizinkan.');
  const bytes = file.getBlob().getBytes();
  const prefix = bytes.slice(0, 5).map(function(b) { return (b + 256) % 256; });
  if (prefix.join(',') !== '37,80,68,70,45') throw new Error('Isi file bukan PDF yang valid.');
  return { ok: true, name: file.getName(), mimeType: 'application/pdf', base64: Utilities.base64Encode(bytes) };
}

function apiAdminGetLearningFile(session, fileId) {
  requireSuperAdmin_(session);
  const id = String(fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{15,}$/.test(id)) throw new Error('File materi tidak valid.');
  const folderId = getLearningFolderId_();
  const file = DriveApp.getFileById(id);
  if (file.isTrashed() || file.getMimeType() !== MimeType.PDF || file.getSize() > MPS.maxLearningFileBytes || String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE)) {
    throw new Error('File tidak tersedia atau melebihi batas ukuran 8 MB.');
  }
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  if (!inFolder) throw new Error('Akses file tidak diizinkan.');
  const bytes = file.getBlob().getBytes();
  const prefix = bytes.slice(0, 5).map(function(b) { return (b + 256) % 256; });
  if (prefix.join(',') !== '37,80,68,70,45') throw new Error('Isi file bukan PDF yang valid.');
  return { ok: true, name: file.getName(), mimeType: 'application/pdf', base64: Utilities.base64Encode(bytes) };
}


function getLearningFolderId_() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('MPS_LEARNING_FOLDER_ID');
  const proofFolderId = props.getProperty('MPS_PROOF_FOLDER_ID');
  if (!folderId) throw new Error('Folder materi Learning belum dikonfigurasi admin.');
  if (folderId === proofFolderId) throw new Error('Folder Learning wajib terpisah dari folder bukti deposit.');
  const folder=DriveApp.getFolderById(folderId);
  if(String(folder.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Folder Learning tidak PRIVATE. Akses materi dihentikan sampai admin mengamankan folder.');
  return folderId;
}


/**
 * Market Pulse privat. Sumber data HTML disimpan di folder Learning privat
 * dengan nama persis "MPS Market Pulse Data.html". API hanya mengirim data
 * setelah sesi member lolos requireMember_().
 */
function apiGetMarketPulse(session) {
  requireMember_(session);
  return getMarketPulseData_();
}

/** Preview khusus admin. Tetap wajib memiliki sesi admin yang sah di backend. */
function apiAdminGetMarketPulse(session) {
  requireAdmin_(session);
  return getMarketPulseData_();
}

/** Membaca dan memvalidasi sumber data Pulse privat yang sama untuk member/admin. */
function validateMarketPulseSource_(source) {
  const text=String(source||'');
  if(!text||text.length>MPS.maxPulseDataBytes)throw new Error('File data Market Pulse kosong atau melebihi batas 1 MB.');
  const match=text.match(/const\s+D\s*=\s*(\{[\s\S]*?\})\s*,\s*TH\s*=\s*55\s*;/);
  if(!match)throw new Error('Struktur data Market Pulse tidak dikenali. Gunakan file heatmap MPS yang asli.');
  let data;try{data=JSON.parse(match[1]);}catch(err){throw new Error('Data Market Pulse tidak dapat dibaca sebagai JSON yang valid.');}
  if(!data||!data.XAUUSD||!data.EURUSD||!data.XAUUSD.t||!data.EURUSD.t)throw new Error('Data Market Pulse tidak lengkap.');
  if(Object.keys(data).sort().join(',')!=='EURUSD,XAUUSD')throw new Error('Dataset berisi properti tambahan yang tidak diizinkan.');
  const expectedSlots={'1':1440,'5':288,'15':96},groups=[],stats={totalSlots:0,emptySlots:0,groups:0};
  ['XAUUSD','EURUSD'].forEach(function(pair){
    if(Object.keys(data[pair]).sort().join(',')!=='end,t'||Object.keys(data[pair].t).sort().join(',')!=='1,15,5')throw new Error('Struktur dataset '+pair+' tidak sesuai skema MPS.');
    const endDate=String(data[pair].end||'');const parsedEnd=new Date(endDate+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||isNaN(parsedEnd.getTime())||parsedEnd.toISOString().slice(0,10)!==endDate)throw new Error('Tanggal akhir dataset '+pair+' tidak valid.');
    ['1','5','15'].forEach(function(tf){
      const periods=data[pair].t[tf];if(!Array.isArray(periods)||periods.length!==3)throw new Error('Struktur periode data Pulse tidak valid.');
      let groupSlots=0,groupEmpty=0;
      periods.forEach(function(slots){if(!Array.isArray(slots)||slots.length!==expectedSlots[tf])throw new Error('Jumlah slot data Pulse tidak valid.');slots.forEach(function(candle){if(!Array.isArray(candle)||candle.length!==3||candle.some(function(v){return !Number.isSafeInteger(v)||v<0;}))throw new Error('Nilai statistik data Pulse tidak valid.');groupSlots++;if(candle[0]===0&&candle[1]===0&&candle[2]===0)groupEmpty++;});});
      groups.push({pair:pair,timeframe:'M'+tf,slots:groupSlots,emptySlots:groupEmpty,periods:['1 bulan','2 bulan','4 bulan']});stats.totalSlots+=groupSlots;stats.emptySlots+=groupEmpty;stats.groups++;
    });
  });
  return {ok:true,data:data,threshold:55,stats:stats,groups:groups,endDates:{XAUUSD:data.XAUUSD.end,EURUSD:data.EURUSD.end}};
}

function getMarketPulseData_() {
  const folderId=getLearningFolderId_(),folder=DriveApp.getFolderById(folderId),files=folder.getFilesByName('MPS Market Pulse Data.html');
  if(!files.hasNext())throw new Error('Data Market Pulse belum dipasang admin. Hubungi admin MPS.');
  const file=files.next();if(files.hasNext())throw new Error('Ditemukan lebih dari satu file data Pulse. Admin perlu menyisakan satu file dengan nama yang ditentukan.');
  if(file.isTrashed()||file.getSize()>MPS.maxPulseDataBytes)throw new Error('File data Market Pulse tidak tersedia atau melebihi batas 1 MB.');
  const mime=String(file.getMimeType()||'').toLowerCase();if(mime&&mime!=='text/html'&&mime!=='text/plain'&&mime!=='application/octet-stream')throw new Error('Format file data Market Pulse tidak sesuai.');
  if(String(file.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('File Market Pulse tidak PRIVATE. Admin harus mengamankan file sebelum member dapat mengaksesnya.');
  return validateMarketPulseSource_(file.getBlob().getDataAsString('UTF-8'));
}

/** Public dashboard: hanya agregat, tidak pernah mengirim nama/ID/Telegram member. */
function buildMpsDashboard_() {
  const sheet=getMemberSheet_(),last=sheet.getLastRow();
  const out={ok:true,totalMembers:0,totalSuccessful:0,pendingDeposit:0,countries:[],monthly:[],generatedAt:new Date().toISOString()};
  if(last<2)return out;
  const rows=sheet.getRange(2,1,last-1,MPS.headers.length).getValues();
  const countries={},monthly={};
  rows.forEach(function(r){const id=String(r[MPS_COL.id-1]||'').trim();if(!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(id))return;out.totalMembers++;const rs=String(r[MPS_COL.registrationStatus-1]||''),ds=String(r[MPS_COL.depositStatus-1]||'');if(ds==='Menunggu verifikasi')out.pendingDeposit++;if(rs!=='Berhasil'||ds!=='Disetujui')return;out.totalSuccessful++;const c=clean_(r[MPS_COL.country-1],60)||'Tidak diketahui';countries[c]=(countries[c]||0)+1;const d=r[MPS_COL.registeredAt-1];if(d instanceof Date&&!isNaN(d.getTime())){const k=Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM');monthly[k]=(monthly[k]||0)+1;}});
  out.countries=Object.keys(countries).map(k=>({country:k,count:countries[k]})).sort((a,b)=>b.count-a.count||a.country.localeCompare(b.country));
  out.monthly=Object.keys(monthly).sort().map(k=>({month:k,count:monthly[k]}));return out;
}
function apiGetDashboard(session) {
  requireMember_(session);
  // Member hanya menerima statistik komunitas yang sudah terverifikasi.
  // Jangan kirim jumlah pendaftaran/deposit tertunda atau total aplikasi internal.
  const d = buildMpsDashboard_();
  return {ok:true,totalMembers:d.totalSuccessful,totalSuccessful:d.totalSuccessful,
    countries:d.countries,monthly:d.monthly,generatedAt:d.generatedAt};
}
function apiAdminGetDashboard(session) {
  requireAdmin_(session);
  return buildMpsDashboard_();
}
function apiGetHeatmap(session) {
  requireMember_(session);
  const d=buildMpsDashboard_();return {ok:true,countries:d.countries,totalSuccessful:d.totalSuccessful};
}
function apiAdminGetHeatmap(session) {
  requireAdmin_(session);
  const d=buildMpsDashboard_();return {ok:true,countries:d.countries,totalSuccessful:d.totalSuccessful};
}

/** Telegram setup/testing functions are restricted to the script owner/admin flow. */
function setupTelegram_() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('MPS_TELEGRAM_BOT_TOKEN');
  if (!token || token.indexOf(':') < 1) throw new Error('MPS_TELEGRAM_BOT_TOKEN belum ada atau tidak valid.');
  const adminChatId = String(props.getProperty('MPS_TELEGRAM_CHAT_ID') || props.getProperty('MPS_TELEGRAM_ADMIN_CHAT_ID') || props.getProperty('MPS_ADMIN_TELEGRAM_CHAT_ID') || '').trim();
  const vipChatId = String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID') || '').trim();
  if (!/^-?\d+$/.test(adminChatId)) throw new Error('MPS_TELEGRAM_CHAT_ID admin wajib diisi manual dengan chat ID admin yang sudah diverifikasi.');
  if (vipChatId && !/^-?\d+$/.test(vipChatId)) throw new Error('MPS_TELEGRAM_VIP_CHAT_ID tidak valid.');
  let webhookSecret = props.getProperty('MPS_TELEGRAM_WEBHOOK_SECRET');
  if (!webhookSecret || webhookSecret.length < 32) {
    webhookSecret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('MPS_TELEGRAM_WEBHOOK_SECRET', webhookSecret);
  }
  const base = 'https://api.telegram.org/bot' + token + '/';
  const meResp=UrlFetchApp.fetch(base+'getMe',{muteHttpExceptions:true}),meData=parseTelegramResponse_(meResp);
  if(!meData.ok||!meData.result||!meData.result.username)throw new Error('Username bot Telegram tidak dapat diverifikasi.');
  const botUsername=String(meData.result.username);props.setProperty('MPS_TELEGRAM_BOT_USERNAME',botUsername);
  const infoResp = UrlFetchApp.fetch(base + 'getWebhookInfo', { muteHttpExceptions: true });
  const info = parseTelegramResponse_(infoResp);
  if (!info.ok) throw new Error('Tidak dapat memeriksa konfigurasi webhook Telegram.');
  const webAppUrl = ScriptApp.getService().getUrl();
  if (!webAppUrl) throw new Error('Deploy Web App MPS terlebih dahulu sebelum mengaktifkan webhook Telegram.');
  // Apps Script doPost tidak mengekspos header request Telegram. Karena itu secret_token
  // juga dipertahankan sebagai query secret acak; jangan pernah menulis URL ini ke log.
  const webhookUrl = webAppUrl + '?tg=' + encodeURIComponent(webhookSecret);
  const setResp = UrlFetchApp.fetch(base + 'setWebhook', {
    method: 'post',
    payload: {
      url: webhookUrl,
      secret_token: webhookSecret,
      max_connections: 1,
      allowed_updates: JSON.stringify(['message', 'chat_member', 'my_chat_member', 'chat_join_request'])
    },
    muteHttpExceptions: true
  });
  const setResult = parseTelegramResponse_(setResp);
  if (!setResult.ok) throw new Error('Telegram menolak pemasangan webhook: ' + (setResult.description || 'kesalahan tidak diketahui'));
  const test = sendTelegram_('✅ Koneksi webhook Telegram MPS v4.8.0 berhasil.');
  if (!test.ok) throw new Error('Webhook aktif, tetapi pesan uji admin gagal: ' + test.error);
  recordMpsAudit_('ADMIN','TELEGRAM_SETUP','TELEGRAM_WEBHOOK_CONFIGURED','BOT','SUCCESS','Webhook Telegram diperbarui; URL dan token webhook tidak dicatat.');
  return { ok: true, message: vipChatId
    ? 'Webhook aktif. Chat ID admin dan grup VIP sudah terkonfigurasi.'
    : 'Webhook aktif. Kirim /start@'+botUsername+' di grup VIP resmi, lalu periksa dan konfirmasi kandidat grup dari panel admin.' };
}

function processTelegramUpdate_(update) {
  if (!update || typeof update !== 'object') return;
  const updateId=update.update_id;
  if(updateId==null) return processTelegramUpdateCore_(update);
  const cache=CacheService.getScriptCache(),key='mps_tg_update_'+String(updateId);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const state=cache.get(key);
    if(state==='DONE') return;
    if(state==='PROCESSING') throw new Error('Telegram update sedang diproses. Minta Telegram mencoba ulang.');
    // Lease 10 menit melampaui batas eksekusi Apps Script yang umumnya 6 menit.
    // CacheService tetap best-effort dan dapat menghapus item lebih awal; ini bukan jaminan exactly-once.
    cache.put(key,'PROCESSING',600);
  } finally { lock.releaseLock(); }
  try {
    processTelegramUpdateCore_(update);
    const doneLock=LockService.getScriptLock();doneLock.waitLock(10000);
    try { cache.put(key,'DONE',21600); } finally { doneLock.releaseLock(); }
  } catch(err) {
    const retryLock=LockService.getScriptLock();retryLock.waitLock(10000);
    try { cache.remove(key); } finally { retryLock.releaseLock(); }
    throw err;
  }
}

function processTelegramUpdateCore_(update) {
  if (!update || typeof update !== 'object') return;
  const updateId=update.update_id;
  const updateKey='';
  const msg=update.message||update.edited_message;
  if(msg&&msg.chat){
    const chat=msg.chat;
    if((chat.type==='group'||chat.type==='supergroup')&&/\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(String(msg.text||''))){
      if(String(chat.title||'').trim().toLowerCase()==='mps vip community'){
        const props=PropertiesService.getScriptProperties(),candidateLock=LockService.getScriptLock();candidateLock.waitLock(5000);
        try{props.setProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_ID',String(chat.id));props.setProperty('MPS_TELEGRAM_VIP_CHAT_CANDIDATE_TITLE',clean_(chat.title,120));}finally{candidateLock.releaseLock();}
        const notice=telegramSendToChat_(String(chat.id),'Permintaan koneksi grup diterima. Admin MPS harus memeriksa dan mengonfirmasi ID grup sebelum undangan VIP diaktifkan.');
        if(!notice.ok)throw new Error('Pemberitahuan kandidat grup Telegram gagal dikirim.');
      }
      if(updateKey)cache.put(updateKey,'1',21600);return;
    }
    if(chat.type==='private'&&msg.from&&/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Fa-f0-9]{40,64}))?/.test(String(msg.text||''))){
      const match=String(msg.text||'').match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Fa-f0-9]{40,64}))?/),token=match&&match[1];
      if(!token){const welcome=telegramSendToChat_(String(chat.id),'Selamat datang di MPS. Untuk verifikasi pendaftaran, buka kembali formulir MPS lalu tekan Hubungkan Telegram.');if(!welcome.ok)throw new Error('Pesan sambutan Telegram gagal dikirim.');}
      else verifyTelegramLinkFromUpdate_(token,msg);
    }
  }
  if(update.chat_join_request)processVipJoinRequest_(update.chat_join_request);
  const memberUpdate=update.chat_member;
  if(memberUpdate&&memberUpdate.chat&&memberUpdate.new_chat_member&&memberUpdate.new_chat_member.user){
    const chatId=String(memberUpdate.chat.id),userId=String(memberUpdate.new_chat_member.user.id),newMember=memberUpdate.new_chat_member,status=String(newMember.status||'');
    if(chatId===String(PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||''))processMpsVipChatMemberEvent_(update,memberUpdate);
  }
  const botUpdate=update.my_chat_member;
  if(botUpdate&&botUpdate.chat&&botUpdate.new_chat_member){
    const chatId=String(botUpdate.chat.id),status=String(botUpdate.new_chat_member.status||''),configured=String(PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||'');
    if(chatId===configured){
      const canInvite=botUpdate.new_chat_member.can_invite_users===true,healthy=status==='administrator'&&canInvite;
      recordMpsAudit_('TELEGRAM','BOT','BOT_GROUP_PERMISSION_CHANGED',chatId,healthy?'SUCCESS':'WARNING','Status bot pada grup berubah menjadi '+clean_(status,30)+'; izin undang anggota: '+(canInvite?'aktif':'tidak aktif atau tidak diketahui')+'.');
      if(!healthy)sendTelegram_('⚠️ PERINGATAN MPS: status/izin bot pada VIP Community berubah. Status: '+clean_(status,30)+'. Izin mengundang anggota: '+(canInvite?'aktif':'tidak aktif/tidak diketahui')+'. Periksa pengaturan admin bot.');
    }
  }
  if(updateKey)cache.put(updateKey,'1',21600);
}

function processVipJoinRequest_(request) {
  const props=PropertiesService.getScriptProperties(),configuredGroup=String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||'');
  const chatId=String(request.chat&&request.chat.id||''),userId=String(request.from&&request.from.id||'');
  if(!configuredGroup||chatId!==configuredGroup||!userId)return true;
  const token=props.getProperty('MPS_TELEGRAM_BOT_TOKEN');if(!token)throw new Error('Token bot Telegram belum tersedia.');
  if(request.from&&request.from.is_bot){
    const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/declineChatJoinRequest',{method:'post',payload:{chat_id:chatId,user_id:userId},muteHttpExceptions:true});
    const rejected=parseTelegramResponse_(response);if(!rejected.ok&&!/USER_ALREADY_PARTICIPANT|request.*not found|no.*request/i.test(String(rejected.description||'')))throw new Error(rejected.description||'Permintaan bot tidak dapat ditolak.');
    return true;
  }
  const access=getTelegramAccessSheet_(),accessRow=findTelegramAccessByUserId_(access,userId);let allowed=false,memberId='';
  if(accessRow){
    const a=access.getRange(accessRow,1,1,11).getValues()[0];memberId=String(a[0]||'');
    const memberSheet=getMemberSheet_(),memberRow=findMemberById_(memberSheet,memberId);
    if(memberRow){const m=memberSheet.getRange(memberRow,1,1,MPS.headers.length).getValues()[0];allowed=String(m[MPS_COL.registrationStatus-1])==='Berhasil'&&String(m[MPS_COL.depositStatus-1])==='Disetujui'&&String(a[1])===userId&&String(a[2])===userId;}
  }
  if(allowed){
    // Telegram may have approved the previous delivery even if Apps Script timed out.
    try{
      const check=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getChatMember',{method:'post',payload:{chat_id:chatId,user_id:userId},muteHttpExceptions:true});
      const statusData=parseTelegramResponse_(check),status=statusData.ok&&statusData.result?String(statusData.result.status||''):'';
      if(status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&statusData.result.is_member===true)){
        // Status changes are applied only from the original chat_member update.
        try{const welcome=telegramSendToChat_(String(request.user_chat_id||userId),'✅ Permintaan bergabung Anda sudah disetujui. Selamat datang di MPS VIP Community.');if(!welcome.ok)recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Member sudah berada di grup, tetapi pesan sambutan gagal dikirim.');}catch(dmErr){recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Member sudah berada di grup, tetapi pengiriman pesan sambutan gagal.');}
        return true;
      }
    }catch(checkErr){console.error('VIP join idempotency check: '+safeErrorMessage_(checkErr));}
  }
  const method=allowed?'approveChatJoinRequest':'declineChatJoinRequest';
  const resp=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'post',payload:{chat_id:chatId,user_id:userId},muteHttpExceptions:true});
  const result=parseTelegramResponse_(resp);
  if(!result.ok){
    try{
      const retryCheck=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getChatMember',{method:'post',payload:{chat_id:chatId,user_id:userId},muteHttpExceptions:true});
      const state=parseTelegramResponse_(retryCheck),status=state.ok&&state.result?String(state.result.status||''):'';
      if(status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&state.result.is_member===true)){return true;}
      if(!allowed&&(status==='left'||status==='kicked')){recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_ALREADY_DECLINED',userId,'SUCCESS','Permintaan join sudah tidak aktif saat webhook dicoba ulang.');return true;}
      if(allowed&&(status==='left'||status==='kicked')&&/USER_ID_INVALID|request.*not found|no.*join request/i.test(String(result.description||''))){recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_REQUEST_ALREADY_CLOSED',memberId,'SUCCESS','Telegram tidak lagi memiliki join request aktif; tidak ada akses grup yang diberikan.');return true;}
    }catch(checkErr){if(!allowed&&/USER_ID_INVALID|user.*not found|chat.*not found/i.test(String(result.description||'')))return true;}
    if(!allowed&&/USER_ID_INVALID|request.*not found|no.*join request/i.test(String(result.description||'')))return true;
    throw new Error(result.description||'Telegram join request gagal diproses.');
  }
  if(allowed){
    // Approval is not a membership-state event; wait for Telegram chat_member.
    try{const dm=telegramSendToChat_(String(request.user_chat_id||userId),'✅ Permintaan bergabung disetujui. Selamat datang di MPS VIP Community.');if(!dm.ok)recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Permintaan join berhasil disetujui, tetapi pesan sambutan gagal dikirim.');}catch(dmErr){recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Permintaan join berhasil disetujui, tetapi pengiriman pesan sambutan gagal.');}
  }else{
    try{const dm=telegramSendToChat_(String(request.user_chat_id||userId),'Permintaan bergabung belum dapat disetujui. Pastikan Telegram sudah terhubung dan status member MPS sudah Berhasil.');if(!dm.ok)recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_DECLINE_DM_FAILED',userId,'WARNING','Permintaan join ditolak, tetapi pesan penjelasan gagal dikirim.');}catch(dmErr){recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_DECLINE_DM_FAILED',userId,'WARNING','Permintaan join ditolak, tetapi pengiriman pesan penjelasan gagal.');}
  }
  return true;
}

function verifyTelegramLinkFromUpdate_(token,msg) {
  const hash=sha256_(token),links=getMpsMemberLinksSheet_(),row=findMpsMemberLinkRow_(links,hash);
  if(!row){telegramSendToChat_(String(msg.chat.id),'Tautan verifikasi tidak ditemukan. Buat tautan baru dari portal MPS.');return false;}
  const v=links.getRange(row,1,1,MPS_MEMBER_LINKS.headers.length).getValues()[0];
  if(!String(v[4]||'')&&String(v[5]||''))return verifyTelegramApplication_(row,v,msg);
  return verifyTelegramLinkLegacy_(token,msg);
}
function verifyTelegramApplication_(linkRow,link,msg) {
  const chatId=String(msg.chat&&msg.chat.id||''),userId=String(msg.from&&msg.from.id||''),appRef=String(link[5]||'');
  if(!userId||userId!==chatId){telegramSendToChat_(chatId,'Verifikasi harus dilakukan melalui chat pribadi bot MPS.');return false;}
  consumeRateLimit_('mps_tg_verify_'+sha256_(userId).slice(0,20),5,900,'Terlalu banyak percobaan verifikasi Telegram. Coba lagi 15 menit.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  let appSheet=null,appRow=0,appSnapshot=null,depSheet=null,depRow=0,depSnapshot=null,access=null,accessRow=0,accessSnapshot=null,accessCreated=false,linkSheet=null,actualLinkRow=0,linkSnapshot=null,committed=false;
  try{
    linkSheet=getMpsMemberLinksSheet_();actualLinkRow=findMpsMemberLinkRow_(linkSheet,String(link[0]||''));if(!actualLinkRow)throw new Error('Token verifikasi tidak ditemukan.');
    const fresh=linkSheet.getRange(actualLinkRow,1,1,MPS_MEMBER_LINKS.headers.length).getValues()[0];linkSnapshot=fresh.slice();
    if(String(fresh[3])!=='Menunggu'||!(fresh[2] instanceof Date)||fresh[2].getTime()<=Date.now())throw new Error('Tautan verifikasi kedaluwarsa atau sudah digunakan.');
    appSheet=getMpsApplicationsSheet_();appRow=findMpsApplicationRow_(appSheet,appRef);if(!appRow)throw new Error('Application Ref tidak ditemukan.');
    appSnapshot=appSheet.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];
    if(!['Deposit Dikirim','Menunggu Validasi Admin'].includes(String(appSnapshot[7]||'')))throw new Error('Pendaftaran tidak sedang menunggu verifikasi Telegram.');
    const supplied=normalizeTelegram_(msg.from.username?'@'+msg.from.username:'');const registered=normalizeTelegram_(appSnapshot[3]||'');
    if(registered&&registered.replace(/^@/,'').toLowerCase()!==supplied.replace(/^@/,'').toLowerCase())throw new Error('Username Telegram berbeda dari data pendaftaran. Hubungi admin untuk koreksi.');
    depSheet=getMpsDepositsSheet_();depRow=findMpsDepositRow_(depSheet,appRef);if(!depRow)throw new Error('Data deposit tidak ditemukan.');
    depSnapshot=depSheet.getRange(depRow,1,1,MPS_DEPOSITS.headers.length).getValues()[0];
    if(!['Menunggu Telegram','Menunggu Validasi Admin'].includes(String(depSnapshot[9]||'')))throw new Error('Status deposit tidak mengizinkan verifikasi Telegram.');
    access=getTelegramAccessSheet_();const existingUser=findTelegramAccessByUserId_(access,userId);
    if(existingUser){const old=access.getRange(existingUser,1,1,11).getValues()[0];if(String(old[0])!==appRef)throw new Error('Akun Telegram ini sudah terhubung ke pengajuan lain.');accessRow=existingUser;accessSnapshot=old;}
    else{accessRow=findTelegramAccessByMemberId_(access,appRef);if(accessRow){accessSnapshot=access.getRange(accessRow,1,1,11).getValues()[0];if(String(accessSnapshot[1]||'')&&String(accessSnapshot[1])!==userId)throw new Error('Pengajuan ini sudah terhubung ke akun Telegram lain.');}}
    const username=String(msg.from.username||''),first=clean_(msg.from.first_name,80),now=new Date(),rowData=[appRef,userId,chatId,sheetText_(normalizeTelegram_(username?'@'+username:'')),sheetText_(first),now,'Menunggu persetujuan','','','',''];
    if(accessRow)access.getRange(accessRow,1,1,11).setValues([rowData]);else{access.appendRow(rowData);accessRow=access.getLastRow();accessCreated=true;}
    linkSheet.getRange(actualLinkRow,4).setValue('Terverifikasi');linkSheet.getRange(actualLinkRow,7,1,5).setValues([[userId,chatId,sheetText_(username),sheetText_(first),now]]);
    appSheet.getRange(appRow,11,1,3).setValues([['Terverifikasi',userId,chatId]]);appSheet.getRange(appRow,8).setValue('Menunggu Validasi Admin');appSheet.getRange(appRow,15).setValue(now);
    depSheet.getRange(depRow,10,1,4).setValues([['Menunggu Validasi Admin',userId,chatId,now]]);
    committed=true;
  }catch(err){
    const rollbackErrors=[];
    if(accessCreated&&access&&accessRow)try{access.deleteRow(accessRow);}catch(e){rollbackErrors.push('akses Telegram baru: '+safeErrorMessage_(e));}
    else if(access&&accessRow&&accessSnapshot)try{access.getRange(accessRow,1,1,11).setValues([accessSnapshot]);}catch(e){rollbackErrors.push('akses Telegram: '+safeErrorMessage_(e));}
    if(depSheet&&depRow&&depSnapshot)try{depSheet.getRange(depRow,1,1,depSnapshot.length).setValues([depSnapshot]);}catch(e){rollbackErrors.push('deposit: '+safeErrorMessage_(e));}
    if(appSheet&&appRow&&appSnapshot)try{appSheet.getRange(appRow,1,1,appSnapshot.length).setValues([appSnapshot]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
    if(linkSheet&&actualLinkRow&&linkSnapshot)try{linkSheet.getRange(actualLinkRow,1,1,linkSnapshot.length).setValues([linkSnapshot]);}catch(e){rollbackErrors.push('tautan Telegram: '+safeErrorMessage_(e));}
    if(rollbackErrors.length)throw new Error('Verifikasi Telegram gagal: '+safeErrorMessage_(err)+'. Rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Hentikan pemrosesan ulang dan lakukan rekonsiliasi manual.');
    throw err;
  }finally{lock.releaseLock();}
  if(committed){recordMpsAudit_('TELEGRAM',appRef,'TELEGRAM_LINKED',appRef,'SUCCESS','Akun Telegram diverifikasi untuk Application Ref; Member ID belum diterbitkan.');try{const notice=telegramSendToChat_(chatId,'✅ Telegram berhasil terhubung ke pengajuan MPS. Admin akan memeriksa identitas dan bukti deposit. Member ID baru diterbitkan setelah persetujuan admin.');if(!notice.ok)recordMpsAudit_('TELEGRAM',appRef,'TELEGRAM_LINK_NOTICE_FAILED',appRef,'WARNING','Verifikasi tersimpan, tetapi pesan konfirmasi gagal dikirim.');}catch(e){}}
  return committed;
}

function verifyTelegramLinkLegacy_(token,msg) {
  const tokenHash=sha256_(token),sh=getMpsMemberLinksSheet_(),lock=LockService.getScriptLock();
  lock.waitLock(10000);
  let verifiedMemberId='',chatId=String(msg.chat&&msg.chat.id||''),committed=false,failureMessage='';
  let access=null,accessRow=0,accessSnapshot=null,accessCreatedRow=0,memberSheet=null,memberRow=0,memberSnapshot=null,appSheet=null,appRow=0,appSnapshot=null,linkSnapshot=null;
  try{
    const row=findMpsMemberLinkRow_(sh,tokenHash);
    if(!row){failureMessage='Tautan verifikasi tidak ditemukan. Kembali ke website MPS dan buat tautan baru.';throw new Error('MPS_TELEGRAM_LINK_NOT_FOUND');}
    const v=sh.getRange(row,1,1,MPS_MEMBER_LINKS.headers.length).getValues()[0];linkSnapshot=v.slice();
    if(!(v[2] instanceof Date)||v[2].getTime()<=Date.now()||v[3]!=='Menunggu'){
      if(v[3]==='Menunggu'&&v[2] instanceof Date&&v[2].getTime()<=Date.now()){sh.getRange(row,4).setValue('Expired');linkSnapshot[3]='Expired';}
      failureMessage='Tautan verifikasi sudah kedaluwarsa atau pernah digunakan. Minta tautan baru melalui website MPS.';throw new Error('MPS_TELEGRAM_LINK_EXPIRED');
    }
    const userId=String(msg.from&&msg.from.id||'');if(!userId||userId!==chatId){failureMessage='Verifikasi harus dilakukan melalui chat pribadi bot MPS.';throw new Error('MPS_TELEGRAM_PRIVATE_CHAT_REQUIRED');}
    const memberId=String(v[4]||'');verifiedMemberId=memberId;
    access=getTelegramAccessSheet_();const existingUser=findTelegramAccessByUserId_(access,userId);
    if(existingUser){const existingMember=String(access.getRange(existingUser,1).getDisplayValue()||'');if(existingMember!==memberId)throw new Error('Akun Telegram ini sudah terhubung ke member lain.');accessRow=existingUser;}
    else accessRow=findTelegramAccessByMemberId_(access,memberId);
    if(accessRow)accessSnapshot=access.getRange(accessRow,1,1,11).getValues()[0];
    memberSheet=getMemberSheet_();memberRow=findMemberById_(memberSheet,memberId);if(!memberRow)throw new Error('ID Member untuk tautan Telegram tidak ditemukan.');
    memberSnapshot=memberSheet.getRange(memberRow,1,1,MPS.headers.length).getValues()[0];
    if(String(memberSnapshot[MPS_COL.depositStatus-1]||'')!=='Menunggu verifikasi')throw new Error('Status deposit tidak mengizinkan verifikasi Telegram.');
    appSheet=getMpsApplicationsSheet_();appRow=findMpsApplicationRowByMember_(appSheet,memberId);
    if(!appRow||String(appSheet.getRange(appRow,8).getDisplayValue()||'')!=='Deposit Dikirim')throw new Error('Pendaftaran tidak sedang menunggu validasi Telegram. Kirim ulang konfirmasi deposit jika diperlukan.');
    appSnapshot=appSheet.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).getValues()[0];
    const username=String(msg.from.username||''),firstName=String(msg.from.first_name||'');
    const rowData=[memberId,userId,chatId,sheetText_(normalizeTelegram_(username?'@'+username:'')),sheetText_(clean_(firstName,80)),new Date(),'Menunggu persetujuan','','','',''];
    if(existingUser){access.getRange(accessRow,3,1,4).setValues([[chatId,rowData[3],rowData[4],new Date()]]);access.getRange(accessRow,7).setValue('Menunggu persetujuan');}
    else if(accessRow)access.getRange(accessRow,1,1,rowData.length).setValues([rowData]);
    else{access.appendRow(rowData);accessCreatedRow=access.getLastRow();}
    memberSheet.getRange(memberRow,MPS_COL.telegram).setValue(sheetText_(normalizeTelegram_(username?'@'+username:'')));
    sh.getRange(row,4).setValue('Terverifikasi');sh.getRange(row,7,1,5).setValues([[userId,chatId,sheetText_(username),sheetText_(firstName),new Date()]]);
    appSheet.getRange(appRow,11,1,3).setValues([['Terverifikasi',userId,chatId]]);appSheet.getRange(appRow,15).setValue(new Date());appSheet.getRange(appRow,8).setValue('Menunggu Validasi Admin');
    if(String(memberSnapshot[MPS_COL.registrationStatus-1]||'')!=='Ditolak')memberSheet.getRange(memberRow,MPS_COL.registrationStatus).setValue('Menunggu Validasi Admin');
    committed=true;
  }catch(err){
    const rollbackErrors=[];
    if(accessCreatedRow&&access)try{access.deleteRow(accessCreatedRow);}catch(e){rollbackErrors.push('akses Telegram baru: '+safeErrorMessage_(e));}
    else if(accessRow&&accessSnapshot&&access)try{access.getRange(accessRow,1,1,11).setValues([accessSnapshot]);}catch(e){rollbackErrors.push('akses Telegram: '+safeErrorMessage_(e));}
    if(memberRow&&memberSnapshot&&memberSheet)try{memberSheet.getRange(memberRow,1,1,MPS.headers.length).setValues([memberSnapshot]);}catch(e){rollbackErrors.push('member: '+safeErrorMessage_(e));}
    if(appRow&&appSnapshot&&appSheet)try{appSheet.getRange(appRow,1,1,MPS_APPLICATIONS.headers.length).setValues([appSnapshot]);}catch(e){rollbackErrors.push('aplikasi: '+safeErrorMessage_(e));}
    if(linkSnapshot){const row=findMpsMemberLinkRow_(sh,tokenHash);if(row)try{sh.getRange(row,1,1,MPS_MEMBER_LINKS.headers.length).setValues([linkSnapshot]);}catch(e){rollbackErrors.push('tautan Telegram: '+safeErrorMessage_(e));}}
    if(rollbackErrors.length)failureMessage='Verifikasi Telegram gagal dan rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Hentikan pemrosesan ulang dan lakukan rekonsiliasi manual.';
    else if(!failureMessage)failureMessage='Verifikasi Telegram belum dapat diselesaikan. Periksa kembali status tautan atau hubungi admin MPS.';
  }finally{lock.releaseLock();}
  if(failureMessage){try{telegramSendToChat_(chatId,failureMessage);}catch(noticeErr){console.error('Telegram legacy verification notice failed: '+safeErrorMessage_(noticeErr));}return false;}
  if(committed){
    recordMpsAudit_('TELEGRAM',verifiedMemberId,'TELEGRAM_LINKED',verifiedMemberId,'SUCCESS','Akun Telegram terverifikasi menggunakan token sekali pakai.');
    try{const notice=telegramSendToChat_(chatId,'✅ Telegram berhasil terhubung ke pendaftaran MPS. Admin akan memeriksa identitas dan bukti deposit. Jangan bagikan tautan verifikasi kepada siapa pun.');if(!notice.ok)recordMpsAudit_('TELEGRAM',verifiedMemberId,'TELEGRAM_LINK_NOTICE_FAILED',verifiedMemberId,'WARNING','Verifikasi tersimpan, tetapi pesan konfirmasi gagal dikirim.');}catch(noticeErr){recordMpsAudit_('TELEGRAM',verifiedMemberId,'TELEGRAM_LINK_NOTICE_FAILED',verifiedMemberId,'WARNING','Verifikasi tersimpan, tetapi pengiriman pesan konfirmasi gagal.');}
  }
  return committed;
}



function getTelegramLinksSheet_() {
  return getOrCreateTelegramSheet_('Telegram Links', ['Token Hash','Dibuat','Kedaluwarsa','Status','Telegram User ID','Chat ID','Username','Nama Depan','Dikonsumsi']);
}
function getTelegramAccessSheet_() {
  return getOrCreateTelegramSheet_('VIP Access', ['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir']);
}
function getOrCreateTelegramSheet_(name, headers) {
  const ss = openDatabase_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); }
  const actual = sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
  headers.forEach(function(h,i) { if (String(actual[i] || '') !== h) throw new Error('Header sheet ' + name + ' tidak sesuai. Tidak ada data yang diubah.'); });
  return sh;
}
function findTelegramLinkRow_(sheet, hash) {
  const last = sheet.getLastRow(); if (last < 2) return 0;
  const vals = sheet.getRange(2,1,last-1,1).getDisplayValues();
  for (let i=0;i<vals.length;i++) if (String(vals[i][0]) === hash) return i+2;
  return 0;
}
function getVerifiedTelegramLink_(token) {
  if (!/^[A-Fa-f0-9]{40,64}$/.test(token)) return null;
  const sh = getTelegramLinksSheet_(); const row = findTelegramLinkRow_(sh, sha256_(token)); if (!row) return null;
  const v = sh.getRange(row,1,1,9).getValues()[0];
  if (v[3] !== 'Terverifikasi' || !(v[2] instanceof Date) || v[2].getTime() <= Date.now()) return null;
  return { row:row, telegramUserId:String(v[4]), chatId:String(v[5]), username:String(v[6] || ''), firstName:String(v[7] || '') };
}
function markTelegramLinkConsumed_(row, now) { const sh=getTelegramLinksSheet_(); const hash=String(sh.getRange(row,1).getDisplayValue()||''); sh.getRange(row,4).setValue('Dipakai'); sh.getRange(row,9).setValue(now); if(hash)CacheService.getScriptCache().put('mps_tg_link_'+hash,'CONSUMED',900); }
function findTelegramAccessByUserId_(sheet, userId) {
  const last=sheet.getLastRow(); if(last<2)return 0; const vals=sheet.getRange(2,2,last-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0])===String(userId)) return i+2; return 0;
}
function findTelegramAccessByMemberId_(sheet, memberId) {
  const last=sheet.getLastRow(); if(last<2)return 0; const vals=sheet.getRange(2,1,last-1,1).getDisplayValues();
  for(let i=0;i<vals.length;i++) if(String(vals[i][0]).toUpperCase()===String(memberId).toUpperCase()) return i+2; return 0;
}
function telegramSendToChat_(chatId, message) {
  const token=PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_BOT_TOKEN'); if(!token||!chatId)return {ok:false};
  const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',payload:{chat_id:chatId,text:String(message||'').slice(0,3900)},muteHttpExceptions:true});
  const j=parseTelegramResponse_(r); return {ok:!!(r.getResponseCode()>=200&&r.getResponseCode()<300&&j.ok),error:j.description||''};
}
function sendVipInvite_(memberId) {
  const props=PropertiesService.getScriptProperties(),token=props.getProperty('MPS_TELEGRAM_BOT_TOKEN'),group=props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID');
  if(props.getProperty('MPS_PIN_DELIVERED_'+memberId)!=='1')return {ok:false,error:'PIN belum berhasil dikirim secara privat. Undangan VIP ditahan.'};
  if(!token||!group)return {ok:false,error:'Bot atau grup VIP belum dikonfigurasi.'};
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  let sh,row,v,memberRow,m,previous,previousLink,previousDbInvite;
  try{
    const cache=CacheService.getScriptCache(),busyKey='mps_vip_invite_busy_'+sha256_(memberId).slice(0,24);
    if(cache.get(busyKey))return {ok:false,error:'Undangan VIP sedang diproses. Tunggu sebentar sebelum mencoba ulang.'};
    cache.put(busyKey,'1',90);
    sh=getTelegramAccessSheet_();row=findTelegramAccessByMemberId_(sh,memberId);if(!row){cache.remove(busyKey);return {ok:false,error:'Akun Telegram member belum terhubung.'};}
    v=sh.getRange(row,1,1,11).getValues()[0];if(!v[1]||!v[2]||String(v[1])!==String(v[2])){cache.remove(busyKey);return {ok:false,error:'Identitas Telegram member tidak cocok.'};}
    const db=getMemberSheet_();memberRow=findMemberById_(db,memberId);if(!memberRow){cache.remove(busyKey);return {ok:false,error:'Data member tidak ditemukan.'};}
    m=db.getRange(memberRow,1,1,MPS.headers.length).getValues()[0];if(String(m[MPS_COL.registrationStatus-1])!=='Berhasil'||String(m[MPS_COL.depositStatus-1])!=='Disetujui'){cache.remove(busyKey);return {ok:false,error:'Undangan hanya untuk member Berhasil dengan deposit Disetujui.'};}
    previous=v.slice(6,11);previousLink=String(v[7]||'');previousDbInvite=m.slice(25,30);
  }finally{lock.releaseLock();}
  const busyKey='mps_vip_invite_busy_'+sha256_(memberId).slice(0,24),cache=CacheService.getScriptCache();
  try{
    const wasMarkedActive=String(v[6])==='Aktif';let membershipVerified=false;
    try{
      const check=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getChatMember',{method:'post',payload:{chat_id:group,user_id:String(v[1])},muteHttpExceptions:true});
      const data=parseTelegramResponse_(check),status=data.ok&&data.result?String(data.result.status||''):'';membershipVerified=!!data.ok;
      if(status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&data.result.is_member===true)){
        // getChatMember is an observation, not a status-change event.
        // The authoritative chat_member update owns both spreadsheet status writes.
        return {ok:true,alreadyJoined:true};
      }
      if(status==='kicked')return {ok:false,error:'Akun Telegram ini sedang diblokir dari grup VIP. Admin harus meninjau blokir secara manual.'};
    }catch(e){console.error('VIP membership check: '+safeErrorMessage_(e));if(wasMarkedActive)return {ok:false,error:'Status keanggotaan Telegram belum dapat diverifikasi; tautan baru tidak dibuat.'};}
    if(wasMarkedActive&&!membershipVerified)return {ok:false,error:'Status keanggotaan Telegram belum dapat diverifikasi; tautan baru tidak dibuat.'};
    const expiry=Math.floor(Date.now()/1000)+86400,resp=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/createChatInviteLink',{method:'post',payload:{chat_id:group,creates_join_request:true,expire_date:expiry,name:'MPS '+memberId},muteHttpExceptions:true}),data=parseTelegramResponse_(resp);
    if(!data.ok||!data.result||!data.result.invite_link)return {ok:false,error:data.description||'Telegram gagal membuat undangan VIP.'};
    const link=String(data.result.invite_link),expiryDate=new Date(expiry*1000);
    let storeError=null;
    const lk=LockService.getScriptLock();lk.waitLock(10000);
    try{
      const freshSheet=getTelegramAccessSheet_(),freshRow=findTelegramAccessByMemberId_(freshSheet,memberId),freshDb=getMemberSheet_(),freshMember=findMemberById_(freshDb,memberId);
      if(!freshRow||!freshMember)throw new Error('Data member berubah saat undangan dibuat.');
      const freshData=freshDb.getRange(freshMember,1,1,MPS.headers.length).getValues()[0];if(String(freshData[MPS_COL.registrationStatus-1])!=='Berhasil'||String(freshData[MPS_COL.depositStatus-1])!=='Disetujui')throw new Error('Status member berubah; undangan dibatalkan.');
      freshSheet.getRange(freshRow,7,1,5).setValues([['Undangan dikirim',link,expiryDate,v[9],'']]);freshDb.getRange(freshMember,26,1,5).setValues([[link,expiryDate,freshData[27]||'',String(v[1]),'Undangan Dikirim']]);
    }catch(e){storeError=e;}finally{lk.releaseLock();}
    if(storeError){const revoked=revokeVipInviteLink_(group,link),restoreLock=LockService.getScriptLock();restoreLock.waitLock(10000);try{const restoreSheet=getTelegramAccessSheet_(),restoreRow=findTelegramAccessByMemberId_(restoreSheet,memberId);if(restoreRow&&String(restoreSheet.getRange(restoreRow,8).getDisplayValue()||'')===link)restoreSheet.getRange(restoreRow,7,1,5).setValues([previous]);const restoreDb=getMemberSheet_(),restoreMember=findMemberById_(restoreDb,memberId);if(restoreMember)restoreDb.getRange(restoreMember,26,1,5).setValues([previousDbInvite]);}finally{restoreLock.releaseLock();}if(!revoked)recordMpsAudit_('TELEGRAM',memberId,'VIP_INVITE_REVOKE_FAILED',memberId,'WARNING','Pembuatan undangan gagal dan pencabutan link Telegram juga gagal; admin perlu memeriksa.');throw storeError;}
    let dm={ok:false,error:'Telegram tidak dapat dihubungi.'};try{dm=telegramSendToChat_(String(v[2]),'🎉 Selamat! Keanggotaan MPS Anda telah disetujui.\nGunakan tautan berikut untuk meminta bergabung ke MPS VIP Community. Admin bot akan memverifikasi akun Telegram Anda.\nTautan berlaku sampai '+expiryDate.toLocaleString()+':\n'+link+'\nJangan bagikan tautan ini.');}catch(e){dm={ok:false,error:safeErrorMessage_(e)};}
    if(!dm.ok){const revoked=revokeVipInviteLink_(group,link),lk2=LockService.getScriptLock();lk2.waitLock(10000);try{const freshSheet=getTelegramAccessSheet_(),freshRow=findTelegramAccessByMemberId_(freshSheet,memberId);if(freshRow&&String(freshSheet.getRange(freshRow,8).getDisplayValue()||'')===link)freshSheet.getRange(freshRow,7,1,5).setValues([previous]);const freshDb=getMemberSheet_(),freshMember=findMemberById_(freshDb,memberId);if(freshMember)freshDb.getRange(freshMember,26,1,5).setValues([previousDbInvite]);}finally{lk2.releaseLock();}if(!revoked)recordMpsAudit_('TELEGRAM',memberId,'VIP_INVITE_REVOKE_FAILED',memberId,'WARNING','Pengiriman DM gagal dan tautan baru tidak berhasil dicabut.');return {ok:false,error:revoked?'Telegram gagal mengirim undangan. Tautan baru dicabut; undangan lama dipertahankan.':'Telegram gagal mengirim undangan dan pencabutan tautan baru gagal. Admin harus memeriksa grup.'};}
    if(previousLink&&previousLink!==link&&!revokeVipInviteLink_(group,previousLink))recordMpsAudit_('TELEGRAM',memberId,'OLD_VIP_INVITE_REVOKE_FAILED',memberId,'WARNING','Undangan baru berhasil dikirim, tetapi tautan lama gagal dicabut.');
    return {ok:true};
  }catch(err){return {ok:false,error:safeErrorMessage_(err)};}
  finally{cache.remove(busyKey);}
}

function isSafePublicIdentity_(value) {
  const text=String(value||'').trim();
  if(!text||text.length>100)return false;
  // Nama asli boleh ditampilkan, tetapi identifier dan detail pribadi tidak.
  // Filter diterapkan pada alias dan teks aktivitas publik sebelum API mengirimkannya.
  const sensitivePattern=/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\+?\d[\d ()-]{7,}\b|\b(?:MT5|LOGIN)\s*[:#-]?\s*\d{4,}\b|(?:^|\s)@[A-Z0-9_]{5,32}\b|\bMPS-(?:APP-)?[A-F0-9]{8,20}\b|https?:\/\/|www\.|\b(?:RP|IDR)\s*[\d.,]+)/i;
  return !sensitivePattern.test(text);
}
/**
 * Durable VIP transition integration for original Telegram chat_member events.
 * All spreadsheet writes and keyed effects share one ScriptLock scope.
 * No Telegram network calls occur while the lock is held.
 */
function getMpsExistingVipAccessSheetForTransition_() {
  const ss=openDatabase_(),sh=ss.getSheetByName('VIP Access');
  const headers=['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'];
  if(!sh||sh.getLastRow()<1||sh.getLastColumn()<headers.length)throw new Error('VIP_TRANSITION_ACCESS_SHEET_MISSING_OR_INVALID');
  const actual=sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
  headers.forEach(function(h,i){if(String(actual[i]||'').trim()!==h)throw new Error('VIP_TRANSITION_ACCESS_SCHEMA_MISMATCH');});
  return sh;
}
function findUniqueMpsTransitionRow_(sheet,column,value) {
  const last=sheet.getLastRow();if(last<2)return 0;
  const vals=sheet.getRange(2,column,last-1,1).getDisplayValues();let found=0;
  for(let i=0;i<vals.length;i++)if(String(vals[i][0]||'')===String(value)){
    if(found)throw new Error('VIP_TRANSITION_DUPLICATE_IDENTITY_ROW');found=i+2;
  }
  return found;
}
function resolveMpsVipChatMemberTransition_(tx,input) {
  tx.assertActive();
  const userId=String(input.telegramUserId||''),status=String(input.telegramStatus||'');
  const active=status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&input.isMember===true);
  const left=status==='left'||status==='kicked'||(status==='restricted'&&input.isMember===false);
  if(!active&&!left)return {ignored:true};
  const access=getMpsExistingVipAccessSheetForTransition_();
  const accessRow=findUniqueMpsTransitionRow_(access,2,userId);
  if(left&&!accessRow)return {ignored:true};
  const accessData=accessRow?access.getRange(accessRow,1,1,11).getValues()[0]:null;
  const rawMemberId=String(accessData&&accessData[0]||'');
  const validMemberId=/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(rawMemberId);
  let memberId=validMemberId?rawMemberId:'TGUSER:'+userId;
  let memberName='Member MPS',allowed=false;
  if(accessData&&validMemberId&&String(accessData[1])===userId&&String(accessData[2])===userId){
    const db=getMemberSheet_(),memberRow=findUniqueMpsTransitionRow_(db,MPS_COL.id,memberId);
    if(memberRow){
      const m=db.getRange(memberRow,1,1,MPS.headers.length).getValues()[0];
      allowed=String(m[MPS_COL.registrationStatus-1])==='Berhasil'&&String(m[MPS_COL.depositStatus-1])==='Disetujui';
      if(allowed)memberName=clean_(m[MPS_COL.accountName-1]||m[MPS_COL.nickname-1]||'Member MPS',100)||'Member MPS';
    }
  }
  const targetState=left?'LEFT':(allowed?'ACTIVE':'DENIED');
  const inviteToRevoke=targetState==='ACTIVE'&&accessData?String(accessData[7]||''):'';
  return {
    memberId:memberId,memberName:memberName,telegramUserId:userId,targetState:targetState,
    tickerAllowed:targetState==='ACTIVE'&&input.wasMember===false&&isSafePublicIdentity_(memberName),
    inviteToRevoke:inviteToRevoke,
    kickNeeded:targetState==='DENIED'&&(status==='member'||(status==='restricted'&&input.isMember===true)),
    adminAlert:targetState==='DENIED'&&(status==='administrator'||status==='creator'),
    telegramStatus:status
  };
}
function createMpsVipTransitionStatusWriter_() {
  function accessSheet_(){return getMpsExistingVipAccessSheetForTransition_();}
  return Object.freeze({
    applyAccessStatus:function(tx,r){
      tx.assertActive();
      const sh=accessSheet_(),row=findUniqueMpsTransitionRow_(sh,2,r.telegramUserId);
      if(!row){if(r.targetState==='DENIED')return;throw new Error('VIP_TRANSITION_ACCESS_ROW_MISSING');}
      const current=sh.getRange(row,1,1,11).getDisplayValues()[0];
      if(String(r.memberId).indexOf('TGUSER:')!==0&&String(current[0]||'')!==String(r.memberId))throw new Error('VIP_TRANSITION_ACCESS_IDENTITY_CHANGED');
      if(r.targetState==='ACTIVE'){
        sh.getRange(row,7).setValue('Aktif');sh.getRange(row,10).setValue(new Date(r.sourceDate*1000));
      }else if(r.targetState==='LEFT')sh.getRange(row,7).setValue('Keluar');
      else if(r.targetState==='DENIED')sh.getRange(row,7).setValue('Akses Ditolak');
      else throw new Error('VIP_TRANSITION_STATUS_INVALID');
      SpreadsheetApp.flush();
    },
    applyMemberStatus:function(tx,r){
      tx.assertActive();
      if(r.targetState==='DENIED'||!/^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(String(r.memberId)))return;
      const db=getMemberSheet_(),row=findUniqueMpsTransitionRow_(db,MPS_COL.id,r.memberId);
      if(!row){if(r.targetState==='ACTIVE')throw new Error('VIP_TRANSITION_MEMBER_ROW_MISSING');return;}
      if(r.targetState==='ACTIVE')db.getRange(row,28,1,3).setValues([[new Date(r.sourceDate*1000),String(r.telegramUserId),'Aktif']]);
      else if(r.targetState==='LEFT')db.getRange(row,30).setValue('Keluar');
      else throw new Error('VIP_TRANSITION_STATUS_INVALID');
      SpreadsheetApp.flush();
    }
  });
}
function processMpsVipChatMemberEvent_(update,memberUpdate) {
  const props=PropertiesService.getScriptProperties(),groupId=String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||'');
  const spreadsheetId=String(props.getProperty('MPS_SPREADSHEET_ID')||'');
  if(!groupId)return 'IGNORED';
  if(!spreadsheetId)throw new Error('MPS_SPREADSHEET_ID_REQUIRED_FOR_VIP_TRANSITIONS');
  const ledger=createMpsGasEffectLedger_({spreadsheetId:spreadsheetId});
  const store=createMpsGasVipTransitionStore_({spreadsheetId:spreadsheetId});
  const orchestrator=createMpsGasVipTransitionOrchestrator_({ledger:ledger,store:store,statusWriter:createMpsVipTransitionStatusWriter_()});
  const handler=createMpsGasVipChatMemberHandler_({
    orchestrator:orchestrator,vipChatId:groupId,
    hashEvent:function(event){return sha256_(JSON.stringify(event));},
    resolveTransition:resolveMpsVipChatMemberTransition_,
    afterTransition:function(context){
      const r=context.resolved;
      if(context.targetState==='ACTIVE'){
        CacheService.getScriptCache().remove('mps_public_center_v480');
        if(r.inviteToRevoke&&!revokeVipInviteLink_(groupId,r.inviteToRevoke)){
          sendTelegram_('⚠️ PERINGATAN MPS: member '+r.memberId+' sudah bergabung, tetapi tautan undangan lama gagal dicabut. Periksa invite link VIP Community.');
        }
      }else if(context.targetState==='DENIED'){
        if(r.kickNeeded&&!kickMpsUnauthorizedUser_(groupId,r.telegramUserId)){
          sendTelegram_('⚠️ PERINGATAN KEAMANAN MPS: akun Telegram '+r.telegramUserId+' tidak memenuhi syarat member, tetapi bot gagal memastikan penghapusannya dari VIP Community. Admin harus segera memeriksa keanggotaan grup.');
        }else if(r.adminAlert){
          sendTelegram_('⚠️ PERINGATAN KEAMANAN MPS: akun Telegram '+r.telegramUserId+' memiliki status '+r.telegramStatus+' di grup VIP, tetapi tidak cocok dengan member MPS yang disetujui. Bot tidak melakukan demosi otomatis. Admin perlu memeriksa manual.');
        }
      }
    }
  });
  return handler.process(update);
}
/**
 * Read-only schema preflight for the explicit v4.8 member-sheet migration.
 * This function never writes, formats, migrates, provisions, or acquires a lock.
 */
/**
 * Read-only validation of every sheet schema required by VIP transition storage.
 * Missing/empty tabs are acceptable because provisioning creates them; existing
 * populated tabs must match exactly. Existing Effect Key values are validated.
 */
function inspectMpsVipTransitionStorageSchemas_(ss,store) {
  const checks=[];
  function check_(name,headers,allowEffectKey) {
    const sh=ss.getSheetByName(name);
    if(!sh){checks.push({name:name,ok:true,state:'MISSING_WILL_CREATE'});return;}
    const lastRow=sh.getLastRow();
    if(lastRow===0){checks.push({name:name,ok:true,state:'EMPTY_WILL_INITIALIZE'});return;}
    const width=sh.getLastColumn();
    if(width!==headers.length&&!(allowEffectKey&&width===headers.length+1)){
      checks.push({name:name,ok:false,state:'COLUMN_COUNT_MISMATCH'});return;
    }
    const actual=sh.getRange(1,1,1,width).getDisplayValues()[0].map(function(v){return String(v==null?'':v);});
    if(headers.some(function(h,i){return actual[i]!==h;})){
      checks.push({name:name,ok:false,state:'HEADER_MISMATCH'});return;
    }
    if(width===headers.length){
      checks.push({name:name,ok:true,state:'LEGACY_READY'});return;
    }
    if(actual[headers.length]!=='Effect Key'){
      checks.push({name:name,ok:false,state:'EFFECT_KEY_HEADER_MISMATCH'});return;
    }
    const last=sh.getLastRow(),seen=Object.create(null);
    if(last>1){
      const keys=sh.getRange(2,headers.length+1,last-1,1).getDisplayValues();
      for(let i=0;i<keys.length;i++){
        const key=String(keys[i][0]==null?'':keys[i][0]);
        if(!key)continue;
        if(!/^[A-Za-z0-9:_-]{1,160}$/.test(key)||seen[key]){
          checks.push({name:name,ok:false,state:'EFFECT_KEY_DATA_INVALID'});return;
        }
        seen[key]=true;
      }
    }
    checks.push({name:name,ok:true,state:'ALREADY_MIGRATED'});
  }
  check_('VIP Access',['ID Member','Telegram User ID','Chat ID','Username','Nama Depan','Terhubung','Status VIP','Invite Link','Invite Expiry','Joined At','Error Terakhir'],false);
  check_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers,true);
  check_(MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers,true);
  check_('MPS Telegram VIP Transition Intents',store.headers.intents,false);
  check_('MPS Telegram VIP Member Cursor',store.headers.cursor,false);
  const blocked=checks.filter(function(x){return !x.ok;});
  return {ok:blocked.length===0,checks:checks,message:blocked.length?'Storage preflight diblokir: '+blocked.map(function(x){return x.name+' ('+x.state+')';}).join(', '):'Seluruh skema storage transisi cocok atau aman untuk dibuat/migrasi.'};
}

/**
 * Read-only schema preflight for the explicit v4.8 member-sheet migration.
 * This function never writes, formats, migrates, provisions, or acquires a lock.
 */
function apiAdminInspectMemberSchemaV480(session) {
  requireSuperAdmin_(session);
  const ss=openDatabase_();
  const sh=ss.getSheetByName('Database Member');
  if(!sh)return {ok:false,state:'MISSING_SHEET',actualColumns:0,expectedLegacyColumns:18,expectedV480Columns:MPS.headers.length,appendable:false,provisioningReady:false,message:'Sheet Database Member tidak ditemukan. Tidak ada perubahan dilakukan.'};
  const actualColumns=sh.getLastColumn();
  const legacy=MPS.headers.slice(0,18),full=MPS.headers.slice();
  let headers=[];
  if(actualColumns>0)headers=sh.getRange(1,1,1,actualColumns).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
  if(actualColumns===18&&legacy.every(function(h,i){return headers[i]===h;})){
    return {ok:true,state:'LEGACY_18_READY',actualColumns:18,expectedLegacyColumns:18,expectedV480Columns:full.length,appendable:true,provisioningReady:false,message:'Skema legacy v4.6.1 cocok. Migrasi append-only 12 kolom dapat dijalankan setelah konfirmasi eksplisit.'};
  }
  if(actualColumns===full.length&&full.every(function(h,i){return headers[i]===h;})){
    const spreadsheetId=String(PropertiesService.getScriptProperties().getProperty('MPS_SPREADSHEET_ID')||'');
    if(!spreadsheetId)return {ok:false,state:'CONFIGURATION_BLOCKED',actualColumns:actualColumns,expectedLegacyColumns:18,expectedV480Columns:full.length,appendable:false,provisioningReady:false,message:'MPS_SPREADSHEET_ID belum dikonfigurasi. Provisioning dinonaktifkan.'};
    const store=createMpsGasVipTransitionStore_({spreadsheetId:spreadsheetId});
    const storage=inspectMpsVipTransitionStorageSchemas_(ss,store);
    return {ok:true,state:'READY_30',actualColumns:actualColumns,expectedLegacyColumns:18,expectedV480Columns:full.length,appendable:false,provisioningReady:storage.ok,provisioningChecks:storage.checks,message:storage.ok?'Database Member dan seluruh skema storage transisi cocok atau siap diprovision.': 'Database Member cocok 30 kolom, tetapi '+storage.message};
  }
  return {ok:false,state:'SCHEMA_MISMATCH',actualColumns:actualColumns,expectedLegacyColumns:18,expectedV480Columns:full.length,appendable:false,provisioningReady:false,message:'Skema tidak cocok dengan format legacy 18 kolom atau v4.8 30 kolom. Migrasi dan provisioning dinonaktifkan; tidak ada perubahan dilakukan.'};
}

/**
 * Explicit append-only Database Member migration: legacy v4.6.1 (18 columns)
 * to the v4.8 candidate schema (30 columns). Existing first 18 headers and all
 * member rows are preserved; only headers in columns 19-30 are appended.
 * This function is never invoked automatically by a webhook or page load.
 */
function apiAdminMigrateMemberSheetToV480(session) {
  requireSuperAdmin_(session);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const ss=openDatabase_(),sh=ss.getSheetByName('Database Member');
    if(!sh)throw new Error('Sheet Database Member tidak ditemukan.');
    const legacy=MPS.headers.slice(0,18),full=MPS.headers.slice();
    const last=sh.getLastColumn();
    if(last===18){
      const current=sh.getRange(1,1,1,18).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
      if(legacy.some(function(h,i){return current[i]!==h;}))throw new Error('Skema 18 kolom Database Member tidak cocok; migrasi dibatalkan tanpa perubahan.');
      sh.getRange(1,19,1,12).setValues([full.slice(18)]);
      SpreadsheetApp.flush();
    }else if(last===30){
      const current=sh.getRange(1,1,1,30).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
      if(full.some(function(h,i){return current[i]!==h;}))throw new Error('Skema 30 kolom Database Member tidak cocok; migrasi dibatalkan tanpa perubahan.');
      return {ok:true,migrated:false,columns:30,message:'Database Member sudah memakai skema 30 kolom v4.8.'};
    }else{
      throw new Error('Jumlah kolom Database Member harus tepat 18 atau 30. Tidak ada perubahan dilakukan.');
    }
    const verify=sh.getRange(1,1,1,30).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
    if(full.some(function(h,i){return verify[i]!==h;}))throw new Error('Verifikasi header hasil migrasi gagal.');
    return {ok:true,migrated:true,appendedColumns:12,columns:30,message:'Migrasi header selesai; 18 kolom lama dipertahankan dan 12 header v4.8 ditambahkan di sebelah kanan.'};
  }finally{lock.releaseLock();}
}

/**
 * Explicit admin-only one-time provisioning. Never called by the webhook.
 * Adds Effect Key columns append-only and creates only the two new transition
 * tabs when missing; existing rows are never rewritten or inferred.
 */
function apiAdminPrepareTelegramVipTransitionStorage(session) {
  requireSuperAdmin_(session);
  const spreadsheetId=String(PropertiesService.getScriptProperties().getProperty('MPS_SPREADSHEET_ID')||'');
  if(!spreadsheetId)throw new Error('MPS_SPREADSHEET_ID belum dikonfigurasi.');
  const ledger=createMpsGasEffectLedger_({spreadsheetId:spreadsheetId});
  const store=createMpsGasVipTransitionStore_({spreadsheetId:spreadsheetId});
  ledger.runExclusive(function(tx){
    const ss=SpreadsheetApp.openById(spreadsheetId);
    const memberSheet=ss.getSheetByName('Database Member');
    if(!memberSheet||memberSheet.getLastColumn()!==MPS.headers.length)throw new Error('Database Member belum memakai skema 30 kolom. Jalankan apiAdminMigrateMemberSheetToV480(session) terlebih dahulu.');
    const memberHeaders=memberSheet.getRange(1,1,1,MPS.headers.length).getDisplayValues()[0].map(function(v){return String(v||'').trim();});
    if(MPS.headers.some(function(h,i){return memberHeaders[i]!==h;}))throw new Error('Database Member memiliki header yang tidak cocok. Provisioning dibatalkan tanpa perubahan.');
    const storage=inspectMpsVipTransitionStorageSchemas_(ss,store);
    if(!storage.ok)throw new Error('VIP_TRANSITION_PREFLIGHT_FAILED: '+storage.message);
    getMemberSheet_();getTelegramAccessSheet_();
    getMpsContentSheet_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers,true);
    getMpsContentSheet_(MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers,true);
    tx.migrate('audit');tx.migrate('ticker');
    function ensure_(name,headers){
      let sh=ss.getSheetByName(name);
      if(!sh)sh=ss.insertSheet(name);
      if(sh.getLastRow()===0){sh.getRange(1,1,1,headers.length).setValues([headers]);SpreadsheetApp.flush();return;}
      const width=sh.getLastColumn(),actual=width?sh.getRange(1,1,1,width).getDisplayValues()[0].map(String):[];
      if(actual.length!==headers.length||headers.some(function(h,i){return actual[i]!==h;}))throw new Error('VIP_TRANSITION_SCHEMA_MISMATCH: '+name);
    }
    ensure_('MPS Telegram VIP Transition Intents',store.headers.intents);
    ensure_('MPS Telegram VIP Member Cursor',store.headers.cursor);
  });
  return {ok:true,message:'Penyimpanan transisi VIP siap. Webhook belum diaktifkan otomatis; lakukan uji runtime terisolasi sebelum aktivasi.'};
}

function kickMpsUnauthorizedUser_(groupId,userId){
  const token=PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_BOT_TOKEN');if(!token)return false;
  try{
    // A replay must not unban a user who was manually banned or has already left.
    const check=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/getChatMember',{method:'post',payload:{chat_id:groupId,user_id:String(userId)},muteHttpExceptions:true});
    const current=parseTelegramResponse_(check),status=current.ok&&current.result?String(current.result.status||''):'';
    if(!current.ok)return false;
    if(status==='left'||status==='kicked'||(status==='restricted'&&current.result.is_member===false))return true;
    if(status!=='member'&&!(status==='restricted'&&current.result.is_member===true))return false;
    const r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/banChatMember',{method:'post',payload:{chat_id:groupId,user_id:String(userId)},muteHttpExceptions:true});
    const banned=parseTelegramResponse_(r);if(!banned.ok){console.error('MPS unauthorized VIP removal: '+(banned.description||'ban failed'));return false;}
    const u=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/unbanChatMember',{method:'post',payload:{chat_id:groupId,user_id:String(userId),only_if_banned:true},muteHttpExceptions:true});
    const unbanned=parseTelegramResponse_(u);if(!unbanned.ok){console.error('MPS unauthorized VIP temporary ban remains: '+(unbanned.description||'unban failed'));return false;}
    return true;
  }catch(err){console.error('MPS unauthorized VIP removal: '+safeErrorMessage_(err));return false;}
}
function revokeVipInviteLink_(groupId,inviteLink) {
  if(!groupId||!inviteLink)return false;
  const token=PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_BOT_TOKEN'); if(!token)return false;
  try {
    const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/revokeChatInviteLink',{method:'post',payload:{chat_id:groupId,invite_link:inviteLink},muteHttpExceptions:true});
    const result=parseTelegramResponse_(response);if(result.ok)return true;
    // Telegram reports an already-revoked/expired link as invalid; it is no longer usable.
    return /INVITE_HASH_INVALID|invite.*(?:invalid|revoked|expired|not found|already)/i.test(String(result.description||''));
  }
  catch(err) { console.error('VIP invite revoke: '+safeErrorMessage_(err));return false; }
}
function testTelegram_() {
  const result = sendTelegram_('🧪 TES NOTIFIKASI MARKET PSYCHOLOGY SOCIETY v4');
  if (!result.ok) throw new Error('Tes Telegram gagal: ' + result.error);
  return { ok: true, message: 'Pesan tes berhasil dikirim.' };
}

function sendTelegram_(message) {
  const props=PropertiesService.getScriptProperties(),token=props.getProperty('MPS_TELEGRAM_BOT_TOKEN'),chatId=props.getProperty('MPS_TELEGRAM_CHAT_ID')||props.getProperty('MPS_TELEGRAM_ADMIN_CHAT_ID')||props.getProperty('MPS_ADMIN_TELEGRAM_CHAT_ID');
  if(!token||!chatId)return {ok:false,error:'Token bot atau Chat ID admin belum tersimpan.'};
  try{const response=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'post',payload:{chat_id:chatId,text:String(message||'').slice(0,3900)},muteHttpExceptions:true}),payload=parseTelegramResponse_(response);
    if(response.getResponseCode()<200||response.getResponseCode()>=300||!payload.ok)return {ok:false,error:payload.description||('HTTP '+response.getResponseCode())};return {ok:true};
  }catch(err){console.error('Telegram send failed: '+safeErrorMessage_(err));return {ok:false,error:'Koneksi Telegram gagal.'};}
}

function parseTelegramResponse_(response) {
  try { return JSON.parse(response.getContentText()); }
  catch (err) { return { ok: false, description: 'Respons Telegram tidak terbaca.' }; }
}

/** Formatting only touches the submitted/changed row; filters and charts are preserved. */
function formatMemberRow_(sheet, row) {
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, MPS.headers.length)
    .setBackground('#111111').setFontColor('#D4AF37').setFontWeight('bold')
    .setFontSize(10).setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.getRange(row, 1, 1, MPS.headers.length).setVerticalAlignment('middle').setWrap(true).setFontFamily('Arial').setFontSize(10);
  sheet.getRange(row, MPS_COL.registeredAt).setNumberFormat('dd mmm yyyy hh:mm');
  sheet.getRange(row, MPS_COL.amount).setNumberFormat('"Rp" #,##0');
  sheet.getRange(row, MPS_COL.depositDate).setNumberFormat('dd mmm yyyy');
  sheet.getRange(row, MPS_COL.confirmedAt, 1, 2).setNumberFormat('dd mmm yyyy hh:mm');
}

function normalizeTelegram_(value) {
  const v = clean_(value, 40).replace(/^@+/, '').replace(/\s/g, '');
  return v ? '@' + v : '';
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sheetText_(value) {
  const s = String(value == null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function safeFileName_(value) {
  return String(value || 'bukti-deposit').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 70) || 'bukti-deposit';
}

function cleanRequestId_(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{12,80}$/.test(id) ? id : '';
}

function validDate_(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function isValidImageSignature_(bytes, mime) {
  const b = bytes.slice(0, 12).map(function(x) { return (x + 256) % 256; });
  if (mime === 'image/jpeg') return b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === 'image/png') return b.length >= 8 && b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10';
  if (mime === 'image/webp') return b.length >= 12 && String.fromCharCode.apply(null, b.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, b.slice(8, 12)) === 'WEBP';
  return false;
}

function consumeRateLimit_(key, maxAttempts, windowSeconds, message) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const cache = CacheService.getScriptCache();
    const count = Number(cache.get(key) || 0);
    if (count >= maxAttempts) throw new Error(message);
    cache.put(key, String(count + 1), Math.max(1,Math.min(21600,Number(windowSeconds)||60)));
  } finally {
    lock.releaseLock();
  }
}

function constantTimeEquals_(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function markPinDeliveredIfCurrent_(memberId,pin) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const props=PropertiesService.getScriptProperties(),record=props.getProperty(pinPropertyKey_(memberId));
    if(!record||!verifyMemberPin_(memberId,pin,record)){props.deleteProperty('MPS_PIN_DELIVERED_'+memberId);return false;}
    props.setProperty('MPS_PIN_DELIVERED_'+memberId,'1');return true;
  }finally{lock.releaseLock();}
}

function generatePin_() {
  // UUID digunakan sebagai sumber nilai unik; ini bukan klaim CSPRNG khusus.
  const seed = Utilities.getUuid() + ':' + Utilities.getUuid() + ':' + new Date().getTime();
  const hex = sha256_(seed).slice(0, 12);
  const number = parseInt(hex, 16) % 1000000;
  return String(number).padStart(6, '0');
}

function pinPropertyKey_(memberId) {
  return 'MPS_PIN_' + String(memberId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
}

function storeMemberPin_(memberId, pin) {
  const salt = Utilities.getUuid();
  const hash = sha256_(salt + ':' + memberId + ':' + pin);
  PropertiesService.getScriptProperties().setProperty(pinPropertyKey_(memberId), salt + '$' + hash);
}

function verifyMemberPin_(memberId, pin, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 2) return false;
  return constantTimeEquals_(parts[1], sha256_(parts[0] + ':' + memberId + ':' + pin));
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function formatDateForClient_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) return String(value || '');
  return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd MMM yyyy');
}

function safeParseJson_(value, fallback) {
  try { return JSON.parse(value); } catch (err) { return fallback; }
}

function safeErrorMessage_(err) {
  const message = String(err && err.message || err || 'Terjadi kesalahan.');
  // Hindari mengembalikan detail token, URL endpoint Telegram, atau stack trace ke browser.
  if (/token|script properties|exception|stack|https:\/\/api\.telegram/i.test(message)) return 'Permintaan gagal diproses. Periksa data atau hubungi admin MPS.';
  return message.slice(0, 300);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

/* ========================================================================
 * MPS PUBLIC & MEMBER INTELLIGENCE CENTER — v4.8.0
 * Semua konten publik dipisahkan dari Database Member dan data Market Pulse.
 * Status akses hanya PUBLIC dan VIP. Admin adalah peran pengelola.
 * ====================================================================== */

const MPS_AUDIT_LOGS = Object.freeze({sheet:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']});
const MPS_VIP_TICKER_EVENTS = Object.freeze({sheet:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']});
const MPS_LEARNING_CATALOG = Object.freeze({sheet:'MPS Learning Catalog',headers:['File ID','Title','Category','Level','Description','Sort Order','Status','Updated At']});
const MPS_LEARNING_PROGRESS = Object.freeze({sheet:'MPS Learning Progress',headers:['Member ID','File ID','Completed','Completed At','Updated At']});
const MPS_ANNOUNCEMENTS = Object.freeze({
  sheet:'MPS Announcement Center',
  headers:['ID','Created At','Title','Category','Body','Audience','Priority','Start At','End At','Status','Display Type','Image URL','Button Text','Button URL','Frequency','Color Theme','Animation','Updated At']
});
const MPS_SITE_SETTINGS = Object.freeze({sheet:'MPS Website Settings',headers:['Key','Value','Updated At']});
const MPS_NEWS_ANALYSIS = Object.freeze({
  sheet:'MPS News Analysis',
  headers:['News ID','Impact Summary','USD Impact','XAUUSD Bias','Bullish Scenario','Bearish Scenario','Neutral Scenario','Volatility & Risk','Analyst Context','Status','Updated At']
});
const MPS_AD_PACKAGES = Object.freeze({sheet:'MPS Ad Packages',headers:['Package ID','Name','Description','Price IDR','Duration Days','Placement','Status','Updated At']});
const MPS_AD_REQUESTS = Object.freeze({
  sheet:'MPS Advertising Requests',
  headers:['Request ID','Created At','Brand','Contact Name','Email','Contact Handle','Proposal','Material URL','Target URL','Placement','Duration','Offer','Status','Admin Note','Payment Status','Updated At','Package ID']
});
const MPS_APPROVED_ADS = Object.freeze({
  sheet:'MPS Approved Ads',
  headers:['Ad ID','Request ID','Created At','Brand','Title','Description','Image URL','Target URL','Placement','Start At','End At','Approval Status','Payment Status','Clicks','Updated At']
});

const MPS_CONTENT = Object.freeze({
  newsSheet: 'MPS News',
  calendarSheet: 'MPS Economic Calendar',
  announcementSheet: 'MPS Announcements',
  adsSheet: 'MPS Partner Ads',
  activitySheet: 'MPS Community Activity',
  briefingSheet: 'MPS VIP Briefings',
  newsHeaders: ['ID','Published At','Source','Category','Title','Summary','Source URL','Status','Verification','Access','Pinned','Imported At','Updated At'],
  calendarHeaders: ['ID','Event Date','Event Time WIB','Country','Event Name','Impact','Forecast','Previous','Actual','Source URL','Status','Updated At'],
  announcementHeaders: ['ID','Created At','Title','Category','Body','Audience','Priority','Start At','End At','Status','Updated At'],
  adsHeaders: ['ID','Created At','Brand','Title','Description','Image URL','Target URL','Placement','Start At','End At','Status','Clicks','Updated At'],
  activityHeaders: ['ID','Created At','Event Type','Public Alias','Public Text','Status'],
  briefingHeaders: ['ID','Created At','Title','Category','Summary','Body','Source URL','Status','Updated At']
});

/** Public endpoint: hanya konten yang telah dipublikasikan untuk umum. */
function apiGetPublicCenter() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('mps_public_center_v480');
  if (cached) return safeParseJson_(cached, { ok: true, news: [], calendar: [], announcements: [], ads: [], activity: [], updatedAt: '' });
  const news = [] // Premium News & Review is available only through the authenticated member endpoint.
    .sort(function(a,b) { return (Number(!!b.Pinned)-Number(!!a.Pinned)) || (dateMs_(b['Published At']) - dateMs_(a['Published At'])); }).slice(0,30);
  const calendar = []; // Economic calendar details are member-only.
  const announcements = readMpsContentRows_(MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers)
    .filter(function(r){return r.Status==='Published'&&['PUBLIC','BOTH'].includes(String(r.Audience))&&isWithinWindow_(r['Start At'],r['End At']);})
    .sort(function(a,b){return Number(b.Priority||0)-Number(a.Priority||0)||dateMs_(b['Created At'])-dateMs_(a['Created At']);}).slice(0,12);
  const ads = readMpsContentRows_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers)
    .filter(function(r){return r['Approval Status']==='Approved'&&r['Payment Status']==='Paid'&&['Public Home','Website publik'].includes(String(r.Placement||''))&&isWithinWindow_(r['Start At'],r['End At']);})
    .sort(function(a,b){return dateMs_(a['Created At'])-dateMs_(b['Created At']);}).slice(0,8);
  const activity = readMpsContentRows_(MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers)
    .filter(function(r){return r.Status==='Visible'&&isSafePublicIdentity_(r['Member Name'])&&isSafePublicIdentity_(r['Event Text']);})
    .sort(function(a,b){return dateMs_(b['Created At'])-dateMs_(a['Created At']);}).slice(0,30);
  const publicNews = news.map(function(r){return {ID:r.ID,PublishedAt:r['Published At'],Source:r.Source,Category:r.Category,Title:r.Title,Summary:r.Summary,SourceURL:r['Source URL'],Verification:r.Verification,Pinned:!!r.Pinned};});
  const publicCalendar = calendar.map(function(r){return {EventDate:r['Event Date'],EventTimeWIB:r['Event Time WIB'],Country:r.Country,EventName:r['Event Name'],Impact:r.Impact,Forecast:r.Forecast,Previous:r.Previous,Actual:r.Actual,SourceURL:r['Source URL']};});
  const publicAnnouncements = announcements.map(function(r){return {ID:r.ID,Title:r.Title,Category:r.Category,Body:r.Body,Audience:r.Audience,DisplayType:r['Display Type'],ImageURL:r['Image URL'],ButtonText:r['Button Text'],ButtonURL:r['Button URL'],Frequency:r.Frequency,ColorTheme:r['Color Theme'],Animation:r.Animation};});
  const publicAds = ads.map(function(r){return {ID:r['Ad ID'],Brand:r.Brand,Title:r.Title,Description:r.Description,ImageURL:r['Image URL'],TargetURL:r['Target URL'],Placement:r.Placement};});
  const adPackages=readMpsContentRows_(MPS_AD_PACKAGES.sheet,MPS_AD_PACKAGES.headers).filter(function(r){return r.Status==='Active';}).map(function(r){return {id:r['Package ID'],name:r.Name,description:r.Description,price:Number(r['Price IDR']||0),durationDays:Number(r['Duration Days']||0),placement:r.Placement};});
  const publicActivity = activity.map(function(r){return {PublicAlias:r['Member Name'],PublicText:r['Event Text']};});
  const tickerSettings=readMpsWebsiteSettings_();
  const out = { ok:true, news:publicNews, calendar:publicCalendar, announcements:publicAnnouncements, ads:publicAds, adPackages:adPackages, activity:publicActivity, tickerSettings:tickerSettings,
    updatedAt: PropertiesService.getScriptProperties().getProperty('MPS_CONTENT_LAST_SYNC') || '',
    syncStatus: PropertiesService.getScriptProperties().getProperty('MPS_CONTENT_LAST_SYNC_STATUS') || '' };
  cache.put('mps_public_center_v480', JSON.stringify(out), 120);
  return out;
}

/** VIP endpoint: membutuhkan sesi member yang sudah Berhasil dan deposit Disetujui. */
function buildMpsMemberIntelligence_(member, includeVipContent) {
  const briefings = includeVipContent===true ? readMpsContentRows_(MPS_CONTENT.briefingSheet, MPS_CONTENT.briefingHeaders)
    .filter(function(r) { return r.Status === 'Published'; })
    .sort(function(a,b) { return dateMs_(b['Created At'])-dateMs_(a['Created At']); }).slice(0,30) : [];
  const announcements = readMpsContentRows_(MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers)
    .filter(function(r){const audience=String(r.Audience);return r.Status==='Published'&&(audience==='BOTH'||(audience==='VIP'&&includeVipContent===true))&&isWithinWindow_(r['Start At'],r['End At']);})
    .sort(function(a,b){return Number(b.Priority||0)-Number(a.Priority||0);}).slice(0,20);
  const analysisRows=readMpsContentRows_(MPS_NEWS_ANALYSIS.sheet,MPS_NEWS_ANALYSIS.headers).filter(function(r){return r.Status==='Published';});
  const analysisByNews={};analysisRows.forEach(function(r){analysisByNews[String(r['News ID'])]=r;});
  const news = readMpsContentRows_(MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders)
    .filter(function(r){return r.Status==='Published'&&!!analysisByNews[String(r.ID)];})
    .sort(function(a,b){return dateMs_(b['Published At'])-dateMs_(a['Published At']);}).slice(0,50)
    .map(function(r){r.Analysis=analysisByNews[String(r.ID)];return r;});
  const calendar = readMpsContentRows_(MPS_CONTENT.calendarSheet,MPS_CONTENT.calendarHeaders)
    .filter(function(r){return r.Status==='Published'&&dateMs_(r['Event Date'])>=startOfTodayMs_()-86400000;})
    .sort(function(a,b){return dateMs_(a['Event Date'])-dateMs_(b['Event Date']);}).slice(0,40);
  const allAds=readMpsContentRows_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers)
    .filter(function(r){return r['Approval Status']==='Approved'&&r['Payment Status']==='Paid'&&['Member Area','VIP Community'].includes(String(r.Placement||''))&&isWithinWindow_(r['Start At'],r['End At']);})
    .map(function(r){return {ID:r['Ad ID'],Brand:r.Brand,Title:r.Title,Description:r.Description,ImageURL:r['Image URL'],TargetURL:r['Target URL'],Placement:r.Placement};});
  return { ok:true, access:includeVipContent===true?'VIP':'MEMBER', memberId:member.memberId, briefings:briefings, announcements:announcements, news:news, calendar:calendar, memberAds:allAds.filter(function(a){return a.Placement==='Member Area';}).slice(0,20), vipAds:includeVipContent===true?allAds.filter(function(a){return a.Placement==='VIP Community';}).slice(0,20):[] };
}
function apiGetMemberIntelligence(session) {
  const member = requireMember_(session);
  // Konten member umum tetap tersedia untuk seluruh member aktif, tetapi konten
  // VIP (briefing, pengumuman VIP, dan iklan VIP Community) memakai gate DB + Telegram.
  let vipVerified = false;
  try { requireVipMember_(session); vipVerified = true; } catch (vipErr) { vipVerified = false; }
  return buildMpsMemberIntelligence_(member, vipVerified);
}
function apiAdminGetMemberIntelligence(session) {
  requireAdmin_(session);
  return buildMpsMemberIntelligence_({memberId:'ADMIN-PREVIEW'}, true);
}

/** Admin: buat semua sheet tambahan tanpa menyentuh Database Member. */
function apiAdminInitializeContent(session) {
  requireSuperAdmin_(session);
  Object.keys(MPS_CONTENT).forEach(function(k) {
    if (!/Headers$/.test(k)) getMpsContentSheet_(MPS_CONTENT[k], MPS_CONTENT[k.replace('Sheet','Headers')], true);
  });
  getMpsApplicationsSheet_();
  getMpsDepositsSheet_();
  getMpsMemberLinksSheet_();
  getTelegramAccessSheet_();
  getMpsContentSheet_(MPS_NEWS_ANALYSIS.sheet,MPS_NEWS_ANALYSIS.headers,true);
  getMpsContentSheet_(MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers,true);
  getMpsContentSheet_(MPS_SITE_SETTINGS.sheet,MPS_SITE_SETTINGS.headers,true);
  getMpsContentSheet_(MPS_LEARNING_CATALOG.sheet,MPS_LEARNING_CATALOG.headers,true);
  getMpsContentSheet_(MPS_LEARNING_PROGRESS.sheet,MPS_LEARNING_PROGRESS.headers,true);
  getMpsContentSheet_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers,true);
  getMpsContentSheet_(MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers,true);
  getMpsContentSheet_(MPS_AD_PACKAGES.sheet,MPS_AD_PACKAGES.headers,true);
  getMpsContentSheet_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers,true);
  getMpsContentSheet_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers,true);
  return { ok:true, message:'Penyimpanan MPS Core dan Intelligence Center siap. Seluruh 30 kolom Database Member dipertahankan.' };
}

function readMpsWebsiteSettings_() {
  const defaults={enabled:true,speed:34,theme:'Neon',prefix:'VIP LIVE',suffix:'bergabung ke MPS VIP Community'};
  const sh=getMpsContentSheet_(MPS_SITE_SETTINGS.sheet,MPS_SITE_SETTINGS.headers,false);if(!sh||sh.getLastRow()<2)return defaults;
  const rows=readMpsContentRows_(MPS_SITE_SETTINGS.sheet,MPS_SITE_SETTINGS.headers),out=Object.assign({},defaults);
  rows.forEach(function(r){const k=String(r.Key||'');if(k==='VIP_TICKER_ENABLED')out.enabled=String(r.Value)==='true';if(k==='VIP_TICKER_SPEED')out.speed=Math.max(10,Math.min(120,Number(r.Value)||34));if(k==='VIP_TICKER_THEME'&&['Neon','Gold','Blue','Purple'].includes(String(r.Value)))out.theme=String(r.Value);if(k==='VIP_TICKER_PREFIX')out.prefix=clean_(r.Value,24)||defaults.prefix;if(k==='VIP_TICKER_SUFFIX')out.suffix=clean_(r.Value,100)||defaults.suffix;});
  return out;
}
function apiAdminGetWebsiteSettings(session) { requireSuperAdmin_(session);return {ok:true,settings:readMpsWebsiteSettings_()}; }
function apiAdminSaveWebsiteSettings(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const speed=Number(payload.speed),theme=String(payload.theme||'Neon');
  if(!Number.isFinite(speed)||speed<10||speed>120||!['Neon','Gold','Blue','Purple'].includes(theme))throw new Error('Pengaturan kecepatan atau tema ticker tidak valid.');
  const sh=getMpsContentSheet_(MPS_SITE_SETTINGS.sheet,MPS_SITE_SETTINGS.headers,true);
  const values={VIP_TICKER_ENABLED:String(payload.enabled===true),VIP_TICKER_SPEED:String(Math.round(speed)),VIP_TICKER_THEME:theme,VIP_TICKER_PREFIX:clean_(payload.prefix||'VIP LIVE',24),VIP_TICKER_SUFFIX:clean_(payload.suffix||'bergabung ke MPS VIP Community',100)};
  const changes=[];
  try{
    Object.keys(values).forEach(function(key){
      const row=findMpsContentRow_(sh,key),data=[key,sheetText_(values[key]),new Date()];
      if(row){const before=sh.getRange(row,1,1,3).getValues()[0];changes.push({row:row,created:false,values:before,key:key});sh.getRange(row,1,1,3).setValues([data]);}
      else{const target=sh.getLastRow()+1;changes.push({row:target,created:true,key:key});sh.appendRow(data);}
    });
  }catch(err){
    const rollbackErrors=[];
    for(let i=changes.length-1;i>=0;i--){const change=changes[i];try{if(change.created){if(change.row<=sh.getLastRow())sh.deleteRow(change.row);}else sh.getRange(change.row,1,1,change.values.length).setValues([change.values]);}catch(e){rollbackErrors.push('pengaturan '+change.key+': '+safeErrorMessage_(e));}}
    if(rollbackErrors.length)throw new Error('Penyimpanan pengaturan ticker gagal dan rollback tidak lengkap ('+rollbackErrors.join('; ')+'). Periksa Website Settings sebelum mencoba ulang.');
    throw err;
  }
  CacheService.getScriptCache().remove('mps_public_center_v480');
  const auditWritten=recordMpsAudit_(adminRole_(session),adminActorRef_(session),'VIP_TICKER_SETTINGS_UPDATED','WEBSITE','SUCCESS','Pengaturan ticker VIP diperbarui.');
  return {ok:true,message:'Pengaturan ticker VIP diperbarui.',auditWarning:auditWritten?'':'Audit log gagal ditulis; Super Admin perlu memeriksa MPS Audit Logs.'};
}

function recordMpsAudit_(role,actorRef,action,targetRef,result,details) {
  try{
    const sh=getMpsContentSheet_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers,true);
    sh.appendRow([new Date(),clean_(role,20),sheetText_(clean_(actorRef,60)),clean_(action,60),sheetText_(clean_(targetRef,100)),clean_(result,30),sheetText_(cleanNewsText_(details,240))]);
    const last=sh.getLastRow();
    if(last>2001){
      const width=sh.getLastColumn(),hasEffectKey=width>=8&&String(sh.getRange(1,8).getDisplayValues()[0][0]||'')==='Effect Key';
      if(!hasEffectKey)sh.deleteRows(2,last-2001);
      else{
        // Keyed rows are the durable deduplication ledger. Prune only older
        // unkeyed audit rows; never delete effect-key rows or the new audit row.
        const oldCount=Math.max(0,last-2),keys=oldCount?sh.getRange(2,8,oldCount,1).getDisplayValues():[];
        const excess=last-2001,remove=[];
        for(let i=0;i<keys.length&&remove.length<excess;i++)if(!String(keys[i][0]||''))remove.push(i+2);
        const runs=[];
        remove.forEach(function(row){const lastRun=runs[runs.length-1];if(lastRun&&row===lastRun.start+lastRun.count)lastRun.count++;else runs.push({start:row,count:1});});
        for(let i=runs.length-1;i>=0;i--)sh.deleteRows(runs[i].start,runs[i].count);
      }
    }
    return true;
  }catch(err){console.error('MPS audit log write failed: '+safeErrorMessage_(err));return false;}
}
function apiAdminCheckSystemConfiguration(session) {
  requireSuperAdmin_(session);
  // This diagnostic is deliberately READ-ONLY: never create missing sheets,
  // folders, properties, or modify the database while an admin is checking setup.
  const props=PropertiesService.getScriptProperties(),checks=[];
  function add(label,ok,detail){checks.push({label:label,ok:!!ok,detail:detail||''});}
  const spreadsheetId=String(props.getProperty('MPS_SPREADSHEET_ID')||'');
  const proofFolderId=String(props.getProperty('MPS_PROOF_FOLDER_ID')||'');
  const learningFolderId=String(props.getProperty('MPS_LEARNING_FOLDER_ID')||'');
  let ss=null;
  if(!spreadsheetId){add('Database spreadsheet ID',false,'MPS_SPREADSHEET_ID belum dikonfigurasi.');}
  else {
    try {
      const file=DriveApp.getFileById(spreadsheetId);
      const isPrivate=String(file.getSharingAccess())===String(DriveApp.Access.PRIVATE);
      add('Database spreadsheet PRIVATE',isPrivate,isPrivate?'Akses umum/non-private tidak terdeteksi.':'Spreadsheet database tidak PRIVATE; hentikan rilis sampai akses diamankan.');
      ss=SpreadsheetApp.openById(spreadsheetId);
      const memberSheet=ss.getSheetByName(MPS.sheetName);
      if(!memberSheet)add('Database Member — 30 kolom',false,'Sheet Database Member tidak ditemukan.');
      else {
        try { validateHeaders_(memberSheet); add('Database Member — 30 kolom',true,'Header cocok; tidak ada perubahan dilakukan.'); }
        catch(e){ add('Database Member — 30 kolom',false,safeErrorMessage_(e)); }
      }
      const depositSheet=ss.getSheetByName(MPS_DEPOSITS.sheet);
      if(!depositSheet)add('Deposit Applications sheet',false,'Sheet belum tersedia. Pemeriksaan tidak membuat sheet otomatis.');
      else {
        try { assertSheetHeaders_(depositSheet,MPS_DEPOSITS.headers,MPS_DEPOSITS.sheet); add('Deposit Applications sheet',true,'Header cocok; tidak ada perubahan dilakukan.'); }
        catch(e){ add('Deposit Applications sheet',false,safeErrorMessage_(e)); }
      }
    } catch(e) {
      add('Akses database',false,safeErrorMessage_(e));
    }
  }
  if(!proofFolderId)add('Proof Folder',false,'MPS_PROOF_FOLDER_ID belum dikonfigurasi.');
  else {
    try { const folder=DriveApp.getFolderById(proofFolderId);const priv=String(folder.getSharingAccess())===String(DriveApp.Access.PRIVATE);add('Proof Folder PRIVATE',priv,priv?'Folder bukti bersifat private.':'Folder bukti tidak PRIVATE.'); }
    catch(e){add('Proof Folder',false,safeErrorMessage_(e));}
  }
  if(!learningFolderId)add('Learning Folder',false,'MPS_LEARNING_FOLDER_ID belum dikonfigurasi.');
  else if(learningFolderId===proofFolderId)add('Learning Folder terpisah',false,'Folder Learning dan Proof tidak boleh sama.');
  else {
    try { const folder=DriveApp.getFolderById(learningFolderId);const priv=String(folder.getSharingAccess())===String(DriveApp.Access.PRIVATE);add('Learning Folder PRIVATE',priv,priv?'Folder materi bersifat private.':'Folder materi tidak PRIVATE.'); }
    catch(e){add('Learning Folder',false,safeErrorMessage_(e));}
  }
  const adminSecret=String(props.getProperty('MPS_ADMIN_TOKEN')||''),superSecret=String(props.getProperty('MPS_SUPER_ADMIN_TOKEN')||'');
  function credentialStrength(secret){
    if(secret.length<32)return false;
    let classes=0;
    if(/[a-z]/.test(secret))classes++;
    if(/[A-Z]/.test(secret))classes++;
    if(/[0-9]/.test(secret))classes++;
    if(/[^A-Za-z0-9]/.test(secret))classes++;
    return classes>=3;
  }
  add('Admin password',!!adminSecret,'Keberadaan kredensial diperiksa; nilainya tidak ditampilkan.');
  add('Admin password strength',credentialStrength(adminSecret),'Gunakan minimal 32 karakter dan sedikitnya 3 kelompok karakter (huruf kecil, huruf besar, angka, simbol). Nilai rahasia tidak ditampilkan.');
  add('Super Admin password',!!superSecret,'Keberadaan kredensial diperiksa; nilainya tidak ditampilkan.');
  add('Super Admin password strength',credentialStrength(superSecret),'Gunakan minimal 32 karakter dan sedikitnya 3 kelompok karakter (huruf kecil, huruf besar, angka, simbol). Nilai rahasia tidak ditampilkan.');
  add('Pemisahan kredensial Admin',!!(adminSecret&&superSecret&&adminSecret!==superSecret),'Token Admin dan Super Admin harus berbeda.');
  const botToken=String(props.getProperty('MPS_TELEGRAM_BOT_TOKEN')||'');
  add('Telegram bot token format',/^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(botToken),'Format token diperiksa tanpa menampilkan nilainya.');
  const webhookSecret=String(props.getProperty('MPS_TELEGRAM_WEBHOOK_SECRET')||'');
  add('Telegram webhook secret strength',/^[a-f0-9]{64}$/i.test(webhookSecret),'Webhook secret harus berupa 64 karakter heksadesimal acak. Nilai rahasia tidak ditampilkan.');
  add('Telegram admin archive',!!(props.getProperty('MPS_TELEGRAM_CHAT_ID')||props.getProperty('MPS_TELEGRAM_ADMIN_CHAT_ID')||props.getProperty('MPS_ADMIN_TELEGRAM_CHAT_ID')),'Chat ID tidak ditampilkan.');
  const vipGroupId=String(props.getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||'');
  add('VIP group',!vipGroupId||/^-?\d+$/.test(vipGroupId),'Group ID harus berupa angka Telegram yang valid; nilainya tidak ditampilkan.');
  add('Web App deployment',!!ScriptApp.getService().getUrl(),'URL deployment tidak diubah.');
  const failed=checks.filter(function(x){return !x.ok;});
  return {ok:true,checks:checks,failed:failed.length,readOnly:true,message:'Pemeriksaan konfigurasi bersifat read-only; tidak ada sheet, folder, properti, atau data yang dibuat/diubah.'};
}

function apiAdminCheckStorageSecurity(session) {
  requireSuperAdmin_(session);
  const props=PropertiesService.getScriptProperties(),checks=[],risks=[];
  function inspectFile(file,label){
    try{
      const access=String(file.getSharingAccess()),permission=String(file.getSharingPermission());
      const restricted=access===String(DriveApp.Access.PRIVATE);
      // PRIVATE blocks link-wide access, but named collaborators may still have access.
      // Do not expose collaborator identities in the admin UI or audit log.
      const editors=typeof file.getEditors==='function'?file.getEditors():[];
      const viewers=typeof file.getViewers==='function'?file.getViewers():[];
      const collaboratorCount=(editors?editors.length:0)+(viewers?viewers.length:0);
      const safe=restricted&&collaboratorCount===0;
      checks.push({label:label,name:file.getName(),access:access,permission:permission,collaboratorCount:collaboratorCount,safe:safe});
      if(!restricted)risks.push(label+' "'+file.getName()+'" tidak bersifat PRIVATE (akses: '+access+').');
      if(collaboratorCount>0)risks.push(label+' "'+file.getName()+'" memiliki '+collaboratorCount+' akses kolaborator bernama; verifikasi satu per satu melalui Google Drive.');
    }
    catch(e){checks.push({label:label,name:file.getName(),access:'UNKNOWN',safe:false});risks.push('Hak akses '+label+' tidak dapat diverifikasi: '+safeErrorMessage_(e));}
  }
  const spreadsheetId=props.getProperty('MPS_SPREADSHEET_ID'),proofId=props.getProperty('MPS_PROOF_FOLDER_ID'),learningId=props.getProperty('MPS_LEARNING_FOLDER_ID'),backupId=props.getProperty('MPS_LAST_BACKUP_ID');
  if(spreadsheetId)inspectFile(DriveApp.getFileById(spreadsheetId),'Database Spreadsheet');else risks.push('MPS_SPREADSHEET_ID belum dikonfigurasi.');
  if(backupId){try{inspectFile(DriveApp.getFileById(backupId),'Database Backup');}catch(backupErr){risks.push('Database Backup tidak dapat diperiksa: '+safeErrorMessage_(backupErr));}}
  if(proofId&&learningId&&String(proofId)===String(learningId))risks.push('Proof Folder dan Learning Folder menggunakan folder yang sama; dokumen bukti dan materi harus dipisahkan.');
  [['Proof Folder',proofId],['Learning Folder',learningId]].forEach(function(entry){if(!entry[1]){risks.push(entry[0]+' belum dikonfigurasi.');return;}try{const folder=DriveApp.getFolderById(entry[1]);inspectFile(folder,entry[0]);const it=folder.getFiles();let n=0,more=false;while(it.hasNext()){if(n>=100){more=true;break;}inspectFile(it.next(),entry[0]==='Proof Folder'?'Proof File':'Learning File');n++;}if(more)risks.push('Pemindaian '+entry[0]+' mencapai batas 100 file; hasil pemeriksaan belum mencakup seluruh file.');}catch(e){risks.push(entry[0]+' tidak dapat diperiksa: '+safeErrorMessage_(e));}});
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'DRIVE_ACCESS_AUDIT','STORAGE',risks.length?'WARNING':'SUCCESS','Pemeriksaan akses Drive dilakukan.');
  return {ok:true,checks:checks,risks:risks,checkedCount:checks.length,checkedAt:new Date().toISOString(),message:risks.length?'Ditemukan pengaturan akses yang perlu diperiksa.':'Semua aset yang berhasil diperiksa bersifat PRIVATE. Pemindaian file dibatasi 100 file per folder per pemeriksaan; jika folder melebihi batas, hasilnya parsial.'};
}

function apiAdminGetAuditLogs(session,limit) {
  requireSuperAdmin_(session);const n=Math.max(1,Math.min(200,Number(limit)||100));
  const rows=readMpsContentRows_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers);
  return {ok:true,logs:rows.slice(-n).reverse()};
}
function apiAdminCreateBackup(session) {
  requireSuperAdmin_(session);
  consumeRateLimit_('mps_backup_global',3,21600,'Backup spreadsheet dibatasi maksimal 3 kali per 6 jam.');
  const id=PropertiesService.getScriptProperties().getProperty('MPS_SPREADSHEET_ID');if(!id)throw new Error('MPS_SPREADSHEET_ID belum dikonfigurasi.');
  const source=DriveApp.getFileById(id);if(String(source.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Database spreadsheet tidak PRIVATE. Amankan file asli sebelum membuat backup.');
  const stamp=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyyMMdd-HHmmss');
  const copy=source.makeCopy('MPS DATABASE BACKUP '+stamp);
  try{copy.setSharing(DriveApp.Access.PRIVATE,DriveApp.Permission.NONE);if(String(copy.getSharingAccess())!==String(DriveApp.Access.PRIVATE))throw new Error('Backup tidak dapat dipastikan PRIVATE.');}
  catch(permissionErr){try{copy.setTrashed(true);}catch(ignore){}throw new Error('Backup dibatalkan karena akses file tidak dapat dipastikan PRIVATE: '+safeErrorMessage_(permissionErr));}
  PropertiesService.getScriptProperties().setProperty('MPS_LAST_BACKUP_ID',copy.getId());
  PropertiesService.getScriptProperties().setProperty('MPS_LAST_BACKUP_AT',new Date().toISOString());
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'DATABASE_BACKUP',copy.getId(),'SUCCESS','Spreadsheet database disalin ke file backup terpisah.');
  return {ok:true,backupId:copy.getId(),name:copy.getName(),url:copy.getUrl(),message:'Backup spreadsheet berhasil dibuat. File asli tidak diubah.'};
}

function assertSheetHeaders_(sheet,headers,name) {
  if(!sheet)return;
  if(sheet.getLastRow()<1)throw new Error('Header sheet '+name+' belum tersedia. Tidak ada data yang dihapus.');
  const actual=sheet.getRange(1,1,1,headers.length).getDisplayValues()[0];
  if(headers.some(function(h,i){return String(actual[i]||'').trim()!==h;}))throw new Error('Header sheet '+name+' tidak cocok. Tidak ada data yang dihapus.');
}

function clearRowsByColumnsValues_(sheet,columns,matchValues) {
  if(!sheet||sheet.getLastRow()<2||!matchValues||!matchValues.size)return {count:0,snapshots:[]};
  const lastRow=sheet.getLastRow(),lastCol=Math.max(1,sheet.getLastColumn()),range=sheet.getRange(2,1,lastRow-1,lastCol),data=range.getValues(),display=range.getDisplayValues(),formulas=range.getFormulas(),snapshots=[];
  display.forEach(function(row,i){if(columns.some(function(col){return matchValues.has(String(row[col-1]||'').trim());}))snapshots.push({row:i+2,values:data[i],formulas:formulas[i]});});
  try{snapshots.forEach(function(item){sheet.getRange(item.row,1,1,lastCol).clearContent();});}
  catch(err){restoreClearedRows_(sheet,snapshots);throw err;}
  return {count:snapshots.length,snapshots:snapshots};
}

function restoreClearedRows_(sheet,snapshots) {
  if(!sheet||!snapshots)return;
  snapshots.forEach(function(item){try{sheet.getRange(item.row,1,1,item.values.length).setValues([item.values]);(item.formulas||[]).forEach(function(formula,i){if(formula)sheet.getRange(item.row,i+1).setFormula(formula);});}catch(err){console.error('Test cleanup rollback row '+item.row+': '+safeErrorMessage_(err));}});
}



function apiAdminClearTestMemberData(session, confirmation, memberIds) {
  requireSuperAdmin_(session);
  // Fail-closed: destructive cleanup is intentionally disabled until a separately
  // reviewed, explicitly approved maintenance workflow is implemented.
  throw new Error('Pembersihan data uji dinonaktifkan sementara demi keamanan. Tidak ada data yang dihapus.');
}
function apiAdminGetContent(session) {
  const adminInfo=requireSuperAdmin_(session);
  const isSuperAdmin=adminInfo.role==='SUPER_ADMIN';
  return {
    ok:true,
    news:readMpsContentRows_(MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders).slice(0,100),
    calendar:readMpsContentRows_(MPS_CONTENT.calendarSheet,MPS_CONTENT.calendarHeaders).slice(0,100),
    announcements:readMpsContentRows_(MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers).slice(0,100),
    ads:readMpsContentRows_(MPS_CONTENT.adsSheet,MPS_CONTENT.adsHeaders).slice(0,100),
    briefings:readMpsContentRows_(MPS_CONTENT.briefingSheet,MPS_CONTENT.briefingHeaders).slice(0,100),
    newsAnalysis:readMpsContentRows_(MPS_NEWS_ANALYSIS.sheet,MPS_NEWS_ANALYSIS.headers).slice(0,200),
    advertisingRequests:readMpsContentRows_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers).slice(0,200),
    adPackages:readMpsContentRows_(MPS_AD_PACKAGES.sheet,MPS_AD_PACKAGES.headers).slice(0,100),
    approvedAds:readMpsContentRows_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers).slice(0,100),
    websiteSettings:readMpsWebsiteSettings_(),
    learningCatalog:readMpsContentRows_(MPS_LEARNING_CATALOG.sheet,MPS_LEARNING_CATALOG.headers).slice(0,300),
    auditLogs:isSuperAdmin?readMpsContentRows_(MPS_AUDIT_LOGS.sheet,MPS_AUDIT_LOGS.headers).slice(-150).reverse():[],
    vipTickerEvents:readMpsContentRows_(MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers).slice(-100).reverse(),
    lastBackupId:isSuperAdmin?PropertiesService.getScriptProperties().getProperty('MPS_LAST_BACKUP_ID')||'':'',
    lastBackupAt:isSuperAdmin?PropertiesService.getScriptProperties().getProperty('MPS_LAST_BACKUP_AT')||'':'',
    webAppUrl:ScriptApp.getService().getUrl()||'',
    automation:isSuperAdmin?ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='syncMpsNewsScheduled_';}):false,
    lastSync:PropertiesService.getScriptProperties().getProperty('MPS_CONTENT_LAST_SYNC') || '',
    lastSyncStatus:PropertiesService.getScriptProperties().getProperty('MPS_CONTENT_LAST_SYNC_STATUS') || ''
  };
}

function apiAdminSyncNews(session) {
  requireSuperAdmin_(session);
  const result = syncMpsNews_();
  CacheService.getScriptCache().remove('mps_public_center_v480');
  return result;
}

function apiAdminSetupContentAutomation(session) {
  requireSuperAdmin_(session);const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const exists=ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='syncMpsNewsScheduled_');if(!exists)ScriptApp.newTrigger('syncMpsNewsScheduled_').timeBased().everyMinutes(15).create();return {ok:true,message:exists?'Sinkronisasi otomatis 15 menit sudah aktif.':'Sinkronisasi otomatis berita dijadwalkan setiap 15 menit.'};}
  finally{lock.releaseLock();}
}

function syncMpsNewsScheduled_() { syncMpsNews_(); }

/** Official feeds publish as official-source items; GDELT items stay in admin review. */
function syncMpsNews_() {
  const cache=CacheService.getScriptCache(),key='mps_news_sync_lease';
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{if(cache.get(key))return {ok:false,error:'Sinkronisasi berita lain sedang berjalan. Coba lagi setelah proses selesai.'};cache.put(key,'1',600);}finally{lock.releaseLock();}
  try{return syncMpsNewsCore_();}
  finally{const done=LockService.getScriptLock();done.waitLock(10000);try{cache.remove(key);}finally{done.releaseLock();}}
}

function syncMpsNewsCore_() {
  const sh = getMpsContentSheet_(MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders,true);
  const existing = {};
  if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues().forEach(function(r){existing[String(r[0])]=true;});
  const sources = [
    {name:'BLS',url:'https://www.bls.gov/feed/bls_latest.rss',category:'Ekonomi AS'},
    {name:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',category:'Bank Sentral'},
    {name:'BEA',url:'https://apps.bea.gov/rss/rss.xml',category:'Ekonomi AS'},
    {name:'EIA',url:'https://www.eia.gov/rss/press_rss.xml',category:'Energi'}
  ];
  let imported = 0, reviewed = 0, failed = [];
  sources.forEach(function(src) {
    try {
      const response = UrlFetchApp.fetch(src.url,{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':'MPS-Market-Center/4.8.0'}});
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('HTTP '+response.getResponseCode());
      const doc = XmlService.parse(response.getContentText());
      const root = doc.getRootElement();
      const channel = root.getName().toLowerCase()==='rss' ? root.getChild('channel') : root;
      let items = channel ? channel.getChildren('item') : [];
      if (!items.length && channel) items = channel.getChildren().filter(function(x){return x.getName().toLowerCase()==='entry';});
      items.slice(0,25).forEach(function(item) {
        const title = cleanNewsText_(xmlChildText_(item,'title'),220);
        const link = xmlChildText_(item,'link') || (item.getChild('link') && item.getChild('link').getAttribute('href') ? item.getChild('link').getAttribute('href').getValue() : '');
        if (!title || !validHttpsUrl_(link)) return;
        const id = 'N-'+sha256_(link).slice(0,18).toUpperCase(); if(existing[id]) return;
        const published = parseFeedDate_(xmlChildText_(item,'pubDate') || xmlChildText_(item,'published') || xmlChildText_(item,'updated')) || new Date();
        const summary = cleanNewsText_(xmlChildText_(item,'description') || xmlChildText_(item,'summary') || '',420);
        const category = classifyMpsNews_(title,src.category);
        sh.appendRow([id,published,sheetText_(src.name),sheetText_(category),sheetText_(title),sheetText_(summary),sheetText_(link),'Review','Official Source','VIP',false,new Date(),new Date()]);
        existing[id]=true; imported++;
      });
    } catch(err) { failed.push(src.name+': '+safeErrorMessage_(err)); }
  });
  // GDELT is a discovery source, not a verification authority. Its items remain unpublished until admin review.
  try {
    const q = '(war OR conflict OR sanctions OR Iran OR Iraq OR Israel OR Ukraine OR oil OR geopolitical)';
    const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(q)+'&mode=ArtList&format=json&maxrecords=20&sort=HybridRel';
    const response = UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{'User-Agent':'MPS-Market-Center/4.8.0'}});
    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
      const data = JSON.parse(response.getContentText());
      (data.articles || []).forEach(function(a) {
        const title = cleanNewsText_(a.title,220), link = String(a.url || '');
        if (!title || !validHttpsUrl_(link)) return;
        const id = 'N-'+sha256_(link).slice(0,18).toUpperCase(); if(existing[id]) return;
        const published = parseGdeltDate_(a.seendate) || new Date();
        const domain = clean_(a.domain || getHostFromUrl_(link),80);
        const category = classifyMpsNews_(title,'Geopolitik');
        sh.appendRow([id,published,sheetText_('GDELT · '+domain),sheetText_(category),sheetText_(title),sheetText_('Liputan terdeteksi dari agregator berita global. Verifikasi isi dan sumber asli sebelum dipublikasikan.'),sheetText_(link),'Review','Belum Diverifikasi','PUBLIC',false,new Date(),new Date()]);
        existing[id]=true; reviewed++;
      });
    } else failed.push('GDELT: HTTP '+response.getResponseCode());
  } catch(err) { failed.push('GDELT: '+safeErrorMessage_(err)); }
  // Keep sheet bounded; remove oldest rows only from this dedicated news sheet.
  if (sh.getLastRow() > 501) sh.deleteRows(2,sh.getLastRow()-501);
  const now = new Date();
  PropertiesService.getScriptProperties().setProperties({
    MPS_CONTENT_LAST_SYNC: Utilities.formatDate(now,'Asia/Jakarta','dd MMM yyyy HH:mm:ss')+' WIB',
    MPS_CONTENT_LAST_SYNC_STATUS: failed.length ? ('Sebagian sumber gagal: '+failed.join(' | ')) : 'Semua sumber yang dikonfigurasi berhasil diperiksa.'
  });
  CacheService.getScriptCache().remove('mps_public_center_v480');
  return {ok:true,officialImported:imported,globalNewsForReview:reviewed,failed:failed,lastSync:PropertiesService.getScriptProperties().getProperty('MPS_CONTENT_LAST_SYNC')};
}



function apiAdminSaveNewsAnalysis(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const id=clean_(payload.newsId,60);if(!id)throw new Error('ID berita wajib diisi.');
  const newsSheet=getMpsContentSheet_(MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders,false);
  if(!newsSheet||!findMpsContentRow_(newsSheet,id))throw new Error('Berita sumber tidak ditemukan.');
  const impact=cleanNewsText_(payload.impactSummary,700),usd=String(payload.usdImpact||'Mixed'),bias=String(payload.xauusdBias||'Two-way');
  const bull=cleanNewsText_(payload.bullishScenario,700),bear=cleanNewsText_(payload.bearishScenario,700),neutral=cleanNewsText_(payload.neutralScenario,700);
  const risk=cleanNewsText_(payload.volatilityRisk,700),context=cleanNewsText_(payload.analystContext,1000);
  const status=String(payload.status||'Draft');
  if(!['Stronger','Weaker','Mixed','Neutral'].includes(usd)||!['Bullish','Bearish','Neutral','Two-way'].includes(bias)||!['Draft','Published'].includes(status))throw new Error('Pilihan analisis tidak valid.');
  if(status==='Published'&&(!impact||!bull||!bear||!neutral||!risk))throw new Error('Analisis publikasi wajib memuat dampak, skenario bullish/bearish/netral, dan risiko volatilitas.');
  const sh=getMpsContentSheet_(MPS_NEWS_ANALYSIS.sheet,MPS_NEWS_ANALYSIS.headers,true);
  const row=[id,sheetText_(impact),usd,bias,sheetText_(bull),sheetText_(bear),sheetText_(neutral),sheetText_(risk),sheetText_(context),status,new Date()];upsertMpsContentRow_(sh,id,row);
  CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'NEWS_ANALYSIS_SAVED',id,'SUCCESS','Analisis berita disimpan dengan status '+status+'.');
  return {ok:true,message:status==='Published'?'Analisis MPS siap dipakai untuk publikasi berita.':'Draft analisis disimpan.'};
}

function apiSubmitAdvertisingRequest(payload) {
  payload=payload||{};
  if(payload.website)return {ok:true,ignored:true};
  consumeRateLimit_('mps_ad_request_global',30,3600,'Terlalu banyak pengajuan iklan. Coba lagi nanti.');
  const brand=clean_(payload.brand,100),contact=clean_(payload.contactName,80),email=clean_(payload.email,120).toLowerCase();
  const handle=clean_(payload.contactHandle,80),proposal=cleanNewsText_(payload.proposal,1500);
  const material=String(payload.materialUrl||'').trim(),target=String(payload.targetUrl||'').trim();
  if(!brand||!contact||!/^\S+@\S+\.\S+$/.test(email)||!handle||!proposal)throw new Error('Lengkapi brand, kontak, email, dan proposal.');
  if(material&&!validHttpsUrl_(material))throw new Error('URL materi harus menggunakan HTTPS.');
  if(target&&!validHttpsUrl_(target))throw new Error('URL tujuan harus menggunakan HTTPS.');
  consumeRateLimit_('mps_ad_request_'+sha256_(email).slice(0,24),3,86400,'Email ini sudah mengirim beberapa proposal dalam 6 jam terakhir. Hubungi admin MPS.');
  const packageId=clean_(payload.packageId,60);
  if(packageId){const packages=readMpsContentRows_(MPS_AD_PACKAGES.sheet,MPS_AD_PACKAGES.headers);if(!packages.some(function(x){return String(x['Package ID'])===packageId&&x.Status==='Active';}))throw new Error('Paket iklan tidak tersedia. Pilih paket yang masih aktif.');}
  const sh=getMpsContentSheet_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers,true);
  const id='AR-'+Utilities.getUuid().replace(/-/g,'').slice(0,16).toUpperCase(),now=new Date();
  sh.appendRow([id,now,sheetText_(brand),sheetText_(contact),sheetText_(email),sheetText_(handle),sheetText_(proposal),sheetText_(material),sheetText_(target),sheetText_(clean_(payload.placement||'Belum ditentukan',40)),sheetText_(clean_(payload.duration,60)),sheetText_(cleanNewsText_(payload.offer,1000)),'Pending','','Belum Diverifikasi',now,packageId]);
  recordMpsAudit_('PUBLIC','ADVERTISER','AD_REQUEST_SUBMITTED',id,'SUCCESS','Proposal kerja sama iklan diterima untuk review admin.');
  return {ok:true,requestId:id,message:'Proposal diterima dan menunggu peninjauan admin MPS.'};
}

function apiAdminSaveAdPackage(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const name=clean_(payload.name,100),description=cleanNewsText_(payload.description,500),price=Number(payload.price),days=Number(payload.durationDays),placement=clean_(payload.placement||'Public Home',50),status=String(payload.status||'Draft');
  if(!name||!Number.isSafeInteger(price)||price<0||!Number.isInteger(days)||days<1||days>365||!['Active','Draft','Hidden'].includes(status))throw new Error('Nama, harga, durasi, atau status paket tidak valid.');
  if(!['Public Home','Member Area','VIP Community'].includes(placement))throw new Error('Placement paket iklan tidak valid.');
  const sh=getMpsContentSheet_(MPS_AD_PACKAGES.sheet,MPS_AD_PACKAGES.headers,true),id=clean_(payload.packageId,60)||('PKG-'+Utilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase());
  upsertMpsContentRow_(sh,id,[id,sheetText_(name),sheetText_(description),price,days,sheetText_(placement),status,new Date()]);
  CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'AD_PACKAGE_SAVED',id,'SUCCESS','Paket iklan diperbarui.');return {ok:true,packageId:id,message:'Paket iklan disimpan.'};
}

function apiAdminGetAdvertisingRequests(session) {
  requireSuperAdmin_(session);
  return {ok:true,requests:readMpsContentRows_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers).slice(0,200),ads:readMpsContentRows_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers).slice(0,100)};
}

function apiAdminReviewAdvertisingRequest(session,requestId,decision,note,paymentStatus) {
  requireSuperAdmin_(session);
  const id=clean_(requestId,60),choice=String(decision||'').toLowerCase(),payment=String(paymentStatus||'Belum Diverifikasi');
  if(!['review','approve','reject'].includes(choice))throw new Error('Keputusan proposal tidak valid.');
  if(!['Belum Diverifikasi','Menunggu Pembayaran','Paid','Gagal'].includes(payment))throw new Error('Status pembayaran tidak valid.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sh=getMpsContentSheet_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers,false),row=sh?findMpsContentRow_(sh,id):0;
    if(!row)throw new Error('Proposal iklan tidak ditemukan.');
    const status=choice==='review'?'Under Review':choice==='approve'?'Approved':'Rejected';
    sh.getRange(row,13,1,4).setValues([[status,sheetText_(clean_(note,500)),payment,new Date()]]);
    recordMpsAudit_(adminRole_(session),adminActorRef_(session),'AD_REQUEST_REVIEWED',id,'SUCCESS','Status '+status+'; pembayaran '+payment+'.');
    return {ok:true,message:'Status proposal dan pembayaran diperbarui. Iklan belum tayang sampai materi disiapkan dan pembayaran berstatus Paid.'};
  }finally{lock.releaseLock();}
}

function apiAdminPublishAdvertisingRequest(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const requestId=clean_(payload.requestId,60),title=clean_(payload.title,140),description=cleanNewsText_(payload.description,500);
  const image=String(payload.imageUrl||'').trim(),target=String(payload.targetUrl||'').trim();
  if(!requestId||!title||!validHttpsUrl_(target)||(image&&!validHttpsUrl_(image)))throw new Error('Request ID, judul, URL tujuan, dan URL gambar yang valid wajib diisi.');
  const start=parseOptionalDate_(payload.startAt),end=parseOptionalDate_(payload.endAt);if(start&&end&&end.getTime()<start.getTime())throw new Error('Akhir tayang tidak boleh lebih awal dari mulai tayang.');
  const placement=clean_(payload.placement||'Public Home',40);if(!['Public Home','Website publik','Member Area','VIP Community'].includes(placement))throw new Error('Placement iklan tidak valid.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const req=getMpsContentSheet_(MPS_AD_REQUESTS.sheet,MPS_AD_REQUESTS.headers,false),rr=req?findMpsContentRow_(req,requestId):0;
    if(!rr)throw new Error('Proposal iklan tidak ditemukan.');
    const request=req.getRange(rr,1,1,MPS_AD_REQUESTS.headers.length).getValues()[0];
    if(String(request[12])!=='Approved'||String(request[14])!=='Paid')throw new Error('Iklan hanya dapat diterbitkan setelah disetujui admin dan pembayaran dikonfirmasi Paid.');
    const ads=getMpsContentSheet_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers,true);
    const existing=readMpsContentRows_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers).some(function(a){return String(a['Request ID'])===requestId;});
    if(existing)throw new Error('Proposal ini sudah memiliki iklan terbit.');
    const adId='AD-'+Utilities.getUuid().replace(/-/g,'').slice(0,16).toUpperCase(),now=new Date();
    ads.appendRow([adId,requestId,now,sheetText_(String(request[2]||'')),sheetText_(title),sheetText_(description),sheetText_(image),sheetText_(target),placement,start,end,'Approved','Paid',0,now]);
    req.getRange(rr,13).setValue('Published');req.getRange(rr,16).setValue(now);
    CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'AD_PUBLISHED',adId,'SUCCESS','Iklan dipublikasikan setelah status Approved dan Paid.');return {ok:true,adId:adId,message:'Iklan diterbitkan setelah persetujuan dan pembayaran terverifikasi.'};
  }finally{lock.releaseLock();}
}

function isMpsOfficialNewsUrl_(url) {
  const value=String(url||'').trim().toLowerCase();if(!/^https:\/\//.test(value))return false;
  const host=value.replace(/^https:\/\//,'').split(/[/?#]/)[0].replace(/^www\./,'');
  const domains=['bls.gov','federalreserve.gov','bea.gov','eia.gov','home.treasury.gov','cftc.gov','sec.gov','imf.org','worldbank.org','opec.org','un.org','nato.int','europa.eu','gov.uk'];
  return domains.some(function(d){return host===d||host.endsWith('.'+d);});
}

function apiAdminSaveNewsReview(session, id, decision, category, summary) {
  requireSuperAdmin_(session);
  const sh = getMpsContentSheet_(MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders,true);
  const row = findMpsContentRow_(sh,id);
  if (!row) throw new Error('Berita tidak ditemukan.');
  const choice = String(decision||'').toLowerCase();
  if (choice !== 'publish' && choice !== 'hide') throw new Error('Keputusan berita tidak valid.');
  if(choice==='publish'){
    const analysisSheet=getMpsContentSheet_(MPS_NEWS_ANALYSIS.sheet,MPS_NEWS_ANALYSIS.headers,false);
    const analysisRow=analysisSheet?findMpsContentRow_(analysisSheet,id):0;
    if(!analysisRow||String(analysisSheet.getRange(analysisRow,10).getDisplayValue()||'')!=='Published') throw new Error('Lengkapi dan publikasikan analisis dampak USD/XAUUSD sebelum berita diterbitkan.');
  }
  const verification = String(sh.getRange(row,9).getDisplayValue()||''),sourceUrl=sh.getRange(row,7).getDisplayValue();
  if(choice==='publish'&&!validHttpsUrl_(sourceUrl))throw new Error('Berita tidak dapat dipublikasikan tanpa sumber HTTPS yang dapat diperiksa.');
  if(choice==='publish'&&verification==='Official Source'&&!isMpsOfficialNewsUrl_(sourceUrl))throw new Error('Label Official Source hanya boleh digunakan untuk domain lembaga resmi yang terdaftar. Gunakan Reviewed by MPS Admin untuk media lain yang sudah diperiksa.');
  if(choice==='publish'&&verification!=='Official Source')sh.getRange(row,9).setValue('Reviewed by MPS Admin');
  sh.getRange(row,4).setValue(sheetText_(clean_(category||sh.getRange(row,4).getDisplayValue(),60)));
  if (summary != null) sh.getRange(row,6).setValue(sheetText_(cleanNewsText_(summary,420)));
  sh.getRange(row,8).setValue(choice==='publish'?'Published':'Hidden');
  sh.getRange(row,13).setValue(new Date());
  CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'NEWS_REVIEW_'+choice.toUpperCase(),id,'SUCCESS','Status berita diubah oleh admin.');
  return {ok:true,message:choice==='publish'?'Berita dipublikasikan.':'Berita disembunyikan.'};
}

function apiAdminSaveAnnouncement(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const title=clean_(payload.title,140),body=cleanNewsText_(payload.body,1800),audience=String(payload.audience||'PUBLIC').toUpperCase();
  const display=String(payload.displayType||'Popup'),frequency=String(payload.frequency||'Once Per Session');
  const theme=String(payload.colorTheme||'Gold'),animation=String(payload.animation||'Fade');
  const image=String(payload.imageUrl||'').trim(),buttonUrl=String(payload.buttonUrl||'').trim();
  if(!title||!body||!['PUBLIC','VIP','BOTH'].includes(audience))throw new Error('Judul, isi, atau target pengumuman tidak valid.');
  if(!['Popup','Banner','Both'].includes(display)||!['Once Per Session','Once Per Day','Always'].includes(frequency)||!['Gold','Red','Blue','Green','Purple'].includes(theme)||!['Fade','Slide','Pulse'].includes(animation))throw new Error('Pengaturan tampilan pengumuman tidak valid.');
  if(image&&!validHttpsUrl_(image))throw new Error('URL gambar harus menggunakan HTTPS.');
  if(buttonUrl&&!validHttpsUrl_(buttonUrl))throw new Error('URL tombol harus menggunakan HTTPS.');
  const startAt=parseOptionalDate_(payload.startAt),endAt=parseOptionalDate_(payload.endAt),priority=payload.priority==null||payload.priority===''?0:Number(payload.priority);
  if(!Number.isFinite(priority)||priority<0||priority>9)throw new Error('Prioritas pengumuman harus bernilai 0 sampai 9.');
  if(startAt&&endAt&&endAt.getTime()<startAt.getTime())throw new Error('Akhir tayang tidak boleh lebih awal dari mulai tayang.');
  const status=String(payload.status||'Draft');if(!['Draft','Published','Hidden'].includes(status))throw new Error('Status pengumuman tidak valid.');
  const sh=getMpsContentSheet_(MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers,true),id=clean_(payload.id,60)||('A-'+Utilities.getUuid().slice(0,12).toUpperCase());
  const existing=findMpsContentRow_(sh,id),created=existing?sh.getRange(existing,2).getValue():new Date();
  const row=[id,created,sheetText_(title),sheetText_(clean_(payload.category||'Pengumuman',50)),sheetText_(body),audience,Math.round(priority),startAt,endAt,status,display,sheetText_(image),sheetText_(clean_(payload.buttonText||'',50)),sheetText_(buttonUrl),frequency,theme,animation,new Date()];
  upsertMpsContentRow_(sh,id,row);CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'ANNOUNCEMENT_SAVED',id,'SUCCESS','Pengumuman '+audience+' diperbarui.');
  return {ok:true,id:id,message:'Pengumuman berhasil disimpan.'};
}

function apiAdminSaveCalendarEvent(session, payload) {
  requireSuperAdmin_(session); payload = payload || {};
  const name = clean_(payload.eventName,140), date = parseOptionalDate_(payload.eventDate);
  const time = clean_(payload.eventTime,20), impact = String(payload.impact||'Medium');
  if (!name || !date || !/^\d{2}:\d{2}$/.test(time) || ['Low','Medium','High'].indexOf(impact)<0) throw new Error('Nama event, tanggal, waktu WIB, atau dampak tidak valid.');
  const source = String(payload.sourceUrl||'').trim(),status=String(payload.status||'Draft');
  if (source && !validHttpsUrl_(source)) throw new Error('URL sumber harus menggunakan HTTPS.');
  if(!['Draft','Published','Hidden'].includes(status))throw new Error('Status event tidak valid.');
  if(status==='Published'&&!validHttpsUrl_(source))throw new Error('Event kalender harus memiliki URL sumber HTTPS sebelum dipublikasikan.');
  const sh = getMpsContentSheet_(MPS_CONTENT.calendarSheet,MPS_CONTENT.calendarHeaders,true);
  const id = clean_(payload.id,60) || ('E-'+Utilities.getUuid().slice(0,12).toUpperCase());
  const row = [id,date,time,sheetText_(clean_(payload.country||'United States',50)),sheetText_(name),impact,sheetText_(clean_(payload.forecast,80)),sheetText_(clean_(payload.previous,80)),sheetText_(clean_(payload.actual,80)),sheetText_(source),status,new Date()];
  upsertMpsContentRow_(sh,id,row);
  CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'CALENDAR_EVENT_SAVED',id,'SUCCESS','Jadwal ekonomi diperbarui.');
  return {ok:true,id:id,message:'Event kalender berhasil disimpan.'};
}

function apiAdminSavePartnerAd(session, payload) {
  requireSuperAdmin_(session); payload = payload || {};
  const brand = clean_(payload.brand,100), title = clean_(payload.title,140), target = String(payload.targetUrl||'').trim();
  const image = String(payload.imageUrl||'').trim();
  if (!brand || !title || !validHttpsUrl_(target)) throw new Error('Nama brand, judul, dan tautan HTTPS wajib diisi.');
  if (image && !validHttpsUrl_(image)) throw new Error('URL gambar harus menggunakan HTTPS.');
  const startAt = parseOptionalDate_(payload.startAt), endAt = parseOptionalDate_(payload.endAt);
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) throw new Error('Akhir tayang iklan tidak boleh lebih awal dari mulai tayang.');
  const sh = getMpsContentSheet_(MPS_CONTENT.adsSheet,MPS_CONTENT.adsHeaders,true);
  const id = clean_(payload.id,60) || ('AD-'+Utilities.getUuid().slice(0,12).toUpperCase());
  const existing = findMpsContentRow_(sh,id), created = existing ? sh.getRange(existing,2).getValue() : new Date();
  const row = [id,created,sheetText_(brand),sheetText_(title),sheetText_(clean_(payload.description,500)),sheetText_(image),sheetText_(target),sheetText_(clean_(payload.placement||'Main',30)),startAt,endAt,String(payload.status||'Active')==='Hidden'?'Hidden':'Active',existing?Number(sh.getRange(existing,12).getValue()||0):0,new Date()];
  upsertMpsContentRow_(sh,id,row);
  CacheService.getScriptCache().remove('mps_public_center_v480');
  return {ok:true,id:id,message:'Partner ad berhasil disimpan.'};
}

function apiAdminSaveVipBriefing(session, payload) {
  requireSuperAdmin_(session); payload = payload || {};
  const title = clean_(payload.title,140), body = cleanNewsText_(payload.body,5000);
  if (!title || !body) throw new Error('Judul dan isi briefing wajib diisi.');
  const source = String(payload.sourceUrl||'').trim(),status=String(payload.status||'Draft');
  if (source && !validHttpsUrl_(source)) throw new Error('URL sumber harus menggunakan HTTPS.');
  if(!['Draft','Published','Hidden'].includes(status))throw new Error('Status briefing tidak valid.');
  if(status==='Published'&&!source)throw new Error('VIP briefing Published wajib memiliki sumber atau referensi HTTPS.');
  const sh = getMpsContentSheet_(MPS_CONTENT.briefingSheet,MPS_CONTENT.briefingHeaders,true);
  const id = clean_(payload.id,60) || ('VIP-'+Utilities.getUuid().slice(0,12).toUpperCase());
  const existing = findMpsContentRow_(sh,id), created = existing ? sh.getRange(existing,2).getValue() : new Date();
  upsertMpsContentRow_(sh,id,[id,created,sheetText_(title),sheetText_(clean_(payload.category||'Market Intelligence',50)),sheetText_(cleanNewsText_(payload.summary,500)),sheetText_(body),sheetText_(source),status,new Date()]);
  recordMpsAudit_(adminRole_(session),adminActorRef_(session),'VIP_BRIEFING_SAVED',id,'SUCCESS','VIP briefing diperbarui.');
  return {ok:true,id:id,message:'Briefing VIP berhasil disimpan.'};
}

function apiAdminUpdateApprovedAd(session,payload) {
  requireSuperAdmin_(session);payload=payload||{};
  const id=clean_(payload.adId,60),title=clean_(payload.title,140),description=cleanNewsText_(payload.description,500),image=String(payload.imageUrl||'').trim(),target=String(payload.targetUrl||'').trim();
  if(!id||!title||!validHttpsUrl_(target)||(image&&!validHttpsUrl_(image)))throw new Error('Data iklan tidak valid.');
  const start=parseOptionalDate_(payload.startAt),end=parseOptionalDate_(payload.endAt);if(start&&end&&end.getTime()<start.getTime())throw new Error('Akhir tayang tidak boleh lebih awal dari mulai tayang.');
  const placement=clean_(payload.placement||'Public Home',40);if(!['Public Home','Website publik','Member Area','VIP Community'].includes(placement))throw new Error('Placement iklan tidak valid.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sh=getMpsContentSheet_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers,false),row=sh?findMpsContentRow_(sh,id):0;if(!row)throw new Error('Iklan tidak ditemukan.');
    const v=sh.getRange(row,1,1,MPS_APPROVED_ADS.headers.length).getValues()[0];if(String(v[12])!=='Paid')throw new Error('Iklan yang belum lunas tidak dapat diperbarui atau ditayangkan.');
    const values=[sheetText_(title),sheetText_(description),sheetText_(image),sheetText_(target),placement,start,end,v[11],v[12],v[13],new Date()];
    sh.getRange(row,5,1,11).setValues([values]);CacheService.getScriptCache().remove('mps_public_center_v480');recordMpsAudit_(adminRole_(session),adminActorRef_(session),'AD_UPDATED',id,'SUCCESS','Materi, placement, atau jadwal iklan diperbarui.');return {ok:true,message:'Materi, placement, atau jadwal iklan diperbarui.'};
  }finally{lock.releaseLock();}
}

function apiAdminSetContentStatus(session,type,id,status) {
  requireSuperAdmin_(session);
  const map={news:[MPS_CONTENT.newsSheet,MPS_CONTENT.newsHeaders,8],announcement:[MPS_ANNOUNCEMENTS.sheet,MPS_ANNOUNCEMENTS.headers,10],calendar:[MPS_CONTENT.calendarSheet,MPS_CONTENT.calendarHeaders,11],ad:[MPS_CONTENT.adsSheet,MPS_CONTENT.adsHeaders,11],approvedAd:[MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers,12],vipTickerEvent:[MPS_VIP_TICKER_EVENTS.sheet,MPS_VIP_TICKER_EVENTS.headers,6],briefing:[MPS_CONTENT.briefingSheet,MPS_CONTENT.briefingHeaders,8]};
  const cfg=map[String(type||'')];if(!cfg)throw new Error('Jenis konten tidak valid.');
  const allowed=type==='ad'?['Active','Hidden']:type==='approvedAd'?['Approved','Hidden']:type==='vipTickerEvent'?['Visible','Hidden']:type==='briefing'||type==='calendar'||type==='announcement'?['Draft','Published','Hidden']:['Hidden','Review'];
  if(allowed.indexOf(String(status))<0)throw new Error(type==='news'&&status==='Published'?'Publikasi berita harus melalui News Review agar analisis, sumber, dan verifikasi diperiksa.':'Status konten tidak valid.');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const sh=getMpsContentSheet_(cfg[0],cfg[1],false),row=sh?findMpsContentRow_(sh,id):0;if(!row)throw new Error('Konten tidak ditemukan.');
    const values=sh.getRange(row,1,1,cfg[1].length).getDisplayValues()[0];
    if(status==='Published'&&type==='calendar'){
      if(!String(values[4]||'').trim()||!['High','Medium','Low'].includes(String(values[5]||''))||!dateMs_(values[1]))throw new Error('Event kalender wajib memiliki tanggal, nama event, dan tingkat dampak yang valid.');
      if(!validHttpsUrl_(values[9]))throw new Error('Event kalender harus memiliki sumber HTTPS sebelum dipublikasikan.');
    }
    if(status==='Published'&&type==='briefing'){
      if(!String(values[2]||'').trim()||!String(values[4]||'').trim()||!String(values[5]||'').trim())throw new Error('VIP briefing wajib memiliki judul, ringkasan, dan isi.');
      if(!validHttpsUrl_(values[6]))throw new Error('VIP briefing harus memiliki sumber HTTPS sebelum dipublikasikan.');
    }
    if(status==='Published'&&type==='announcement'){
      if(!String(values[2]||'').trim()||!String(values[4]||'').trim()||!['PUBLIC','VIP','BOTH'].includes(String(values[5]||'')))throw new Error('Pengumuman harus memiliki judul, isi, dan audience yang valid sebelum dipublikasikan.');
    }
    if(status==='Active'&&type==='ad'){
      if(!String(values[2]||'').trim()||!String(values[3]||'').trim()||!validHttpsUrl_(values[6]))throw new Error('Partner ad wajib memiliki brand, judul, dan URL tujuan HTTPS yang valid.');
      if(values[5]&&!validHttpsUrl_(values[5]))throw new Error('URL gambar partner ad harus HTTPS.');
    }
    if(status==='Approved'&&type==='approvedAd'){
      if(String(values[12]||'')!=='Paid')throw new Error('Iklan hanya dapat diaktifkan jika pembayaran berstatus Paid.');
      if(!validHttpsUrl_(values[7]))throw new Error('Iklan harus memiliki URL tujuan HTTPS yang valid.');
      if(!['Public Home','Website publik','Member Area','VIP Community'].includes(String(values[8]||'')))throw new Error('Placement iklan tidak valid.');
    }
    sh.getRange(row, cfg[2]).setValue(status);CacheService.getScriptCache().remove('mps_public_center_v480');
    recordMpsAudit_(adminRole_(session),adminActorRef_(session),'CONTENT_STATUS_CHANGED',String(type)+':'+String(id),'SUCCESS','Status konten diubah menjadi '+status+'.');
    return {ok:true,message:'Status konten diperbarui.'};
  }finally{lock.releaseLock();}
}

function apiTrackPartnerClick(id,session) {
  const adId=clean_(id,60);if(!/^AD-[A-F0-9-]{8,}$/i.test(adId))return {ok:false};
  const sh=getMpsContentSheet_(MPS_APPROVED_ADS.sheet,MPS_APPROVED_ADS.headers,false),row=sh?findMpsContentRow_(sh,adId):0;
  if(!row)return {ok:false};
  const v=sh.getRange(row,1,1,MPS_APPROVED_ADS.headers.length).getValues()[0],placement=String(v[8]||'');
  if(String(v[11])!=='Approved'||String(v[12])!=='Paid'||!isWithinWindow_(v[9],v[10]))return {ok:false};
  if(['Member Area','VIP Community'].includes(placement)){
    let allowed=false;
    try { if(placement==='VIP Community') requireVipMember_(session); else requireMember_(session); allowed=true; }
    catch(e) { try { requireAdmin_(session); allowed=true; } catch(ignore) {} }
    if(!allowed)throw new Error(placement==='VIP Community'?'Iklan ini khusus member MPS VIP yang sudah terverifikasi.':'Iklan ini hanya dapat dibuka oleh member MPS.');
  }
  if(!['Public Home','Website publik','Member Area','VIP Community'].includes(placement))return {ok:false};
  consumeRateLimit_('mps_ad_click_global',1200,60,'Terlalu banyak klik iklan.');
  consumeRateLimit_('mps_ad_click_'+sha256_(adId).slice(0,20),600,60,'Terlalu banyak klik.');
  const lock=LockService.getScriptLock();lock.waitLock(5000);
  try{sh.getRange(row,14).setValue(Number(sh.getRange(row,14).getValue()||0)+1);}finally{lock.releaseLock();}
  return {ok:true};
}

function recordMpsActivity_(eventType, publicText, publicName) {
  const text=clean_(publicText,180),name=clean_(publicName,80);
  if(!text||/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\+?\d[\d ()-]{7,}\b|\b(?:MT5|LOGIN)\s*[:#-]?\s*\d{4,}\b)/i.test(text+' '+name))return false;
  const sh=getMpsContentSheet_(MPS_ACTIVITY.sheet,MPS_ACTIVITY.headers,true);sh.appendRow([Utilities.getUuid(),String(eventType||'').slice(0,40),sheetText_(text),sheetText_(name),new Date()]);return true;
}

function getMpsContentSheet_(name, headers, createIfMissing) {
  const ss = openDatabase_(); let sh = ss.getSheetByName(name);
  if (!sh && !createIfMissing) return null;
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow()===0) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.setHiddenGridlines(true); sh.getRange(1,1,1,headers.length).setBackground('#101f32').setFontColor('#d8b45a').setFontWeight('bold').setWrap(true); }
  const actual = sh.getRange(1,1,1,headers.length).getDisplayValues()[0];
  headers.forEach(function(h,i){if(String(actual[i]||'').trim()!==h)throw new Error('Header sheet '+name+' tidak sesuai. Tidak ada data yang diubah.');});
  return sh;
}

function readMpsContentRows_(name, headers) {
  const sh = getMpsContentSheet_(name,headers,false); if (!sh || sh.getLastRow()<2) return [];
  const values = sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues();
  return values.filter(function(row){return String(row[0]||'').trim()!=='';}).map(function(row){const o={};headers.forEach(function(h,i){o[h]=row[i] instanceof Date ? row[i].toISOString() : row[i];});return o;});
}
function findMpsContentRow_(sh,id) { const key=String(id||''); if(!key||sh.getLastRow()<2)return 0; const vals=sh.getRange(2,1,sh.getLastRow()-1,1).getDisplayValues(); for(let i=0;i<vals.length;i++)if(String(vals[i][0])===key)return i+2; return 0; }
function upsertMpsContentRow_(sh,id,row) {
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{const existing=findMpsContentRow_(sh,id);if(existing)sh.getRange(existing,1,1,row.length).setValues([row]);else sh.appendRow(row);}
  finally{lock.releaseLock();}
}

function xmlChildText_(el,name) { const child=el.getChildren().filter(function(x){return x.getName().toLowerCase()===String(name).toLowerCase();})[0]; return child ? child.getText() : ''; }
function cleanNewsText_(value,max) { return String(value||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\s+/g,' ').trim().slice(0,max||500); }
function validHttpsUrl_(value) { const v=String(value||'').trim(); return /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]{1,5})?(?:[/?#]|$)/i.test(v) && !/^https:\/\/[^/]*@/i.test(v); }
function getHostFromUrl_(url) { const m=String(url||'').match(/^https:\/\/([^/:?#]+)/i); return m?m[1]:''; }
function parseFeedDate_(value) { if(!value)return null; const d=new Date(value); return isNaN(d.getTime())?null:d; }
function parseGdeltDate_(value) {
  const m=String(value||'').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);if(!m)return null;
  const p=m.slice(1).map(Number);if(p[1]<1||p[1]>12||p[2]<1||p[2]>31||p[3]>23||p[4]>59||p[5]>59)return null;
  const d=new Date(Date.UTC(p[0],p[1]-1,p[2],p[3],p[4],p[5]));
  if(d.getUTCFullYear()!==p[0]||d.getUTCMonth()!==p[1]-1||d.getUTCDate()!==p[2]||d.getUTCHours()!==p[3]||d.getUTCMinutes()!==p[4]||d.getUTCSeconds()!==p[5])return null;
  return d;
}

function classifyMpsNews_(title,fallback) { const t=String(title||'').toLowerCase(); if(/fomc|federal reserve|interest rate|powell|monetary policy/.test(t))return 'Bank Sentral'; if(/employment|payroll|unemployment|jobs report|job openings|wages/.test(t))return 'Tenaga Kerja'; if(/inflation|consumer price|cpi|producer price|pce/.test(t))return 'Inflasi'; if(/oil|crude|opec|energy|petroleum/.test(t))return 'Energi'; if(/war|conflict|missile|sanction|iran|iraq|israel|ukraine|geopolit/.test(t))return 'Geopolitik'; if(/gdp|gross domestic|economic growth/.test(t))return 'Pertumbuhan'; return fallback||'Global Market'; }
function parseOptionalDate_(value) {
  if(value==null||value==='')return '';
  const text=String(value);let d;
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    const p=text.split('-').map(Number);if(p[1]<1||p[1]>12||p[2]<1||p[2]>31)throw new Error('Tanggal konten tidak valid.');
    d=new Date(text+'T00:00:00+07:00');
    if(Utilities.formatDate(d,'Asia/Jakarta','yyyy-MM-dd')!==text)throw new Error('Tanggal konten tidak valid.');
  }else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)){
    const m=text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/),p=m.slice(1).map(Number);
    if(p[1]<1||p[1]>12||p[2]<1||p[2]>31||p[3]>23||p[4]>59)throw new Error('Waktu konten tidak valid.');
    d=new Date(text+':00+07:00');if(Utilities.formatDate(d,'Asia/Jakarta','yyyy-MM-dd HH:mm')!==text.replace('T',' '))throw new Error('Tanggal atau waktu konten tidak valid.');
  }else{d=new Date(text);if(isNaN(d.getTime()))throw new Error('Format tanggal konten tidak valid.');}
  if(isNaN(d.getTime()))throw new Error('Format tanggal konten tidak valid.');return d;
}

function dateMs_(value) { const d=value instanceof Date?value:new Date(value); return isNaN(d.getTime())?0:d.getTime(); }
function startOfTodayMs_() { const day=Utilities.formatDate(new Date(),'Asia/Jakarta','yyyy-MM-dd'); return new Date(day+'T00:00:00+07:00').getTime(); }
function isWithinWindow_(start,end) { const now=Date.now(),s=dateMs_(start),e=dateMs_(end); return (!s||s<=now)&&(!e||e>=now); }

/* Isolated durable Telegram VIP transition adapters. */
/**
 * Isolated MPS append-only effect ledger adapter.
 * Explicit spreadsheet ID only; no tab/spreadsheet creation, Script Properties,
 * webhook wiring, or implicit production resource selection.
 */
function createMpsGasEffectLedger_(config) {
  config=config||{};
  var spreadsheetId=String(config.spreadsheetId||'').trim();
  var lockWaitMs=Number(config.lockWaitMs||10000);
  if(!spreadsheetId) throw new Error('EFFECT_SPREADSHEET_ID_REQUIRED');
  if(!(lockWaitMs>0&&lockWaitMs<=30000)) throw new Error('INVALID_EFFECT_LOCK_WAIT');
  var schemas={
    audit:{sheetName:'MPS Audit Logs',headers:['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']},
    ticker:{sheetName:'MPS VIP Ticker Events',headers:['Event ID','Created At','Member ID','Member Name','Event Text','Status']}
  };
  var keyHeader='Effect Key';
  function withLock_(fn){var lock=LockService.getScriptLock();lock.waitLock(lockWaitMs);try{return fn();}finally{lock.releaseLock();}}
  function schema_(kind){var s=schemas[kind];if(!s)throw new Error('UNKNOWN_EFFECT_SHEET');return s;}
  function sheet_(s){var ss=SpreadsheetApp.openById(spreadsheetId),sh=ss&&ss.getSheetByName(s.sheetName);if(!sh)throw new Error('EFFECT_SHEET_MISSING');return sh;}
  function readHeaders_(sh){var width=sh.getLastColumn();if(width<1)return [];return sh.getRange(1,1,1,width).getDisplayValues()[0].map(function(v){return String(v==null?'':v);});}
  function validateSchema_(kind,sh,requireMigrated){
    var s=schema_(kind),actual=readHeaders_(sh),expected=s.headers;
    for(var i=0;i<expected.length;i++)if(actual[i]!==expected[i])throw new Error('EFFECT_LEGACY_SCHEMA_MISMATCH');
    if(actual.length===expected.length){if(requireMigrated)throw new Error('EFFECT_MIGRATION_REQUIRED');return{migrated:false,keyColumn:expected.length+1};}
    if(actual.length===expected.length+1&&actual[expected.length]===keyHeader)return{migrated:true,keyColumn:expected.length+1};
    throw new Error('EFFECT_UNKNOWN_EXTRA_COLUMNS');
  }
  function validateKeys_(sh,keyColumn){
    var last=sh.getLastRow(),seen=Object.create(null);if(last<2)return;
    sh.getRange(2,keyColumn,last-1,1).getDisplayValues().forEach(function(line){
      var key=String(line[0]==null?'':line[0]);if(!key)return;
      if(!/^[A-Za-z0-9:_-]{1,160}$/.test(key))throw new Error('EFFECT_INVALID_EXISTING_KEY');
      if(seen[key])throw new Error('EFFECT_DUPLICATE_EXISTING_KEY');seen[key]=true;
    });
  }
  function migrateLocked_(kind){
    var s=schema_(kind),sh=sheet_(s),state=validateSchema_(kind,sh,false);
    if(state.migrated){validateKeys_(sh,state.keyColumn);return{outcome:'ALREADY_MIGRATED',keyColumn:state.keyColumn};}
    var last=sh.getLastRow();
    if(last>1){var stray=sh.getRange(2,state.keyColumn,last-1,1).getDisplayValues();if(stray.some(function(line){return String(line[0]==null?'':line[0]).trim()!=='';}))throw new Error('EFFECT_UNLABELLED_COLUMN_HAS_DATA');}
    sh.getRange(1,state.keyColumn).setValue(keyHeader);SpreadsheetApp.flush();
    var confirmed=validateSchema_(kind,sh,true);validateKeys_(sh,confirmed.keyColumn);
    return{outcome:'MIGRATED',keyColumn:confirmed.keyColumn};
  }
  function canonical_(v){if(Array.isArray(v))return v.map(canonical_);if(v&&typeof v==='object'){var o={};Object.keys(v).sort().forEach(function(k){o[k]=canonical_(v[k]);});return o;}return v;}
  function appendOnceLocked_(kind,effectKey,rowValues){
    var s=schema_(kind),sh=sheet_(s),state=validateSchema_(kind,sh,true);validateKeys_(sh,state.keyColumn);
    var key=String(effectKey==null?'':effectKey);
    if(!/^[A-Za-z0-9:_-]{1,160}$/.test(key))throw new Error('INVALID_EFFECT_KEY');
    if(!Array.isArray(rowValues)||rowValues.length!==s.headers.length)throw new Error('INVALID_EFFECT_ROW');
    var expected=JSON.stringify(canonical_(rowValues)),last=sh.getLastRow();
    if(last>=2){var existing=sh.getRange(2,1,last-1,state.keyColumn).getValues();
      for(var i=0;i<existing.length;i++)if(String(existing[i][state.keyColumn-1]||'')===key){
        var prior=JSON.stringify(canonical_(existing[i].slice(0,s.headers.length)));
        return prior===expected?{outcome:'ALREADY_APPENDED',row:i+2}:{outcome:'REVIEW_KEY_COLLISION',row:i+2};
      }
    }
    var values=rowValues.slice();values.push(key);var target=last+1;
    sh.getRange(target,state.keyColumn).setNumberFormat('@');
    sh.getRange(target,1,1,state.keyColumn).setValues([values]);SpreadsheetApp.flush();
    return{outcome:'APPENDED',row:target};
  }
  var scopeActive_=false;
  function migrate_(kind){
    if(scopeActive_)throw new Error('NESTED_EFFECT_LOCK_ACQUISITION');
    return withLock_(function(){return migrateLocked_(kind);});
  }
  function appendOnce_(kind,effectKey,rowValues){
    if(scopeActive_)throw new Error('NESTED_EFFECT_LOCK_ACQUISITION');
    return withLock_(function(){return appendOnceLocked_(kind,effectKey,rowValues);});
  }
  function runExclusive_(callback){
    if(typeof callback!=='function')throw new Error('EFFECT_SCOPE_CALLBACK_REQUIRED');
    if(scopeActive_)throw new Error('NESTED_EFFECT_LOCK_ACQUISITION');
    return withLock_(function(){
      scopeActive_=true;
      var active=true;
      var scoped=Object.freeze({
        assertActive:function(){if(!active)throw new Error('EFFECT_SCOPE_CLOSED');return true;},
        migrate:function(kind){if(!active)throw new Error('EFFECT_SCOPE_CLOSED');return migrateLocked_(kind);},
        appendOnce:function(kind,effectKey,rowValues){if(!active)throw new Error('EFFECT_SCOPE_CLOSED');return appendOnceLocked_(kind,effectKey,rowValues);}
      });
      try{
        var result=callback(scoped);
        if(result&&typeof result.then==='function')throw new Error('ASYNC_EFFECT_SCOPE_NOT_SUPPORTED');
        return result;
      }finally{active=false;scopeActive_=false;}
    });
  }
  return{migrate:migrate_,appendOnce:appendOnce_,runExclusive:runExclusive_};
}


/**
 * Durable VIP transition intent/cursor sheet repository.
 * Every public operation requires the scoped capability from the effect
 * ledger's runExclusive(tx => ...) callback. This module never takes a lock.
 * Both tabs must be provisioned explicitly in an isolated spreadsheet.
 */
function createMpsGasVipTransitionStore_(config) {
  config=config||{};
  var spreadsheetId=String(config.spreadsheetId||'').trim();
  if(!spreadsheetId)throw new Error('VIP_TRANSITION_SPREADSHEET_ID_REQUIRED');
  var intentName='MPS Telegram VIP Transition Intents';
  var cursorName='MPS Telegram VIP Member Cursor';
  var intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
  var cursorHeaders=['Member ID','Last Update Epoch','Last Source Date','Last Update ID','Last Transition Key','Updated At'];
  var intentFields=['Update Epoch','Update ID','Member ID','Member Name','Telegram User ID','Target State','Source Type','Source Date','Payload SHA-256','Ticker Allowed','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
  function active_(tx){if(!tx||typeof tx.assertActive!=='function')throw new Error('VIP_TRANSITION_SCOPE_REQUIRED');tx.assertActive();}
  function sheet_(name,headers,tx){
    active_(tx);
    var ss=SpreadsheetApp.openById(spreadsheetId),sh=ss&&ss.getSheetByName(name);
    if(!sh)throw new Error('VIP_TRANSITION_SHEET_MISSING');
    var width=sh.getLastColumn(),actual=width?sh.getRange(1,1,1,width).getDisplayValues()[0].map(String):[];
    if(actual.length!==headers.length||headers.some(function(h,i){return actual[i]!==h;}))throw new Error('VIP_TRANSITION_SCHEMA_MISMATCH');
    return sh;
  }
  function rows_(sh,width){var last=sh.getLastRow();return last<2?[]:sh.getRange(2,1,last-1,width).getValues();}
  function uniqueRow_(rows,index,value,code){
    var found=-1;for(var i=0;i<rows.length;i++)if(String(rows[i][index])===String(value)){if(found>=0)throw new Error(code||'VIP_TRANSITION_DUPLICATE_ROW');found=i;}
    return found;
  }
  function key_(value){var s=String(value==null?'':value);if(!/^[A-Za-z0-9:_-]{1,160}$/.test(s))throw new Error('VIP_TRANSITION_INVALID_KEY');return s;}
  function member_(value){var s=String(value==null?'':value).trim();if(!s||s.length>128)throw new Error('VIP_TRANSITION_INVALID_MEMBER');return s;}
  function intentObject_(row){var o={};intentHeaders.forEach(function(h,i){o[h]=row[i];});return o;}
  function validateIntent_(o){
    if(!o||key_(o['Intent Key'])!==String(o['Intent Key']))throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    var epoch=Number(o['Update Epoch']),sourceDate=Number(o['Source Date']),updateId=String(o['Update ID']||'');
    if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(sourceDate)||sourceDate<=0||!/^(0|[1-9]\d{0,19})$/.test(updateId))throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    member_(o['Member ID']);
    if(!/^[0-9]{1,20}$/.test(String(o['Telegram User ID']||''))||!['ACTIVE','LEFT','DENIED'].includes(String(o['Target State']))||o['Source Type']!=='CHAT_MEMBER')throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    if(!/^[a-f0-9]{64}$/.test(String(o['Payload SHA-256']||''))||typeof o['Ticker Allowed']!=='boolean')throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    if(['INTENT','STATUS_APPLIED','COMPLETED','SUPERSEDED'].indexOf(String(o.State))<0)throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    key_(o['Ticker Effect Key']);key_(o['Audit Effect Key']);
    if(String(o['Member Name']||'').length>128)throw new Error('VIP_TRANSITION_INTENT_CORRUPT');
    return o;
  }
  function readIntent(tx,intentKey){
    var key=key_(intentKey),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length),i=uniqueRow_(rows,0,key);
    return i<0?null:validateIntent_(intentObject_(rows[i]));
  }
  function insertIntent(tx,record){
    active_(tx);if(!record||typeof record!=='object')throw new Error('VIP_TRANSITION_INVALID_INTENT');
    var key=key_(record['Intent Key']),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length);
    var epoch=Number(record['Update Epoch']),updateId=String(record['Update ID']==null?'':record['Update ID']);
    var sourceDate=Number(record['Source Date']),memberId=member_(record['Member ID']);
    if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('VIP_TRANSITION_INVALID_EPOCH');
    if(!/^(0|[1-9]\d{0,19})$/.test(updateId))throw new Error('VIP_TRANSITION_INVALID_UPDATE_ID');
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new Error('VIP_TRANSITION_INVALID_SOURCE_DATE');
    if(!['ACTIVE','LEFT','DENIED'].includes(record['Target State']))throw new Error('VIP_TRANSITION_INVALID_TARGET_STATE');
    if(record['Source Type']!=='CHAT_MEMBER')throw new Error('VIP_TRANSITION_UNSUPPORTED_SOURCE_TYPE');
    if(!/^[a-f0-9]{64}$/.test(String(record['Payload SHA-256']||'')))throw new Error('VIP_TRANSITION_INVALID_PAYLOAD_HASH');
    if(String(record['Member Name']||memberId).length>128)throw new Error('VIP_TRANSITION_INVALID_MEMBER_NAME');
    if(!/^[0-9]{1,20}$/.test(String(record['Telegram User ID']||'')))throw new Error('VIP_TRANSITION_INVALID_TELEGRAM_USER_ID');
    if(typeof record['Ticker Allowed']!=='boolean')throw new Error('VIP_TRANSITION_INVALID_TICKER_POLICY');
    if(record.State!=='INTENT')throw new Error('VIP_TRANSITION_INVALID_INITIAL_STATE');
    key_(record['Ticker Effect Key']);key_(record['Audit Effect Key']);
    var existingIndex=uniqueRow_(rows,0,key);
    var values=[key].concat(intentFields.map(function(h){return record[h]===undefined?'':record[h];}));
    if(existingIndex>=0){var prior=rows[existingIndex];validateIntent_(intentObject_(prior));var same=prior.length===values.length&&prior.every(function(v,i){return String(v==null?'':v)===String(values[i]==null?'':values[i]);});return{outcome:same?'EXISTS':'REVIEW_COLLISION',record:intentObject_(prior)};}
    sh.getRange(sh.getLastRow()+1,1,1,intentHeaders.length).setValues([values]);SpreadsheetApp.flush();
    return{outcome:'INSERTED',row:sh.getLastRow(),record:intentObject_(values)};
  }
  function updateIntent(tx,intentKey,patch){
    active_(tx);var key=key_(intentKey),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length),i=uniqueRow_(rows,0,key);
    if(i<0)throw new Error('VIP_TRANSITION_INTENT_NOT_FOUND');
    var current=validateIntent_(intentObject_(rows[i]));
    var currentState=String(current.State),nextState=patch&&patch.State;
    if(nextState!==undefined){var allowed={INTENT:['INTENT','STATUS_APPLIED','SUPERSEDED'],STATUS_APPLIED:['STATUS_APPLIED','COMPLETED'],COMPLETED:['COMPLETED'],SUPERSEDED:['SUPERSEDED']};if(!allowed[currentState]||allowed[currentState].indexOf(String(nextState))<0)throw new Error('VIP_TRANSITION_INVALID_STATE_CHANGE');}
    Object.keys(patch||{}).forEach(function(field){var col=intentHeaders.indexOf(field);if(col<=0)throw new Error('VIP_TRANSITION_FIELD_NOT_WRITABLE');rows[i][col]=patch[field];});
    sh.getRange(i+2,1,1,intentHeaders.length).setValues([rows[i]]);SpreadsheetApp.flush();
    return intentObject_(rows[i]);
  }
  function readCursor(tx,memberId){
    var id=member_(memberId),sh=sheet_(cursorName,cursorHeaders,tx),rows=rows_(sh,cursorHeaders.length),i=uniqueRow_(rows,0,id);
    if(i<0)return null;var row=rows[i],epoch=Number(row[1]),sourceDate=Number(row[2]),updateId=String(row[3]||''),transitionKey=key_(row[4]);
    if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(sourceDate)||sourceDate<=0||!/^(0|[1-9]\d{0,19})$/.test(updateId))throw new Error('VIP_TRANSITION_CURSOR_CORRUPT');
    return{memberId:row[0],epoch:epoch,sourceDate:sourceDate,updateId:updateId,transitionKey:transitionKey,updatedAt:row[5]};
  }
  function writeCursor(tx,record){
    active_(tx);if(!record||typeof record!=='object')throw new Error('VIP_TRANSITION_INVALID_CURSOR');
    var id=member_(record.memberId),epoch=Number(record.epoch),sourceDate=Number(record.sourceDate),updateId=String(record.updateId==null?'':record.updateId);
    if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('VIP_TRANSITION_INVALID_EPOCH');
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new Error('VIP_TRANSITION_INVALID_SOURCE_DATE');
    if(!/^(0|[1-9]\d{0,19})$/.test(updateId))throw new Error('VIP_TRANSITION_INVALID_UPDATE_ID');
    var sh=sheet_(cursorName,cursorHeaders,tx),rows=rows_(sh,cursorHeaders.length),i=uniqueRow_(rows,0,id);
    var transitionKey=key_(record.transitionKey);
    var values=[id,epoch,sourceDate,updateId,transitionKey,record.updatedAt];
    if(i<0){sh.getRange(sh.getLastRow()+1,1,1,cursorHeaders.length).setValues([values]);SpreadsheetApp.flush();return{outcome:'INSERTED'};}
    var prior=rows[i],priorEpoch=Number(prior[1]),priorDate=Number(prior[2]),priorId=String(prior[3]);
    if(!Number.isSafeInteger(priorEpoch)||priorEpoch<0||!Number.isSafeInteger(priorDate)||priorDate<=0||!/^(0|[1-9]\d{0,19})$/.test(priorId))throw new Error('VIP_TRANSITION_CURSOR_CORRUPT');
    key_(prior[4]);
    function cmpId(a,b){return a.length!==b.length?(a.length>b.length?1:-1):(a===b?0:(a>b?1:-1));}
    var order=sourceDate!==priorDate?(sourceDate>priorDate?1:-1):(epoch!==priorEpoch?(epoch>priorEpoch?1:-1):cmpId(updateId,priorId));
    if(order<0)throw new Error('VIP_TRANSITION_CURSOR_REGRESSION');
    if(order===0&&String(prior[4])!==transitionKey)throw new Error('VIP_TRANSITION_CURSOR_COLLISION');
    if(order===0)return{outcome:'ALREADY_CURRENT'};
    sh.getRange(i+2,1,1,cursorHeaders.length).setValues([values]);SpreadsheetApp.flush();return{outcome:'UPDATED'};
  }
  function findPending(tx,memberId){
    var id=member_(memberId),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length);
    var found=[];rows.forEach(function(row){if(String(row[3])===id){var intent=validateIntent_(intentObject_(row));if(['INTENT','STATUS_APPLIED'].indexOf(String(intent.State))>=0)found.push(intent);}});
    if(found.length>1)throw new Error('VIP_TRANSITION_MULTIPLE_PENDING');
    return found.length?found[0]:null;
  }
  return Object.freeze({readIntent:readIntent,insertIntent:insertIntent,updateIntent:updateIntent,readCursor:readCursor,writeCursor:writeCursor,findPending:findPending,
    headers:Object.freeze({intents:intentHeaders.slice(),cursor:cursorHeaders.slice()})});
}


/**
 * Synchronous VIP transition orchestrator for isolated Apps Script integration.
 * All Sheets/status/effect work shares one effect-ledger runExclusive scope.
 * Only original chat_member events are accepted: join-request reconciliation
 * needs a separately timestamped observation policy before it can be admitted.
 * No Telegram/network calls are permitted in this critical section.
 */
function createMpsGasVipTransitionOrchestrator_(config) {
  config=config||{};
  var ledger=config.ledger,store=config.store,statusWriter=config.statusWriter,resolveTransition=config.resolveTransition;
  if(!ledger||typeof ledger.runExclusive!=='function')throw new Error('VIP_ORCHESTRATOR_LEDGER_REQUIRED');
  if(!store||typeof store.findPending!=='function')throw new Error('VIP_ORCHESTRATOR_STORE_REQUIRED');
  if(!statusWriter||typeof statusWriter.applyAccessStatus!=='function'||typeof statusWriter.applyMemberStatus!=='function')throw new Error('VIP_STATUS_WRITER_REQUIRED');

  function decimal_(v){
    if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0)throw new Error('VIP_INVALID_UPDATE_ID');return String(v);}
    var s=String(v==null?'':v);if(!/^(0|[1-9]\d{0,19})$/.test(s))throw new Error('VIP_INVALID_UPDATE_ID');return s;
  }
  function compareDecimal_(a,b){a=String(a);b=String(b);return a.length!==b.length?(a.length>b.length?1:-1):(a===b?0:(a>b?1:-1));}
  function compare_(a,b){
    if(!b)return 1;
    // Telegram chat_member.date is the primary source-event clock. update_id
    // is the deterministic tie-break for events within the same second.
    if(Number(a.sourceDate)!==Number(b.sourceDate))return Number(a.sourceDate)>Number(b.sourceDate)?1:-1;
    if(Number(a.epoch)!==Number(b.epoch))return Number(a.epoch)>Number(b.epoch)?1:-1;
    return compareDecimal_(a.updateId,b.updateId);
  }
  function key_(epoch,id){return 'telegram:'+epoch+':'+id+':vip_transition';}
  function callWriter_(fn,tx,record){
    tx.assertActive();var result=fn(tx,record);
    if(result&&typeof result.then==='function')throw new Error('VIP_STATUS_WRITER_MUST_BE_SYNCHRONOUS');
  }
  function checkEffect_(result,kind){
    if(result&&result.outcome==='REVIEW_KEY_COLLISION')throw new Error('VIP_'+kind+'_EFFECT_COLLISION');
  }
  function finish_(tx,intent,nowIso){
    var key=String(intent['Intent Key']),state=String(intent.State);
    if(state==='COMPLETED'||state==='SUPERSEDED')return state;
    var memberId=String(intent['Member ID']),target=String(intent['Target State']);
    var epoch=Number(intent['Update Epoch']),sourceDate=Number(intent['Source Date']);
    var updateId=String(intent['Update ID']);
    if(state==='INTENT'){
      var cursor=store.readCursor(tx,memberId);
      if(cursor&&compare_({epoch:epoch,sourceDate:sourceDate,updateId:updateId},
        {epoch:Number(cursor.epoch),sourceDate:Number(cursor.sourceDate),updateId:String(cursor.updateId)})<=0){
        if(Number(cursor.epoch)===epoch&&Number(cursor.sourceDate)===sourceDate&&String(cursor.updateId)===updateId&&String(cursor.transitionKey)===key){
          throw new Error('VIP_CURSOR_ADVANCED_BEFORE_STATUS_APPLIED');
        }
        store.updateIntent(tx,key,{'State':'SUPERSEDED','Updated At':nowIso,'Last Error Code':'STALE_BEFORE_STATUS'});
        return 'SUPERSEDED';
      }
      var statusRecord={memberId:memberId,telegramUserId:String(intent['Telegram User ID']),targetState:target,sourceDate:sourceDate,updateId:updateId,transitionKey:key};
      callWriter_(statusWriter.applyAccessStatus,tx,statusRecord);
      callWriter_(statusWriter.applyMemberStatus,tx,statusRecord);
      intent=store.updateIntent(tx,key,{'State':'STATUS_APPLIED','Updated At':nowIso,'Last Error Code':''});
      state='STATUS_APPLIED';
    }
    if(state!=='STATUS_APPLIED')throw new Error('VIP_INTENT_UNKNOWN_STATE');
    var cursorNow=store.readCursor(tx,memberId);
    if(cursorNow){
      var cursorOrder=compare_({epoch:Number(cursorNow.epoch),sourceDate:Number(cursorNow.sourceDate),updateId:String(cursorNow.updateId)},
        {epoch:epoch,sourceDate:sourceDate,updateId:updateId});
      if(cursorOrder>0)throw new Error('VIP_TRANSITION_CURSOR_AHEAD');
      if(cursorOrder===0&&String(cursorNow.transitionKey)!==key)throw new Error('VIP_TRANSITION_CURSOR_COLLISION');
    }
    if(!cursorNow||compare_({epoch:epoch,sourceDate:sourceDate,updateId:updateId},
      {epoch:Number(cursorNow.epoch),sourceDate:Number(cursorNow.sourceDate),updateId:String(cursorNow.updateId)})>0){
      store.writeCursor(tx,{memberId:memberId,epoch:epoch,sourceDate:sourceDate,updateId:updateId,transitionKey:key,updatedAt:nowIso});
    }
    var timestamp=new Date(sourceDate*1000),tickerKey=String(intent['Ticker Effect Key']),auditKey=String(intent['Audit Effect Key']);
    if(target==='ACTIVE'&&intent['Ticker Allowed']===true){
      checkEffect_(tx.appendOnce('ticker',tickerKey,[
        'VIP-'+key,timestamp,memberId,String(intent['Member Name']||memberId),
        'telah bergabung ke MPS VIP Community','Visible'
      ]),'TICKER');
    }
    var action=target==='ACTIVE'?'VIP_JOIN_CONFIRMED':(target==='LEFT'?'VIP_LEFT_CONFIRMED':'VIP_JOIN_DENIED');
    var result=target==='DENIED'?'WARNING':'SUCCESS';
    checkEffect_(tx.appendOnce('audit',auditKey,[
      timestamp,'TELEGRAM',memberId,action,memberId,result,'Transition '+key+' applied from Telegram chat_member event.'
    ]),'AUDIT');
    store.updateIntent(tx,key,{'State':'COMPLETED','Updated At':nowIso,'Last Error Code':''});
    return 'COMPLETED';
  }
  function process(input,resolveOverride){
    input=input||{};
    var updateId=decimal_(input.updateId),epoch=Number(input.epoch);
    var sourceDate=Number(input.sourceDate),memberId=String(input.memberId||'').trim();
    var target=String(input.targetState||'');
    if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('VIP_INVALID_EPOCH');
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new Error('VIP_INVALID_SOURCE_DATE');
    if(!memberId&&typeof resolveTransition!=='function'&&typeof resolveOverride!=='function')throw new Error('VIP_INVALID_MEMBER');
    if(memberId.length>128)throw new Error('VIP_INVALID_MEMBER');
    if(target&&!['ACTIVE','LEFT','DENIED'].includes(target))throw new Error('VIP_INVALID_TARGET_STATE');
    if(input.sourceType!=='CHAT_MEMBER')throw new Error('VIP_UNSUPPORTED_SOURCE_TYPE');
    var payloadHash=String(input.payloadSha256||'').toLowerCase();
    if(!/^[a-f0-9]{64}$/.test(payloadHash))throw new Error('VIP_INVALID_PAYLOAD_HASH');
    var intentKey=key_(epoch,updateId),timestampIso=new Date(sourceDate*1000).toISOString();
    return ledger.runExclusive(function(tx){
      tx.assertActive();
      var resolver=typeof resolveOverride==='function'?resolveOverride:resolveTransition;
      var resolved=typeof resolver==='function'?resolver(tx,input):input;
      if(!resolved||resolved.ignored===true)return 'IGNORED';
      var effectiveMemberId=String(resolved.memberId||memberId).trim();
      var effectiveTarget=String(resolved.targetState||target);
      var effectiveName=String(resolved.memberName||input.memberName||effectiveMemberId);
      var telegramUserId=String(resolved.telegramUserId||input.telegramUserId||'');
      var tickerAllowed=resolved.tickerAllowed===true;
      if(!effectiveMemberId||effectiveMemberId.length>128)throw new Error('VIP_INVALID_MEMBER');
      if(!['ACTIVE','LEFT','DENIED'].includes(effectiveTarget))throw new Error('VIP_INVALID_TARGET_STATE');
      if(!/^[0-9]{1,20}$/.test(telegramUserId))throw new Error('VIP_INVALID_TELEGRAM_USER_ID');
      var pending=store.findPending(tx,effectiveMemberId);
      if(pending)finish_(tx,pending,timestampIso);
      memberId=effectiveMemberId;target=effectiveTarget;
      var existing=store.readIntent(tx,intentKey);
      if(existing){
        if(String(existing['Payload SHA-256'])!==payloadHash||String(existing['Member ID'])!==memberId||
          String(existing['Target State'])!==target||Number(existing['Source Date'])!==sourceDate||String(existing['Telegram User ID'])!==telegramUserId){
          throw new Error('VIP_TRANSITION_INTENT_COLLISION');
        }
        if(String(existing.State)==='COMPLETED')return 'DUPLICATE';
        if(String(existing.State)==='SUPERSEDED')return 'STALE';
        finish_(tx,existing,timestampIso);return target;
      }
      var cursor=store.readCursor(tx,memberId);
      if(cursor&&compare_({epoch:epoch,sourceDate:sourceDate,updateId:updateId},
        {epoch:Number(cursor.epoch),sourceDate:Number(cursor.sourceDate),updateId:String(cursor.updateId)})<=0)return 'STALE';
      var record={
        'Intent Key':intentKey,'Update Epoch':epoch,'Update ID':updateId,'Member ID':memberId,
        'Member Name':effectiveName,'Telegram User ID':telegramUserId,'Target State':target,'Source Type':'CHAT_MEMBER','Source Date':sourceDate,
        'Payload SHA-256':payloadHash,'Ticker Allowed':tickerAllowed,'State':'INTENT','Ticker Effect Key':intentKey+':ticker',
        'Audit Effect Key':intentKey+':audit','Created At':timestampIso,'Updated At':timestampIso,
        'Last Error Code':''
      };
      var inserted=store.insertIntent(tx,record);
      if(inserted.outcome==='REVIEW_COLLISION')throw new Error('VIP_TRANSITION_INTENT_COLLISION');
      if(inserted.outcome!=='INSERTED'&&inserted.outcome!=='EXISTS')throw new Error('VIP_TRANSITION_INTENT_WRITE_FAILED');
      var durable=store.readIntent(tx,intentKey);
      if(!durable)throw new Error('VIP_TRANSITION_INTENT_NOT_DURABLE');
      if(String(durable['Payload SHA-256'])!==payloadHash)throw new Error('VIP_TRANSITION_INTENT_COLLISION');
      finish_(tx,durable,timestampIso);
      return target;
    });
  }
  function isCurrent(input,resolved){
    input=input||{};resolved=resolved||{};
    var memberId=String(resolved.memberId||input.memberId||'').trim();
    if(!memberId)return false;
    var updateId=decimal_(input.updateId),epoch=Number(input.epoch),sourceDate=Number(input.sourceDate);
    if(!Number.isSafeInteger(epoch)||epoch<0||!Number.isSafeInteger(sourceDate)||sourceDate<=0)return false;
    var intentKey=key_(epoch,updateId);
    return ledger.runExclusive(function(tx){
      tx.assertActive();
      var intent=store.readIntent(tx,intentKey);
      if(!intent||String(intent.State)!=='COMPLETED'||String(intent['Member ID'])!==memberId)return false;
      var cursor=store.readCursor(tx,memberId);
      return !!cursor&&String(cursor.transitionKey)===intentKey&&
        compare_({epoch:epoch,sourceDate:sourceDate,updateId:updateId},
          {epoch:Number(cursor.epoch),sourceDate:Number(cursor.sourceDate),updateId:String(cursor.updateId)})===0;
    });
  }
  return Object.freeze({process:process,isCurrent:isCurrent});
}


/**
 * Telegram chat_member ingress adapter.
 * It preserves update_id and Telegram's original chat_member.date, delegates
 * identity/eligibility resolution under the orchestrator's one lock, then runs
 * optional external follow-up only after the lock has been released.
 */
function createMpsGasVipChatMemberHandler_(config) {
  config=config||{};
  var orchestrator=config.orchestrator,resolveTransition=config.resolveTransition;
  if(!orchestrator||typeof orchestrator.process!=='function')throw new Error('VIP_CHAT_MEMBER_ORCHESTRATOR_REQUIRED');
  if(typeof resolveTransition!=='function')throw new Error('VIP_CHAT_MEMBER_RESOLVER_REQUIRED');
  if(typeof config.hashEvent!=='function')throw new Error('VIP_CHAT_MEMBER_HASH_REQUIRED');
  function process(update) {
    if(!update||typeof update!=='object'||!update.chat_member)return 'IGNORED';
    var event=update.chat_member,chat=event.chat||{},user=event.new_chat_member&&event.new_chat_member.user;
    var chatId=String(chat.id==null?'':chat.id),userId=String(user&&user.id!=null?user.id:'');
    if(!chatId||!userId||!/^\d{1,20}$/.test(userId))throw new Error('VIP_CHAT_MEMBER_ID_INVALID');
    if(config.vipChatId&&chatId!==String(config.vipChatId))return 'IGNORED';
    var updateId=update.update_id;
    if(updateId==null)throw new Error('VIP_CHAT_MEMBER_UPDATE_ID_REQUIRED');
    var sourceDate=Number(event.date);
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new Error('VIP_CHAT_MEMBER_SOURCE_DATE_REQUIRED');
    var status=String(event.new_chat_member.status||'');
    var isMember=event.new_chat_member.is_member===true;
    function membership_(member){if(!member)return null;var s=String(member.status||'');if(s==='member'||s==='administrator'||s==='creator')return true;if(s==='left'||s==='kicked')return false;if(s==='restricted')return member.is_member===true?true:(member.is_member===false?false:null);return null;}
    var active=membership_(event.new_chat_member)===true;
    var left=membership_(event.new_chat_member)===false;
    var oldMember=membership_(event.old_chat_member);
    if(!active&&!left)return 'IGNORED';
    if(oldMember!==null&&oldMember===active)return 'IGNORED';
    var snapshot=null;
    var input={
      updateId:updateId,epoch:Math.floor(sourceDate/604800),sourceDate:sourceDate,
      memberId:'',memberName:'',telegramUserId:userId,targetState:'',
      sourceType:'CHAT_MEMBER',payloadSha256:String(config.hashEvent(event)),
      telegramStatus:status,isMember:isMember,wasMember:oldMember,groupChatId:chatId
    };
    var result=orchestrator.process(input,function(tx,raw){
      tx.assertActive();
      snapshot=resolveTransition(tx,raw);
      if(!snapshot||snapshot.ignored===true)return snapshot;
      var resolved=Object.assign({},snapshot);
      if(!resolved.targetState)resolved.targetState=active?'ACTIVE':'LEFT';
      if(!resolved.telegramUserId)resolved.telegramUserId=userId;
      return resolved;
    });
    var followupEligible=['ACTIVE','LEFT','DENIED'].indexOf(result)>=0;
    if(result==='DUPLICATE'&&snapshot&&snapshot.ignored!==true&&typeof orchestrator.isCurrent==='function')followupEligible=orchestrator.isCurrent(input,snapshot);
    if(snapshot&&snapshot.ignored!==true&&typeof config.afterTransition==='function'&&followupEligible){
      var followup=config.afterTransition({result:result,targetState:String(snapshot.targetState||''),input:input,resolved:snapshot});
      if(followup&&typeof followup.then==='function')throw new Error('VIP_CHAT_MEMBER_FOLLOWUP_MUST_BE_SYNCHRONOUS');
    }
    return result;
  }
  return Object.freeze({process:process});
}


/** Embedded VIP calculator source; kept in this file so the deployment needs only Code.gs and Index.html. */
const MPS_VIP_CALCULATOR_HTML = "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<meta name=\"theme-color\" content=\"#05060f\">\n<meta name=\"description\" content=\"MPS Trading Calculator untuk perencanaan lot, risiko, risk-to-reward, biaya, margin, dan risiko akun.\">\n<title>MPS Trading Calculator · Market Psychology Society</title>\n<style>\n:root{--bg:#05060f;--bg2:#0b0d22;--cd:#0e1130;--ln:rgba(0,217,255,.22);--fg:#eef2ff;--mut:#8d96c7;--bl:#00d9ff;--pk:#ff2fb9;--on:#04050d;--gl:.55;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n@media(prefers-color-scheme:light){:root:not([data-theme=\"dark\"]){--bg:#f3f5ff;--bg2:#e8ecff;--cd:#fff;--ln:rgba(0,120,160,.28);--fg:#0b1030;--mut:#566096;--bl:#007fa3;--pk:#cf0b91;--on:#fff;--gl:.18}}\n:root[data-theme=\"dark\"]{--bg:#05060f;--bg2:#0b0d22;--cd:#0e1130;--ln:rgba(0,217,255,.22);--fg:#eef2ff;--mut:#8d96c7;--bl:#00d9ff;--pk:#ff2fb9;--on:#04050d;--gl:.55}\n*{box-sizing:border-box}html{scroll-padding-top:env(safe-area-inset-top,0px)}\nbody{margin:0;background:radial-gradient(90% 40% at 15% -5%,rgba(255,47,185,calc(var(--gl)*.5)),transparent 60%),radial-gradient(90% 40% at 90% 0,rgba(0,217,255,calc(var(--gl)*.45)),transparent 60%),var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;padding:18px 12px 40px;max-width:720px;margin:0 auto}\nheader{text-align:center;margin:6px 0 18px}.logo{font:900 56px/1 ui-monospace,\"SF Mono\",Menlo,Consolas,monospace;letter-spacing:.06em;color:var(--bl);text-shadow:0 0 14px var(--bl),0 0 38px rgba(0,217,255,calc(var(--gl)*.9)),4px 3px 0 rgba(255,47,185,.75)}\n.org{margin-top:6px;font:700 13px ui-monospace,Menlo,monospace;letter-spacing:.32em;color:var(--pk);text-shadow:0 0 12px rgba(255,47,185,calc(var(--gl)*1.2))}.tag{margin-top:4px;color:var(--mut);font-size:13px}\n.card{background:var(--cd);border:1px solid var(--ln);border-radius:16px;padding:14px;margin:12px 0;box-shadow:0 0 22px rgba(0,217,255,calc(var(--gl)*.12))}\nh2{margin:0 0 8px;font:800 15px ui-monospace,Menlo,monospace;color:var(--bl);letter-spacing:.02em}\nlabel{display:block;color:var(--mut);font-size:12.5px;margin:10px 0 4px}\ninput,select{width:100%;min-width:0;background:var(--bg2);border:1px solid var(--ln);color:var(--fg);border-radius:10px;padding:11px 12px;font:600 16px ui-monospace,Menlo,monospace}\ninput:focus,select:focus,button:focus-visible{outline:none;border-color:var(--bl);box-shadow:0 0 0 2px rgba(0,217,255,.45),0 0 14px rgba(0,217,255,.5)}\ninput[type=checkbox]{width:20px;height:20px;padding:0;accent-color:var(--pk);flex:0 0 auto}\n.g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}\n.dir{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:2px}.dir button{padding:12px;border-radius:12px;border:1px solid var(--ln);background:transparent;color:var(--mut);font:800 15px ui-monospace,monospace;cursor:pointer}\n.dir button.on.buy{color:var(--on);background:var(--bl);border-color:var(--bl);box-shadow:0 0 18px rgba(0,217,255,.45)}.dir button.on.sell{color:var(--on);background:var(--pk);border-color:var(--pk);box-shadow:0 0 18px rgba(255,47,185,.45)}\n.kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}.kpi div{background:var(--cd);border:1px solid var(--ln);border-radius:14px;padding:12px 6px;text-align:center;min-width:0}.kpi small{display:block;color:var(--mut);font-size:12px}.kpi b{font:800 19px ui-monospace,monospace;color:var(--bl);overflow-wrap:anywhere}.kpi div:nth-child(2) b{color:var(--pk)}\n.tabs{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;scrollbar-width:none}.tabs::-webkit-scrollbar{display:none}.tabs button{flex:none;padding:10px 16px;border-radius:99px;border:1px solid var(--ln);background:transparent;color:var(--mut);font:700 14px system-ui,sans-serif;cursor:pointer}.tabs button.on{color:var(--pk);border-color:var(--pk);box-shadow:0 0 14px rgba(255,47,185,.35)}\n.r{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--ln);font-size:14px}.r:last-child{border:0}.r span:first-child{color:var(--mut)}.r span:last-child{font:700 14px ui-monospace,Menlo,monospace;text-align:right;overflow-wrap:anywhere}\n.bl{color:var(--bl)}.pk{color:var(--pk)}.mut{color:var(--mut)}.note{color:var(--mut);font-size:12.5px;line-height:1.6;margin-top:8px}.note b{color:var(--fg)}\n.msg{border:1px solid var(--pk);border-radius:12px;padding:10px 12px;color:var(--pk);font-size:14px;margin:8px 0}.warn{border:1px solid rgba(255,180,60,.7);border-radius:12px;padding:10px 12px;color:#d99a35;font-size:13px;margin:8px 0}\n.btn{padding:11px 14px;border-radius:12px;border:1px solid var(--bl);background:transparent;color:var(--bl);font:800 14px ui-monospace,monospace;cursor:pointer}.btn.f{background:var(--bl);color:var(--on);box-shadow:0 0 18px rgba(0,217,255,.4)}.btn.p{border-color:var(--pk);color:var(--pk)}\n.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}table{width:100%;border-collapse:collapse;font:600 13px ui-monospace,Menlo,monospace;margin-top:6px;table-layout:auto}td,th{padding:7px 4px;border-bottom:1px solid var(--ln);text-align:right}th{color:var(--mut);font-weight:600}td:first-child,th:first-child{text-align:left}\n.chk{display:flex;gap:10px;align-items:flex-start;padding:5px 0;font-size:14px}.chk i{font-style:normal;font-weight:800;width:18px;flex:0 0 18px}.ok{color:var(--bl)}.no{color:var(--pk)}\ndetails summary{cursor:pointer;font:700 13.5px ui-monospace,monospace;color:var(--bl)}.tip{cursor:pointer;color:var(--mut);font-size:13.5px;text-align:center;padding:14px 8px;border:1px dashed var(--ln);border-radius:14px}\n.checkline{display:flex;gap:10px;align-items:center;color:var(--fg);font-size:13px;margin:10px 0}.checkline label{margin:0;color:var(--fg);font-size:13px}\n@media(max-width:420px){body{padding-left:10px;padding-right:10px}.g3{gap:7px}.g3 input{padding:10px 8px;font-size:14px}.kpi{gap:6px}.kpi b{font-size:16px}.card{padding:12px}.org{letter-spacing:.2em}}\n</style>\n</head>\n<body>\n<header><div class=\"logo\">MPS</div><div class=\"org\">Market Psychology Society</div><div class=\"tag\">Trading Calculator · lot, risk to reward, biaya, margin, risiko akun</div></header>\n\n<section class=\"card\">\n<h2>Trade yang direncanakan</h2>\n<label for=\"inst\">Instrumen</label>\n<select id=\"inst\" data-k=\"inst\"><option value=\"XAUUSD\">XAUUSD</option><option value=\"EURUSD\">EURUSD</option><option value=\"GBPUSD\">GBPUSD</option><option value=\"USDJPY\">USDJPY</option><option value=\"CUSTOM\">Kustom</option></select>\n<label>Arah</label><div class=\"dir\"><button type=\"button\" class=\"buy\" data-d=\"BUY\" aria-pressed=\"true\">BUY</button><button type=\"button\" class=\"sell\" data-d=\"SELL\" aria-pressed=\"false\">SELL</button></div>\n<div class=\"g2\"><div><label for=\"bal\">Saldo akun (USD)</label><input id=\"bal\" data-k=\"bal\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"riskp\">Risiko per trade (%)</label><input id=\"riskp\" data-k=\"riskp\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"g3\"><div><label for=\"entry\">Entry</label><input id=\"entry\" data-k=\"entry\" inputmode=\"decimal\" placeholder=\"harga\" autocomplete=\"off\"></div><div><label for=\"sl\">Stop loss</label><input id=\"sl\" data-k=\"sl\" inputmode=\"decimal\" placeholder=\"harga\" autocomplete=\"off\"></div><div><label for=\"tp\">Take profit</label><input id=\"tp\" data-k=\"tp\" inputmode=\"decimal\" placeholder=\"harga\" autocomplete=\"off\"></div></div>\n<details style=\"margin-top:12px\"><summary>Pengaturan lanjutan</summary>\n<div class=\"g2\"><div><label for=\"riskd\">Atau risiko tetap (USD)</label><input id=\"riskd\" data-k=\"riskd\" inputmode=\"decimal\" placeholder=\"kosong = pakai %\" autocomplete=\"off\"></div><div><label for=\"lotm\">Lot manual</label><input id=\"lotm\" data-k=\"lotm\" inputmode=\"decimal\" placeholder=\"kosong = otomatis\" autocomplete=\"off\"></div></div>\n<div class=\"g3\"><div><label for=\"tp2\">TP kedua</label><input id=\"tp2\" data-k=\"tp2\" inputmode=\"decimal\" placeholder=\"opsional\" autocomplete=\"off\"></div><div><label for=\"sh\">Porsi TP1 (%)</label><input id=\"sh\" data-k=\"sh\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"wr\">Win rate (%)</label><input id=\"wr\" data-k=\"wr\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"g3\"><div><label for=\"spr\">Spread (pip)</label><input id=\"spr\" data-k=\"spr\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"com\">Komisi round-turn ($/lot)</label><input id=\"com\" data-k=\"com\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"swp\">Swap ($/lot/malam)</label><input id=\"swp\" data-k=\"swp\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"g3\"><div><label for=\"ngt\">Lama tahan (malam)</label><input id=\"ngt\" data-k=\"ngt\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"lev\">Leverage 1:</label><input id=\"lev\" data-k=\"lev\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"so\">Stop-out (%)</label><input id=\"so\" data-k=\"so\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"g3\"><div><label for=\"cs\">Ukuran kontrak</label><input id=\"cs\" data-k=\"cs\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"pip\">Ukuran 1 pip</label><input id=\"pip\" data-k=\"pip\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"cap\">Margin maks (% saldo)</label><input id=\"cap\" data-k=\"cap\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"g2\"><div><label for=\"minLot\">Lot minimum broker</label><input id=\"minLot\" data-k=\"minLot\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"lotStep\">Langkah lot broker</label><input id=\"lotStep\" data-k=\"lotStep\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n<div class=\"checkline\"><input type=\"checkbox\" id=\"incl\" data-k=\"incl\"><label for=\"incl\">Masukkan spread dan komisi ke anggaran sizing lot</label></div>\n<div class=\"checkline\"><input type=\"checkbox\" id=\"q\" data-k=\"q\"><label for=\"q\">Mata uang kuotasi = USD (nonaktifkan untuk USDJPY)</label></div>\n<div class=\"checkline\"><input type=\"checkbox\" id=\"b\" data-k=\"b\"><label for=\"b\">Mata uang dasar = USD (untuk hitung margin)</label></div>\n<div class=\"note\">Isi ukuran kontrak, spread, komisi, swap, leverage, minimum lot, dan langkah lot sesuai spesifikasi broker serta jenis akun. Komisi di atas dimasukkan sebagai total pulang-pergi (round-turn) per lot. Jika broker menampilkan komisi per sisi, jumlahkan biaya buka dan tutup.</div>\n<div class=\"g3\"><div><label for=\"dRisk\">Disiplin: risiko maks (%)</label><input id=\"dRisk\" data-k=\"dRisk\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"dRR\">Disiplin: RR min</label><input id=\"dRR\" data-k=\"dRR\" inputmode=\"decimal\" autocomplete=\"off\"></div><div><label for=\"dCost\">Disiplin: biaya maks (% SL)</label><input id=\"dCost\" data-k=\"dCost\" inputmode=\"decimal\" autocomplete=\"off\"></div></div>\n</details>\n</section>\n\n<div class=\"kpi\" id=\"kpi\" aria-live=\"polite\"></div>\n<section class=\"card\" id=\"disc\" aria-live=\"polite\"></section>\n<nav class=\"tabs\" id=\"tabs\" aria-label=\"Bagian kalkulator\"></nav>\n<section class=\"card\" id=\"res\" aria-live=\"polite\"></section>\n<div class=\"row\"><button type=\"button\" class=\"btn f\" id=\"copy\">Salin ringkasan</button><button type=\"button\" class=\"btn p\" id=\"reset\">Atur ulang</button></div>\n<div class=\"note\" id=\"cmsg\" role=\"status\" aria-live=\"polite\"></div>\n<div class=\"tip\" id=\"tip\" role=\"button\" tabindex=\"0\" aria-label=\"Tampilkan tips berikutnya\"></div>\n<div class=\"note\" style=\"text-align:center;margin-top:16px\">Alat hitung edukasi, bukan saran keuangan atau ajakan trading. Hasil bergantung pada data dan spesifikasi broker yang kamu masukkan. Perhitungan mengasumsikan akun dalam USD dan model kontrak linear. Forex/CFD berisiko tinggi; kerugian dapat melebihi estimasi karena slippage, gap, perubahan spread, konversi mata uang, dan aturan broker.</div>\n<div class=\"note\" style=\"text-align:center\">Data input disimpan lokal di browser perangkat ini. Hindari menyimpan data akun pada perangkat bersama dan gunakan tombol Atur ulang setelah selesai.</div>\n\n<script>\n'use strict';\nconst INST={\n XAUUSD:{cs:100,pip:.1,q:1,b:0,dec:2,spr:2.5},\n EURUSD:{cs:100000,pip:.0001,q:1,b:0,dec:5,spr:1.2},\n GBPUSD:{cs:100000,pip:.0001,q:1,b:0,dec:5,spr:1.5},\n USDJPY:{cs:100000,pip:.01,q:0,b:1,dec:3,spr:1.2},\n CUSTOM:{cs:100,pip:.1,q:1,b:0,dec:2,spr:2}\n};\nconst DEF={\n inst:'XAUUSD',cs:100,pip:.1,q:1,b:0,bal:1000,riskp:1,riskd:'',lotm:'',\n dir:'BUY',entry:'',sl:'',tp:'',tp2:'',sh:100,wr:50,spr:2.5,com:0,swp:0,ngt:0,\n lev:500,so:20,cap:20,minLot:.01,lotStep:.01,incl:1,dRisk:2,dRR:1.5,dCost:15,\n tab:'lot',nt:200,rd:30,sn:5\n};\nconst KEY='mps_calc_v2';\nconst TABS=[['lot','Lot'],['rr','Risk to reward'],['biaya','Biaya'],['margin','Margin'],['risiko','Risiko akun']];\nconst TIPS=[\n 'Rencanakan tradenya, lalu tradingkan rencananya.',\n 'SL ditentukan sebelum entry, bukan sesudah harga bergerak melawan.',\n 'Satu trade buruk tidak merusak akun. Menaikkan lot untuk membalas yang merusaknya.',\n 'Tidak masuk pasar juga sebuah keputusan trading.',\n 'Win rate bagus tidak berarti untung. Lihat hasil rata-rata setelah biaya.',\n 'Kalau lot terasa terlalu besar buat tidurmu, lot itu memang terlalu besar.',\n 'Catat alasan sebelum masuk, bukan sesudah hasilnya keluar.',\n 'Spread dan komisi dibayar di setiap trade, menang atau kalah.'\n];\nconst $=id=>document.getElementById(id);\nconst NUM_KEYS=['cs','pip','bal','riskp','riskd','lotm','entry','sl','tp','tp2','sh','wr','spr','com','swp','ngt','lev','so','cap','minLot','lotStep','dRisk','dRR','dCost','nt','rd','sn'];\nconst N=v=>{if(v===null||v===undefined||String(v).trim()==='')return NaN;const x=Number(String(v).trim().replace(',','.'));return Number.isFinite(x)?x:NaN};\nconst clamp=(x,a,b)=>Math.min(b,Math.max(a,x));\nconst usd=v=>(v<0?'-$':'$')+Math.abs(v).toFixed(2);\nconst pc=(v,d=1)=>Number.isFinite(v)?v.toFixed(d)+'%':'—';\nconst esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));\nlet G={...DEF},SIMR=null,SEED=7,tipIndex=0;\nconst EMBEDDED=window.parent!==window;\nlet bridgeReadResolve=null;\nconst BRIDGE_NONCE='__MPS_CALC_BRIDGE_NONCE__';\nwindow.addEventListener('message',e=>{\n if(e.source!==window.parent||!e.data||e.data.nonce!==BRIDGE_NONCE||e.data.type!=='mps-calc-storage-value'||!bridgeReadResolve)return;\n const resolve=bridgeReadResolve;bridgeReadResolve=null;resolve(e.data.value||null);\n});\nfunction loadSavedState(){\n if(!EMBEDDED){try{return Promise.resolve(JSON.parse(localStorage.getItem(KEY)||'null'))}catch(_){return Promise.resolve(null)}}\n return new Promise(resolve=>{let settled=false;const finish=value=>{if(settled)return;settled=true;bridgeReadResolve=null;resolve(value)};bridgeReadResolve=finish;window.setTimeout(()=>finish(null),1200);try{window.parent.postMessage({type:'mps-calc-storage-get',nonce:BRIDGE_NONCE},'*')}catch(_){finish(null)}});\n}\nfunction applySavedState(saved){\n if(saved&&typeof saved==='object'&&!Array.isArray(saved))for(const k of Object.keys(DEF))if(Object.prototype.hasOwnProperty.call(saved,k))G[k]=saved[k];\n if(!INST[G.inst])G.inst=DEF.inst;\n if(!['BUY','SELL'].includes(G.dir))G.dir=DEF.dir;\n if(!TABS.some(t=>t[0]===G.tab))G.tab=DEF.tab;\n}\nfunction save(){\n const value=JSON.stringify(G);\n if(!EMBEDDED){try{localStorage.setItem(KEY,value)}catch(_){}return}\n try{window.parent.postMessage({type:'mps-calc-storage-set',value:value,nonce:BRIDGE_NONCE},'*')}catch(_){}\n}\nfunction num(g,k,fallback){const x=N(g[k]);return Number.isFinite(x)?x:fallback}\nfunction fmt(v,d){return Number.isFinite(v)?v.toFixed(d):'—'}\nfunction roundDownStep(value,step){if(!(value>0&&step>0))return 0;return Math.floor((value+step*1e-9)/step)*step}\nfunction validate(){\n const errors=[];\n const requiredPositive=['bal','cs','pip','lev','minLot','lotStep'];\n for(const k of requiredPositive){const v=N(G[k]);if(!(v>0))errors.push(`${({bal:'Saldo harus lebih dari 0.',cs:'Ukuran kontrak harus lebih dari 0.',pip:'Ukuran pip harus lebih dari 0.',lev:'Leverage harus lebih dari 0.',minLot:'Lot minimum broker harus lebih dari 0.',lotStep:'Langkah lot broker harus lebih dari 0.'})[k]}`)}\n const nonnegative=['spr','com','ngt','cap','so'];\n for(const k of nonnegative){const v=N(G[k]);if(!Number.isFinite(v)||v<0)errors.push(`${({spr:'Spread tidak boleh negatif.',com:'Komisi tidak boleh negatif.',ngt:'Lama tahan tidak boleh negatif.',cap:'Batas margin tidak boleh negatif.',so:'Stop-out tidak boleh negatif.'})[k]}`)}\n if(String(G.swp).trim()!==''&&!Number.isFinite(N(G.swp)))errors.push('Swap harus berupa angka; gunakan 0 jika tidak ada.');\n if(N(G.so)>100)errors.push('Stop-out tidak boleh lebih dari 100%.');\n if(N(G.cap)>100)errors.push('Batas margin tidak boleh lebih dari 100%.');\n const fixedRisk=N(G.riskd)>0;\n if(String(G.riskp).trim()!==''&&(!Number.isFinite(N(G.riskp))||N(G.riskp)<0))errors.push('Risiko persentase harus berupa angka 0 atau lebih.');\n if(!fixedRisk&&!(N(G.riskp)>0))errors.push('Isi risiko persentase atau risiko tetap yang lebih dari 0.');\n if(String(G.riskd).trim()!==''&&!Number.isFinite(N(G.riskd)))errors.push('Risiko tetap harus berupa angka.');\n if(Number.isFinite(N(G.riskd))&&N(G.riskd)<0)errors.push('Risiko tetap tidak boleh negatif.');\n if(String(G.lotm).trim()!==''&&!Number.isFinite(N(G.lotm)))errors.push('Lot manual harus berupa angka.');\n if(Number.isFinite(N(G.lotm))&&N(G.lotm)<0)errors.push('Lot manual tidak boleh negatif.');\n if(String(G.tp2).trim()!==''&&!Number.isFinite(N(G.tp2)))errors.push('TP kedua harus berupa angka.');\n if(!Number.isFinite(N(G.sh))||N(G.sh)<0||N(G.sh)>100)errors.push('Porsi TP1 harus berupa angka 0–100%.');\n if(!Number.isFinite(N(G.wr))||N(G.wr)<0||N(G.wr)>100)errors.push('Win rate harus berupa angka 0–100%.');\n if(!Number.isFinite(N(G.dRisk))||N(G.dRisk)<=0||!Number.isFinite(N(G.dRR))||N(G.dRR)<=0||!Number.isFinite(N(G.dCost))||N(G.dCost)<0)errors.push('Batas disiplin harus valid dan tidak negatif.');\n if(!Number.isFinite(N(G.nt))||N(G.nt)<10||N(G.nt)>1000)errors.push('Jumlah trade simulasi harus 10–1.000.');\n if(!Number.isFinite(N(G.sn))||N(G.sn)<1||N(G.sn)>50)errors.push('Panjang rentetan rugi harus 1–50.');\n if(!Number.isFinite(N(G.rd))||N(G.rd)<=0||N(G.rd)>=100)errors.push('Batas drawdown harus di atas 0% dan di bawah 100%.');\n return errors;\n}\nfunction calc(){\n const g=G,e=N(g.entry),sl=N(g.sl),tp=N(g.tp),tp2=N(g.tp2),bal=N(g.bal),cs=N(g.cs),pip=N(g.pip),lev=N(g.lev);\n const R={ok:false,errors:validate(),dec:(INST[g.inst]&&INST[g.inst].dec)||(pip>0&&pip<.001?5:2)};\n if(R.errors.length)return R;\n if(!(e>0&&sl>0))return R;\n const dist=Math.abs(e-sl),uv=cs*(+g.q?1:1/e),spp=N(g.spr)*pip,com=N(g.com),swp=String(g.swp).trim()===''?0:N(g.swp),ng=N(g.ngt);\n Object.assign(R,{e,sl,dist,uv,bal,spp,pip});\n R.dirOK=g.dir==='BUY'?sl<e:sl>e;\n if(!R.dirOK||dist===0)return R;\n const riskUSD=N(g.riskd)>0?N(g.riskd):bal*N(g.riskp)/100;\n const perLot=dist*uv+(+g.incl?spp*uv+com:0);\n if(!(riskUSD>0&&perLot>0&&Number.isFinite(perLot)))return R;\n const lotExact=riskUSD/perLot,lotMin=N(g.minLot),lotStep=N(g.lotStep);\n const lotAuto=roundDownStep(lotExact,lotStep);\n const manual=N(g.lotm)>0,lot=manual?N(g.lotm):Math.max(lotAuto,lotMin);\n const lossSL=lot*dist*uv,costSpread=lot*spp*uv,costCom=lot*com,costSwap=lot*swp*ng;\n const costOpen=costSpread+costCom,costAll=costOpen+costSwap,lossAll=lossSL+costAll;\n const budgetOver=lossAll>riskUSD+Math.max(.01,riskUSD*1e-6);\n const lotBelowMin=!manual&&lotAuto<lotMin;\n const stepMismatch=manual&&Math.abs(lot/lotStep-Math.round(lot/lotStep))>1e-7;\n Object.assign(R,{ok:true,riskUSD,lotExact,lotAuto,lotMin,lotStep,lot,manual,lotBelowMin,stepMismatch,budgetOver,lossSL,costSpread,costCom,costOpen,costSwap,costAll,lossAll,riskPct:lossAll/bal*100,baseRiskPct:lossSL/bal*100,costPct:costAll/lossSL*100,valPip:pip*uv,distPips:dist/pip});\n R.tpOK=tp>0&&(g.dir==='BUY'?tp>e:tp<e);\n if(R.tpOK){\n  const d1=Math.abs(tp-e),t2=tp2>0&&(g.dir==='BUY'?tp2>e:tp2<e);\n  const share=clamp(N(g.sh)/100,0,1);\n  const dWeighted=t2?share*d1+(1-share)*Math.abs(tp2-e):d1;\n  R.RR=dWeighted/dist;R.profitGross=lot*dWeighted*uv;R.profitNet=R.profitGross-costAll;\n  R.costR=costAll/lossSL;R.be=(1+R.costR)/(1+R.RR)*100;\n  const w=N(g.wr)/100;R.EVR=w*(R.RR+1)-1-R.costR;R.EV=R.EVR*lossSL;\n  R.tpCostPct=R.profitGross>0?costAll/R.profitGross*100:NaN;R.t2=t2;R.tp1Share=share;\n }\n const marginPerLot=(+g.b?cs:cs*e)/lev,margin=lot*marginPerLot;\n const stopOut=N(g.so),equityAtStopOut=stopOut/100*margin,lossCapacity=bal-equityAtStopOut;\n const distStop=lossCapacity/(lot*uv);\n Object.assign(R,{marginPerLot,margin,free:bal-margin,ml0:margin>0?bal/margin*100:Infinity,mlSL:margin>0?(bal-lossAll)/margin*100:Infinity,distStop,stopRatio:dist>0?distStop/dist:NaN,marginPct:margin/bal*100,maxLot:roundDownStep((bal*N(g.cap)/100)/marginPerLot,lotStep),beP:g.dir==='BUY'?e+costAll/(lot*uv):e-costAll/(lot*uv)});\n return R;\n}\nfunction streakProb(lossProb,trades,streak){\n let states=Array(streak).fill(0);states[0]=1;let hit=0;\n for(let t=0;t<trades;t++){\n  const next=Array(streak).fill(0);\n  for(let k=0;k<streak;k++){const p=states[k];if(!p)continue;next[0]+=p*(1-lossProb);if(k+1>=streak)hit+=p*lossProb;else next[k+1]+=p*lossProb}\n  states=next;\n }\n return clamp(hit,0,1);\n}\nfunction simulate(wr,rr,costR,baseRisk,trades,ddLimit,runs,seed){\n let s=seed|0;const rnd=()=>{s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};\n let ddHit=0,prof=0,mdSum=0;const finals=[];\n for(let i=0;i<runs;i++){\n  let equity=1,peak=1,maxDD=0,hit=false;\n  for(let j=0;j<trades;j++){\n   const netR=rnd()<wr?rr-costR:-(1+costR);\n   equity*=Math.max(.0001,1+baseRisk*netR);\n   if(equity>peak)peak=equity;\n   const dd=1-equity/peak;if(dd>maxDD)maxDD=dd;\n   if(!hit&&dd>=ddLimit/100)hit=true;\n  }\n  if(hit)ddHit++;if(equity>1)prof++;mdSum+=maxDD;finals.push(equity);\n }\n finals.sort((a,b)=>a-b);\n const quantile=p=>finals[Math.min(runs-1,Math.floor(p*(runs-1)))];\n return{ddHit:ddHit/runs,prof:prof/runs,md:mdSum/runs,p5:quantile(.05),p50:quantile(.5),p95:quantile(.95)};\n}\nfunction msg(R){\n if(R.errors&&R.errors.length)return`<div class=\"msg\"><b>Periksa input:</b><ul>${R.errors.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;\n if(!R.e||!R.sl)return'<div class=\"note\">Isi saldo, entry, dan stop loss untuk mulai menghitung.</div>';\n if(!R.dirOK)return`<div class=\"msg\">Untuk ${esc(G.dir)}, stop loss harus ${G.dir==='BUY'?'di bawah':'di atas'} entry.</div>`;\n return'<div class=\"note\">Perhitungan belum tersedia. Periksa kembali nilai input.</div>';\n}\nfunction tLot(R){\n if(!R.ok)return msg(R);\n return`${R.lotBelowMin?'<div class=\"msg\">Lot hasil sizing berada di bawah minimum broker. Kalkulator menampilkan lot minimum, tetapi risikonya dapat melebihi anggaran.</div>':''}\n ${R.budgetOver?'<div class=\"warn\">Risiko aktual termasuk biaya melebihi anggaran risiko yang ditetapkan. Kurangi lot atau sesuaikan parameter.</div>':''}\n ${R.stepMismatch?'<div class=\"warn\">Lot manual tidak sesuai kelipatan langkah lot broker.</div>':''}\n <div class=\"r\"><span>Anggaran risiko</span><span class=\"pk\">${usd(R.riskUSD)}</span></div>\n <div class=\"r\"><span>Jarak SL</span><span>${fmt(R.dist,R.dec)} (${fmt(R.distPips,1)} pip)</span></div>\n <div class=\"r\"><span>Lot ideal sebelum pembulatan</span><span>${fmt(R.lotExact,4)}</span></div>\n <div class=\"r\"><span>Lot otomatis sesuai langkah</span><span>${fmt(R.lotAuto,3)}</span></div>\n <div class=\"r\"><span>Lot yang dihitung${R.manual?' (manual)':''}</span><span class=\"bl\">${fmt(R.lot,3)}</span></div>\n <div class=\"r\"><span>Rugi harga di SL</span><span>${usd(-R.lossSL)}</span></div>\n <div class=\"r\"><span>Biaya total termasuk swap</span><span>${usd(-R.costAll)}</span></div>\n <div class=\"r\"><span>Total estimasi rugi di SL</span><span class=\"pk\">${usd(-R.lossAll)} (${pc(R.riskPct,2)} saldo)</span></div>\n <div class=\"r\"><span>Nilai 1 pip per 1 lot</span><span>${usd(R.valPip)}</span></div>\n <div class=\"note\">Sizing otomatis membulatkan lot ke bawah sesuai langkah broker. Jika lot minimum lebih besar dari hasil sizing, angka minimum ditampilkan dengan peringatan risiko.</div>`;\n}\nfunction rrButtons(){return[1,2,3].map(x=>`<button type=\"button\" class=\"btn\" data-qrr=\"${x}\">TP 1:${x}</button>`).join('')}\nfunction tRR(R){\n if(!R.ok)return msg(R);\n if(!R.tpOK)return`<div class=\"note\">Isi take profit atau pilih rasio target di bawah untuk menghitung risk-to-reward.</div><div class=\"row\">${rrButtons()}</div>`;\n return`<div class=\"r\"><span>Risk-to-reward kotor${R.t2?' (gabungan TP1 + TP2)':''}</span><span class=\"bl\">1 : ${fmt(R.RR,2)}</span></div>\n <div class=\"r\"><span>Untung kotor di target</span><span>${usd(R.profitGross)}</span></div>\n <div class=\"r\"><span>Untung bersih estimasi setelah biaya</span><span class=\"bl\">${usd(R.profitNet)}</span></div>\n <div class=\"r\"><span>Rugi estimasi jika SL kena</span><span class=\"pk\">${usd(-R.lossAll)}</span></div>\n <div class=\"r\"><span>Win rate impas setelah biaya</span><span>${pc(R.be,2)}</span></div>\n <div class=\"r\"><span>Ekspektasi per trade pada win rate ${fmt(N(G.wr),1)}%</span><span class=\"${R.EVR>=0?'bl':'pk'}\">${R.EVR>=0?'+':''}${fmt(R.EVR,2)}R (${usd(R.EV)})</span></div>\n <div class=\"note\">1R di sini adalah rugi harga pada SL sebelum biaya (${usd(R.lossSL)}). Ekspektasi memakai biaya sebagai bagian dari hasil menang maupun kalah. Angka win rate harus berasal dari catatan trading yang representatif.</div>\n <div class=\"row\">${rrButtons()}</div>`;\n}\nfunction tBiaya(R){\n if(!R.ok)return msg(R);\n const cl=R.costPct<=10?'bl':R.costPct<=20?'':'pk';\n return`<div class=\"r\"><span>Spread (${fmt(N(G.spr),2)} pip)</span><span>${usd(R.costSpread)}</span></div>\n <div class=\"r\"><span>Komisi round-turn</span><span>${usd(R.costCom)}</span></div>\n <div class=\"r\"><span>Swap (${fmt(N(G.ngt),1)} malam)</span><span>${usd(R.costSwap)}</span></div>\n <div class=\"r\"><span>Total biaya estimasi</span><span class=\"pk\">${usd(R.costAll)}</span></div>\n <div class=\"r\"><span>Biaya sebagai % dari rugi harga SL</span><span class=\"${cl}\">${pc(R.costPct,2)}</span></div>\n ${R.tpOK?`<div class=\"r\"><span>Biaya sebagai % dari target kotor</span><span>${pc(R.tpCostPct,2)}</span></div>`:''}\n <div class=\"r\"><span>Harga impas estimasi setelah biaya</span><span>${fmt(R.beP,R.dec)}</span></div>\n <div class=\"note\">Spread/komisi/swap adalah estimasi berdasarkan input. Swap aktual dapat berbeda menurut arah, hari rollover, simbol, dan kebijakan broker. Swap negatif berarti biaya; swap positif berarti kredit.</div>`;\n}\nfunction tMargin(R){\n if(!R.ok)return msg(R);\n const ratio=R.stopRatio;\n return`<div class=\"r\"><span>Margin terpakai</span><span>${usd(R.margin)} (${pc(R.marginPct,2)} saldo)</span></div>\n <div class=\"r\"><span>Margin bebas estimasi</span><span>${usd(R.free)}</span></div>\n <div class=\"r\"><span>Margin level saat entry</span><span>${fmt(R.ml0,1)}%</span></div>\n <div class=\"r\"><span>Margin level jika SL kena</span><span class=\"${R.mlSL<N(G.so)*2?'pk':''}\">${fmt(R.mlSL,1)}%</span></div>\n <div class=\"r\"><span>Jarak harga teoritis ke stop-out</span><span>${fmt(R.distStop,R.dec)} (${fmt(R.distStop/R.pip,1)} pip)</span></div>\n <div class=\"r\"><span>Jarak stop-out dibanding jarak SL</span><span class=\"${ratio>=3?'bl':'pk'}\">${fmt(ratio,2)}×</span></div>\n <div class=\"r\"><span>Lot maksimum pada batas margin ${fmt(N(G.cap),1)}%</span><span>${fmt(R.maxLot,3)}</span></div>\n <div class=\"note\">Estimasi margin memakai leverage dan nilai kontrak yang dimasukkan, dengan asumsi mata uang akun USD. Jarak stop-out mengabaikan posisi lain, perubahan margin, spread yang melebar, komisi, swap, slippage, dan aturan broker. Ini bukan prediksi harga likuidasi.</div>`;\n}\nfunction tRisiko(R){\n const baseRisk=R.ok?R.baseRiskPct/100:(Number.isFinite(N(G.riskp))?N(G.riskp)/100:0);\n const wr=clamp(Number.isFinite(N(G.wr))?N(G.wr)/100:0.5,0,1),n=clamp(Math.round(Number.isFinite(N(G.sn))?N(G.sn):5),1,50),M=clamp(Math.round(Number.isFinite(N(G.nt))?N(G.nt):200),10,1000);\n const recovery=[5,10,20,30,40,50].map(d=>`<tr><td>-${d}%</td><td>+${(d/(100-d)*100).toFixed(1)}%</td></tr>`).join('');\n const streak=[3,5,8,10,15,20].map(k=>`<tr><td>${k} rugi beruntun</td><td>${pc(Math.pow(1-baseRisk,k)*100,2)}</td></tr>`).join('');\n const probability=streakProb(1-wr,M,n);\n const sim=SIMR?`<div class=\"r\"><span>Peluang drawdown menyentuh ${fmt(N(G.rd),1)}%</span><span class=\"pk\">${pc(SIMR.ddHit*100,2)}</span></div>\n <div class=\"r\"><span>Peluang modal akhir di atas awal</span><span>${pc(SIMR.prof*100,2)}</span></div>\n <div class=\"r\"><span>Rata-rata drawdown maksimum</span><span>${pc(SIMR.md*100,2)}</span></div>\n <div class=\"r\"><span>Modal akhir (persentil 5 / 50 / 95)</span><span>${fmt(SIMR.p5*100,1)}% / ${fmt(SIMR.p50*100,1)}% / ${fmt(SIMR.p95*100,1)}%</span></div>`:'';\n return`<h2>Pemulihan drawdown</h2><table><tr><th>Penurunan</th><th>Kenaikan untuk pulih</th></tr>${recovery}</table>\n <h2 style=\"margin-top:16px\">Dampak rugi beruntun (risiko harga ${pc(baseRisk*100,2)} per trade)</h2><table><tr><th>Kejadian</th><th>Sisa saldo</th></tr>${streak}</table>\n <h2 style=\"margin-top:16px\">Peluang rentetan rugi</h2><div class=\"g2\"><div><label for=\"sn\">Panjang rentetan</label><input id=\"sn\" data-k=\"sn\" inputmode=\"numeric\" value=\"${esc(G.sn)}\"></div><div><label for=\"nt\">Jumlah trade</label><input id=\"nt\" data-k=\"nt\" inputmode=\"numeric\" value=\"${esc(G.nt)}\"></div></div>\n <div class=\"r\"><span>Peluang minimal sekali ${n} rugi beruntun dalam ${M} trade (win rate ${fmt(wr*100,1)}%)</span><span class=\"pk\">${pc(probability*100,2)}</span></div>\n <h2 style=\"margin-top:16px\">Simulasi Monte Carlo · 5.000 jalur</h2><div class=\"g2\"><div><label for=\"rd\">Ambang drawdown (%)</label><input id=\"rd\" data-k=\"rd\" inputmode=\"decimal\" value=\"${esc(G.rd)}\"></div><div><label>RR yang dipakai</label><input value=\"${R&&R.tpOK?'1 : '+fmt(R.RR,2):'isi TP dulu'}\" readonly></div></div>\n <div class=\"row\"><button type=\"button\" class=\"btn f\" id=\"runsim\">Jalankan simulasi</button></div>${sim}\n <div class=\"note\">Simulasi menggunakan persentase risiko harga terhadap ekuitas berjalan, RR kotor, biaya relatif terhadap risiko harga, dan hasil trade independen. Ini model matematis sederhana, bukan ramalan; tidak memodelkan perubahan win rate, korelasi, slippage, gap, atau perubahan kondisi pasar.</div>`;\n}\nfunction discipline(R){\n if(!R.ok)return'<h2>Cek disiplin</h2><div class=\"note\">Lengkapi input yang diperlukan untuk melihat pemeriksaan disiplin.</div>';\n const riskLimit=N(G.dRisk),rrLimit=N(G.dRR),costLimit=N(G.dCost),cap=N(G.cap);\n const checks=[\n  [R.riskPct<=riskLimit,`Risiko aktual ${pc(R.riskPct,2)} (batas ${fmt(riskLimit,2)}%)`],\n  [R.tpOK&&R.RR>=rrLimit,R.tpOK?`Risk-to-reward 1:${fmt(R.RR,2)} (minimal 1:${fmt(rrLimit,2)})`:'Take profit belum valid'],\n  [R.costPct<=costLimit,`Biaya ${pc(R.costPct,2)} dari rugi harga SL (batas ${fmt(costLimit,2)}%)`],\n  [R.marginPct<=cap,`Margin ${pc(R.marginPct,2)} saldo (batas ${fmt(cap,2)}%)`],\n  [!R.budgetOver,'Risiko aktual tidak melebihi anggaran risiko'],\n  [!R.lotBelowMin&&!R.stepMismatch,'Lot memenuhi minimum dan langkah broker'],\n  [R.stopRatio>=3,`Jarak stop-out teoritis ${fmt(R.stopRatio,2)}× jarak SL (acuan 3×)`]\n ];\n const passed=checks.filter(x=>x[0]).length;\n return`<h2>Cek disiplin · lolos ${passed} dari ${checks.length}</h2>${checks.map(x=>`<div class=\"chk\"><i class=\"${x[0]?'ok':'no'}\">${x[0]?'✓':'✗'}</i><span>${esc(x[1])}</span></div>`).join('')}<div class=\"note\">Lolos seluruh pemeriksaan bukan jaminan profit atau keamanan akun. Ini hanya checklist berdasarkan batas yang kamu masukkan.</div>`;\n}\nfunction render(){\n const R=calc();\n $('kpi').innerHTML=`<div><small>Lot</small><b>${R.ok?fmt(R.lot,3):'–'}</b></div><div><small>Estimasi rugi di SL</small><b>${R.ok?usd(-R.lossAll):'–'}</b></div><div><small>Risk-to-reward</small><b>${R.ok&&R.tpOK?'1:'+fmt(R.RR,1):'–'}</b></div>`;\n $('disc').innerHTML=discipline(R);\n $('tabs').innerHTML=TABS.map(t=>`<button type=\"button\" data-t=\"${t[0]}\" class=\"${G.tab===t[0]?'on':''}\" aria-pressed=\"${G.tab===t[0]}\">${t[1]}</button>`).join('');\n renderRes(R);\n document.querySelectorAll('[data-d]').forEach(b=>{const active=b.dataset.d===G.dir;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active))});\n}\nfunction renderRes(R=calc()){\n const views={lot:tLot,rr:tRR,biaya:tBiaya,margin:tMargin,risiko:tRisiko};\n $('res').innerHTML=views[G.tab](R);\n}\nfunction runSim(){\n const R=calc();\n if(!(R.ok&&R.tpOK)){$('cmsg').textContent='Lengkapi trade dan take profit yang valid sebelum menjalankan simulasi.';return}\n $('cmsg').textContent='Simulasi sedang dihitung…';\n const trades=clamp(Math.round(N(G.nt)),10,1000);\n SIMR=simulate(N(G.wr)/100,R.RR,R.costR,R.lossSL/R.bal,trades,N(G.rd),5000,++SEED);\n $('cmsg').textContent='Simulasi selesai. Hasil bersifat ilustratif.';\n renderRes(R);\n}\nfunction fill(){\n document.querySelectorAll('[data-k]').forEach(el=>{\n  if(el.closest('#res'))return;\n  const v=G[el.dataset.k];\n  if(el.type==='checkbox')el.checked=!!Number(v);\n  else el.value=v??'';\n });\n}\nfunction resetAll(){\n G={...DEF};SIMR=null;save();fill();$('cmsg').textContent='Pengaturan dikembalikan ke nilai awal.';render();\n}\ndocument.addEventListener('input',e=>{\n const el=e.target;if(!el.dataset||!el.dataset.k)return;\n G[el.dataset.k]=el.type==='checkbox'?(el.checked?1:0):el.value;\n if(el.dataset.k==='inst'){\n  const p=INST[el.value]||INST.CUSTOM;\n  Object.assign(G,{cs:p.cs,pip:p.pip,q:p.q,b:p.b,spr:p.spr});\n  fill();\n }\n save();SIMR=null;render();\n});\ndocument.addEventListener('click',e=>{\n const target=e.target.closest('button');\n if(!target)return;\n if(target.dataset.d){G.dir=target.dataset.d;save();SIMR=null;render();return}\n if(target.dataset.t){G.tab=target.dataset.t;save();render();return}\n if(target.dataset.qrr){\n  const R=calc();if(!R.ok)return;\n  const multiple=Number(target.dataset.qrr),targetPrice=G.dir==='BUY'?R.e+multiple*R.dist:R.e-multiple*R.dist;\n  G.tp=targetPrice.toFixed(R.dec);$('tp').value=G.tp;save();SIMR=null;render();return;\n }\n if(target.id==='runsim'){runSim();return}\n});\n$('copy').addEventListener('click',async()=>{\n const R=calc();if(!R.ok){$('cmsg').textContent='Lengkapi input trade sebelum menyalin.';return}\n const summary=`MPS Trading Calculator\\n${G.inst} ${G.dir}\\nEntry ${R.e} · SL ${R.sl}${R.tpOK?' · TP '+G.tp:''}\\nLot ${fmt(R.lot,3)} · Estimasi rugi di SL ${usd(R.lossAll)} (${fmt(R.riskPct,2)}%)${R.tpOK?'\\nRR 1:'+fmt(R.RR,2)+' · Untung bersih estimasi '+usd(R.profitNet):''}\\nBiaya ${usd(R.costAll)} · Margin estimasi ${usd(R.margin)}\\nCatatan: estimasi edukasi; hasil aktual tergantung broker dan eksekusi.`;\n try{if(!navigator.clipboard||!window.isSecureContext)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(summary);$('cmsg').textContent='Ringkasan tersalin.'}\n catch(_){$('cmsg').textContent='Clipboard tidak tersedia. Buka melalui HTTPS dan izinkan akses clipboard.'}\n});\n$('reset').addEventListener('click',resetAll);\nfunction nextTip(){tipIndex=(tipIndex+1)%TIPS.length;$('tip').textContent=TIPS[tipIndex]}\n$('tip').addEventListener('click',nextTip);\n$('tip').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();nextTip()}});\n(async()=>{applySavedState(await loadSavedState());fill();$('tip').textContent=TIPS[0];render()})();\n</script>\n</body>\n</html>";
