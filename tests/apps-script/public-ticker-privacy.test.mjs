import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
new vm.Script(source,{filename:'candidate/Code.gs'});
const start=source.indexOf('function isSafePublicIdentity_(value) {');
const end=source.indexOf('\nfunction createMpsVipTransitionStatusWriter_(',start+1);
assert.ok(start>=0&&end>start,'public identity guard boundaries must exist');
const guardSource=source.slice(start,end);
const context={};
vm.createContext(context);vm.runInContext(guardSource,context,{timeout:1000});

test('real member names remain eligible for public social proof without masking',()=>{
  for(const name of ['Budi Santoso','Dewi Anggraini','Muhammad Rizky Pratama',"Ayu D'Pratiwi",'陈美玲','José María']) {
    assert.equal(context.isSafePublicIdentity_(name),true,name);
  }
});
test('empty, oversized, and identifier-like names are denied',()=>{
  for(const value of ['', '   ', 'A'.repeat(101), 'MPS-ABCDEF1234', 'MPS-APP-0123456789ABCDEF', '@trader_mps', 'MT5 Login: 12345678', 'LOGIN 12345678']) {
    assert.equal(context.isSafePublicIdentity_(value),false,String(value));
  }
});
test('contact details, payment amounts, and links are denied from public ticker fields',()=>{
  for(const value of ['member@example.com','+62 812-3456-7890','081234567890','RP 1.500.000','IDR 250000','https://example.com/proof','www.example.com']) {
    assert.equal(context.isSafePublicIdentity_(value),false,value);
  }
});
test('public activity projection exposes only approved display name and event text',()=>{
  assert.match(source,/const publicActivity\s*=\s*activity\.map\(function\(r\)\s*\{\s*return\s*\{PublicAlias:r\['Member Name'\],PublicText:r\['Event Text'\]\};\s*\}\);/);
  assert.match(source,/r\.Status==='Visible'&&isSafePublicIdentity_\(r\['Member Name'\]\)&&isSafePublicIdentity_\(r\['Event Text'\]\)/);
  assert.doesNotMatch(source,/publicActivity\s*=\s*activity\.map\(function\(r\)\s*\{\s*return\s*\{[^}]*Telegram User ID|publicActivity\s*=\s*activity\.map\(function\(r\)\s*\{\s*return\s*\{[^}]*Deposit Amount/i);
});
