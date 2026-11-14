/**
 * P1.28 — verified SQLite backup and restore contract.
 * TEST ONLY: local files, synthetic DBs; no production recovery or external trust anchor.
 */
import { DatabaseSync } from 'node:sqlite';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const exactKeys=(v,keys)=>v && typeof v==='object' && !Array.isArray(v) &&
  Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const MANIFEST_KEYS=['formatVersion','createdAt','bytes','sha256','pageCount','schemaSha256','integrity'];
const EVIDENCE_KEYS=['createdAt','bytes','sha256','schemaSha256'];

function assertAbsolute(file) {
  if(typeof file!=='string'||!path.isAbsolute(file)||file.length>4096) throw fail('VALIDATION_ERROR','Absolute file path required.');
}
async function regularFile(file) {
  const st=await fs.lstat(file);
  if(!st.isFile()||st.isSymbolicLink()) throw fail('BACKUP_INTEGRITY_ERROR','Expected regular non-symlink file.');
  return st;
}
function inspectDatabase(file) {
  const db=new DatabaseSync(file);
  try {
    const integrity=Object.values(db.prepare('PRAGMA integrity_check').get())[0];
    const quick=Object.values(db.prepare('PRAGMA quick_check').get())[0];
    if(integrity!=='ok'||quick!=='ok') throw fail('BACKUP_INTEGRITY_ERROR','SQLite integrity check failed.');
    const pageCount=Object.values(db.prepare('PRAGMA page_count').get())[0];
    const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name,tbl_name").all();
    const schemaSha256=sha256(Buffer.from(JSON.stringify(schema),'utf8'));
    return {pageCount,schemaSha256,integrity};
  } finally { db.close(); }
}
async function digestFile(file) {
  await regularFile(file);
  const bytes=await fs.readFile(file);
  return {bytes:bytes.length,sha256:sha256(bytes)};
}
function validateManifest(m) {
  if(!exactKeys(m,MANIFEST_KEYS)||m.formatVersion!==1||
     typeof m.createdAt!=='string'||!Number.isFinite(Date.parse(m.createdAt))||
     !Number.isSafeInteger(m.bytes)||m.bytes<1||
     !/^[a-f0-9]{64}$/.test(m.sha256)||!Number.isSafeInteger(m.pageCount)||m.pageCount<1||
     !/^[a-f0-9]{64}$/.test(m.schemaSha256)||m.integrity!=='ok') {
    throw fail('BACKUP_INTEGRITY_ERROR','Backup manifest schema or values are invalid.');
  }
}
function validateEvidence(e) {
  if(!exactKeys(e,EVIDENCE_KEYS)||typeof e.createdAt!=='string'||!Number.isFinite(Date.parse(e.createdAt))||
     !Number.isSafeInteger(e.bytes)||e.bytes<1||!/^[a-f0-9]{64}$/.test(e.sha256)||
     !/^[a-f0-9]{64}$/.test(e.schemaSha256)) {
    throw fail('BACKUP_INTEGRITY_ERROR','Independent expected evidence is invalid.');
  }
}

