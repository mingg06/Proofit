CREATE TABLE investigations (
 sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 proposal_id TEXT NOT NULL REFERENCES proposals(id), actor_id TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN('LIVE_TEST','CONTROLLED_TEST')),
 status TEXT NOT NULL CHECK(status IN('RUNNING','COMPLETE','RULES_ONLY','UNAVAILABLE','BUDGET_EXHAUSTED','MALFORMED_OUTPUT','EVIDENCE_CHANGED','FAILED','ABANDONED')),
 model_id TEXT, prompt_version TEXT NOT NULL, tools_version TEXT NOT NULL, model_turns INTEGER NOT NULL DEFAULT 0, tool_calls INTEGER NOT NULL DEFAULT 0,
 active_duration_ms INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER, output_tokens INTEGER, usage_complete INTEGER NOT NULL DEFAULT 1 CHECK(usage_complete IN(0,1)),
 unresolved_json TEXT NOT NULL CHECK(json_valid(unresolved_json)), created_at TEXT NOT NULL, deadline_at TEXT NOT NULL, finished_at TEXT, validation_id TEXT REFERENCES validations(id),
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version), FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE UNIQUE INDEX one_running_investigation ON investigations(tenant_id,proposal_id) WHERE status='RUNNING';
CREATE INDEX investigation_proposal ON investigations(tenant_id,proposal_id,sequence);
CREATE TABLE investigation_events (
 sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, run_id TEXT NOT NULL REFERENCES investigations(id), kind TEXT NOT NULL,
 data_json TEXT NOT NULL CHECK(json_valid(data_json)), created_at TEXT NOT NULL
) STRICT;
CREATE TABLE investigation_evidence (
 run_id TEXT NOT NULL REFERENCES investigations(id), evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
 record_json TEXT NOT NULL CHECK(json_valid(record_json)), PRIMARY KEY(run_id,evidence_id)
) STRICT;
CREATE TABLE investigation_findings (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES investigations(id), kind TEXT NOT NULL CHECK(kind IN('OBSERVATION','INTERPRETATION')),
 text TEXT NOT NULL, references_json TEXT NOT NULL CHECK(json_valid(references_json))
) STRICT;
