import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=new URL('../../rebuild/v4.8.1/',import.meta.url);
const code=readFileSync(fileURLToPath(new URL('Code.gs',root)),'utf8');
const html=readFileSync(fileURLToPath(new URL('Index.html',root)),'utf8');

test('complete Apps Script backend parses as one V8 program',()=>{
  assert.ok(code.length>50000,'expected complete Code.gs, not a partial snippet');
  assert.doesNotThrow(()=>new vm.Script(code,{filename:'rebuild/v4.8.1/Code.gs'}));
});

test('Apps Script HtmlService frontend inline JavaScript parses after template substitution',()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length,1,'expected one inline frontend script');
  assert.ok(html.length>30000,'expected complete Index.html, not a partial snippet');
  const javascript=scripts[0][1].replace(/<\?=\s*initialPage\s*\?>/g,JSON.stringify('home'));
  assert.doesNotThrow(()=>new vm.Script(javascript,{filename:'rebuild/v4.8.1/Index.html inline script'}));
});

test('Admin UI is wired to the reviewed IB, approval, PIN, and VIP APIs',()=>{
  for(const api of ['apiAdminSetIbVerification','apiAdminReview','apiAdminIssuePin','apiAdminProcessVipQueue'])
    assert.ok(html.includes(api),'missing frontend call to '+api);
});
