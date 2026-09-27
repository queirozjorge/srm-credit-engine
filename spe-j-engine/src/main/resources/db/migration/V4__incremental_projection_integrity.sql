-- Replace O(batch size) recounts on every title commit with transaction-local
-- conservation of counters. Existing rows are verified once before activation.
-- Application roles cannot access the private queue or call its writer.
LOCK TABLE batch, receivable, receivable_processing, settlement_request,
    settlement_request_item, pending_integrity_check IN SHARE ROW EXCLUSIVE MODE;
DO $$ DECLARE entity UUID; BEGIN
    FOR entity IN SELECT uuid FROM batch LOOP PERFORM check_batch_integrity(entity); END LOOP;
    FOR entity IN SELECT uuid FROM settlement_request LOOP PERFORM check_request_integrity(entity); END LOOP;
    IF EXISTS(SELECT 1 FROM pending_integrity_check) THEN
        RAISE EXCEPTION 'A fila de integridade deve estar vazia antes da migração' USING ERRCODE='23514';
    END IF;
END $$;

ALTER TABLE pending_integrity_check
    ADD COLUMN total_delta BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN ready_delta BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN pending_delta BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN settled_delta BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN failed_delta BIGINT NOT NULL DEFAULT 0;

CREATE FUNCTION queue_projection_delta(kind TEXT, id UUID, total BIGINT, ready BIGINT,
    pending BIGINT, settled BIGINT, failed BIGINT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
    INSERT INTO public.pending_integrity_check(uuid,date_register,transaction_id,entity_type,batch_uuid,request_uuid,
        total_delta,ready_delta,pending_delta,settled_delta,failed_delta)
    VALUES(gen_random_uuid(),clock_timestamp(),pg_current_xact_id(),kind,
        CASE WHEN kind='batch' THEN id END,CASE WHEN kind='request' THEN id END,
        total,ready,pending,settled,failed)
    ON CONFLICT(transaction_id,entity_type,entity_uuid) DO UPDATE SET
        total_delta=public.pending_integrity_check.total_delta+EXCLUDED.total_delta,
        ready_delta=public.pending_integrity_check.ready_delta+EXCLUDED.ready_delta,
        pending_delta=public.pending_integrity_check.pending_delta+EXCLUDED.pending_delta,
        settled_delta=public.pending_integrity_check.settled_delta+EXCLUDED.settled_delta,
        failed_delta=public.pending_integrity_check.failed_delta+EXCLUDED.failed_delta;
END $$;
REVOKE ALL ON FUNCTION queue_projection_delta(TEXT,UUID,BIGINT,BIGINT,BIGINT,BIGINT,BIGINT) FROM PUBLIC;

CREATE FUNCTION capture_projection_delta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE previous JSONB := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::JSONB END;
    batch_id UUID; old_status TEXT := coalesce(previous->>'status','');
BEGIN
    CASE TG_TABLE_NAME
    WHEN 'batch' THEN
        PERFORM public.queue_projection_delta('batch',NEW.uuid,
            coalesce((previous->>'item_count')::BIGINT,0)-NEW.item_count,
            coalesce((previous->>'ready_count')::BIGINT,0)-NEW.ready_count,
            coalesce((previous->>'pending_count')::BIGINT,0)-NEW.pending_count,
            coalesce((previous->>'settled_count')::BIGINT,0)-NEW.settled_count,
            coalesce((previous->>'failed_count')::BIGINT,0)-NEW.failed_count);
    WHEN 'settlement_request' THEN
        PERFORM public.queue_projection_delta('request',NEW.uuid,
            coalesce((previous->>'item_count')::BIGINT,0)-NEW.item_count,0,
            coalesce((previous->>'pending_count')::BIGINT,0)-NEW.pending_count,
            coalesce((previous->>'settled_count')::BIGINT,0)-NEW.settled_count,
            coalesce((previous->>'failed_count')::BIGINT,0)-NEW.failed_count);
    WHEN 'receivable' THEN
        PERFORM public.queue_projection_delta('batch',NEW.batch_uuid,1,0,0,0,0);
    WHEN 'receivable_processing' THEN
        SELECT batch_uuid INTO STRICT batch_id FROM public.receivable WHERE uuid=NEW.receivable_uuid;
        PERFORM public.queue_projection_delta('batch',batch_id,0,
            (NEW.status='READY')::INTEGER-(old_status='READY')::INTEGER,
            (NEW.status='PENDING')::INTEGER-(old_status='PENDING')::INTEGER,
            (NEW.status='SETTLED')::INTEGER-(old_status='SETTLED')::INTEGER,
            (NEW.status='FAILED')::INTEGER-(old_status='FAILED')::INTEGER);
    WHEN 'settlement_request_item' THEN
        PERFORM public.queue_projection_delta('request',NEW.request_uuid,(TG_OP='INSERT')::INTEGER,0,
            (NEW.status='PENDING')::INTEGER-(old_status='PENDING')::INTEGER,
            (NEW.status='SETTLED')::INTEGER-(old_status='SETTLED')::INTEGER,
            (NEW.status='FAILED')::INTEGER-(old_status='FAILED')::INTEGER);
    END CASE;
    RETURN NULL;
END $$;
DO $$ DECLARE entity TEXT; BEGIN
    FOREACH entity IN ARRAY ARRAY['batch','receivable','receivable_processing','settlement_request','settlement_request_item'] LOOP
        EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION capture_projection_delta()',
            entity||'_projection_delta',entity);
    END LOOP;
