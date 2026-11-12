import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const code=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../candidates/Index.html',import.meta.url)),'utf8');
const definitions=new Set([...code.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
const calls=[...new Set([...html.matchAll(/\bapi\(\s*['"]([A-Za-z_$][\w$]*)['"]/g)].map(m=>m[1]))].sort();

test('every literal frontend google.script.run API call has a matching backend function',()=>{
  assert.ok(calls.length>=40,'expected the complete frontend API inventory');
  const missing=calls.filter(name=>!definitions.has(name));
  assert.deepEqual(missing,[]);
});
test('all frontend API calls route through the guarded google.script.run wrapper',()=>{
  assert.match(html,/function api\(method,\.\.\.args\)[\s\S]{0,500}runner\[method\]\(\.\.\.args\)/);
});
test('backend router does not expose a generic unauthenticated doPost method dispatcher',()=>{
  const doPost=code.slice(code.indexOf('function doPost(e)'),code.indexOf('\nfunction doGet(e)'));
  assert.doesNotMatch(doPost,/data\.method|data\.action|this\[|globalThis\[|eval\s*\(/);
});
