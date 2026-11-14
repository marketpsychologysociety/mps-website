import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTabletopSubmission, tabletopScenarioIds } from "./tabletop-exercise.mjs";

const complete = (scenarioId, extra = {}) => ({
  scenarioId,
  decisions: ({
    IR01:["confirm_independent_checkpoint","preserve_provider_evidence","verify_readback_before_close"],
    IR02:["freeze_affected_writes","preserve_exact_generations","use_new_isolated_restore_target","independent_review"],
    IR03:["verify_exact_generation_and_expiry","preserve_policy_and_audit","independent_review"],
    IR04:["mark_evidence_incomplete","preserve_query_and_pagination","independent_source_review"],
    IR05:["stop_ambiguous_restore","preserve_target_artifacts","confirm_out_of_band_checkpoint","restore_to_new_target"],
    IR06:["stop_key_changes","preserve_key_metadata","use_authorized_custodian","test_only_synthetic_fixture"],
    IR07:["treat_delivery_as_unknown","preserve_provider_receipt_state","reconcile_before_retry","use_out_of_band_escalation_if_critical"],
    IR08:["stop_privileged_operations","preserve_identity_and_journal_evidence","independent_security_review","quiesce_before_lock_recovery"]
  })[scenarioId],
  evidencePreserved:true, secondReviewerAssigned:true, privacySafe:true,
  productionActionAttempted:false, ...extra
});

test("all eight runbook scenarios have a complete passing synthetic response", () => {
  assert.deepEqual(tabletopScenarioIds, ["IR01","IR02","IR03","IR04","IR05","IR06","IR07","IR08"]);
  for (const id of tabletopScenarioIds) assert.equal(evaluateTabletopSubmission(complete(id)).status, "PASS", id);
});
test("missing required decisions remain INCOMPLETE", () => {
  const s=complete("IR02"); s.decisions=s.decisions.filter(x=>x!=="independent_review");
  const r=evaluateTabletopSubmission(s);
  assert.equal(r.status,"INCOMPLETE"); assert.deepEqual(r.missingDecisions,["independent_review"]);
});
test("forbidden evidence repair is a hard FAIL", () => {
  const r=evaluateTabletopSubmission(complete("IR02",{decisions:[...complete("IR02").decisions,"repair_in_place"]}));
  assert.equal(r.status,"FAIL"); assert.deepEqual(r.prohibitedDecisions,["repair_in_place"]);
});
test("production action attempt is a hard FAIL", () => assert.equal(evaluateTabletopSubmission(complete("IR05",{productionActionAttempted:true})).status,"FAIL"));
test("missing independent reviewer blocks completion", () => assert.equal(evaluateTabletopSubmission(complete("IR08",{secondReviewerAssigned:false})).status,"INCOMPLETE"));
test("privacy failure is a hard FAIL", () => assert.equal(evaluateTabletopSubmission(complete("IR06",{privacySafe:false})).status,"FAIL"));
test("unknown fields fail closed", () => assert.throws(()=>evaluateTabletopSubmission({...complete("IR01"),memberId:"MPS-123"}),/UNKNOWN_FIELD/));
test("unknown scenarios and malformed decisions fail closed", () => {
  assert.throws(()=>evaluateTabletopSubmission(complete("IR99")),/SCENARIO_UNKNOWN/);
  assert.throws(()=>evaluateTabletopSubmission(complete("IR01",{decisions:["x","x"]})),/DECISIONS_INVALID/);
});
test("no scenario can pass when evidence was not preserved", () => assert.equal(evaluateTabletopSubmission(complete("IR01",{evidencePreserved:false})).status,"INCOMPLETE"));
