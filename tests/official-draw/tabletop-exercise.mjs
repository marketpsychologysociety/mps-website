/**
 * MPS P1.19 synthetic tabletop exercise evaluator.
 * This validates submitted exercise decisions only. It performs no incident,
 * notification, credential, provider, backup, or production action.
 */
const SCENARIOS = Object.freeze({
  IR01: { required: ["confirm_independent_checkpoint","preserve_provider_evidence","verify_readback_before_close"], forbidden: ["claim_upload_request_is_backup","overwrite_old_checkpoint"] },
  IR02: { required: ["freeze_affected_writes","preserve_exact_generations","use_new_isolated_restore_target","independent_review"], forbidden: ["repair_in_place","recompute_chain_in_place","choose_newest_timestamp_as_authority"] },
  IR03: { required: ["verify_exact_generation_and_expiry","preserve_policy_and_audit","independent_review"], forbidden: ["enable_irreversible_lock_as_shortcut","alter_legal_hold_without_authority"] },
  IR04: { required: ["mark_evidence_incomplete","preserve_query_and_pagination","independent_source_review"], forbidden: ["infer_no_action_from_missing_logs","claim_incomplete_export_complete"] },
  IR05: { required: ["stop_ambiguous_restore","preserve_target_artifacts","confirm_out_of_band_checkpoint","restore_to_new_target"], forbidden: ["retry_same_ambiguous_target","overwrite_source","cutover_without_approval"] },
  IR06: { required: ["stop_key_changes","preserve_key_metadata","use_authorized_custodian","test_only_synthetic_fixture"], forbidden: ["paste_private_key_into_ticket","rotate_or_destroy_key_without_plan"] },
  IR07: { required: ["treat_delivery_as_unknown","preserve_provider_receipt_state","reconcile_before_retry","use_out_of_band_escalation_if_critical"], forbidden: ["manually_mark_delivered","assume_timeout_means_not_sent"] },
  IR08: { required: ["stop_privileged_operations","preserve_identity_and_journal_evidence","independent_security_review","quiesce_before_lock_recovery"], forbidden: ["steal_ownerless_lock","delete_journal_evidence","continue_with_shared_identity"] }
});
const ALLOWED_KEYS = new Set(["scenarioId","decisions","evidencePreserved","secondReviewerAssigned","privacySafe","productionActionAttempted"]);
const SECRET_PATTERN = /(Bearer\\s+|-----BEGIN [A-Z ]*PRIVATE KEY-----|api[_ -]?key\\s*[:=]|password\\s*[:=]|otp\\s*[:=])/i;
function evaluateTabletopSubmission(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("SUBMISSION_INVALID");
  if (Object.keys(input).some(k => !ALLOWED_KEYS.has(k))) throw new TypeError("UNKNOWN_FIELD");
  const scenario = SCENARIOS[input.scenarioId];
  if (!scenario) throw new TypeError("SCENARIO_UNKNOWN");
  if (!Array.isArray(input.decisions) || input.decisions.some(x => typeof x !== "string") || new Set(input.decisions).size !== input.decisions.length) throw new TypeError("DECISIONS_INVALID");
  if (typeof input.evidencePreserved !== "boolean" || typeof input.secondReviewerAssigned !== "boolean" || typeof input.privacySafe !== "boolean" || typeof input.productionActionAttempted !== "boolean") throw new TypeError("CONTROL_FLAGS_INVALID");
  const decisions = new Set(input.decisions);
  const missing = scenario.required.filter(x => !decisions.has(x));
  const forbidden = scenario.forbidden.filter(x => decisions.has(x));
  const blockers = [];
  if (!input.evidencePreserved) blockers.push("EVIDENCE_NOT_PRESERVED");
  if (!input.secondReviewerAssigned) blockers.push("SECOND_REVIEWER_MISSING");
  if (!input.privacySafe) blockers.push("PRIVACY_CHECK_FAILED");
  if (input.productionActionAttempted) blockers.push("PRODUCTION_ACTION_PROHIBITED");
  if (missing.length) blockers.push("REQUIRED_DECISIONS_MISSING");
  if (forbidden.length) blockers.push("PROHIBITED_DECISION_SELECTED");
  const status = forbidden.length || blockers.includes("PRODUCTION_ACTION_PROHIBITED") || blockers.includes("PRIVACY_CHECK_FAILED") ? "FAIL" : blockers.length ? "INCOMPLETE" : "PASS";
  return Object.freeze({ scenarioId: input.scenarioId, status, missingDecisions: missing, prohibitedDecisions: forbidden, blockers });
}
export const tabletopScenarioIds = Object.freeze(Object.keys(SCENARIOS));
export { evaluateTabletopSubmission };