END $$;

-- Conservation is checked using the final queue row, not the NEW image captured
-- by the first deferred INSERT. Multiple titles/updates coalesce into one check.
CREATE FUNCTION check_projection_delta(kind TEXT, id UUID) RETURNS VOID
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM public.pending_integrity_check
        WHERE transaction_id=pg_current_xact_id() AND entity_type=kind AND entity_uuid=id
          AND (total_delta<>0 OR ready_delta<>0 OR pending_delta<>0 OR settled_delta<>0 OR failed_delta<>0)) THEN
        RAISE EXCEPTION 'Contagens incrementais incoerentes: % %',kind,id USING ERRCODE='23514';
    END IF;
END $$;
REVOKE ALL ON FUNCTION check_projection_delta(TEXT,UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION check_batch_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE b batch;
BEGIN
    PERFORM public.check_projection_delta('batch',id);
    SELECT * INTO STRICT b FROM batch WHERE uuid=id;
    IF NOT EXISTS(SELECT 1 FROM audit_event WHERE batch_uuid=id AND event_type='BATCH_CREATED') THEN
        RAISE EXCEPTION 'Cadastro do lote exige auditoria' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM settlement_request WHERE batch_uuid=id AND status='PENDING' AND uuid IS DISTINCT FROM b.active_request_uuid) THEN
        RAISE EXCEPTION 'Solicitação pendente deve ser a ativa' USING ERRCODE='23514'; END IF;
END $$;

CREATE OR REPLACE FUNCTION check_request_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r settlement_request; q exchange_rate;
BEGIN
    PERFORM public.check_projection_delta('request',id);
    SELECT * INTO STRICT r FROM settlement_request WHERE uuid=id;
    IF r.kind='INITIAL' AND r.item_count<>(SELECT item_count FROM batch WHERE uuid=r.batch_uuid) THEN
        RAISE EXCEPTION 'Solicitação inicial deve conter todo o lote' USING ERRCODE='23514'; END IF;
    IF NOT EXISTS(SELECT 1 FROM audit_event WHERE request_uuid=id AND event_type=CASE r.kind WHEN 'INITIAL' THEN 'SETTLEMENT_REQUESTED' ELSE 'SETTLEMENT_REPROCESS_REQUESTED' END) THEN
        RAISE EXCEPTION 'Solicitação exige auditoria' USING ERRCODE='23514'; END IF;
    IF r.exchange_rate_uuid IS NOT NULL THEN
        SELECT * INTO STRICT q FROM exchange_rate WHERE uuid=r.exchange_rate_uuid;
        IF ROW(q.rate,q.effective_from) IS DISTINCT FROM ROW(r.exchange_rate_value,r.exchange_rate_effective_from)
            OR q.effective_from>r.accepted_at OR q.effective_from<r.accepted_at-INTERVAL '24 hours'
            OR EXISTS(SELECT 1 FROM exchange_rate newer WHERE newer.effective_from<=r.accepted_at AND newer.effective_from>q.effective_from) THEN
            RAISE EXCEPTION 'Snapshot cambial inválido' USING ERRCODE='23514'; END IF;
    END IF;
END $$;

-- Avoid filtering all historical events of a large batch merely to find its registration.
CREATE INDEX audit_batch_created_idx ON audit_event(batch_uuid) WHERE event_type='BATCH_CREATED';
