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
    if(!chatId||!userId||!/^\\d{1,20}$/.test(userId))throw new Error('VIP_CHAT_MEMBER_ID_INVALID');
    if(config.vipChatId&&chatId!==String(config.vipChatId))return 'IGNORED';
    var updateId=update.update_id;
    if(updateId==null)throw new Error('VIP_CHAT_MEMBER_UPDATE_ID_REQUIRED');
    var sourceDate=Number(event.date);
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new Error('VIP_CHAT_MEMBER_SOURCE_DATE_REQUIRED');
    var status=String(event.new_chat_member.status||'');
    var isMember=event.new_chat_member.is_member===true;
    var active=status==='member'||status==='administrator'||status==='creator'||(status==='restricted'&&isMember);
    var left=status==='left'||status==='kicked'||(status==='restricted'&&event.new_chat_member.is_member===false);
    if(!active&&!left)return 'IGNORED';
    var snapshot=null;
    var input={
      updateId:updateId,epoch:Math.floor(sourceDate/604800),sourceDate:sourceDate,
      memberId:'',memberName:'',telegramUserId:userId,targetState:'',
      sourceType:'CHAT_MEMBER',payloadSha256:String(config.hashEvent(event)),
      telegramStatus:status,isMember:isMember,groupChatId:chatId
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
    if(snapshot&&snapshot.ignored!==true&&typeof config.afterTransition==='function'&&
      ['ACTIVE','LEFT','DENIED'].indexOf(result)>=0){
      var followup=config.afterTransition({result:result,input:input,resolved:snapshot});
      if(followup&&typeof followup.then==='function')throw new Error('VIP_CHAT_MEMBER_FOLLOWUP_MUST_BE_SYNCHRONOUS');
    }
    return result;
  }
  return Object.freeze({process:process});
}
