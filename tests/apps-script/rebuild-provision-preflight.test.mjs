import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
function extract(name,next){
  const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction '+next+'(',start+1);
  assert.ok(start>=0&&end>start,name+' source boundaries must exist');
  return source.slice(start,end);
}
const provisionSource=extract('provisionMpsRebuildStorage_','/** Public API: initial application');
const ensureSource=extract('ensureSheet_','validateMpsRebuildConfig_');

function makeSheet(headers=[],{malformedWidth=0}={}){
  const rows=headers.length?[headers.slice()]:[];
  let writes=0;
  return {
    rows,writes:()=>writes,
    getLastRow:()=>rows.length,
    getLastColumn:()=>malformedWidth||Math.max(0,...rows.map(r=>r.length)),
    getRange(row,col,nr=1,nc=1){
      return {
        getDisplayValues:()=>Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>String((rows[row-1+i]||[])[col-1+j]??''))),
        setValues(values){writes++;values.forEach((line,i)=>{if(!rows[row-1+i])rows[row-1+i]=[];line.forEach((v,j)=>rows[row-1+i][col-1+j]=v);});}
      };
    },
    setFrozenRows(){}
  };
}
function harness({legacyHeaders=['ID','Time'],auxiliary={},deleteFails=false}={}){
  const legacyName='Database Member';
  const specs={applications:{name:'Applications',headers:['ref','status']},deposits:{name:'Deposits',headers:['ref','amount']}};
  const sheets={...auxiliary};if(legacyHeaders!==null)sheets[legacyName]=makeSheet(legacyHeaders);
  let inserts=0,deleted=0;
  const ss={
    getSheetByName:name=>sheets[name]||null,
    insertSheet(name){inserts++;const sh=makeSheet();sheets[name]=sh;return sh;}
  };
  const ctx={
    MPS:{LEGACY_SHEET:legacyName,LEGACY_HEADERS:['ID','Time'],LEGACY_EXTENDED_HEADERS:['ID','Time','Tech'],SHEETS:specs,VERSION:'4.8.1'},
    requireOwnerContext_:()=>true,
    prop_:key=>key==='MPS_REBUILD_ALLOW_PROVISION'?'true':'',
    openDb_:()=>ss,
    ensureSheet_:undefined,
    PropertiesService:{getScriptProperties:()=>({deleteProperty:key=>{deleted++;if(deleteFails)throw new Error('INJECTED_DELETE_FAILURE');}})},
    Logger:{log:()=>{}},console:{log:()=>{}}
  };
  vm.createContext(ctx);vm.runInContext(ensureSource,ctx,{timeout:1000});vm.runInContext(provisionSource,ctx,{timeout:1000});
  return {run:()=>ctx.provisionMpsRebuildStorage_(),sheets,stats:()=>({inserts,deleted})};
}

test('malformed later auxiliary schema is detected before any missing sheet is created',()=>{
  const malformed=makeSheet(['wrong','header']);
  const h=harness({auxiliary:{Deposits:malformed}});
  assert.throws(()=>h.run(),/Header sheet Deposits tidak cocok/);
  assert.equal(h.sheets.Applications,undefined);
  assert.equal(h.stats().inserts,0);
  assert.equal(h.sheets['Database Member'].writes(),0);
});

test('valid preflight provisions only missing sheets and clears one-time flag',()=>{
  const h=harness({legacyHeaders:null});
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(result.provisioningFlagCleared,true);
  assert.deepEqual(h.stats(),{inserts:3,deleted:1});
  assert.deepEqual(h.sheets['Database Member'].rows[0],['ID','Time']);
  assert.deepEqual(h.sheets.Applications.rows[0],['ref','status']);
  assert.deepEqual(h.sheets.Deposits.rows[0],['ref','amount']);
});

test('failed one-time flag deletion returns explicit failure after safe provisioning',()=>{
  const h=harness({deleteFails:true});
  assert.throws(()=>h.run(),/flag sekali pakai gagal dihapus/i);
  assert.equal(h.stats().deleted,1);
  assert.ok(h.sheets.Applications);
  assert.ok(h.sheets.Deposits);
});

test('existing valid legacy and auxiliary schemas are left untouched',()=>{
  const apps=makeSheet(['ref','status']),deposits=makeSheet(['ref','amount']);
  const h=harness({auxiliary:{Applications:apps,Deposits:deposits}});
  const result=h.run();
  assert.equal(result.ok,true);
  assert.equal(apps.writes(),0);
  assert.equal(deposits.writes(),0);
  assert.equal(h.sheets['Database Member'].writes(),0);
  assert.deepEqual(h.stats(),{inserts:0,deleted:1});
});
