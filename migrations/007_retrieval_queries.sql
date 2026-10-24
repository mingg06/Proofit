CREATE TABLE retrieval_queries (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES investigations(id),
 purpose TEXT NOT NULL CHECK(purpose IN('REQUEST','POLICY')), source_id TEXT NOT NULL, source_version TEXT NOT NULL,
 query_reference TEXT NOT NULL, provenance TEXT NOT NULL CHECK(provenance IN('LIVE','CONTROLLED_TEST')),
 adapter_version TEXT NOT NULL, row_count INTEGER NOT NULL CHECK(row_count BETWEEN 1 AND 5),
 retrieved_at TEXT NOT NULL, latency_ms INTEGER NOT NULL CHECK(latency_ms>=0)
) STRICT;
CREATE TABLE retrieval_evidence (
 evidence_id TEXT PRIMARY KEY REFERENCES evidence_records(id), query_id TEXT NOT NULL REFERENCES retrieval_queries(id)
) STRICT;
CREATE INDEX retrieval_run ON retrieval_queries(run_id);
