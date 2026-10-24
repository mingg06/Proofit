CREATE TABLE resource_leases (
 resource_key TEXT PRIMARY KEY, lease_id TEXT NOT NULL UNIQUE, tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL CHECK(expires_at>created_at),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id)
) STRICT;
