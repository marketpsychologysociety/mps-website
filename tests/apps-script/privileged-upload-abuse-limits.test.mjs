import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../candidates/Code.gs',import.meta.url),'utf8');
function body(name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'missing '+name);
  return source.slice(start,end);
}

test('Learning PDF upload is Super Admin-only and rate-limited before decoding or Drive access',()=>{
  const fn=body('apiAdminUploadLearningFile');
  assert.match(fn,/const admin=requireSuperAdmin_\(session\)/);
  assert.match(fn,/consumeRateLimit_\('mps_admin_learning_upload_'.*?,3,900,/);
  assert.ok(fn.indexOf('consumeRateLimit_')<fn.indexOf('Utilities.base64Decode'));
  assert.ok(fn.indexOf('consumeRateLimit_')<fn.indexOf('DriveApp.getFolderById'));
});

test('Learning PDF deletion is Super Admin-only and rate-limited before Drive access',()=>{
  const fn=body('apiAdminDeleteLearningFile');
  assert.match(fn,/const admin=requireSuperAdmin_\(session\)/);
  assert.match(fn,/consumeRateLimit_\('mps_admin_learning_delete_'.*?,5,900,/);
  assert.ok(fn.indexOf('consumeRateLimit_')<fn.indexOf('DriveApp.getFileById'));
});

test('Market Pulse publication has a separate Super Admin rate limit from validation',()=>{
  const fn=body('apiAdminUploadMarketPulse');
  assert.match(fn,/const admin=requireSuperAdmin_\(session\)/);
  assert.match(fn,/consumeRateLimit_\('mps_admin_pulse_publish_'.*?,3,900,/);
  assert.ok(fn.indexOf('consumeRateLimit_')<fn.indexOf('LockService.getScriptLock'));
});
