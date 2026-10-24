CREATE TABLE provider_accounts (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), account_id TEXT NOT NULL,
 provenance TEXT NOT NULL CHECK(provenance IN('FIXTURE','LIVE')), verified_at TEXT NOT NULL,
 UNIQUE(tenant_id,account_id)
) STRICT;
CREATE TABLE provider_customers (
 tenant_id TEXT NOT NULL, customer_id TEXT NOT NULL, account_id TEXT NOT NULL, provider_customer_id TEXT NOT NULL,
 provenance TEXT NOT NULL CHECK(provenance IN('FIXTURE','LIVE')), verified_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,customer_id), UNIQUE(account_id,provider_customer_id),
 FOREIGN KEY(tenant_id,customer_id) REFERENCES customers(tenant_id,id),
 FOREIGN KEY(tenant_id,account_id) REFERENCES provider_accounts(tenant_id,account_id)
) STRICT;
