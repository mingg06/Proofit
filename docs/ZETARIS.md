# Zetaris evidence retrieval preparation

Implemented 24 October 2026. `apps/investigator/zetaris.ts` supplies the scoped query builder, validation and transactional ingestion boundary. It is exercised through the persisted investigator with a CONTROLLED_TEST query client. **No real Zetaris HTTP transport or live retrieval is implemented or verified.** Default backend startup remains unconfigured; provider writes remain disabled. No phase gate is complete.

## Verified documentation and transport blocker

The official [REST guide](https://kbase.zetaris.com/knowledge/rest-api) documents bearer authentication, an OpenSqlQuery body containing `select` and `pageLimit` (1–100), pagination with `queryToken`, and cursor closure. Its linked `zetaris/zetaris-public` collection returned 404 on 24 October. The [API release page](https://kbase.zetaris.com/knowledge/zetaris-api-release) says API documentation is available inside the platform and GitHub files require access. The [SQL guide](https://kbase.zetaris.com/knowledge/sql-guide) documents qualified relations and separate database versus file/REST sources.

The public material did not establish exact endpoint paths, response envelopes, cursor cleanup requests or a durable non-secret query/audit identifier. The user confirmed instance documentation and credentials are unavailable. No assumed SDK dependency, endpoint, response shape or fabricated query reference was introduced.

`ZetarisQueryClient` is an application-normalized port, not a purported provider API schema. A future transport must be implemented against the instance's versioned documentation, bound to an approved HTTPS endpoint with redirects rejected, bearer credentials confined to retrieval, bounded streamed responses and deadlines, cursor cleanup, and explicit completeness. Do not persist a pagination token as a durable citation or print raw errors. Transport compatibility and both real source queries remain blocked on access to the instance contract and credentials.

## Application mapping and trust

Code injects `ZetarisEvidenceRetrieval` through `new Investigator(gateway, {model, retrieval})`. Neither environment variables nor public HTTP inputs enable it. The existing ZETARIS environment names are prerequisites for future configuration, not an activation mechanism.

Trusted configuration binds one tenant to two distinct source IDs and qualified relations with pinned versions. Before deployment, register a structured database-backed request/customer/payment evidence view and a separate approved policy/case file or REST-backed view in Zetaris. This preparation uses request-scoped normalized evidence projections from both views; it does not yet add standalone subscription/payment lookup tools or prove the upstream source types.

Each projection returns `tenant_id`, `customer_id`, `request_id`, `request_version`, `policy_version`, `source_id`, `source_version`, `passage_id`, and `excerpt`. This is an application mapping to provision and verify, not a pre-existing Zetaris table schema. Policy queries restrict to the current deterministic rule's exact passage. Identifier values use a restricted alphabet; unsupported values fail closed instead of constructing unsafe SQL. Model search terms are applied locally to retrieved passages and never interpolated into SQL.

The client normalizes a complete result to `{queryReference, complete: true, rows}`. The reference must be a genuine durable provider reference, never a locally invented success marker. Controlled tests use visibly synthetic references and provenance. Queries are SELECT-only, include authenticated tenant/customer/request/version/policy/source predicates, and request at most six rows so overflow beyond the five-row accepted bound cannot silently pass. Partial pages, empty results, duplicate passages, mismatched scope and oversized results require review. The transport must establish completeness before returning this envelope.

Source/version approval must already exist locally. Retrieval never approves a source, changes policy rules, issues a receipt or grants staff authority. It rejects controlled clients in LIVE_TEST mode and cannot relabel fixture versions as LIVE. Retrieved text remains untrusted evidence, including embedded instructions. Provider execution state must still come from the isolated provider adapter.

Both queries must succeed before any evidence is saved. In one transaction the adapter rechecks session/role, request version, active policy, rule content and source approval; rejects changes to an existing pinned passage; then saves passages, evidence, a manifest, query provenance and an investigation event. Existing unresolved/conflict holds are preserved. A ten-second retrieval deadline shares the investigator's abort signal. Late results cannot persist after cancellation or run completion.

Migration 007 adds `retrieval_queries` and evidence-to-query links; migrations 001–006 remain unchanged. Records include the run, source/version, genuine or controlled query reference, adapter version, provenance, accepted row count, timestamp and measured query latency. Staff-scoped recorded replay returns these stored references without another query/model/provider call. Customer DTOs remain unchanged.

## Verification

Use Node 24.22.1:

```powershell
npx.cmd --yes --package=node@24.22.1 node node_modules/typescript/bin/tsc --noEmit
npx.cmd --yes --package=node@24.22.1 node --test tests/zetaris.test.ts
npx.cmd --yes --package=node@24.22.1 node --test tests/*.test.ts
```

Tests cover two-source persisted citations/replay, scoped SQL, malformed/partial/overflow results, tenant/customer/version substitution, source approval, role isolation, concurrent request/policy/source changes, transactional rollback, pinned-passage conflicts, late aborts, sanitized errors, relation injection, preserved material holds, controlled/live isolation and known authority mismatches. These are controlled application tests, not remote integration evidence.

Verified: all 106 Node tests pass, including 9 Zetaris tests with multiple negative-path variants; server, console and e2e TypeScript checks pass under Node 24.22.1. Browser workflows were not rerun because the UI was unchanged. No live latency, usage or cost measurements exist for Zetaris.
