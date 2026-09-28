package com.backend.settlement.repository;

import com.backend.settlement.model.SettlementQuarantineEntry;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SettlementQuarantineRepository {
    private final JdbcTemplate jdbc;

    public SettlementQuarantineRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void insertIfAbsent(SettlementQuarantineEntry entry) {
        int inserted = jdbc.update("""
            INSERT INTO settlement_consumer_quarantine(uuid,source_topic,source_partition,source_offset,
                key_sha256,key_size_bytes,value_sha256,value_size_bytes,failure_code,date_register)
            VALUES(?,?,?,?,?,?,?,?,?,clock_timestamp())
            ON CONFLICT(source_topic,source_partition,source_offset) DO NOTHING
            """, UUID.randomUUID(), entry.sourceTopic(), entry.sourcePartition(), entry.sourceOffset(),
                entry.keySha256(), entry.keySizeBytes(), entry.valueSha256(), entry.valueSizeBytes(), entry.failureCode());
        if (inserted == 1) return;

        var existing = jdbc.queryForObject("""
            SELECT key_sha256,value_sha256,key_size_bytes,value_size_bytes,failure_code
            FROM settlement_consumer_quarantine
            WHERE source_topic=? AND source_partition=? AND source_offset=?
            """, (rs, row) -> new StoredEntry(rs.getString("key_sha256"), rs.getString("value_sha256"),
                rs.getInt("key_size_bytes"), rs.getInt("value_size_bytes"), rs.getString("failure_code")),
            entry.sourceTopic(), entry.sourcePartition(), entry.sourceOffset());
        if (existing == null || !Objects.equals(existing.keySha256(), entry.keySha256())
                || !Objects.equals(existing.valueSha256(), entry.valueSha256())
                || existing.keySizeBytes() != entry.keySizeBytes()
                || existing.valueSizeBytes() != entry.valueSizeBytes()
                || !existing.failureCode().equals(entry.failureCode())) {
            throw new IllegalStateException("A identidade do registro em quarentena já existe com conteúdo diferente.");
        }
    }

    private record StoredEntry(String keySha256, String valueSha256, int keySizeBytes, int valueSizeBytes, String failureCode) {}
}
