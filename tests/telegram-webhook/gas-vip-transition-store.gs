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
  var intentHeaders=['Intent Key','Update Epoch','Update ID','Member ID','Target State','Source Type','Source Date','Payload SHA-256','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
  var cursorHeaders=['Member ID','Last Update Epoch','Last Update ID','Last Transition Key','Updated At'];
  var intentFields=['Update Epoch','Update ID','Member ID','Target State','Source Type','Source Date','Payload SHA-256','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
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
  function readIntent(tx,intentKey){
    var key=key_(intentKey),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length),i=uniqueRow_(rows,0,key);
    return i<0?null:intentObject_(rows[i]);
  }
  function insertIntent(tx,record){
    active_(tx);if(!record||typeof record!=='object')throw new Error('VIP_TRANSITION_INVALID_INTENT');
    var key=key_(record['Intent Key']),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length);
    var existingIndex=uniqueRow_(rows,0,key);
    var values=[key].concat(intentFields.map(function(h){return record[h]===undefined?'':record[h];}));
    if(existingIndex>=0){var prior=rows[existingIndex];var same=prior.length===values.length&&prior.every(function(v,i){return String(v==null?'':v)===String(values[i]==null?'':values[i]);});return{outcome:same?'EXISTS':'REVIEW_COLLISION',record:intentObject_(prior)};}
    sh.getRange(sh.getLastRow()+1,1,1,intentHeaders.length).setValues([values]);SpreadsheetApp.flush();
    return{outcome:'INSERTED',row:sh.getLastRow(),record:intentObject_(values)};
  }
  function updateIntent(tx,intentKey,patch){
    active_(tx);var key=key_(intentKey),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length),i=uniqueRow_(rows,0,key);
    if(i<0)throw new Error('VIP_TRANSITION_INTENT_NOT_FOUND');
    Object.keys(patch||{}).forEach(function(field){var col=intentHeaders.indexOf(field);if(col<=0)throw new Error('VIP_TRANSITION_FIELD_NOT_WRITABLE');rows[i][col]=patch[field];});
    sh.getRange(i+2,1,1,intentHeaders.length).setValues([rows[i]]);SpreadsheetApp.flush();
    return intentObject_(rows[i]);
  }
  function readCursor(tx,memberId){
    var id=member_(memberId),sh=sheet_(cursorName,cursorHeaders,tx),rows=rows_(sh,cursorHeaders.length),i=uniqueRow_(rows,0,id);
    if(i<0)return null;var row=rows[i];return{memberId:row[0],epoch:row[1],updateId:row[2],transitionKey:row[3],updatedAt:row[4]};
  }
  function writeCursor(tx,record){
    active_(tx);if(!record||typeof record!=='object')throw new Error('VIP_TRANSITION_INVALID_CURSOR');
    var id=member_(record.memberId),epoch=Number(record.epoch),updateId=String(record.updateId==null?'':record.updateId);
    if(!Number.isSafeInteger(epoch)||epoch<0)throw new Error('VIP_TRANSITION_INVALID_EPOCH');
    if(!/^(0|[1-9]\\d{0,19})$/.test(updateId))throw new Error('VIP_TRANSITION_INVALID_UPDATE_ID');
    var sh=sheet_(cursorName,cursorHeaders,tx),rows=rows_(sh,cursorHeaders.length),i=uniqueRow_(rows,0,id);
    var values=[id,epoch,updateId,key_(record.transitionKey),record.updatedAt];
    if(i<0){sh.getRange(sh.getLastRow()+1,1,1,cursorHeaders.length).setValues([values]);SpreadsheetApp.flush();return{outcome:'INSERTED'};}
    sh.getRange(i+2,1,1,cursorHeaders.length).setValues([values]);SpreadsheetApp.flush();return{outcome:'UPDATED'};
  }
  function findPending(tx,memberId){
    var id=member_(memberId),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length);
    var found=[];rows.forEach(function(row){if(String(row[3])===id&&['INTENT','STATUS_APPLIED'].indexOf(String(row[8]))>=0)found.push(intentObject_(row));});
    if(found.length>1)throw new Error('VIP_TRANSITION_MULTIPLE_PENDING');
    return found.length?found[0]:null;
  }
  return Object.freeze({readIntent:readIntent,insertIntent:insertIntent,updateIntent:updateIntent,readCursor:readCursor,writeCursor:writeCursor,findPending:findPending,
    headers:Object.freeze({intents:intentHeaders.slice(),cursor:cursorHeaders.slice()})});
}
