/*
 * Candidate Code.gs handler call-site snapshot for characterization tests only.
 * Origin SHA-256: c9e84512fc2ac641f59f63b9b8b7fa10d113f0256f662c25ca70555a09aea8ba
 * Origin path: Library candidate Code.gs (not deployed or integrated by this test).
 * Exact source locations: processTelegramUpdateCore_ line 1352; processVipJoinRequest_ line 1392.
 * Refresh this fixture only after re-auditing the source snapshot and updating provenance.
 * This is not a deployable Code.gs file and does not model live Apps Script services.
 */

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
    if(chatId===String(PropertiesService.getScriptProperties().getProperty('MPS_TELEGRAM_VIP_CHAT_ID')||''))updateVipJoinStatus_(userId,status,newMember.is_member===true);
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
        updateVipJoinStatus_(userId,status,statusData.result.is_member===true);
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
      if(status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&state.result.is_member===true)){updateVipJoinStatus_(userId,status,state.result.is_member===true);if(allowed)return true;return true;}
      if(!allowed&&(status==='left'||status==='kicked')){recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_ALREADY_DECLINED',userId,'SUCCESS','Permintaan join sudah tidak aktif saat webhook dicoba ulang.');return true;}
      if(allowed&&(status==='left'||status==='kicked')&&/USER_ID_INVALID|request.*not found|no.*join request/i.test(String(result.description||''))){recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_REQUEST_ALREADY_CLOSED',memberId,'SUCCESS','Telegram tidak lagi memiliki join request aktif; tidak ada akses grup yang diberikan.');return true;}
    }catch(checkErr){if(!allowed&&/USER_ID_INVALID|user.*not found|chat.*not found/i.test(String(result.description||'')))return true;}
    if(!allowed&&/USER_ID_INVALID|request.*not found|no.*join request/i.test(String(result.description||'')))return true;
    throw new Error(result.description||'Telegram join request gagal diproses.');
  }
  if(allowed){
    updateVipJoinStatus_(userId,'member',true);
    try{const dm=telegramSendToChat_(String(request.user_chat_id||userId),'✅ Permintaan bergabung disetujui. Selamat datang di MPS VIP Community.');if(!dm.ok)recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Permintaan join berhasil disetujui, tetapi pesan sambutan gagal dikirim.');}catch(dmErr){recordMpsAudit_('TELEGRAM',memberId,'VIP_JOIN_DM_FAILED',memberId,'WARNING','Permintaan join berhasil disetujui, tetapi pengiriman pesan sambutan gagal.');}
  }else{
    try{const dm=telegramSendToChat_(String(request.user_chat_id||userId),'Permintaan bergabung belum dapat disetujui. Pastikan Telegram sudah terhubung dan status member MPS sudah Berhasil.');if(!dm.ok)recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_DECLINE_DM_FAILED',userId,'WARNING','Permintaan join ditolak, tetapi pesan penjelasan gagal dikirim.');}catch(dmErr){recordMpsAudit_('TELEGRAM',userId,'VIP_JOIN_DECLINE_DM_FAILED',userId,'WARNING','Permintaan join ditolak, tetapi pengiriman pesan penjelasan gagal.');}
  }
  return true;
}