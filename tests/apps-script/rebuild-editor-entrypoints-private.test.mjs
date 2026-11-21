import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Index.html',import.meta.url)),'utf8');
const functions=[...code.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)];
const names=functions.map(x=>x[1]);
function bodyOf(index){
  const start=functions[index].index;
  const end=index+1<functions.length?functions[index+1].index:code.length;
  return code.slice(start,end);
}

test('owner/editor-only setup and maintenance entry points are private to google.script.run',()=>{
  const expected=[
    'runMpsTelegramTestWebhookStatus_',
    'runMpsTelegramTestPollingSetup_',
    'runMpsTelegramTestPollingStop_',
    'runMpsTelegramTestPostTransportProbe_',
    'runMpsTelegramTestWebhookSetup_',
    'runMpsRebuildValidation_',
    'runMpsBackupSnapshot_',
    'runMpsFullAcceptanceSuite_'
  ];
  for(const name of expected) assert.ok(names.includes(name),'missing private editor entry point '+name);
  for(const name of expected) assert.ok(!names.includes(name.slice(0,-1)),'public web-callable wrapper remains: '+name.slice(0,-1));
  assert.doesNotMatch(html,/runMps(?:Telegram|Rebuild|Backup|FullAcceptance)/);
});

test('every function that performs owner-context operations is private',()=>{
  for(let i=0;i<functions.length;i++){
    const name=functions[i][1], body=bodyOf(i);
    const privileged=/requireOwnerContext_\s*\(|requireEffectiveOwnerContext_\s*\(|installMpsTelegramWebhook_\s*\(|provisionMpsRebuildStorage_\s*\(|initializeMpsTotpSecrets_\s*\(|createMpsBackupSnapshot_\s*\(|ScriptApp\.newTrigger\s*\(|ScriptApp\.deleteTrigger\s*\(/.test(body);
    if(privileged) assert.ok(name.endsWith('_'),'owner-only function must end in underscore: '+name);
  }
});

test('public web API remains limited to the intended user-facing functions',()=>{
  const publicNames=names.filter(name=>!name.endsWith('_'));
  for(const name of publicNames) assert.ok(!/^runMps/.test(name),'public maintenance endpoint is not allowed: '+name);
});
