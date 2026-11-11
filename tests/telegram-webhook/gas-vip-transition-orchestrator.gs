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
          String(existing['Target State'])!==target||Number(existing['Source Date'])!==sourceDate||String(existing['Member Name'])!==effectiveName||String(existing['Telegram User ID'])!==telegramUserId||existing['Ticker Allowed']!==tickerAllowed){
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
  return Object.freeze({process:process});
}
