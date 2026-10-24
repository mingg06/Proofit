CREATE TABLE policy_rules (
 tenant_id TEXT NOT NULL, policy_version TEXT NOT NULL, rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 PRIMARY KEY(tenant_id,policy_version), FOREIGN KEY(tenant_id,policy_version) REFERENCES policy_versions(tenant_id,version)
) STRICT;
CREATE TABLE source_versions (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), source_id TEXT NOT NULL, version TEXT NOT NULL,
 approved INTEGER NOT NULL CHECK(approved IN(0,1)), provenance TEXT NOT NULL CHECK(provenance IN('FIXTURE','LIVE')),
 PRIMARY KEY(tenant_id,source_id,version)
) STRICT;
CREATE TABLE passages (
 tenant_id TEXT NOT NULL, source_id TEXT NOT NULL, source_version TEXT NOT NULL, id TEXT NOT NULL, excerpt TEXT NOT NULL,
 PRIMARY KEY(tenant_id,source_id,source_version,id),
 FOREIGN KEY(tenant_id,source_id,source_version) REFERENCES source_versions(tenant_id,source_id,version)
) STRICT;
CREATE TABLE evidence_records (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN('REQUEST','POLICY')), record_json TEXT NOT NULL CHECK(json_valid(record_json)),
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version)
) STRICT;
CREATE TABLE evidence_manifests (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 policy_version TEXT NOT NULL, manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)), created_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version),
 FOREIGN KEY(tenant_id,policy_version) REFERENCES policy_versions(tenant_id,version)
) STRICT;
CREATE TABLE validations (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 proposal_id TEXT NOT NULL REFERENCES proposals(id), receipt_id TEXT REFERENCES receipts(id), actor_id TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN('BLOCK','REVIEW_REQUIRED','READY')),
 record_json TEXT NOT NULL CHECK(json_valid(record_json)), provider_state_json TEXT CHECK(provider_state_json IS NULL OR json_valid(provider_state_json)),
 mode TEXT NOT NULL CHECK(mode IN('LIVE_TEST','CONTROLLED_TEST')), rules_version TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE TABLE validation_checks (
 validation_id TEXT NOT NULL REFERENCES validations(id), name TEXT NOT NULL,
 result TEXT NOT NULL CHECK(result IN('PASS','BLOCK','REVIEW_REQUIRED')), reason TEXT NOT NULL,
 evidence_ids_json TEXT NOT NULL CHECK(json_valid(evidence_ids_json)), PRIMARY KEY(validation_id,name)
) STRICT;
CREATE TABLE operations (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 validation_id TEXT NOT NULL UNIQUE, receipt_id TEXT NOT NULL UNIQUE, binding_digest TEXT NOT NULL,
 business_key TEXT NOT NULL UNIQUE, provider_key TEXT NOT NULL UNIQUE, resource_key TEXT NOT NULL,
 action_json TEXT NOT NULL CHECK(json_valid(action_json)), state TEXT NOT NULL CHECK(state IN('RESERVED','SUBMITTED','PENDING','SUCCEEDED','FAILED','CANCELED','OUTCOME_UNKNOWN')),
 mode TEXT NOT NULL CHECK(mode IN('LIVE_TEST','CONTROLLED_TEST')),
 provider_object_id TEXT, effect_verified INTEGER NOT NULL DEFAULT 0 CHECK(effect_verified IN(0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,validation_id) REFERENCES validations(tenant_id,id),
 FOREIGN KEY(tenant_id,receipt_id) REFERENCES receipts(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version)
) STRICT;
CREATE UNIQUE INDEX serialize_active_resource ON operations(resource_key) WHERE state IN('RESERVED','SUBMITTED','PENDING','OUTCOME_UNKNOWN');
CREATE INDEX manifest_case ON evidence_manifests(tenant_id,request_id,request_version,created_at);
CREATE INDEX validation_case ON validations(tenant_id,request_id,request_version,created_at);
