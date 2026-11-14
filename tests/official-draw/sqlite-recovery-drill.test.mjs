import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { inspectLogicalDatabase, runSQLiteRecoveryDrill } from './sqlite-recovery-drill.mjs';

async function fixture(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mps-p129-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const source=path.join(dir,'source.sqlite'),db=new DatabaseSync(source);
  db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE participants(id INTEGER PRIMARY KEY, synthetic_ref TEXT NOT NULL, state TEXT NOT NULL) STRICT;
    CREATE TABLE draw_records(id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL, version INTEGER NOT NULL) STRICT;
    CREATE TABLE idempotency_operations(operation_key TEXT PRIMARY KEY, request_digest TEXT NOT NULL) STRICT;
    CREATE TABLE notification_outbox(id INTEGER PRIMARY KEY, status TEXT NOT NULL) STRICT;
    INSERT INTO participants VALUES(1,'SYN-001','ELIGIBLE'),(2,'SYN-002','ELIGIBLE');
    INSERT INTO draw_records VALUES('DRAW-SYN-1','CP-SYN-7',7);
    INSERT INTO idempotency_operations VALUES('IDEM-SYN-1','${'a'.repeat(64)}');
    INSERT INTO notification_outbox VALUES(1,'PENDING');
  `);
  db.close();
  const checkpoint=inspectLogicalDatabase(source);
  const backup=path.join(dir,'backup.sqlite'),target=path.join(dir,'restored.sqlite');
  return {dir,source,checkpoint,backup,target,sourcePath:source,backupPath:backup,targetPath:target};
}
const timing={createdAt:'2026-11-11T00:00:00.000Z',now:'2026-11-11T01:00:00.000Z',maxAgeMs:24*60*60*1000};

test('end-to-end drill restores all tables and verifies exact logical checkpoint while preserving source',async t=>{
 const f=await fixture(t),before=inspectLogicalDatabase(f.source);
 const result=await runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing});
 assert.equal(result.status,'RECOVERY_DRILL_VERIFIED');
 assert.equal(result.sourceUnchanged,true);
 assert.deepEqual(result.restoredCheckpoint,f.checkpoint);
 assert.deepEqual(inspectLogicalDatabase(f.source),before);
 const restored=new DatabaseSync(f.target);
 for(const [table,count] of Object.entries(f.checkpoint.tableCounts))
   assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n,count);
 restored.close();
});

test('rejects missing, malformed, or mismatched expected checkpoint before creating artifacts',async t=>{
 const f=await fixture(t);
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:null,...timing}),e=>e.code==='CHECKPOINT_INVALID');
 const wrong={...f.checkpoint,logicalSha256:'0'.repeat(64)};
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:wrong,...timing}),e=>e.code==='SOURCE_CHECKPOINT_MISMATCH');
 await assert.rejects(fs.stat(f.backup),e=>e.code==='ENOENT');
});

test('rejects a checkpoint with altered table count and leaves source untouched',async t=>{
 const f=await fixture(t),before=inspectLogicalDatabase(f.source);
 const wrong={...f.checkpoint,tableCounts:{...f.checkpoint.tableCounts,participants:999}};
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:wrong,...timing}),e=>e.code==='SOURCE_CHECKPOINT_MISMATCH');
 assert.deepEqual(inspectLogicalDatabase(f.source),before);
});

test('preserves backup after interruption and does not silently restart the drill',async t=>{
 const f=await fixture(t);
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing,
  faultInjector:stage=>stage==='AFTER_BACKUP'}),e=>e.code==='DRILL_RECONCILIATION_REQUIRED');
 assert.ok((await fs.stat(f.backup)).size>0);
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing}),e=>e.code==='BACKUP_TARGET_EXISTS');
});

test('preserves partially restored target and requires explicit reconciliation after restore interruption',async t=>{
 const f=await fixture(t);
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing,
  faultInjector:stage=>stage==='RESTORE_AFTER_COPY'}),e=>e.code==='RESTORE_RECONCILIATION_REQUIRED');
 assert.ok((await fs.stat(f.target)).size>0);
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing}),e=>e.code==='BACKUP_TARGET_EXISTS');
});

test('detects source mutation during drill and does not report a verified recovery',async t=>{
 const f=await fixture(t);
 const original=inspectLogicalDatabase;
 // Inject mutation only after the backup/restore stage via the AFTER_RESTORE hook.
 await assert.rejects(runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing,
  faultInjector:stage=>{
    if(stage==='AFTER_RESTORE') {
      const db=new DatabaseSync(f.source); db.exec("UPDATE participants SET state='CHANGED' WHERE id=1"); db.close();
      return false;
    }
    return false;
  }}),e=>e.code==='SOURCE_MUTATED');
 assert.notDeepEqual(inspectLogicalDatabase(f.source),f.checkpoint);
});

test('detects restored logical row tampering even if SQLite remains structurally valid',async t=>{
 const f=await fixture(t);
 await runSQLiteRecoveryDrill({...f,expectedCheckpoint:f.checkpoint,...timing});
 const db=new DatabaseSync(f.target); db.exec("UPDATE participants SET state='TAMPERED' WHERE id=1"); db.close();
 assert.notDeepEqual(inspectLogicalDatabase(f.target),f.checkpoint);
 assert.equal(inspectLogicalDatabase(f.target).schemaSha256,f.checkpoint.schemaSha256);
});
