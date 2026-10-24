CREATE TABLE execution_attempts (
 operation_id TEXT PRIMARY KEY REFERENCES operations(id), claim_token TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN('STARTED','ACKNOWLEDGED','UNKNOWN')), started_at TEXT NOT NULL, deadline_at TEXT NOT NULL,
 provider_request_id TEXT, acknowledged_at TEXT
) STRICT;
CREATE TABLE reconciliation_tasks (
 operation_id TEXT PRIMARY KEY REFERENCES operations(id), next_attempt_at TEXT NOT NULL,
 lease_token TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 done INTEGER NOT NULL DEFAULT 0 CHECK(done IN(0,1))
) STRICT;
CREATE UNIQUE INDEX operation_tenant_scope ON operations(tenant_id,id);
CREATE TABLE outcome_observations (
 sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, operation_id TEXT NOT NULL,
 record_json TEXT NOT NULL CHECK(json_valid(record_json)), recorded_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,operation_id) REFERENCES operations(tenant_id,id)
) STRICT;
CREATE INDEX operation_observations ON outcome_observations(operation_id,sequence);
