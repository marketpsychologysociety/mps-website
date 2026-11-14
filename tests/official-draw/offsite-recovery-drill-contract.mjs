/**
 * P1.16 off-site backup and recovery drill evidence contract.
 * OFFLINE NORMALIZER ONLY: validates shape and consistency, not provider claims.
 * No cloud SDK, network, credentials, or production integration.
 */
import { createHash } from 'node:crypto';

const sha=/^[a-f0-9]{64}$/;
const fail=(code,msg)=>Object.assign(new Error(msg),{code});
const keys=(v,expected)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===expected.length&&expected.every(k=>Object.hasOwn(v,k));
const nonempty=v=>typeof v==='string'&&v.length>0&&v.length<=256;
const digest=v=>createHash('sha256').update(v).digest('hex');

const ROLE_KEYS=['source_writer','backup_writer','recovery_operator','independent_verifier','storage_admin','audit_admin'];
const ROLE_FIELDS=['subject','admin_boundary','account_boundary','mfa_attested'];
const TOP_FIELDS=['schema_version','drill_id','source','backup','identities','restore','audit','timing'];
const SOURCE_FIELDS=['provider','account_id','project_id','region','sequence','last_hash','payload_sha256','bytes'];
const BACKUP_FIELDS=['provider','account_id','project_id','region','object_key','generation','payload_sha256','object_sha256','encryption_key_ref','retention_mode','retention_until'];
const RESTORE_FIELDS=['target_is_new','target_overwrite','exact_generation_read','source_unchanged','source_before_sha256','source_after_sha256','restored_sha256','restored_sequence','restored_last_hash','independent_readback'];
const AUDIT_FIELDS=['writer_create','recovery_read','verifier_readback','denied_source_delete','policy_change','independent_export','complete_pagination'];
const TIMING_FIELDS=['started_at','completed_at','duration_ms','rpo_seconds','rto_seconds'];

function requireObject(v,fields,name){if(!keys(v,fields))throw fail('DRILL_SCHEMA_INVALID',name+' schema is invalid.');}
function validTime(v){return typeof v==='string'&&!Number.isNaN(Date.parse(v));}

