CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE customers (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, name TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
) STRICT;
CREATE TABLE actors (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), customer_id TEXT,
  email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('CUSTOMER','SUPPORT','REFUND_APPROVER')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  CHECK((role='CUSTOMER' AND customer_id IS NOT NULL) OR (role!='CUSTOMER' AND customer_id IS NULL)),
  UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id)
) STRICT;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES actors(id),
  csrf_token TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE policy_versions (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), version TEXT NOT NULL,
  source_version TEXT NOT NULL, clause_text TEXT NOT NULL,
  active INTEGER NOT NULL CHECK(active IN (0,1)), provenance TEXT NOT NULL CHECK(provenance IN ('FIXTURE','LIVE')),
  PRIMARY KEY(tenant_id,version)
) STRICT;
CREATE UNIQUE INDEX one_active_policy ON policy_versions(tenant_id) WHERE active=1;
CREATE TABLE resources (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('SUBSCRIPTION','PAYMENT')),
  provenance TEXT NOT NULL CHECK(provenance IN ('FIXTURE','LIVE')),
  PRIMARY KEY(tenant_id,id,kind), FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id)
) STRICT;
CREATE TABLE requests (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
  customer_id TEXT NOT NULL, actor_id TEXT NOT NULL, original_text TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY(tenant_id,id,version),
  FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE TABLE proposals (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
  actor_id TEXT NOT NULL, proposal_json TEXT NOT NULL CHECK(json_valid(proposal_json)),
  conversation TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE TABLE receipts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, request_id TEXT NOT NULL, request_version INTEGER NOT NULL,
  binding_json TEXT NOT NULL CHECK(json_valid(binding_json)), parameter_digest TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>created_at), consumed_by_operation_id TEXT,
  UNIQUE(tenant_id,request_id,request_version), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version)
) STRICT;
CREATE TABLE approvals (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, receipt_id TEXT NOT NULL UNIQUE, binding_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL, approver_role TEXT NOT NULL CHECK(approver_role='REFUND_APPROVER'),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>created_at), consumed_by_operation_id TEXT,
  FOREIGN KEY(tenant_id,receipt_id) REFERENCES receipts(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE TABLE audit_events (
  sequence INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, request_id TEXT NOT NULL,
  request_version INTEGER NOT NULL, actor_id TEXT NOT NULL, event TEXT NOT NULL,
  detail_json TEXT NOT NULL CHECK(json_valid(detail_json)), created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id,request_id,request_version) REFERENCES requests(tenant_id,id,version),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES actors(tenant_id,id)
) STRICT;
CREATE INDEX proposal_case ON proposals(tenant_id,request_id,request_version);
CREATE INDEX audit_case ON audit_events(tenant_id,request_id,request_version,sequence);
