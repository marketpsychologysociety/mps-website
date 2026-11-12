import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const source=readFileSync(fileURLToPath(new URL('../../candidates/Code.gs',import.meta.url)),'utf8');
const match=source.match(/const MPS_VIP_CALCULATOR_HTML = ("(?:\\.|[^"\\])*");/s);
assert.ok(match,'embedded calculator HTML source must exist');
const calculator=vm.runInNewContext(match[1]);
const scriptMatch=calculator.match(/<script>([\\s\\S]*?)<\\/script>/);
assert.ok(scriptMatch,'embedded calculator script must exist');
const script=scriptMatch[1];

test('calculator escapes untrusted text before HTML template interpolation',()=>{
  const line=script.split('\\n').find(x=>x.startsWith('const esc='));
  assert.ok(line,'HTML escaping helper must exist');
  const esc=vm.runInNewContext(line+'; esc');
  const payload='<img src=x onerror=alert(1)> & "quoted"';
  assert.equal(esc(payload),'&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;');
  for(const key of ['sn','nt','rd']) {
    assert.match(script,new RegExp('esc\\(G\\.'+key+'\\)'),key+' must be escaped before rendering');
  }
  assert.match(script,/R\.errors\.map\(x=>\x60<li>\$\{esc\(x\)\}/);
  assert.match(script,/esc\(x\[1\]\)/,'discipline check labels must be escaped');
});

test('saved calculator state validates every value used as a rendering selector',()=>{
  assert.match(script,/if\(!INST\[G\.inst\]\)G\.inst=DEF\.inst/);
  assert.match(script,/if\(!\['BUY','SELL'\]\.includes\(G\.dir\)\)G\.dir=DEF\.dir/);
  assert.match(script,/if\(!TABS\.some\(t=>t\[0\]===G\.tab\)\)G\.tab=DEF\.tab/);
  assert.match(script,/const views=\{lot:tLot,rr:tRR,biaya:tBiaya,margin:tMargin,risiko:tRisiko\}/);
});

test('calculator innerHTML sinks render computed values, escaped labels, or fixed allowlisted tab definitions',()=>{
  assert.match(script,/\$\('kpi'\)\.innerHTML=\x60[\s\S]*?R\.ok\?fmt\(R\.lot,3\)/);
  assert.match(script,/\$\('disc'\)\.innerHTML=discipline\(R\)/);
  assert.match(script,/\$\('tabs'\)\.innerHTML=TABS\.map/);
  assert.match(script,/\$\('res'\)\.innerHTML=views\[G\.tab\]\(R\)/);
  assert.match(script,/const TABS=\[\['lot','Lot'\],\['rr','Risk to reward'\],\['biaya','Biaya'\],\['margin','Margin'\],\['risiko','Risiko akun'\]\]/);
});