export function verifyOffsiteRecoveryDrill(bundle,{expectedSourceCheckpoint,maximumRtoSeconds=3600,maximumRpoSeconds=86400}={}) {
  requireObject(bundle,TOP_FIELDS,'drill');
  if(bundle.schema_version!==1||!/^SYNTHETIC-DRILL-[A-Z0-9-]{4,80}$/.test(bundle.drill_id||''))throw fail('DRILL_SCHEMA_INVALID','Only version 1 synthetic drill IDs are accepted.');
  const s=bundle.source,b=bundle.backup,r=bundle.restore,a=bundle.audit,t=bundle.timing;
  requireObject(s,SOURCE_FIELDS,'source');requireObject(b,BACKUP_FIELDS,'backup');
  requireObject(r,RESTORE_FIELDS,'restore');requireObject(a,AUDIT_FIELDS,'audit');requireObject(t,TIMING_FIELDS,'timing');
  for(const [label,v] of [['source',s],['backup',b]]) {
    for(const k of ['provider','account_id','project_id','region'])if(!nonempty(v[k]))throw fail('DRILL_SCHEMA_INVALID',label+' identity fields are required.');
  }
  if(!Number.isSafeInteger(s.sequence)||s.sequence<0||!sha.test(s.last_hash||''))throw fail('DRILL_SCHEMA_INVALID','Source checkpoint is invalid.');
  if(!sha.test(s.last_hash)||!sha.test(s.payload_sha256)||!Number.isSafeInteger(s.bytes)||s.bytes<0||
     !sha.test(b.payload_sha256)||!sha.test(b.object_sha256)||!nonempty(b.object_key)||!nonempty(b.generation)||
     !nonempty(b.encryption_key_ref)||!validTime(b.retention_until))throw fail('DRILL_SCHEMA_INVALID','Source or backup evidence fields are invalid.');
  if(s.payload_sha256!==b.payload_sha256||b.object_sha256!==b.payload_sha256||s.bytes<=0)throw fail('DRILL_CONTENT_MISMATCH','Backup payload/object digest or source size does not match.');
  if(s.account_id===b.account_id||s.project_id===b.project_id)throw fail('ADMIN_BOUNDARY_NOT_INDEPENDENT','Backup must be in a separate account and project from source.');
  if(s.region===b.region)throw fail('REGION_SEPARATION_NOT_MET','Backup region must differ from source region for this drill contract.');
  if(!['COMPLIANCE_LOCKED','GOVERNANCE_LOCKED'].includes(b.retention_mode))throw fail('RETENTION_NOT_IMMUTABLE','Backup retention is not evidenced as locked.');
  if(!Array.isArray(bundle.identities)||bundle.identities.length!==ROLE_KEYS.length)throw fail('DRILL_SCHEMA_INVALID','All six role identities are required.');
  const roleMap=new Map();
  for(const item of bundle.identities) {
    requireObject(item,['role',...ROLE_FIELDS],'identity');
    if(!ROLE_KEYS.includes(item.role)||roleMap.has(item.role)||!nonempty(item.subject)||!nonempty(item.admin_boundary)||
       !nonempty(item.account_boundary)||item.mfa_attested!==true)throw fail('IDENTITY_SEPARATION_NOT_MET','Identity role, subject, boundary or MFA attestation is invalid.');
    roleMap.set(item.role,item);
  }
  if(ROLE_KEYS.some(k=>!roleMap.has(k)))throw fail('IDENTITY_SEPARATION_NOT_MET','A required role is missing.');
  const subjects=new Set([...roleMap.values()].map(x=>x.subject));
  if(subjects.size!==ROLE_KEYS.length)throw fail('IDENTITY_SEPARATION_NOT_MET','Privileged roles must use distinct subjects.');
  const writer=roleMap.get('source_writer'), backupWriter=roleMap.get('backup_writer'), verifier=roleMap.get('independent_verifier');
  const storage=roleMap.get('storage_admin'), audit=roleMap.get('audit_admin');
  if(writer.admin_boundary===verifier.admin_boundary||backupWriter.admin_boundary===verifier.admin_boundary||
     backupWriter.admin_boundary===storage.admin_boundary||storage.admin_boundary===audit.admin_boundary||
     backupWriter.account_boundary===audit.account_boundary)throw fail('ADMIN_BOUNDARY_NOT_INDEPENDENT','Writer, verifier, storage and audit boundaries are not independent.');
  for(const k of RESTORE_FIELDS)if(typeof r[k]!=='boolean'&&k!=='source_before_sha256'&&k!=='source_after_sha256'&&k!=='restored_sha256'&&k!=='restored_sequence'&&k!=='restored_last_hash')throw fail('DRILL_SCHEMA_INVALID','Restore assertions must be explicit booleans.');
  if(r.target_is_new!==true||r.target_overwrite!==false||r.exact_generation_read!==true||r.source_unchanged!==true||
     r.independent_readback!==true)throw fail('RESTORE_SAFETY_FAILED','Restore must use a new target, exact generation, independent readback, and preserve source.');
  for(const k of ['source_before_sha256','source_after_sha256','restored_sha256'])if(!sha.test(r[k]||''))throw fail('DRILL_SCHEMA_INVALID','Restore digest is invalid.');
  if(r.source_before_sha256!==r.source_after_sha256||r.source_before_sha256!==s.payload_sha256||
     r.restored_sha256!==b.payload_sha256||r.restored_sequence!==s.sequence||r.restored_last_hash!==s.last_hash)
    throw fail('RESTORE_CONTENT_MISMATCH','Source/backup/restore bytes or checkpoint differ.');
  for(const k of AUDIT_FIELDS)if(a[k]!==true)throw fail('AUDIT_COVERAGE_INCOMPLETE','Required independent audit evidence is missing: '+k);
  if(!validTime(t.started_at)||!validTime(t.completed_at)||!Number.isFinite(t.duration_ms)||t.duration_ms<0||
     !Number.isFinite(t.rpo_seconds)||t.rpo_seconds<0||!Number.isFinite(t.rto_seconds)||t.rto_seconds<0)
    throw fail('DRILL_SCHEMA_INVALID','Timing metrics are invalid.');
  if(Date.parse(t.completed_at)<Date.parse(t.started_at)||Math.abs((Date.parse(t.completed_at)-Date.parse(t.started_at))-t.duration_ms)>1000)
    throw fail('DRILL_TIMING_INVALID','Drill timing interval is inconsistent.');
  if(Date.parse(b.retention_until)<=Date.parse(t.completed_at))throw fail('RETENTION_NOT_IMMUTABLE','Retention evidence expires before the drill completed.');
  if(t.rto_seconds>maximumRtoSeconds||t.rpo_seconds>maximumRpoSeconds)throw fail('RECOVERY_OBJECTIVE_MISSED','Observed RPO/RTO exceeds configured limits.');
  if(!expectedSourceCheckpoint||!Number.isSafeInteger(expectedSourceCheckpoint.sequence)||!sha.test(expectedSourceCheckpoint.last_hash||''))throw fail('SOURCE_CHECKPOINT_MISMATCH','An independently established expected source checkpoint is required.');
  if(expectedSourceCheckpoint.sequence!==s.sequence||expectedSourceCheckpoint.last_hash!==s.last_hash)
    throw fail('SOURCE_CHECKPOINT_MISMATCH','Drill source checkpoint differs from independently expected checkpoint.');
  return {valid:true,drill_id:bundle.drill_id,source_sequence:s.sequence,source_last_hash:s.last_hash,
    backup_project:b.project_id,restore_digest:r.restored_sha256,rpo_seconds:t.rpo_seconds,rto_seconds:t.rto_seconds,
    verified_assertions:ROLE_KEYS.length+Object.keys(a).length+5};
}

// Exported only to support deterministic fixture builders in tests.
export const syntheticDigestForTest = value => digest(value);
