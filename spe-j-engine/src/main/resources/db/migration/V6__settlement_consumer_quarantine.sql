CREATE TABLE settlement_consumer_quarantine (
    uuid UUID PRIMARY KEY,
    source_topic VARCHAR(249) NOT NULL CHECK(source_topic='credit-receivable'),
    source_partition INTEGER NOT NULL CHECK(source_partition>=0),
    source_offset BIGINT NOT NULL CHECK(source_offset>=0),
    key_sha256 CHAR(64) CHECK(key_sha256 IS NULL OR key_sha256 ~ '^[0-9a-f]{64}$'),
    key_size_bytes INTEGER NOT NULL CHECK(key_size_bytes>=0),
    value_sha256 CHAR(64) CHECK(value_sha256 IS NULL OR value_sha256 ~ '^[0-9a-f]{64}$'),
    value_size_bytes INTEGER NOT NULL CHECK(value_size_bytes>=0),
    failure_code VARCHAR(80) NOT NULL CHECK(failure_code IN ('COMANDO_MALFORMADO','COMANDO_NAO_CORRELACIONADO')),
    date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)),
    UNIQUE(source_topic,source_partition,source_offset)
);

REVOKE ALL ON TABLE settlement_consumer_quarantine FROM PUBLIC, "${engineRole}", "${workflowRole}";
GRANT SELECT ON settlement_consumer_quarantine TO "${engineRole}";
GRANT SELECT,INSERT ON settlement_consumer_quarantine TO "${workflowRole}";
