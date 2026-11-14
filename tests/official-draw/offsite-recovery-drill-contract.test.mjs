import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOffsiteRecoveryDrill, syntheticDigestForTest } from './offsite-recovery-drill-contract.mjs';

const h=s=>syntheticDigestForTest(s);
function fixture(){
 const payload='synthetic canonical checkpoint bytes';
 const roles=['source_writer','backup_writer','recovery_operator','independent_verifier','storage_admin','audit_admin'];
 return {
  schema_version:1,drill_id:'SYNTHETIC-DRILL-MPS-P116-0001',
  source:{provider:'synthetic-provider-a',account_id:'acct-source',project_id:'project-source',region:'region-a',sequence:12,last_hash:h('journal-head-12'),payload_sha256:h(payload),bytes:payload.length},
  backup:{provider:'synthetic-provider-b',account_id:'acct-backup',project_id:'project-backup',region:'region-b',object_key:'synthetic/evidence/12',generation:'1700000000000001',payload_sha256:h(payload),object_sha256:h(payload),encryption_key_ref:'kms-backup-key-v1',retention_mode:'COMPLIANCE_LOCKED',retention_until:'2030-01-01T00:00:00.000Z'},
  identities:roles.map((role,i)=>({role,subject:'synthetic-subject-'+i,admin_boundary:'admin-boundary-'+role,account_boundary:'account-boundary-'+role,mfa_attested:true})),
  restore:{target_is_new:true,target_overwrite:false,exact_generation_read:true,source_unchanged:true,source_before_sha256:h(payload),source_after_sha256:h(payload),restored_sha256:h(payload),restored_sequence:12,restored_last_hash:h('journal-head-12'),independent_readback:true},
  audit:{writer_create:true,recovery_read:true,verifier_readback:true,denied_source_delete:true,policy_change:true,independent_export:true,complete_pagination:true},
  timing:{started_at:'2026-11-11T03:00:00.000Z',completed_at:'2026-11-11T03:02:00.000Z',duration_ms:120000,rpo_seconds:0,rto_seconds:120}
 };
}
test('accepts a complete synthetic off-site recovery drill evidence bundle',()=>{
 const b=fixture(); const result=verifyOffsiteRecoveryDrill(b,{expectedSourceCheckpoint:{sequence:12,last_hash:b.source.last_hash}});
 assert.equal(result.valid,true);assert.equal(result.rto_seconds,120);
});
test('rejects same source and backup account/project',()=>{
 const b=fixture();b.backup.project_id=b.source.project_id;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='ADMIN_BOUNDARY_NOT_INDEPENDENT');
});
test('rejects same region under this geographic separation contract',()=>{
 const b=fixture();b.backup.region=b.source.region;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='REGION_SEPARATION_NOT_MET');
});
test('rejects non-locked retention evidence',()=>{
 const b=fixture();b.backup.retention_mode='UNLOCKED';
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='RETENTION_NOT_IMMUTABLE');
});
test('rejects duplicate human subjects across privileged roles',()=>{
 const b=fixture();b.identities[3].subject=b.identities[0].subject;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='IDENTITY_SEPARATION_NOT_MET');
});
test('rejects shared administrator boundaries',()=>{
 const b=fixture();b.identities[3].admin_boundary=b.identities[1].admin_boundary;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='ADMIN_BOUNDARY_NOT_INDEPENDENT');
});
test('rejects MFA assurance missing for any privileged identity',()=>{
 const b=fixture();b.identities[5].mfa_attested=false;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='IDENTITY_SEPARATION_NOT_MET');
});
test('rejects a backup payload digest mismatch',()=>{
 const b=fixture();b.backup.payload_sha256=h('other');
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='DRILL_CONTENT_MISMATCH');
});
test('rejects restore overwrite, wrong generation path, or changed source',()=>{
 const b=fixture();b.restore.target_overwrite=true;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='RESTORE_SAFETY_FAILED');
});
test('rejects a restore checkpoint fork or changed source bytes',()=>{
 const b=fixture();b.restore.restored_last_hash=h('fork');
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='RESTORE_CONTENT_MISMATCH');
});
test('rejects incomplete independent audit evidence',()=>{
 const b=fixture();b.audit.independent_export=false;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='AUDIT_COVERAGE_INCOMPLETE');
});
test('rejects RTO/RPO beyond declared objectives',()=>{
 const b=fixture();b.timing.rto_seconds=7200;
 assert.throws(()=>verifyOffsiteRecoveryDrill(b,{maximumRtoSeconds:3600}),e=>e.code==='RECOVERY_OBJECTIVE_MISSED');
});
test('rejects a drill tied to the wrong independently expected source checkpoint',()=>{
 const b=fixture();
 assert.throws(()=>verifyOffsiteRecoveryDrill(b,{expectedSourceCheckpoint:{sequence:11,last_hash:h('other')}}),e=>e.code==='SOURCE_CHECKPOINT_MISMATCH');
});
test('rejects malformed timing and unknown schema fields',()=>{
 const b=fixture();b.timing.completed_at='not-a-date';
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='DRILL_SCHEMA_INVALID');
 const c=fixture();c.extra='unexpected';
 assert.throws(()=>verifyOffsiteRecoveryDrill(c),e=>e.code==='DRILL_SCHEMA_INVALID');
});

test('requires an independently established expected source checkpoint',()=>{
 const b=fixture();
 assert.throws(()=>verifyOffsiteRecoveryDrill(b),e=>e.code==='SOURCE_CHECKPOINT_MISMATCH');
});
test('rejects retention that expires before drill completion',()=>{
 const b=fixture();b.backup.retention_until='2026-11-10T00:00:00.000Z';
 assert.throws(()=>verifyOffsiteRecoveryDrill(b,{expectedSourceCheckpoint:{sequence:12,last_hash:b.source.last_hash}}),e=>e.code==='RETENTION_NOT_IMMUTABLE');
});
