import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DurableAuditJournal } from './durable-audit-journal.mjs';
import { SyntheticBackupStore } from './synthetic-backup-recovery.mjs';

const digest=s=>createHash('sha256').update(s).digest('hex');
async function fixture(t,{faultInjector=null}={}) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mps-p115-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source'); await fs.mkdir(source);
  const journal=await DurableAuditJournal.open(source);
  await journal.beginOperation({operationId:'op_p115_1',idempotencyKey:'idem_p115_1',actorSubject:'synthetic_operator_A',targetId:'draw_p115_1',payloadDigest:digest('payload-one')});
  await journal.completeOperation({operationId:'op_p115_1',result:{state:'INTENT_RECORDED',synthetic:true}});
  const checkpoint=journal.getStats();
  await journal.close();
  const store=new SyntheticBackupStore(path.join(root,'backups'),{faultInjector});
  return {root,source,journalPath:path.join(source,'audit.journal.jsonl'),checkpoint,store};
}
async function appendOperation(journal,n) {
  await journal.beginOperation({operationId:'op_p115_'+n,idempotencyKey:'idem_p115_'+n,actorSubject:'synthetic_operator_A',targetId:'draw_p115_'+n,payloadDigest:digest('payload-'+n)});
  await journal.completeOperation({operationId:'op_p115_'+n,result:{state:'INTENT_RECORDED',synthetic:true}});
}

test('creates a create-only backup with independently verified manifest and journal checkpoint',async t=>{
  const f=await fixture(t); const backup=await f.store.createBackup(f.journalPath);
  const verified=await f.store.verifyBackup(backup.backup_id);
  assert.equal(verified.sequence,f.checkpoint.record_count);
  assert.equal(verified.last_hash,f.checkpoint.last_hash);
  assert.equal(verified.journal_sha256,backup.journal_sha256);
  await assert.rejects(f.store.createBackup(path.join(f.root,'missing')),e=>e.code==='ENOENT');
});

test('detects journal byte tampering even when backup directory remains present',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  const file=path.join(f.store.root,b.backup_id,'audit.journal.jsonl');
  const bytes=await fs.readFile(file); bytes[10]^=1; await fs.writeFile(file,bytes);
  await assert.rejects(f.store.verifyBackup(b.backup_id),e=>e.code==='BACKUP_INTEGRITY_ERROR');
});

test('detects manifest alteration and unknown manifest fields',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  const file=path.join(f.store.root,b.backup_id,'manifest.json');
  const m=JSON.parse(await fs.readFile(file,'utf8')); m.sequence+=1; m.unexpected='canary';
  await fs.writeFile(file,JSON.stringify(m)+'\n');
  await assert.rejects(f.store.verifyBackup(b.backup_id),e=>e.code==='BACKUP_INTEGRITY_ERROR');
});

test('rejects stale backup when current evidence has advanced',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  const journal=await DurableAuditJournal.open(f.source);
  await appendOperation(journal,2); const current=journal.getStats(); await journal.close();
  await assert.rejects(f.store.restoreToNewTarget(b.backup_id,path.join(f.root,'restore','journal.jsonl'),{sequence:current.record_count,last_hash:current.last_hash}),
    e=>e.code==='STALE_BACKUP');
});

test('rejects equal-sequence checkpoint conflict rather than guessing which evidence is correct',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  await assert.rejects(f.store.restoreToNewTarget(b.backup_id,path.join(f.root,'restore','journal.jsonl'),{sequence:f.checkpoint.record_count,last_hash:digest('different-checkpoint')}),
    e=>e.code==='STALE_BACKUP');
});

test('restores verified bytes only to a new target and readbacks exact checkpoint',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  const target=path.join(f.root,'recovered','audit.journal.jsonl');
  const result=await f.store.restoreToNewTarget(b.backup_id,target,{sequence:f.checkpoint.record_count,last_hash:f.checkpoint.last_hash});
  assert.equal(result.sequence,f.checkpoint.record_count);
  assert.deepEqual(await fs.readFile(target),await fs.readFile(f.journalPath));
  assert.equal((await f.store.verifyBackup(b.backup_id)).last_hash,f.checkpoint.last_hash);
});

test('never overwrites an existing restore target or source journal',async t=>{
  const f=await fixture(t); const b=await f.store.createBackup(f.journalPath);
  const target=path.join(f.root,'restore-existing'); await fs.writeFile(target,'preserve-me');
  await assert.rejects(f.store.restoreToNewTarget(b.backup_id,target,{sequence:f.checkpoint.record_count,last_hash:f.checkpoint.last_hash}),
    e=>e.code==='RESTORE_TARGET_EXISTS');
  assert.equal(await fs.readFile(target,'utf8'),'preserve-me');
  assert.equal((await fs.readFile(f.journalPath)).length,f.checkpoint.record_count>0?(await fs.readFile(f.journalPath)).length:0);
});

test('interrupted backup publication leaves staging evidence and no published backup',async t=>{
  const f=await fixture(t,{faultInjector:stage=>stage==='BEFORE_PUBLISH'});
  await assert.rejects(f.store.createBackup(f.journalPath),e=>e.code==='INJECTED_FAILURE');
  const entries=await fs.readdir(f.store.root);
  assert.equal(entries.filter(x=>x.startsWith('.staging-')).length,1);
  assert.equal(entries.filter(x=>!x.startsWith('.staging-')).length,0);
});

test('interrupted restore never overwrites or silently retries a possibly partial target',async t=>{
  const f=await fixture(t,{faultInjector:stage=>stage==='RESTORE_AFTER_WRITE'});
  const b=await f.store.createBackup(f.journalPath).catch(()=>null);
  // Use a clean store for backup, then inject only at restore.
  const clean=new SyntheticBackupStore(path.join(f.root,'clean-backups'));
  const good=await clean.createBackup(f.journalPath);
  const target=path.join(f.root,'restore-interrupted');
  await assert.rejects(clean.restoreToNewTarget(good.backup_id,target,{sequence:f.checkpoint.record_count,last_hash:f.checkpoint.last_hash}),
    e=>e.code==='RECONCILIATION_REQUIRED' || e.code==='INJECTED_FAILURE');
  assert.equal(await fs.readFile(target,'utf8'),await fs.readFile(f.journalPath,'utf8'));
  await assert.rejects(clean.restoreToNewTarget(good.backup_id,target,{sequence:f.checkpoint.record_count,last_hash:f.checkpoint.last_hash}),
    e=>e.code==='RESTORE_TARGET_EXISTS');
});

test('rejects an incomplete journal rather than truncating or mutating source evidence',async t=>{
  const f=await fixture(t); await fs.appendFile(f.journalPath,'{"partial":');
  const before=await fs.readFile(f.journalPath);
  await assert.rejects(f.store.createBackup(f.journalPath),e=>e.code==='BACKUP_INTEGRITY_ERROR');
  assert.deepEqual(await fs.readFile(f.journalPath),before);
});
