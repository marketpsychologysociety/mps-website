import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson, digestCanonical, validateCreateEvent, authorize,
  projectPublicWinner, SyntheticTransactionHarness
} from "./isolated-acceptance-harness.mjs";

test("canonical JSON is key-order invariant and rejects non-finite numbers", () => {
  assert.equal(canonicalJson({z:1,a:{y:2,x:3}}), canonicalJson({a:{x:3,y:2},z:1}));
  assert.equal(digestCanonical({b:2,a:1}), digestCanonical({a:1,b:2}));
  assert.throws(() => canonicalJson({bad:Infinity}), /NON_FINITE_NUMBER/);
  assert.throws(() => canonicalJson(new Date()), /NON_PLAIN_OBJECT/);
  assert.throws(() => canonicalJson({bad:undefined}), /UNSUPPORTED_JSON_VALUE/);
  assert.throws(() => canonicalJson([,1]), /SPARSE_ARRAY/);
  const cyclic={}; cyclic.self=cyclic;
  assert.throws(() => canonicalJson(cyclic), /CYCLIC_VALUE/);
});

test("strict create-event contract rejects identity, role, participant and unknown fields", () => {
  const valid = validateCreateEvent({
    title_public:"Synthetic event", rules_version:"rules.v1", eligibility_policy_version:"elig.v1"
  });
  assert.equal(valid.ok, true);
  for (const extra of [
    {actor_subject:"spoofed"}, {roles:["DRAW_REVIEWER"]},
    {participant_ids:["real-looking"]}, {admin:true}
  ]) {
    assert.deepEqual(validateCreateEvent({
      title_public:"Synthetic event", rules_version:"rules.v1",
      eligibility_policy_version:"elig.v1", ...extra
    }), {ok:false,code:"UNKNOWN_FIELD"});
  }
  assert.equal(validateCreateEvent({title_public:" ",rules_version:"v1",eligibility_policy_version:"v1"}).code,"INVALID_TITLE");
  assert.equal(validateCreateEvent({title_public:"ok",rules_version:"",eligibility_policy_version:"v1"}).code,"INVALID_VERSION");
  const inherited = Object.create({admin:true});
  Object.assign(inherited,{title_public:"x",rules_version:"v1",eligibility_policy_version:"v1"});
  assert.equal(validateCreateEvent(inherited).code,"INVALID_BODY");
  const accessor = {title_public:"x",rules_version:"v1",eligibility_policy_version:"v1"};
  Object.defineProperty(accessor,"title_public",{get(){throw new Error("must not execute");}});
  assert.equal(validateCreateEvent(accessor).code,"INVALID_BODY");
  const hiddenField={title_public:"x",rules_version:"v1",eligibility_policy_version:"v1"};
  Object.defineProperty(hiddenField,"admin",{value:true,enumerable:false});
  assert.equal(validateCreateEvent(hiddenField).code,"UNKNOWN_FIELD");
});

test("authorization matrix is deny-by-default and enforces distinct reviewer subject", () => {
  assert.equal(authorize({role:"DRAW_AUDITOR",action:"execute_draw",subject:"aud"}).code,"FORBIDDEN");
  assert.equal(authorize({role:"DRAW_OPERATOR",action:"execute_draw",subject:"op",ownerSubject:"other"}).code,"NOT_RESOURCE_OWNER");
  assert.equal(authorize({role:"DRAW_OPERATOR",action:"execute_draw",subject:"op"}).code,"NOT_RESOURCE_OWNER");
  assert.equal(authorize({role:"DRAW_REVIEWER",action:"approve_rules",subject:"reviewer"}).code,"SEPARATION_OF_DUTIES");
  assert.equal(authorize({role:"DRAW_REVIEWER",action:"approve_rules",subject:"same",reviewerSubject:"same"}).code,"SEPARATION_OF_DUTIES");
  assert.equal(authorize({role:"DRAW_REVIEWER",action:"approve_rules",subject:"reviewer",reviewerSubject:"operator"}).allowed,true);
  assert.equal(authorize({role:"UNRECOGNIZED",action:"publish_result",subject:"x"}).allowed,false);
  assert.equal(authorize({role:"DRAW_SECURITY_ADMIN",action:"create_event",subject:"security-admin"}).allowed,false);
  assert.equal(authorize({role:"SERVICE_IDENTITY",action:"approve_rules",subject:"service",reviewerSubject:"operator"}).allowed,false);
  assert.equal(authorize({role:"DRAW_PUBLISHER",action:"execute_draw",subject:"publisher",ownerSubject:"publisher"}).allowed,false);
  assert.equal(authorize(null).allowed,false);
  assert.equal(authorize(Object.create({role:"DRAW_PUBLISHER"})).allowed,false);
  const hostileAuth={role:"DRAW_PUBLISHER",action:"publish_result",subject:"publisher"};
  Object.defineProperty(hostileAuth,"subject",{get(){throw new Error("must not execute");}});
  assert.equal(authorize(hostileAuth).allowed,false);
  const hiddenRole={role:"DRAW_PUBLISHER",action:"publish_result",subject:"publisher"};
  Object.defineProperty(hiddenRole,"admin",{value:true,enumerable:false});
  assert.equal(authorize(hiddenRole).allowed,false);
});

