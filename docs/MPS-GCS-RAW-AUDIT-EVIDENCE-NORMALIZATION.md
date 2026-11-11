# P1.10 — Raw Cloud Audit Logs evidence normalization (offline design and harness)

**Status:** implemented as an offline structural normalizer with synthetic fixtures. It is not a GCP connector, raw-log authenticity verifier, or actual-provider test.

## Why this stage exists

P1.9 validates a normalized evidence bundle. P1.10 adds a separate boundary before that verifier: preserve exact raw JSON strings from a Cloud Logging export, check byte digests and pagination manifests, constrain the project/bucket/log scope, and map recognized audit records to a small normalized event vocabulary. The P1.10 output can then be reviewed before conversion into the P1.9 bundle.

Google's documented LogEntry envelope includes fields such as logName, resource, timestamp, receiveTimestamp, insertId, and one payload field such as protoPayload. Cloud Audit Logs place an AuditLog in protoPayload; service-specific metadata and optional fields vary. Cloud Storage uses service name storage.googleapis.com, monitored resource type gcs_bucket, and project-level log names ending in URL-encoded cloudaudit.googleapis.com%2Fdata_access or %2Factivity. Data Access logging must be explicitly enabled. Sources: https://docs.cloud.google.com/storage/docs/audit-logging ; https://docs.cloud.google.com/logging/docs/audit/understanding-audit-logs ; https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry

## Accepted input envelope

The module accepts a strict outer bundle:
- schemaVersion: mps-gcs-raw-audit/v1.
- source: project ID, bucket, UTC window bounds, explicit allowed project-level log names, pagination completion marker, final token state, and an external export reference.
- expectedPrincipals: expected writer, verifier, and storage-admin principal emails from the independently maintained PoC roster.
- expectedObjects: exact synthetic evidence object names expected in the run.
- pages: ordered page manifest with page index, request/response page-token hashes, entry count, and digest of ordered raw-entry digests.
- rawEntries: page index, exact raw JSON string, and SHA-256 of that exact UTF-8 string.

Raw JSON is retained as the exact string supplied to the normalizer; the module does not reserialize it before computing the raw digest. The digest detects accidental alteration between capture and validation, but does not prove who produced the bytes.

## Structural checks and event mapping

The normalizer fails closed on:
- unknown outer fields, malformed descriptors, invalid time windows, out-of-scope log names, incomplete pagination, page-token chain gaps, page count/digest mismatch, malformed JSON, or altered raw bytes;
- wrong gcs_bucket project/bucket labels, wrong Cloud Storage service or AuditLog type, unsupported audit method, missing timestamps/insert ID/principal, duplicate insert IDs, or event outside the requested time window;
- principal mismatch against the expected role roster, object resource outside the expected bucket/object set, successful rather than denied writer delete attempt, or missing successful create/read evidence for each expected object.

It recognizes a deliberately narrow method-name mapping for object create/insert, get/download, delete, and bucket IAM-policy/update events. Real GCS PoC output must first be inspected to confirm the actual method names and resource-name forms for the exact API calls used. Unrecognized variants are rejected rather than guessed. authorizationInfo is treated as optional evidence; denial is recognized from status code 7 or an explicit granted:false. A real-provider test must observe the actual denial record rather than assume every denied attempt is logged in a particular category.

The normalizer extracts only the fields needed by the next verifier. It does not copy request bodies, custom audit metadata, caller IPs, user agents, or arbitrary payload fields into normalized output.

## Pagination and completeness

Cloud Logging entries.list uses nextPageToken to retrieve subsequent pages; an empty entries array can still accompany a next-page token. The request parameters other than page token must remain identical when continuing pagination. Therefore, a capture is incomplete until all pages have been traversed and the final response has no next-page token. Source: https://docs.cloud.google.com/logging/docs/reference/v2/rest/v2/entries/list

The fixture manifest checks contiguous page indexes, token-hash continuity, final-token absence, page entry counts, and a digest over each page's ordered raw-entry digests. These checks detect missing/reordered/tampered captured pages relative to the manifest. They do not prove the exporter did not omit records, that the query was correct, or that the manifest itself is trustworthy. The query filter, fixed resource names, time bounds, principal, authenticated API response, and export operator must be independently evidenced.

## Authenticity boundary — non-negotiable

sourceAuthenticated is always false. A matching SHA-256 digest, JSON schema, insertId, or independentExportRef is not a Google signature and cannot establish Google Cloud provenance. The module does not verify TLS/API identity, OAuth principal, Cloud Logging API response provenance, signed exports, sink configuration, IAM, or independent audit access.

Before any real evidence can be accepted, an independent reviewer must obtain the records through a separately authenticated Cloud Logging/API session or validate a provider-verifiable export and its custody chain. The reviewer must independently verify project and bucket ownership, exact query/filter, page traversal, API response context, principal identities, log configuration, export destination permissions, and source-to-file correspondence. Exporter-supplied fields such as authenticated:true must never be trusted as proof.

## Privacy and retention

Use only synthetic GCS PoC objects and service identities in this stage. Raw Cloud Audit Logs can contain identities and request metadata; keep raw exports in a restricted evidence area and do not place them in public repositories, public website feeds, issue comments, or ordinary application logs. Normalized output is a minimal test artifact, not a public MPS announcement payload.

## Required real-provider observations before P1.10 can be called provider-validated

1. Capture create and independent read operations through separate principals.
2. Attempt a delete with the writer principal and preserve the actual response plus any corresponding audit evidence; do not infer that an absent record means denial.
3. Capture a storage-admin policy change in Admin Activity and separately confirm its scope and actor.
4. Capture all pages using the same query and record each request/response token relationship.
5. Re-run retrieval independently from a second privileged identity and compare the evidence set.
6. Verify the audit configuration and Data Access coverage through an independent administrative read.
7. Confirm the exact method names, resource names, principal representation, status and authorization fields against actual PoC records.
8. Have an independent reviewer authenticate the source and reconcile raw entries to the normalized bundle.

No cloud project, bucket, billing, IAM, service account, audit sink, credential, retention lock, or production connection is created by P1.10. Official winner draw remains **BLOCKED / NO-GO**; roulette remains **SIMULATION ONLY**.