export async function createVerifiedSQLiteBackup(sourcePath,backupPath,{createdAt=new Date().toISOString()}={}) {
  assertAbsolute(sourcePath); assertAbsolute(backupPath);
  if(path.resolve(sourcePath)===path.resolve(backupPath)) throw fail('VALIDATION_ERROR','Backup must not equal source.');
  if(!Number.isFinite(Date.parse(createdAt))) throw fail('VALIDATION_ERROR','Invalid backup timestamp.');
  await regularFile(sourcePath);
  try { await fs.lstat(backupPath); throw fail('BACKUP_TARGET_EXISTS','Backup target already exists.'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  const parent=path.dirname(backupPath);
  const source=new DatabaseSync(sourcePath);
  try {
    const sourceCheck=inspectDatabase(sourcePath);
    const escaped=backupPath.replaceAll("'","''");
    source.exec("VACUUM INTO '"+escaped+"'");
    const targetStat=await regularFile(backupPath);
    const file=await digestFile(backupPath);
    const check=inspectDatabase(backupPath);
    if(check.integrity!=='ok'||check.schemaSha256!==sourceCheck.schemaSha256||check.pageCount!==sourceCheck.pageCount) {
      throw fail('BACKUP_INTEGRITY_ERROR','Backup does not match source schema/page checkpoint.');
    }
    const handle=await fs.open(backupPath,'r'); try { await handle.sync(); } finally { await handle.close(); }
    await (async()=>{const h=await fs.open(parent,'r');try{await h.sync();}finally{await h.close();}})();
    return Object.freeze({formatVersion:1,createdAt,bytes:file.bytes,sha256:file.sha256,pageCount:check.pageCount,schemaSha256:check.schemaSha256,integrity:'ok'});
  } catch(error) {
    // Never silently remove a possibly useful partial backup artifact.
    throw error;
  } finally { source.close(); }
}

export async function restoreVerifiedSQLiteBackup(backupPath,targetPath,manifest,expectedEvidence,{
  now=new Date().toISOString(),maxAgeMs=7*24*60*60*1000,faultInjector=null
}={}) {
  assertAbsolute(backupPath); assertAbsolute(targetPath);
  if(path.resolve(backupPath)===path.resolve(targetPath)) throw fail('VALIDATION_ERROR','Restore target must be new and distinct.');
  validateManifest(manifest); validateEvidence(expectedEvidence);
  if(!Number.isFinite(Date.parse(now))||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<0) throw fail('VALIDATION_ERROR','Invalid restore time policy.');
  const age=Date.parse(now)-Date.parse(manifest.createdAt);
  if(age<0||age>maxAgeMs) throw fail('STALE_BACKUP','Backup is future-dated or outside the allowed age.');
  for(const k of EVIDENCE_KEYS) if(manifest[k]!==expectedEvidence[k]) throw fail('BACKUP_EVIDENCE_MISMATCH','Manifest differs from separately supplied expected evidence.');
  const backupFile=await digestFile(backupPath);
  if(backupFile.bytes!==manifest.bytes||backupFile.sha256!==manifest.sha256) throw fail('BACKUP_INTEGRITY_ERROR','Backup byte digest/size mismatch.');
  const backupCheck=inspectDatabase(backupPath);
  if(backupCheck.integrity!=='ok'||backupCheck.pageCount!==manifest.pageCount||backupCheck.schemaSha256!==manifest.schemaSha256) {
    throw fail('BACKUP_INTEGRITY_ERROR','Backup SQLite integrity/schema checkpoint mismatch.');
  }
  const parent=path.dirname(targetPath);
  const parentStat=await fs.stat(parent);
  if(!parentStat.isDirectory()) throw fail('VALIDATION_ERROR','Restore parent must be an existing directory.');
  try { await fs.lstat(targetPath); throw fail('RESTORE_TARGET_EXISTS','Restore target already exists.'); }
  catch(e) { if(e.code!=='ENOENT') throw e; }
  try {
    await fs.copyFile(backupPath,targetPath,0x1);
    if(faultInjector?.('AFTER_COPY')===true) throw fail('RESTORE_RECONCILIATION_REQUIRED','Injected interruption after target creation.');
    const h=await fs.open(targetPath,'r'); try { await h.sync(); } finally { await h.close(); }
    const d=await fs.open(parent,'r'); try { await d.sync(); } finally { await d.close(); }
    if(faultInjector?.('AFTER_SYNC')===true) throw fail('RESTORE_RECONCILIATION_REQUIRED','Injected interruption after target sync.');
    const restoredFile=await digestFile(targetPath);
    const restoredCheck=inspectDatabase(targetPath);
    if(restoredFile.bytes!==manifest.bytes||restoredFile.sha256!==manifest.sha256||
       restoredCheck.integrity!=='ok'||restoredCheck.schemaSha256!==manifest.schemaSha256||
       restoredCheck.pageCount!==manifest.pageCount) {
      throw fail('RESTORE_RECONCILIATION_REQUIRED','Restored target readback differs from verified backup.');
    }
    return Object.freeze({status:'RESTORED_VERIFIED',bytes:restoredFile.bytes,sha256:restoredFile.sha256,
      pageCount:restoredCheck.pageCount,schemaSha256:restoredCheck.schemaSha256,integrity:'ok'});
  } catch(error) {
    if(error.code==='RESTORE_RECONCILIATION_REQUIRED') throw error;
    if(['RESTORE_TARGET_EXISTS','VALIDATION_ERROR','STALE_BACKUP','BACKUP_EVIDENCE_MISMATCH','BACKUP_INTEGRITY_ERROR'].includes(error.code)) throw error;
    throw fail('RESTORE_RECONCILIATION_REQUIRED','Restore may have created a partial target; preserve it and reconcile before retry.');
  }
}
