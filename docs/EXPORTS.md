# Recorded case exports

GET /api/requests/:id/export?version=N requires the current authenticated session and enforces tenant/customer scope. Its JSON attachment contains a schema-versioned recorded payload and SHA-256 of JSON.stringify(payload). The hash checks payload integrity, not a digital signature or independent provider attestation. An export is taken in one database snapshot and never calls a model, retrieval service or provider.

Customers receive only their request, exact receipt, automatic-processing summary and scoped operation observations/status. Staff additionally receive proposal/approval/validation records, evidence/manifests, investigation metadata, cited findings, stored events/query references and audit history. No account/session/password table is exported. Customer packets omit staff evidence and audit detail.

Internal operation/idempotency keys are filtered recursively, including JSON strings stored in records. Recognisable Stripe/NVIDIA/bearer/private-key patterns are redacted from untrusted text; original records remain unchanged. Pattern redaction cannot identify every arbitrary secret someone might paste into a request. Keep credentials out of input/evidence in the first place and inspect any packet before external sharing.

The replay screen downloads the server-generated packet through the same-origin authenticated client. It holds no auth token in the URL and does not start a fresh investigation or execute a provider action. Browser and negative-path HTTP tests verify these boundaries.
