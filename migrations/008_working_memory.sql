CREATE TABLE working_memories (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
 run_id TEXT NOT NULL UNIQUE REFERENCES investigations(id), mode TEXT NOT NULL CHECK(mode IN('LIVE_TEST','CONTROLLED_TEST')),
 policy_digest TEXT NOT NULL, record_json TEXT NOT NULL CHECK(json_valid(record_json)), created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version)
) STRICT;
CREATE TABLE memory_audit (
 sequence INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,memory_id TEXT NOT NULL REFERENCES working_memories(id),
 actor_id TEXT NOT NULL,run_id TEXT NOT NULL REFERENCES investigations(id),event TEXT NOT NULL CHECK(event IN('CAPTURED','RECALLED')),created_at TEXT NOT NULL
) STRICT;
CREATE INDEX working_memory_scope ON working_memories(tenant_id,customer_id,request_id,request_version,mode,created_at);
