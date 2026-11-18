import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
const nonEmpty=v=>typeof v==='string'&&v.trim().length>0&&v.length<=512;
const hex64=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(v)&&!Number.isNaN(Date.parse(v));
const exact=(v,keys)=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const CHECKPOINT_KEYS=['formatVersion','schemaSha256','logicalSha256','tableCounts'];
const PAYLOAD_KEYS=['schemaVersion','keyId','issuer','reviewerSubject','exporterSubject','checkpointId','sourceId','checkpointSha256','nonce','issuedAt','expiresAt','reviewerAuthContext'];
const TRUST_KEYS=['keyId','issuer','subject','publicKeyPem','notBefore','notAfter','revoked'];
const fail=(...errors)=>({ok:false,errors:[...new Set(errors)],checkpointAttestationVerified:false,assurance:'UNVERIFIED'});
function canonical(v) {
 if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
 if(typeof v==='number'){if(!Number.isSafeInteger(v))throw new TypeError('Only safe integers accepted');return JSON.stringify(v);}
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
 throw new TypeError('Unsupported canonical value');
}
const sha256=v=>createHash('sha256').update(v,'utf8').digest('hex');
export const recoveryCheckpointCanonicalJson=canonical;
export const recoveryCheckpointSha256=cp=>sha256(canonical(cp));
function validCheckpoint(cp){
 if(!exact(cp,CHECKPOINT_KEYS)||cp.formatVersion!==1||!hex64(cp.schemaSha256)||!hex64(cp.logicalSha256)||!cp.tableCounts||typeof cp.tableCounts!=='object'||Array.isArray(cp.tableCounts))return false;
 const e=Object.entries(cp.tableCounts);
 return e.length>0&&e.length<=256&&e.every(([n,c])=>nonEmpty(n)&&n.length<=256&&Number.isSafeInteger(c)&&c>=0);
}
export function verifyRecoveryCheckpointAttestation(checkpoint,attestation,trust,options){
 if(!validCheckpoint(checkpoint))return fail('CHECKPOINT_SCHEMA_INVALID');
 if(!exact(options,['expectedCheckpointId','expectedSourceId','expectedNonce','now'])||!nonEmpty(options.expectedCheckpointId)||!nonEmpty(options.expectedSourceId)||!nonEmpty(options.expectedNonce)||!Number.isFinite(options.now))return fail('VERIFIER_CONTEXT_INVALID');
 if(!exact(attestation,['payload','signature'])||!exact(attestation.payload,PAYLOAD_KEYS)||typeof attestation.signature!=='string'||!attestation.signature.length)return fail('ATTESTATION_SCHEMA_INVALID');
 if(!exact(trust,TRUST_KEYS)||!nonEmpty(trust.keyId)||!nonEmpty(trust.issuer)||!nonEmpty(trust.subject)||typeof trust.publicKeyPem!=='string'||!trust.publicKeyPem.includes('BEGIN PUBLIC KEY')||!iso(trust.notBefore)||!iso(trust.notAfter)||typeof trust.revoked!=='boolean')return fail('TRUST_ANCHOR_INVALID');
 const errors=[],p=attestation.payload,now=options.now,issued=Date.parse(p.issuedAt),expires=Date.parse(p.expiresAt);
 if(p.schemaVersion!=='mps-recovery-checkpoint-attestation/v1')errors.push('ATTESTATION_VERSION_UNSUPPORTED');
 if(p.keyId!==trust.keyId)errors.push('TRUST_KEY_ID_MISMATCH');
 if(p.issuer!==trust.issuer||p.reviewerSubject!==trust.subject)errors.push('REVIEWER_IDENTITY_MISMATCH');
 if(trust.revoked)errors.push('TRUST_KEY_REVOKED');
 if(!iso(p.issuedAt)||issued<Date.parse(trust.notBefore)||issued>Date.parse(trust.notAfter))errors.push('TRUST_KEY_OUTSIDE_VALIDITY');
 if(!iso(p.issuedAt)||!iso(p.expiresAt)||issued>now||expires<=now||expires<=issued||expires-issued>86400000)errors.push('ATTESTATION_TIME_INVALID');
 if(p.nonce!==options.expectedNonce)errors.push('NONCE_MISMATCH');
 if(p.checkpointId!==options.expectedCheckpointId||p.sourceId!==options.expectedSourceId)errors.push('CHECKPOINT_SCOPE_MISMATCH');
 if(p.checkpointSha256!==recoveryCheckpointSha256(checkpoint))errors.push('CHECKPOINT_DIGEST_MISMATCH');
 if(!nonEmpty(p.exporterSubject)||p.exporterSubject===p.reviewerSubject)errors.push('REVIEWER_NOT_INDEPENDENT');
 if(!nonEmpty(p.reviewerAuthContext))errors.push('REVIEWER_AUTH_CONTEXT_MISSING');
 let key,sig;
 try{key=createPublicKey(trust.publicKeyPem);if(key.asymmetricKeyType!=='ed25519')errors.push('TRUST_KEY_ALGORITHM_INVALID');}catch{errors.push('TRUST_PUBLIC_KEY_INVALID');}
 try{if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attestation.signature))throw Error();sig=Buffer.from(attestation.signature,'base64');if(sig.length!==64||sig.toString('base64')!==attestation.signature)throw Error();}catch{errors.push('SIGNATURE_ENCODING_INVALID');}
 if(key&&sig){let ok=false;try{ok=verifySignature(null,Buffer.from(canonical(p),'utf8'),key,sig);}catch{}if(!ok)errors.push('ATTESTATION_SIGNATURE_INVALID');}
 if(errors.length)return fail(...errors);
 return {ok:true,errors:[],checkpointAttestationVerified:true,assurance:'PINNED_REVIEWER_SIGNATURE_AND_CHECKPOINT_BINDING_VERIFIED',checkpoint:{checkpointId:p.checkpointId,sourceId:p.sourceId,checkpointSha256:p.checkpointSha256,schemaSha256:checkpoint.schemaSha256,logicalSha256:checkpoint.logicalSha256,tableCounts:checkpoint.tableCounts},reviewer:{issuer:p.issuer,subject:p.reviewerSubject,keyId:p.keyId},warning:'Signature and checkpoint binding verified only. Reviewer identity, assertion truth, checkpoint completeness and source authenticity are not established. Authenticated reviewer sessions, governed trust keys, independent checkpoint capture and durable single-use nonce consumption remain required.'};
}
