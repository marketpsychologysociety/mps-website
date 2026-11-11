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
