/**
 * Synthetic durable per-member transition contract for VIP activation AND leave.
 * The store is an in-memory crash/restart model, not a Google Sheets adapter.
 */
const validId = value => typeof value === 'number'
  ? Number.isSafeInteger(value) && value >= 0
  : typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value);
const cmp = (a, b) => {
  if (!b) return 1;
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? 1 : -1;
  if (a.sourceDate !== b.sourceDate) return a.sourceDate > b.sourceDate ? 1 : -1;
  const x=String(a.updateId), y=String(b.updateId);
  return x.length!==y.length ? (x.length>y.length?1:-1) : (x===y?0:(x>y?1:-1));
};
const keyFor = (epoch,id) => 'telegram:'+epoch+':'+String(id)+':vip_transition';
const clone = value => structuredClone(value);

export class SharedVipTransitionStore {
  constructor(shared) {
    this.data=shared||{members:new Map(),intents:new Map(),effects:new Map()};
    this.tail=Promise.resolve();
  }
  async atomic(fn) {
    let release; const prior=this.tail;
    this.tail=new Promise(resolve=>{release=resolve;});
    await prior; try{return await fn();}finally{release();}
  }
  member(id) { return clone(this.data.members.get(String(id))||{
    statusA:'LEFT',statusB:'LEFT',cursor:null
  }); }
  putMember(id,row) { this.data.members.set(String(id),clone(row)); }
  intent(key) { return clone(this.data.intents.get(key)||null); }
  putIntent(key,row) { this.data.intents.set(key,clone(row)); }
  pending(id) {
    const row=[...this.data.intents.values()].find(x=>
      x.memberId===String(id)&&['INTENT','STATUS_APPLIED'].includes(x.state));
    return clone(row||null);
  }
  appendEffect(key,payload) {
    const old=this.data.effects.get(key);
    if(old) return JSON.stringify(old)===JSON.stringify(payload)?'ALREADY_APPENDED':'REVIEW_KEY_COLLISION';
    this.data.effects.set(key,clone(payload)); return 'APPENDED';
  }
}

export class VipTransitionOrchestrator {
  constructor(store,{failAt=null,onPhase=()=>{}}={}) {
    this.store=store; this.failAt=failAt; this.onPhase=onPhase;
  }
  crash(phase) { this.onPhase(phase); if(this.failAt===phase)throw new Error('SIMULATED_CRASH_'+phase); }
  async process({updateId,epoch=0,sourceDate=1800000000,memberId,targetState,receivedAt=1800000000000}) {
    if(!validId(updateId))throw new TypeError('INVALID_UPDATE_ID');
    if(!Number.isSafeInteger(epoch)||epoch<0)throw new TypeError('INVALID_EPOCH');
    if(!memberId||!['ACTIVE','LEFT'].includes(targetState))throw new TypeError('INVALID_TRANSITION');
    if(!Number.isSafeInteger(sourceDate)||sourceDate<=0)throw new TypeError('INVALID_SOURCE_DATE');
    if(!Number.isSafeInteger(receivedAt)||receivedAt<=0)throw new TypeError('INVALID_RECEIVED_AT');
    await this.recover(memberId);
    const key=keyFor(epoch,updateId);
    const decision=await this.store.atomic(async()=>{
      const old=this.store.intent(key);
      if(old) {
        if(old.memberId!==String(memberId)||old.targetState!==targetState)return {outcome:'REVIEW_COLLISION'};
        if(old.state==='COMPLETED')return {outcome:'DUPLICATE'};
        if(old.state==='SUPERSEDED')return {outcome:'STALE'};
        return {outcome:'RESUME',intent:old};
      }
      const member=this.store.member(memberId);
      if(cmp({epoch,sourceDate,updateId:String(updateId)},member.cursor)<=0)return {outcome:'STALE'};
      const intent={key,updateId:String(updateId),epoch,memberId:String(memberId),
        targetState,sourceDate,receivedAt,state:'INTENT',
        effectKeys:targetState==='ACTIVE'?[key+':ticker',key+':audit']:[key+':audit']};
      this.store.putIntent(key,intent); return {outcome:'NEW',intent};
    });
    if(decision.outcome==='REVIEW_COLLISION')throw new Error('TRANSITION_INTENT_COLLISION');
    if(!['NEW','RESUME'].includes(decision.outcome))return decision.outcome;
    await this.finish(decision.intent);
    return targetState;
  }
  async recover(memberId) {
    const pending=this.store.pending(memberId);
    if(pending)await this.finish(pending);
  }
  async finish(initial) {
    let intent=this.store.intent(initial.key);
    if(!intent||['COMPLETED','SUPERSEDED'].includes(intent.state))return;
    if(intent.state==='INTENT') {
      const result=await this.store.atomic(async()=>{
        const latest=this.store.intent(intent.key); const member=this.store.member(intent.memberId);
        if(cmp({epoch:latest.epoch,sourceDate:latest.sourceDate,updateId:latest.updateId},member.cursor)<=0) {
          this.store.putIntent(intent.key,{...latest,state:'SUPERSEDED'});return false;
        }
        // Each sheet-like row write is persisted separately to expose crash windows.
        this.store.putMember(intent.memberId,{...member,statusA:intent.targetState});
        return true;
      });
      if(!result)return;
      this.crash('AFTER_STATUS_A');
      await this.store.atomic(async()=>{
        const latest=this.store.intent(intent.key),member=this.store.member(intent.memberId);
        if(latest.state==='INTENT')this.store.putMember(intent.memberId,{...member,statusB:intent.targetState});
      });
      this.crash('AFTER_STATUS_B');
      await this.store.atomic(async()=>{
        const latest=this.store.intent(intent.key),member=this.store.member(intent.memberId);
        if(latest.state==='INTENT') {
          this.store.putMember(intent.memberId,{...member,cursor:{epoch:latest.epoch,sourceDate:latest.sourceDate,updateId:latest.updateId}});
          this.store.putIntent(intent.key,{...latest,state:'STATUS_APPLIED'});
        }
      });
      this.crash('AFTER_CURSOR');
    }
    intent=this.store.intent(initial.key);
    if(!intent||intent.state!=='STATUS_APPLIED')return;
    for(let i=0;i<intent.effectKeys.length;i++) {
      const kind=intent.effectKeys[i].endsWith(':ticker')?'ticker':'audit';
      const result=await this.store.atomic(async()=>this.store.appendEffect(
        intent.effectKeys[i],{memberId:intent.memberId,targetState:intent.targetState,kind,updateId:intent.updateId}
      ));
      if(result==='REVIEW_KEY_COLLISION')throw new Error('TRANSITION_EFFECT_COLLISION');
      this.crash(kind==='ticker'?'AFTER_TICKER':'AFTER_AUDIT');
    }
    await this.store.atomic(async()=>{
      const latest=this.store.intent(intent.key);
      if(latest?.state==='STATUS_APPLIED')this.store.putIntent(intent.key,{...latest,state:'COMPLETED'});
    });
    this.crash('AFTER_COMPLETE');
  }
}
