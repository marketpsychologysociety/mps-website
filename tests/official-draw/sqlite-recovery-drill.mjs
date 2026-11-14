/**
 * P1.29 — end-to-end SQLite recovery drill.
 * TEST ONLY: synthetic local database and temporary files; never production recovery.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createVerifiedSQLiteBackup, restoreVerifiedSQLiteBackup } from './sqlite-verified-restore.mjs';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const sha256=value=>createHash('sha256').update(value).digest('hex');
const CHECKPOINT_KEYS=['formatVersion','schemaSha256','logicalSha256','tableCounts'];
const EXPECTED_KEYS=['formatVersion','schemaSha256','logicalSha256','tableCounts'];
const canonical=value=>{
  if(value===null||typeof value==='string'||typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number') {
    if(!Number.isFinite(value)) throw fail('CHECKPOINT_INVALID','Non-finite SQLite value.');
    return JSON.stringify(value);
  }
  if(typeof value==='bigint') return JSON.stringify({$integer:value.toString()});
  if(value instanceof Uint8Array) return JSON.stringify({$blob:Buffer.from(value).toString('hex')});
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw fail('CHECKPOINT_INVALID','Unsupported SQLite value.');
};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const quote=id=>'"'+String(id).replaceAll('"','""')+'"';
function inspectLogicalDatabase(file) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    const integrity=db.prepare('PRAGMA integrity_check').get();
    if(Object.values(integrity)[0]!=='ok') throw fail('CHECKPOINT_INVALID','Source database integrity check failed.');
    const objects=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name,tbl_name").all();
    const schemaSha256=sha256(canonical(objects));
    const tables=objects.filter(x=>x.type==='table').map(x=>x.name).sort();
    const tableCounts={};
    const tableRows=[];
    for(const name of tables) {
      const rows=db.prepare('SELECT * FROM '+quote(name)).all().map(row=>canonical(row)).sort();
      tableCounts[name]=rows.length;
      tableRows.push({name,rows});
    }
    return Object.freeze({formatVersion:1,schemaSha256,logicalSha256:sha256(canonical(tableRows)),tableCounts:Object.freeze(tableCounts)});
  } finally { db.close(); }
}
function validateCheckpoint(cp) {
  if(!exact(cp,CHECKPOINT_KEYS)||cp.formatVersion!==1||
     !/^[a-f0-9]{64}$/.test(cp.schemaSha256)||!/^[a-f0-9]{64}$/.test(cp.logicalSha256)||
     !cp.tableCounts||typeof cp.tableCounts!=='object'||Array.isArray(cp.tableCounts)) {
    throw fail('CHECKPOINT_INVALID','Expected checkpoint schema is invalid.');
  }
  for(const [name,count] of Object.entries(cp.tableCounts)) {
    if(!name||name.length>256||!Number.isSafeInteger(count)||count<0) throw fail('CHECKPOINT_INVALID','Expected table counts are invalid.');
  }
  if(Object.keys(cp.tableCounts).length===0) throw fail('CHECKPOINT_INVALID','Expected checkpoint must contain at least one table.');
}
function sameCheckpoint(a,b) { return canonical(a)===canonical(b); }
function assertAbsolute(file) { if(typeof file!=='string'||!path.isAbsolute(file)||file.length>4096) throw fail('VALIDATION_ERROR','Absolute file path required.'); }

/**
 * Run a full backup -> restore -> logical reconciliation drill.
 * expectedCheckpoint must be obtained from an independently controlled source in a real deployment.
 * This synthetic harness does not authenticate that authority.
 */
export async function runSQLiteRecoveryDrill({sourcePath,backupPath,targetPath,expectedCheckpoint,createdAt,now,maxAgeMs,faultInjector=null}) {
  assertAbsolute(sourcePath); assertAbsolute(backupPath); assertAbsolute(targetPath);
  validateCheckpoint(expectedCheckpoint);
  if(new Set([sourcePath,backupPath,targetPath].map(x=>path.resolve(x))).size!==3) throw fail('VALIDATION_ERROR','Source, backup and restore paths must be distinct.');
  const sourceBefore=inspectLogicalDatabase(sourcePath);
  if(!sameCheckpoint(sourceBefore,expectedCheckpoint)) throw fail('SOURCE_CHECKPOINT_MISMATCH','Source does not match the independently supplied expected checkpoint.');
  const backupManifest=await createVerifiedSQLiteBackup(sourcePath,backupPath,{createdAt});
  if(faultInjector?.('AFTER_BACKUP')===true) throw fail('DRILL_RECONCILIATION_REQUIRED','Interrupted after backup creation; preserve backup and reconcile.');
  const evidence={createdAt:backupManifest.createdAt,bytes:backupManifest.bytes,sha256:backupManifest.sha256,schemaSha256:backupManifest.schemaSha256};
  const restore=await restoreVerifiedSQLiteBackup(backupPath,targetPath,backupManifest,evidence,{now,maxAgeMs,
    faultInjector:stage=>faultInjector?.('RESTORE_'+stage)===true});
  if(faultInjector?.('AFTER_RESTORE')===true) throw fail('DRILL_RECONCILIATION_REQUIRED','Interrupted after restore; preserve target and reconcile.');
  const restored=inspectLogicalDatabase(targetPath);
  const sourceAfter=inspectLogicalDatabase(sourcePath);
  if(!sameCheckpoint(restored,expectedCheckpoint)) throw fail('RESTORED_CHECKPOINT_MISMATCH','Restored logical contents differ from expected checkpoint.');
  if(!sameCheckpoint(sourceAfter,sourceBefore)) throw fail('SOURCE_MUTATED','Source database changed during recovery drill.');
  const backupStat=await fs.stat(backupPath);
  return Object.freeze({status:'RECOVERY_DRILL_VERIFIED',checkpoint:expectedCheckpoint,
    restoredCheckpoint:restored,sourceUnchanged:true,backupBytes:backupStat.size,
    backupSha256:backupManifest.sha256,restoreStatus:restore.status});
}

export { inspectLogicalDatabase };
