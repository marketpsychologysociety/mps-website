/**
 * MPS P1.15 — independent backup and restore verifier.
 * TEST ONLY: local filesystem, synthetic journal records, same-host semantics.
 * No cloud backup, external trust anchor, production integration, or PII.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const GENESIS = 'GENESIS';
const HASH_RE = /^[a-f0-9]{64}$/;
const MANIFEST_FIELDS = ['format_version','backup_id','sequence','last_hash','journal_sha256','journal_bytes','created_at'];
const RECORD_FIELDS = ['seq','type','operation_id','idempotency_key','actor_subject','target_id','payload_digest','result','created_at','prev_hash','hash'];
const RESULT_FIELDS = new Set(['state','status','code','synthetic','result_digest','proof_digest','aggregate']);
const AGGREGATE_FIELDS = new Set(['kind','entity_id','event_id','state','version','owner_subject','created_by_subject','approved_by_subject','rules_hash','title_public','operation_count']);

const fail = (code, message) => Object.assign(new Error(message), { code });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const syncDir = async directory => { const h = await fs.open(directory, 'r'); try { await h.sync(); } finally { await h.close(); } };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function recordCore(r) {
  return { seq:r.seq, type:r.type, operation_id:r.operation_id, idempotency_key:r.idempotency_key,
    actor_subject:r.actor_subject, target_id:r.target_id, payload_digest:r.payload_digest,
    result:r.result ?? null, created_at:r.created_at, prev_hash:r.prev_hash };
}

function verifyResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).length === 0 ||
      Object.keys(result).some(k => !RESULT_FIELDS.has(k))) throw fail('BACKUP_INTEGRITY_ERROR','Completion result schema is invalid.');
  for (const [key,value] of Object.entries(result)) {
    if (key === 'aggregate') {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.keys(value).some(k => !AGGREGATE_FIELDS.has(k)) ||
          !['EVENT','DRAW'].includes(value.kind) || typeof value.entity_id !== 'string' ||
          typeof value.state !== 'string' || !Number.isSafeInteger(value.version) || value.version < 1) {
        throw fail('BACKUP_INTEGRITY_ERROR','Aggregate schema is invalid.');
      }
    } else if (!['string','number','boolean'].includes(typeof value) ||
      (typeof value === 'string' && value.length > 256) ||
      (typeof value === 'number' && !Number.isFinite(value))) {
      throw fail('BACKUP_INTEGRITY_ERROR','Completion value is invalid.');
    }
  }
}

export function verifyJournalBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || (bytes.length && bytes[bytes.length-1] !== 10)) {
    throw fail('BACKUP_INTEGRITY_ERROR','Journal is not newline-terminated; incomplete tails are not silently repaired in backup verification.');
  }
  const text = bytes.toString('utf8');
  if (!text) return { sequence:0, last_hash:GENESIS, operation_count:0 };
  const lines = text.slice(0,-1).split('\n');
  let lastHash = GENESIS;
  const operations = new Map();
  const idempotency = new Set();
  for (let i=0;i<lines.length;i++) {
    let r;
    try { r=JSON.parse(lines[i]); } catch { throw fail('BACKUP_INTEGRITY_ERROR','Malformed complete journal JSON.'); }
    if (!exactKeys(r,RECORD_FIELDS) || r.seq !== i+1 || !['INTENT','COMPLETION'].includes(r.type) ||
        ['operation_id','idempotency_key','actor_subject','target_id','created_at'].some(k=>typeof r[k] !== 'string' || !r[k]) ||
        !HASH_RE.test(r.payload_digest) || r.prev_hash !== lastHash || !HASH_RE.test(r.hash)) {
      throw fail('BACKUP_INTEGRITY_ERROR','Journal record schema, sequence, or chain predecessor is invalid.');
    }
    if (r.type === 'INTENT') {
      if (r.result !== null || operations.has(r.operation_id)) throw fail('BACKUP_INTEGRITY_ERROR','Duplicate or malformed intent.');
      const scope = [r.target_id,r.actor_subject,r.idempotency_key].join(':');
      if (idempotency.has(scope)) throw fail('BACKUP_INTEGRITY_ERROR','Duplicate idempotency scope.');
      idempotency.add(scope); operations.set(r.operation_id,{intent:r,completed:false});
    } else {
      const prior=operations.get(r.operation_id);
      if (!prior || prior.completed || prior.intent.payload_digest!==r.payload_digest ||
          prior.intent.idempotency_key!==r.idempotency_key || prior.intent.actor_subject!==r.actor_subject ||
          prior.intent.target_id!==r.target_id) throw fail('BACKUP_INTEGRITY_ERROR','Completion has no unique matching intent.');
      verifyResult(r.result); prior.completed=true;
    }
    if (sha256(JSON.stringify(recordCore(r)))!==r.hash) throw fail('BACKUP_INTEGRITY_ERROR',`Journal hash mismatch at sequence ${r.seq}.`);
    lastHash=r.hash;
  }
  return { sequence:lines.length, last_hash:lastHash, operation_count:operations.size };
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || !Number.isSafeInteger(checkpoint.sequence) || checkpoint.sequence < 0 ||
      (checkpoint.sequence===0 ? checkpoint.last_hash!==GENESIS : !HASH_RE.test(checkpoint.last_hash))) {
    throw fail('VALIDATION_ERROR','Expected checkpoint must contain a valid sequence and hash.');
  }
}

async function writeExclusive(file, bytes, fault, stage) {
  const h=await fs.open(file,'wx',0o600);
  try {
    await h.writeFile(bytes);
    if (fault?.(stage+'_AFTER_WRITE')===true) throw fail('INJECTED_FAILURE','Synthetic interruption after write.');
    await h.sync();
    if (fault?.(stage+'_AFTER_SYNC')===true) throw fail('INJECTED_FAILURE','Synthetic interruption after fsync.');
  } finally { await h.close(); }
}

async function safeRegularFile(file) {
  const st=await fs.lstat(file);
  if (!st.isFile() || st.isSymbolicLink()) throw fail('BACKUP_INTEGRITY_ERROR','Expected a regular non-symlink file.');
}

export class SyntheticBackupStore {
  constructor(root,{faultInjector=null}={}) {
    if (typeof root!=='string' || !path.isAbsolute(root)) throw fail('VALIDATION_ERROR','Backup root must be absolute.');
    this.root=root; this.faultInjector=faultInjector;
  }
  async initialize() { await fs.mkdir(this.root,{recursive:true,mode:0o700}); }

  async createBackup(journalPath) {
    await this.initialize();
    await safeRegularFile(journalPath);
    const bytes=await fs.readFile(journalPath);
    const checkpoint=verifyJournalBytes(bytes);
    const backupId=randomUUID();
    const stage=path.join(this.root,'.staging-'+backupId);
    const final=path.join(this.root,backupId);
    await fs.mkdir(stage,{mode:0o700});
    try {
      await writeExclusive(path.join(stage,'audit.journal.jsonl'),bytes,this.faultInjector,'BACKUP_DATA');
      const manifest={format_version:1,backup_id:backupId,sequence:checkpoint.sequence,last_hash:checkpoint.last_hash,
        journal_sha256:sha256(bytes),journal_bytes:bytes.length,created_at:new Date().toISOString()};
      const manifestBytes=Buffer.from(JSON.stringify(manifest)+'\n');
      await writeExclusive(path.join(stage,'manifest.json'),manifestBytes,this.faultInjector,'BACKUP_MANIFEST');
      await syncDir(stage);
      if (this.faultInjector?.('BEFORE_PUBLISH')===true) throw fail('INJECTED_FAILURE','Synthetic interruption before backup publication.');
      try { await fs.lstat(final); throw fail('BACKUP_CONFLICT','Backup destination already exists.'); }
      catch(e) { if(e.code!=='ENOENT') throw e; }
      await fs.rename(stage,final);
      await syncDir(this.root);
      return {backup_id:backupId,...checkpoint,journal_sha256:manifest.journal_sha256};
    } catch(error) {
      // Preserve incomplete staging evidence for manual inspection; never auto-delete it.
      throw error;
    }
  }

  async verifyBackup(backupId) {
    if (typeof backupId!=='string' || !/^[0-9a-f-]{36}$/.test(backupId)) throw fail('VALIDATION_ERROR','Invalid backup identifier.');
    const dir=path.join(this.root,backupId);
    const st=await fs.lstat(dir);
    if (!st.isDirectory() || st.isSymbolicLink()) throw fail('BACKUP_INTEGRITY_ERROR','Backup path is not a real directory.');
    const journalPath=path.join(dir,'audit.journal.jsonl');
    const manifestPath=path.join(dir,'manifest.json');
    await safeRegularFile(journalPath); await safeRegularFile(manifestPath);
    const [bytes,manifestBytes]=await Promise.all([fs.readFile(journalPath),fs.readFile(manifestPath)]);
    let manifest;
    try { manifest=JSON.parse(manifestBytes.toString('utf8')); } catch { throw fail('BACKUP_INTEGRITY_ERROR','Manifest JSON is malformed.'); }
    if (!exactKeys(manifest,MANIFEST_FIELDS) || manifest.format_version!==1 || manifest.backup_id!==backupId ||
        !Number.isSafeInteger(manifest.sequence) || manifest.sequence<0 || !HASH_RE.test(manifest.journal_sha256) ||
        !Number.isSafeInteger(manifest.journal_bytes) || manifest.journal_bytes!==bytes.length ||
        typeof manifest.created_at!=='string' || !manifest.created_at) throw fail('BACKUP_INTEGRITY_ERROR','Manifest schema is invalid.');
    const checkpoint=verifyJournalBytes(bytes);
    if (sha256(bytes)!==manifest.journal_sha256 || checkpoint.sequence!==manifest.sequence || checkpoint.last_hash!==manifest.last_hash) {
      throw fail('BACKUP_INTEGRITY_ERROR','Backup manifest does not match journal bytes or checkpoint.');
    }
    return {backup_id:backupId,...checkpoint,journal_sha256:manifest.journal_sha256,journal_bytes:bytes.length};
  }

  async restoreToNewTarget(backupId,targetPath,currentCheckpoint) {
    validateCheckpoint(currentCheckpoint);
    const verified=await this.verifyBackup(backupId);
    if (verified.sequence<currentCheckpoint.sequence ||
        (verified.sequence===currentCheckpoint.sequence && verified.last_hash!==currentCheckpoint.last_hash)) {
      throw fail('STALE_BACKUP','Backup is older than or conflicts with the current evidence checkpoint.');
    }
    if (typeof targetPath!=='string' || !path.isAbsolute(targetPath)) throw fail('VALIDATION_ERROR','Restore target must be an absolute path.');
    await fs.mkdir(path.dirname(targetPath),{recursive:true,mode:0o700});
    try { await fs.lstat(targetPath); throw fail('RESTORE_TARGET_EXISTS','Restore never overwrites an existing target.'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    const source=path.join(this.root,backupId,'audit.journal.jsonl');
    const bytes=await fs.readFile(source);
    await writeExclusive(targetPath,bytes,this.faultInjector,'RESTORE');
    await syncDir(path.dirname(targetPath));
    if (this.faultInjector?.('AFTER_RESTORE_PUBLISH')===true) throw fail('RECONCILIATION_REQUIRED','Restore bytes may exist; verify target before retrying.');
    await safeRegularFile(targetPath);
    const restored=verifyJournalBytes(await fs.readFile(targetPath));
    if (restored.sequence!==verified.sequence || restored.last_hash!==verified.last_hash) throw fail('RESTORE_VERIFY_FAILED','Restored target differs from verified backup.');
    return {target_path:targetPath,...restored,backup_id:backupId};
  }
}
