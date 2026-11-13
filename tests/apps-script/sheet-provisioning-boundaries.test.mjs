import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
function extract(name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,name+' boundaries must exist');
  return source.slice(start,end);
}
const runtime=['getMpsSheetStrict_','provisionMpsSheets_','getMpsContentSheet_'].map(extract).join('\n');
const contentHeaders=['Key','Value','Updated At'];
const strictHeaders=['ID','Status'];

function fakeSheet(headers=[]){
  let values=headers.length?[headers.slice()]:[];
  let writes=0,formats=0;
  const sheet={
    getLastRow:()=>values.length,
    getRange:(row,col,numRows=1,numCols=1)=>({
      getDisplayValues:()=>Array.from({length:numRows},(_,ri)=>Array.from({length:numCols},(_,ci)=>String(values[row-1+ri]?.[col-1+ci]??''))),
      setValues:data=>{writes++;for(let ri=0;ri<data.length;ri++){values[row-1+ri]??=[];for(let ci=0;ci<data[ri].length;ci++)values[row-1+ri][col-1+ci]=data[ri][ci];}return this;},
      setBackground:()=>{formats++;return this;},setFontColor:()=>{formats++;return this;},setFontWeight:()=>{formats++;return this;},setWrap:()=>{formats++;return this;}
    }),
    setFrozenRows:()=>{formats++;},setHiddenGridlines:()=>{formats++;},
    stats:()=>({writes,formats,values:values.map(row=>row.slice())})
  };
  return sheet;
}
function harness(initial={}){
  const sheets=new Map(Object.entries(initial)),created=[];
  const ss={
    getSheetByName:name=>sheets.get(name)||null,
    insertSheet:name=>{if(sheets.has(name))throw Error('already exists');const sh=fakeSheet();sheets.set(name,sh);created.push(name);return sh;}
  };
  const context={openDatabase_:()=>ss};
  vm.createContext(context);vm.runInContext(runtime,context,{timeout:1000});
  return{context,sheets,created};
}

test('strict operational sheet access fails closed for a missing tab without creating it',()=>{
  const h=harness();
  assert.throws(()=>h.context.getMpsSheetStrict_('Applications',strictHeaders),/belum disediakan/);
  assert.deepEqual(h.created,[]);
  assert.equal(h.sheets.has('Applications'),false);
});

test('strict operational sheet access rejects an existing empty tab without writing headers or formatting',()=>{
  const empty=fakeSheet(),h=harness({Applications:empty});
  assert.throws(()=>h.context.getMpsSheetStrict_('Applications',strictHeaders),/belum disediakan/);
  assert.deepEqual(empty.stats(),{writes:0,formats:0,values:[]});
  assert.deepEqual(h.created,[]);
});

test('read-only content access leaves missing and existing-empty tabs unchanged',()=>{
  const empty=fakeSheet(),h=harness({EmptyContent:empty});
  assert.equal(h.context.getMpsContentSheet_('MissingContent',contentHeaders,false),null);
  assert.equal(h.context.getMpsContentSheet_('EmptyContent',contentHeaders,false),null);
  assert.deepEqual(empty.stats(),{writes:0,formats:0,values:[]});
  assert.deepEqual(h.created,[]);
});

test('legacy createIfMissing flag cannot create sheets from operational/public call paths',()=>{
  const h=harness();
  assert.throws(()=>h.context.getMpsContentSheet_('PublicRequests',contentHeaders,true),/Jalankan Inisialisasi oleh Super Admin/);
  assert.deepEqual(h.created,[]);
  assert.equal(h.sheets.has('PublicRequests'),false);
});

test('provisioning preflights all existing schemas before creating any missing tab',()=>{
  const mismatch=fakeSheet(['Wrong','Header']),h=harness({Existing:mismatch});
  assert.throws(()=>h.context.provisionMpsSheets_([
    {name:'WouldOtherwiseBeCreated',headers:contentHeaders},
    {name:'Existing',headers:strictHeaders}
  ]),/PROVISIONING_SCHEMA_MISMATCH/);
  assert.deepEqual(h.created,[]);
  assert.equal(h.sheets.has('WouldOtherwiseBeCreated'),false);
  assert.deepEqual(mismatch.stats(),{writes:0,formats:0,values:[['Wrong','Header']]});
});

test('authorized provisioning helper creates only missing tabs and writes exact headers',()=>{
  const existing=fakeSheet(strictHeaders),h=harness({Existing:existing});
  h.context.provisionMpsSheets_([
    {name:'Existing',headers:strictHeaders},
    {name:'NewTab',headers:contentHeaders},
    {name:'NewTab',headers:contentHeaders}
  ]);
  assert.deepEqual(h.created,['NewTab']);
  assert.deepEqual(h.sheets.get('NewTab').stats().values,[contentHeaders]);
  assert.equal(existing.stats().writes,0);
});

test('Super Admin initialization is guarded and explicitly provisions legacy Telegram Links storage',()=>{
  const start=source.indexOf('function apiAdminInitializeContent(session)');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  assert.ok(body.indexOf('requireSuperAdmin_(session)')<body.indexOf('provisionMpsSheets_'));
  assert.match(body,/name:'Telegram Links'/);
  assert.match(body,/name:'VIP Access'/);
});

test('deposit storage is validated before any proof file is created',()=>{
  const body=extract('saveDeposit_');
  assert.ok(body.indexOf('getMpsMemberLinksSheet_()')<body.indexOf('folder.createFile('),
    'Member Links schema must be checked before Drive proof creation');
});

test('all operational content-sheet reads use a non-mutating false path',()=>{
  const body=extract('getMpsContentSheet_');
  assert.match(body,/if\(!sh\|\|sh\.getLastRow\(\)<1\)/);
  assert.match(body,/if\(createIfMissing\)throw new Error/);
  assert.doesNotMatch(body,/insertSheet|setValues|setFrozenRows|setBackground/);
});
