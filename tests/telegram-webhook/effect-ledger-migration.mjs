const LEGACY_SCHEMAS = Object.freeze({
  audit: Object.freeze({headers:Object.freeze(['Timestamp','Actor Role','Actor Ref','Action','Target Ref','Result','Details']),keyHeader:'Effect Key'}),
  ticker: Object.freeze({headers:Object.freeze(['Event ID','Created At','Member ID','Member Name','Event Text','Status']),keyHeader:'Effect Key'})
});
function samePrefix(actual, expected) {
  return expected.every((value,index)=>String(actual[index]??'').trim()===value);
}
export function planAppendOnlyEffectKeyMigration(kind, actualHeaders) {
  const schema=LEGACY_SCHEMAS[kind];
  if(!schema) throw new TypeError('UNKNOWN_EFFECT_SHEET');
  if(!Array.isArray(actualHeaders)||!samePrefix(actualHeaders,schema.headers)) return {outcome:'REVIEW_LEGACY_SCHEMA_MISMATCH'};
  const width=schema.headers.length, extras=actualHeaders.slice(width).map(value=>String(value??'').trim());
  if(extras.length===0||extras.every(value=>value==='')) return {outcome:'MIGRATION_REQUIRED',appendHeader:schema.keyHeader,column:width+1};
  if(extras.length===1&&extras[0]===schema.keyHeader) return {outcome:'ALREADY_MIGRATED',keyColumn:width+1};
  return {outcome:'REVIEW_UNKNOWN_EXTRA_COLUMNS'};
}
export function validateEffectKeyColumn(kind, rows) {
  const schema=LEGACY_SCHEMAS[kind];
  if(!schema) throw new TypeError('UNKNOWN_EFFECT_SHEET');
  if(!Array.isArray(rows)) return {outcome:'REVIEW_INVALID_ROWS'};
  const index=schema.headers.length, seen=new Set();
  for(const row of rows) {
    const key=String(row?.[index]??'').trim();
    if(!key) continue;
    if(!/^[A-Za-z0-9:_-]{1,160}$/.test(key)) return {outcome:'REVIEW_INVALID_EFFECT_KEY'};
    if(seen.has(key)) return {outcome:'REVIEW_DUPLICATE_EFFECT_KEY'};
    seen.add(key);
  }
  return {outcome:'VALID',keyedRows:seen.size};
}
export class KeyedAppendOnlyStore {
  constructor(rows=[],{afterAppend=null}={}) {
    this.rows=rows.map(row=>({...row})); this.afterAppend=afterAppend; this.tail=Promise.resolve();
  }
  async appendOnce({effectKey,payloadHash,record}) {
    if(typeof effectKey!=='string'||!/^[A-Za-z0-9:_-]{1,160}$/.test(effectKey)) throw new TypeError('INVALID_EFFECT_KEY');
    if(typeof payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(payloadHash)) throw new TypeError('INVALID_PAYLOAD_HASH');
    let release; const previous=this.tail; this.tail=new Promise(resolve=>{release=resolve;}); await previous;
    try {
      const existing=this.rows.find(row=>row.effectKey===effectKey);
      if(existing) return existing.payloadHash===payloadHash?{outcome:'ALREADY_APPENDED',row:{...existing}}:{outcome:'REVIEW_KEY_COLLISION'};
      const row={...record,effectKey,payloadHash}; this.rows.push(row);
      if(this.afterAppend) await this.afterAppend({...row});
      return {outcome:'APPENDED',row:{...row}};
    } finally {release();}
  }
}
export function buildVipEffectKey(updateId,effectType) {
  const id=typeof updateId==='number'?(Number.isSafeInteger(updateId)&&updateId>=0?String(updateId):null)
    :(typeof updateId==='string'&&/^(0|[1-9]\\d{0,19})$/.test(updateId)?updateId:null);
  if(id===null) throw new TypeError('INVALID_UPDATE_ID');
  if(!['VIP_TICKER_EVENT','VIP_JOIN_AUDIT'].includes(effectType)) throw new TypeError('INVALID_EFFECT_TYPE');
  return `telegram:${id}:${effectType.toLowerCase()}`;
}
export const LEGACY_EFFECT_SCHEMAS=LEGACY_SCHEMAS;
