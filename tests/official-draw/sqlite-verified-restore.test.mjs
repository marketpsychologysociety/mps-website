import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createVerifiedSQLiteBackup, restoreVerifiedSQLiteBackup } from './sqlite-verified-restore.mjs';

async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-p128-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source.sqlite');
  const db=new DatabaseSync(source);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE participants(id INTEGER PRIMARY KEY, synthetic_ref TEXT NOT NULL, state TEXT NOT NULL) STRICT; INSERT INTO participants VALUES(1,'SYN-001','ELIGIBLE'),(2,'SYN-002','ELIGIBLE');");
  db.close();
  const backup=path.join(dir,'backup.sqlite');
  const createdAt='2026-11-11T00:00:00.000Z';
  const manifest=await createVerifiedSQLiteBackup(source,backup,{createdAt});
  const evidence={createdAt:manifest.createdAt,bytes:manifest.bytes,sha256:manifest.sha256,schemaSha256:manifest.schemaSha256};
  return {dir,source,backup,manifest,evidence};
}
const options={now:'2026-11-11T01:00:00.000Z',maxAgeMs:24*60*60*1000};

test('creates a consistent SQLite backup including committed rows and independently checks its integrity',async t=>{
 const f=await fixture(t);
 const backup=new DatabaseSync(f.backup);
 assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM participants').get().n,2);
 backup.close();
 const source=new DatabaseSync(f.source);
 assert.equal(source.prepare('SELECT COUNT(*) AS n FROM participants').get().n,2);
 source.close();
});

test('restores only after manifest, separately supplied digest evidence and SQLite integrity all match',async t=>{
 const f=await fixture(t), target=path.join(f.dir,'recovered','restored.sqlite');
 await fs.mkdir(path.dirname(target));
 const result=await restoreVerifiedSQLiteBackup(f.backup,target,f.manifest,f.evidence,options);
 assert.equal(result.status,'RESTORED_VERIFIED');
 assert.equal(result.sha256,f.manifest.sha256);
 const restored=new DatabaseSync(target);
 assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 assert.deepEqual(restored.prepare('SELECT id,synthetic_ref,state FROM participants ORDER BY id').all()
  .map(row=>({id:row.id,synthetic_ref:row.synthetic_ref,state:row.state})),
  [{id:1,synthetic_ref:'SYN-001',state:'ELIGIBLE'},{id:2,synthetic_ref:'SYN-002',state:'ELIGIBLE'}]);
 restored.close();
});

test('rejects a tampered backup before creating any restore target',async t=>{
 const f=await fixture(t), target=path.join(f.dir,'target.sqlite');
 const bytes=await fs.readFile(f.backup); bytes[bytes.length-1]^=1; await fs.writeFile(f.backup,bytes);
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,target,f.manifest,f.evidence,options),e=>e.code==='BACKUP_INTEGRITY_ERROR');
 await assert.rejects(fs.stat(target),e=>e.code==='ENOENT');
});

test('rejects stale backup and independently mismatched evidence before restore',async t=>{
 const f=await fixture(t), staleTarget=path.join(f.dir,'stale.sqlite');
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,staleTarget,f.manifest,f.evidence,
  {now:'2026-11-20T00:00:00.000Z',maxAgeMs:24*60*60*1000}),e=>e.code==='STALE_BACKUP');
 const bad={...f.evidence,sha256:'0'.repeat(64)};
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,path.join(f.dir,'mismatch.sqlite'),f.manifest,bad,options),
  e=>e.code==='BACKUP_EVIDENCE_MISMATCH');
});

test('never overwrites existing restore target or source database',async t=>{
 const f=await fixture(t), target=path.join(f.dir,'existing.sqlite');
 await fs.writeFile(target,'preserve-this-target');
 const sourceBefore=await fs.readFile(f.source);
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,target,f.manifest,f.evidence,options),e=>e.code==='RESTORE_TARGET_EXISTS');
 assert.equal(await fs.readFile(target,'utf8'),'preserve-this-target');
 assert.deepEqual(await fs.readFile(f.source),sourceBefore);
});

test('interrupted restore preserves the created target and refuses a blind retry',async t=>{
 const f=await fixture(t), target=path.join(f.dir,'interrupted.sqlite');
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,target,f.manifest,f.evidence,{...options,faultInjector:s=>s==='AFTER_COPY'}),
  e=>e.code==='RESTORE_RECONCILIATION_REQUIRED');
 const preserved=await fs.readFile(target);
 assert.equal(preserved.length,f.manifest.bytes);
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,target,f.manifest,f.evidence,options),e=>e.code==='RESTORE_TARGET_EXISTS');
});

test('rejects malformed or unknown manifest fields without touching backup or target',async t=>{
 const f=await fixture(t), target=path.join(f.dir,'bad-manifest.sqlite');
 const bad={...f.manifest,unexpected:'field'};
 await assert.rejects(restoreVerifiedSQLiteBackup(f.backup,target,bad,f.evidence,options),e=>e.code==='BACKUP_INTEGRITY_ERROR');
 await assert.rejects(fs.stat(target),e=>e.code==='ENOENT');
});
