CREATE TABLE review_jobs (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,customer_id TEXT NOT NULL,request_id TEXT NOT NULL,request_version INTEGER NOT NULL,
 receipt_id TEXT NOT NULL UNIQUE REFERENCES receipts(id),status TEXT NOT NULL CHECK(status IN('QUEUED','INVESTIGATING','UNAVAILABLE','REVIEW_REQUIRED','BLOCKED','READY','OBSERVED','OUTCOME_UNKNOWN')),
 proposal_id TEXT REFERENCES proposals(id),run_id TEXT REFERENCES investigations(id),validation_id TEXT REFERENCES validations(id),operation_id TEXT REFERENCES operations(id),
 message TEXT NOT NULL,lease_token TEXT,lease_until TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version)
) STRICT;
CREATE INDEX review_jobs_queue ON review_jobs(tenant_id,status,created_at);
