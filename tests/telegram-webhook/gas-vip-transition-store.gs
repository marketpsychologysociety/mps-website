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
  var intentFields=['Update Epoch','Update ID','Member ID','Member Name','Target State','Source Type','Source Date','Payload SHA-256','State','Ticker Effect Key','Audit Effect Key','Created At','Updated At','Last Error Code'];
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
    if(existingIndex>=0){var prior=rows[existingIndex];var same=prior.length===values.length&&prior.every(function(v,i){return String(v==null?'':v)===String(values[i]==null?'':values[i]);});return{outcome:same?'EXISTS':'REVIEW_COLLISION',record:intentObject_(prior)};}
    sh.getRange(sh.getLastRow()+1,1,1,intentHeaders.length).setValues([values]);SpreadsheetApp.flush();
    return{outcome:'INSERTED',row:sh.getLastRow(),record:intentObject_(values)};
  }
  function updateIntent(tx,intentKey,patch){
    active_(tx);var key=key_(intentKey),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length),i=uniqueRow_(rows,0,key);
    if(i<0)throw new Error('VIP_TRANSITION_INTENT_NOT_FOUND');
    var currentState=String(rows[i][11]),nextState=patch&&patch.State;
    if(nextState!==undefined){var allowed={INTENT:['INTENT','STATUS_APPLIED','SUPERSEDED'],STATUS_APPLIED:['STATUS_APPLIED','COMPLETED'],COMPLETED:['COMPLETED'],SUPERSEDED:['SUPERSEDED']};if(!allowed[currentState]||allowed[currentState].indexOf(String(nextState))<0)throw new Error('VIP_TRANSITION_INVALID_STATE_CHANGE');}
    Object.keys(patch||{}).forEach(function(field){var col=intentHeaders.indexOf(field);if(col<=0)throw new Error('VIP_TRANSITION_FIELD_NOT_WRITABLE');rows[i][col]=patch[field];});
    sh.getRange(i+2,1,1,intentHeaders.length).setValues([rows[i]]);SpreadsheetApp.flush();
    return intentObject_(rows[i]);
  }
  function readCursor(tx,memberId){
    var id=member_(memberId),sh=sheet_(cursorName,cursorHeaders,tx),rows=rows_(sh,cursorHeaders.length),i=uniqueRow_(rows,0,id);
    if(i<0)return null;var row=rows[i];return{memberId:row[0],epoch:row[1],sourceDate:row[2],updateId:row[3],transitionKey:row[4],updatedAt:row[5]};
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
    var order=sourceDate!==priorDate?(sourceDate>priorDate?1:-1):cmpId(updateId,priorId);
    if(order===0&&epoch!==priorEpoch)order=epoch>priorEpoch?1:-1;
    if(order<0)throw new Error('VIP_TRANSITION_CURSOR_REGRESSION');
    if(order===0&&String(prior[4])!==transitionKey)throw new Error('VIP_TRANSITION_CURSOR_COLLISION');
    if(order===0)return{outcome:'ALREADY_CURRENT'};
    sh.getRange(i+2,1,1,cursorHeaders.length).setValues([values]);SpreadsheetApp.flush();return{outcome:'UPDATED'};
  }
  function findPending(tx,memberId){
    var id=member_(memberId),sh=sheet_(intentName,intentHeaders,tx),rows=rows_(sh,intentHeaders.length);
    var found=[];rows.forEach(function(row){if(String(row[3])===id&&['INTENT','STATUS_APPLIED'].indexOf(String(row[11]))>=0)found.push(intentObject_(row));});
    if(found.length>1)throw new Error('VIP_TRANSITION_MULTIPLE_PENDING');
    return found.length?found[0]:null;
  }
  return Object.freeze({readIntent:readIntent,insertIntent:insertIntent,updateIntent:updateIntent,readCursor:readCursor,writeCursor:writeCursor,findPending:findPending,
    headers:Object.freeze({intents:intentHeaders.slice(),cursor:cursorHeaders.slice()})});
}