test("public winner projection only accepts exact allowlisted PUBLISHED and VERIFIED record", () => {
  const safe = {
    event_title:"Synthetic event", message:"Verified synthetic result",
    prize_public_description:"Synthetic prize", proof_summary:{
      beacon_chain_hash:"c".repeat(64), beacon_round:"42", participant_count:3,
      result_digest:"a".repeat(64), snapshot_commitment:"b".repeat(64)
    }, protocol_version:"test.v1", public_result_id:"public-synthetic-1",
    published_at_utc:"2026-01-01T00:00:00Z", verification_status:"VERIFIED",
    state:"PUBLISHED"
  };
  assert.equal(projectPublicWinner({...safe,state:"DRAFT"}),null);
  assert.equal(projectPublicWinner({...safe,verification_status:"UNVERIFIED"}),null);
  assert.equal(projectPublicWinner({...safe,private_member_id:"CANARY_PRIVATE"}),null);
  assert.equal(projectPublicWinner({...safe,proof_summary:{...safe.proof_summary,beacon_chain_hash:{leak:"CANARY_NESTED"}}}),null);
  assert.equal(projectPublicWinner({...safe,proof_summary:{...safe.proof_summary,participant_count:"3"}}),null);
  assert.equal(projectPublicWinner({...safe,published_at_utc:"2026-99-99T00:00:00Z"}),null);
  const inheritedState=Object.assign(Object.create({state:"PUBLISHED"}),safe);
  delete inheritedState.state;
  assert.equal(projectPublicWinner(inheritedState),null);
  const hostileRecord={...safe};
  Object.defineProperty(hostileRecord,"message",{get(){throw new Error("must not execute");}});
  assert.equal(projectPublicWinner(hostileRecord),null);
  const hiddenPrivate={...safe};
  Object.defineProperty(hiddenPrivate,"private_member_id",{value:"CANARY",enumerable:false});
  assert.equal(projectPublicWinner(hiddenPrivate),null);
  assert.equal(projectPublicWinner({...safe,proof_summary:{...safe.proof_summary,member_name:"CANARY_NAME"}}),null);
  const projected=projectPublicWinner(safe);
  assert.equal(projected.public_result_id,safe.public_result_id);
  assert.equal(Object.hasOwn(projected,"private_member_id"),false);
});

test("transaction model serializes concurrent requests and prevents duplicate operation", async () => {
  const h=new SyntheticTransactionHarness();
  h.seedDraw({drawId:"draw-synthetic-1",ownerSubject:"operator-A"});
  const args={drawId:"draw-synthetic-1",subject:"operator-A",key:"idem-1",payload:{command:"execute"},expectedVersion:1};
  const [a,b]=await Promise.all([h.execute(args),h.execute(args)]);
  assert.deepEqual([a.status,b.status].sort(),[200,202]);
  assert.equal(h.operationCount(),1);
  assert.equal(h.readDraw(args.drawId).version,2);
  assert.equal(h.readDraw(args.drawId).state,"DRAWN_UNVERIFIED");
  assert.deepEqual(h.outboxStates(),["PENDING"]);
});

test("idempotency conflicts, stale versions, foreign owner and invalid state fail closed", async () => {
  const h=new SyntheticTransactionHarness();
  h.seedDraw({drawId:"draw-1",ownerSubject:"operator-A"});
  const base={drawId:"draw-1",subject:"operator-A",key:"same-key",payload:{x:1},expectedVersion:1};
  assert.equal((await h.execute({...base,subject:"operator-B"})).code,"NOT_FOUND");
  assert.equal((await h.execute({...base,expectedVersion:0})).code,"INVALID_REQUEST");
  assert.equal((await h.execute({...base,key:7})).code,"INVALID_REQUEST");
  assert.equal((await h.execute({...base,payload:{bad:undefined}})).code,"INVALID_PAYLOAD");
  assert.equal((await h.execute({...base,fault:"before_commit"})).code,"TRANSACTION_ABORTED");
  assert.equal(h.operationCount(),0);
  const success=await h.execute(base);
  assert.equal(success.status,202);
  assert.equal((await h.execute({...base,payload:{x:2}})).code,"IDEMPOTENCY_CONFLICT");
  assert.equal((await h.execute({...base,expectedVersion:2})).code,"IDEMPOTENCY_CONFLICT");
  assert.equal((await h.execute({...base,key:"another-key"})).code,"INVALID_STATE");
  assert.equal(h.operationCount(),1);
});

test("commit-before-ack failure is safely replayed without a second operation", async () => {
  const h=new SyntheticTransactionHarness();
  h.seedDraw({drawId:"draw-ack",ownerSubject:"operator-A"});
  const args={drawId:"draw-ack",subject:"operator-A",key:"lost-ack",payload:{},expectedVersion:1};
  assert.equal((await h.execute({...args,fault:"after_commit_before_ack"})).code,"ACKNOWLEDGMENT_LOST");
  assert.equal(h.readDraw(args.drawId).version,2);
  const replay=await h.execute(args);
  assert.equal(replay.status,200);
  assert.equal(replay.replayed,true);
  assert.equal(h.operationCount(),1);
});
