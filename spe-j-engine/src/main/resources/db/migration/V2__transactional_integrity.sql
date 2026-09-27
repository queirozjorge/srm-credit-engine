-- Protect historical data even for accidental writes with elevated application grants.
CREATE FUNCTION forbid_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro histórico imutável: %', TG_TABLE_NAME USING ERRCODE='23514'; END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['receivable','receivable_terms','exchange_rate','settlement','audit_event'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION forbid_history_change()',t||'_immutable',t);
 END LOOP;
END $$;

CREATE FUNCTION protect_operational_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed TEXT[]; terminal BOOLEAN := FALSE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Exclusão física proibida: %',TG_TABLE_NAME USING ERRCODE='23514'; END IF;
 allowed := ARRAY['version','date_updated'];
 CASE TG_TABLE_NAME
 WHEN 'assignor' THEN allowed := allowed || ARRAY['name','deleted'];
 WHEN 'batch' THEN allowed := allowed || ARRAY['active_request_uuid','status','ready_count','pending_count','settled_count','failed_count']; terminal:=OLD.status='SETTLED';
 WHEN 'receivable_processing' THEN allowed := allowed || ARRAY['active_attempt_uuid','status','has_error','attempt_number']; terminal:=OLD.status='SETTLED';
 WHEN 'settlement_request' THEN allowed := allowed || ARRAY['status','pending_count','settled_count','failed_count','completed_at']; terminal:=OLD.status<>'PENDING';
 WHEN 'settlement_request_item' THEN allowed := allowed || ARRAY['status','has_error','retry_count','next_retry_at','completed_at','failure_code','failure_message','failure_stage','failure_occurred_at']; terminal:=OLD.status<>'PENDING';
 WHEN 'exchange_rate_proposal' THEN allowed := allowed || ARRAY['status','decided_by_issuer','decided_by_subject','decided_at','decision_reason']; terminal:=OLD.status<>'PENDING';
 WHEN 'outbox_message' THEN allowed := allowed || ARRAY['status','publish_attempts','next_attempt_at','claim_token','claim_expires_at','sent_at']; terminal:=OLD.status='SENT';
 END CASE;
 IF terminal OR (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
 RAISE EXCEPTION 'Estado terminal ou conteúdo imutável: %',TG_TABLE_NAME USING ERRCODE='23514'; END IF;
 IF NEW.version<>OLD.version+1 OR NEW.date_updated IS NULL OR NOT isfinite(NEW.date_updated) OR NEW.date_updated<OLD.date_register THEN
 RAISE EXCEPTION 'Atualização exige versão incremental e instante válido: %',TG_TABLE_NAME USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='receivable_processing' THEN
   IF NEW.active_attempt_uuid IS DISTINCT FROM OLD.active_attempt_uuid THEN
     IF OLD.status NOT IN ('READY','FAILED') OR NEW.attempt_number<>OLD.attempt_number+1 OR NEW.status NOT IN ('PENDING','FAILED') THEN
       RAISE EXCEPTION 'Nova tentativa exige título pronto ou falho e ordinal seguinte' USING ERRCODE='23514'; END IF;
   ELSIF NEW.attempt_number<>OLD.attempt_number OR OLD.status='FAILED' OR NEW.status='READY' THEN
     RAISE EXCEPTION 'Transição do título inválida' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_TABLE_NAME='settlement_request_item' THEN
 IF NEW.retry_count<OLD.retry_count OR NEW.retry_count>OLD.retry_count+1 THEN
 RAISE EXCEPTION 'Orçamento de repetição inválido' USING ERRCODE='23514'; END IF; END IF;
 IF TG_TABLE_NAME='batch' THEN
 IF OLD.status IN ('FAILED','PARTIALLY_SETTLED') AND NEW.active_request_uuid IS NOT DISTINCT FROM OLD.active_request_uuid THEN
 RAISE EXCEPTION 'Reprocessamento exige nova solicitação' USING ERRCODE='23514'; END IF; END IF;
 IF TG_TABLE_NAME='outbox_message' THEN
   IF NOT ((OLD.status='READY' AND NEW.status='CLAIMED' AND NEW.publish_attempts=OLD.publish_attempts+1)
     OR (OLD.status='CLAIMED' AND NEW.status IN ('READY','SENT') AND NEW.publish_attempts=OLD.publish_attempts)) THEN
     RAISE EXCEPTION 'Transição da outbox inválida' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['assignor','batch','receivable_processing','settlement_request','settlement_request_item','exchange_rate_proposal','outbox_message'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION protect_operational_change()',t||'_protection',t);
 END LOOP;
END $$;

CREATE FUNCTION check_batch_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE b batch; c RECORD;
BEGIN
 SELECT * INTO STRICT b FROM batch WHERE uuid=id;
 SELECT count(*) total,count(*) FILTER(WHERE p.status='READY') ready,count(*) FILTER(WHERE p.status='PENDING') pending,
 count(*) FILTER(WHERE p.status='SETTLED') settled,count(*) FILTER(WHERE p.status='FAILED') failed INTO c
 FROM receivable r LEFT JOIN receivable_processing p ON p.receivable_uuid=r.uuid WHERE r.batch_uuid=id;
 IF ROW(c.total,c.ready,c.pending,c.settled,c.failed) IS DISTINCT FROM ROW(b.item_count::BIGINT,b.ready_count::BIGINT,b.pending_count::BIGINT,b.settled_count::BIGINT,b.failed_count::BIGINT) THEN
 RAISE EXCEPTION 'Contagens do lote incoerentes: %',id USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_event WHERE batch_uuid=id AND event_type='BATCH_CREATED') THEN
 RAISE EXCEPTION 'Cadastro do lote exige auditoria' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM settlement_request WHERE batch_uuid=id AND status='PENDING' AND uuid IS DISTINCT FROM b.active_request_uuid) THEN
 RAISE EXCEPTION 'Solicitação pendente deve ser a ativa' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION check_request_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE r settlement_request; c RECORD; q exchange_rate;
BEGIN
 SELECT * INTO STRICT r FROM settlement_request WHERE uuid=id;
 SELECT count(*) total,count(*) FILTER(WHERE status='PENDING') pending,count(*) FILTER(WHERE status='SETTLED') settled,count(*) FILTER(WHERE status='FAILED') failed INTO c
 FROM settlement_request_item WHERE request_uuid=id;
 IF ROW(c.total,c.pending,c.settled,c.failed) IS DISTINCT FROM ROW(r.item_count::BIGINT,r.pending_count::BIGINT,r.settled_count::BIGINT,r.failed_count::BIGINT) THEN
 RAISE EXCEPTION 'Contagens da solicitação incoerentes: %',id USING ERRCODE='23514'; END IF;
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

CREATE FUNCTION check_attempt_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a settlement_request_item; r receivable; req settlement_request; prev settlement_request_item; p receivable_processing; t receivable_terms; s settlement;
 normal_count INTEGER; dlq_count INTEGER; terminal_type TEXT;
BEGIN
 SELECT * INTO STRICT a FROM settlement_request_item WHERE uuid=id;
 SELECT * INTO STRICT r FROM receivable WHERE uuid=a.receivable_uuid;
 SELECT * INTO STRICT req FROM settlement_request WHERE uuid=a.request_uuid;
 SELECT * INTO STRICT p FROM receivable_processing WHERE receivable_uuid=a.receivable_uuid;
 IF req.batch_uuid<>r.batch_uuid THEN RAISE EXCEPTION 'Título e solicitação pertencem a lotes diferentes' USING ERRCODE='23514'; END IF;
 IF a.previous_attempt_uuid IS NULL THEN
 IF req.kind<>'INITIAL' OR a.attempt_number<>1 THEN RAISE EXCEPTION 'Primeira tentativa inválida' USING ERRCODE='23514'; END IF;
 ELSE
 SELECT * INTO STRICT prev FROM settlement_request_item WHERE uuid=a.previous_attempt_uuid;
 IF req.kind<>'REPROCESS' OR prev.status<>'FAILED' OR prev.receivable_uuid<>a.receivable_uuid OR prev.attempt_number+1<>a.attempt_number THEN
 RAISE EXCEPTION 'Tentativa anterior inválida' USING ERRCODE='23514'; END IF;
 END IF;
 IF p.attempt_number<>(SELECT max(attempt_number) FROM settlement_request_item WHERE receivable_uuid=a.receivable_uuid) THEN
 RAISE EXCEPTION 'Estado atual deve referenciar o último ordinal' USING ERRCODE='23514'; END IF;
 IF p.active_attempt_uuid=a.uuid AND (p.status<>a.status OR p.attempt_number<>a.attempt_number) THEN
 RAISE EXCEPTION 'Estado atual diverge da tentativa ativa' USING ERRCODE='23514'; END IF;
 IF a.status='PENDING' AND p.active_attempt_uuid<>a.uuid THEN RAISE EXCEPTION 'Tentativa pendente não ativa' USING ERRCODE='23514'; END IF;
 SELECT * INTO t FROM receivable_terms WHERE attempt_uuid=id;
 SELECT * INTO s FROM settlement WHERE attempt_uuid=id;
 SELECT count(*) FILTER(WHERE topic='credit-receivable'),count(*) FILTER(WHERE topic='credit-receivable.dlq') INTO normal_count,dlq_count FROM outbox_message WHERE attempt_uuid=id;
 IF a.failure_stage='ACCEPTANCE' THEN
 IF t.uuid IS NOT NULL OR normal_count<>0 OR dlq_count<>0 OR s.uuid IS NOT NULL THEN RAISE EXCEPTION 'Rejeição no aceite não pode ter condições, resultado ou outbox' USING ERRCODE='23514'; END IF;
 ELSE
 IF t.uuid IS NULL OR normal_count<>1 THEN RAISE EXCEPTION 'Tentativa apta exige condições e comando' USING ERRCODE='23514'; END IF;
 IF t.term_days<>r.due_date-req.calculation_date OR 1+req.base_rate+t.spread<=0 THEN RAISE EXCEPTION 'Condições inválidas' USING ERRCODE='23514'; END IF;
 IF r.payment_currency='USD' AND req.exchange_rate_uuid IS NULL THEN RAISE EXCEPTION 'Título USD exige cotação no snapshot' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_event WHERE attempt_uuid=id AND event_type='RECEIVABLE_ATTEMPT_ACCEPTED') THEN RAISE EXCEPTION 'Aceite exige auditoria' USING ERRCODE='23514'; END IF;
 END IF;
 IF (a.status='SETTLED')<>(s.uuid IS NOT NULL) THEN RAISE EXCEPTION 'Resultado financeiro diverge do estado da tentativa' USING ERRCODE='23514'; END IF;
 IF a.status='SETTLED' AND (p.active_attempt_uuid<>id OR p.status<>'SETTLED') THEN RAISE EXCEPTION 'Liquidação exige tentativa ativa concluída' USING ERRCODE='23514'; END IF;
 IF (a.status='FAILED' AND a.failure_stage='PROCESSING')<>(dlq_count=1) THEN RAISE EXCEPTION 'Falha de processamento exige DLQ exclusiva' USING ERRCODE='23514'; END IF;
 IF a.status='PENDING' AND EXISTS(SELECT 1 FROM audit_event WHERE attempt_uuid=id AND event_type IN ('RECEIVABLE_ATTEMPT_REJECTED','RECEIVABLE_SETTLED','RECEIVABLE_SETTLEMENT_FAILED')) THEN
 RAISE EXCEPTION 'Tentativa pendente não admite desfecho auditado' USING ERRCODE='23514'; END IF;
 IF a.status<>'PENDING' THEN
 terminal_type:=CASE WHEN a.status='SETTLED' THEN 'RECEIVABLE_SETTLED' WHEN a.failure_stage='ACCEPTANCE' THEN 'RECEIVABLE_ATTEMPT_REJECTED' ELSE 'RECEIVABLE_SETTLEMENT_FAILED' END;
 IF NOT EXISTS(SELECT 1 FROM audit_event WHERE attempt_uuid=id AND event_type=terminal_type) THEN RAISE EXCEPTION 'Tentativa terminal exige auditoria correspondente' USING ERRCODE='23514'; END IF;
 END IF;
 IF a.retry_count>0 AND NOT EXISTS(SELECT 1 FROM audit_event WHERE attempt_uuid=id AND event_type='RECEIVABLE_PROCESSING_RETRY_SCHEDULED' AND retry_number=a.retry_count) THEN
 RAISE EXCEPTION 'Repetição exige reserva auditada' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION check_proposal_integrity(id UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE p exchange_rate_proposal; q exchange_rate; expected TEXT;
BEGIN
 SELECT * INTO STRICT p FROM exchange_rate_proposal WHERE uuid=id;
 SELECT * INTO q FROM exchange_rate WHERE proposal_uuid=id;
 IF (p.status='APPROVED')<>(q.uuid IS NOT NULL) THEN RAISE EXCEPTION 'Aprovação exige cotação correspondente' USING ERRCODE='23514'; END IF;
 IF p.status='APPROVED' AND ROW(q.base_currency,q.quote_currency,q.rate,q.effective_from) IS DISTINCT FROM ROW(p.base_currency,p.quote_currency,p.proposed_rate,p.decided_at) THEN
 RAISE EXCEPTION 'Cotação diverge da proposta aprovada' USING ERRCODE='23514'; END IF;
 IF p.status='PENDING' AND EXISTS(SELECT 1 FROM audit_event WHERE proposal_uuid=id AND event_type IN ('EXCHANGE_RATE_APPROVED','EXCHANGE_RATE_REJECTED')) THEN
 RAISE EXCEPTION 'Proposta pendente não admite decisão auditada' USING ERRCODE='23514'; END IF;
 expected:=CASE p.status WHEN 'APPROVED' THEN 'EXCHANGE_RATE_APPROVED' WHEN 'REJECTED' THEN 'EXCHANGE_RATE_REJECTED' ELSE 'EXCHANGE_RATE_PROPOSED' END;
 IF NOT EXISTS(SELECT 1 FROM audit_event WHERE proposal_uuid=id AND event_type=expected) THEN RAISE EXCEPTION 'Proposta exige auditoria' USING ERRCODE='23514'; END IF;
END $$;

-- A private queue coalesces repeated checks within one transaction without trusting
-- client-editable session settings. It is empty after each successful commit.
CREATE TABLE pending_integrity_check (
 uuid UUID PRIMARY KEY, date_register TIMESTAMPTZ NOT NULL,
 transaction_id XID8 NOT NULL, entity_type VARCHAR NOT NULL CHECK(entity_type IN ('batch','request','attempt','proposal')),
 batch_uuid UUID REFERENCES batch(uuid), request_uuid UUID REFERENCES settlement_request(uuid),
 attempt_uuid UUID REFERENCES settlement_request_item(uuid), proposal_uuid UUID REFERENCES exchange_rate_proposal(uuid),
 entity_uuid UUID GENERATED ALWAYS AS(coalesce(batch_uuid,request_uuid,attempt_uuid,proposal_uuid)) STORED NOT NULL,
 CHECK(num_nonnulls(batch_uuid,request_uuid,attempt_uuid,proposal_uuid)=1),
 UNIQUE(transaction_id,entity_type,entity_uuid)
);
CREATE FUNCTION queue_integrity_check(kind TEXT, id UUID) RETURNS VOID
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 INSERT INTO public.pending_integrity_check(uuid,date_register,transaction_id,entity_type,batch_uuid,request_uuid,attempt_uuid,proposal_uuid)
 VALUES(gen_random_uuid(),clock_timestamp(),pg_current_xact_id(),kind,
 CASE WHEN kind='batch' THEN id END,CASE WHEN kind='request' THEN id END,
 CASE WHEN kind='attempt' THEN id END,CASE WHEN kind='proposal' THEN id END)
 ON CONFLICT(transaction_id,entity_type,entity_uuid) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION queue_integrity_check(TEXT,UUID) FROM PUBLIC;

CREATE FUNCTION verify_pending_integrity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 CASE NEW.entity_type
 WHEN 'batch' THEN PERFORM public.check_batch_integrity(NEW.entity_uuid);
 WHEN 'request' THEN PERFORM public.check_request_integrity(NEW.entity_uuid);
 WHEN 'attempt' THEN PERFORM public.check_attempt_integrity(NEW.entity_uuid);
 WHEN 'proposal' THEN PERFORM public.check_proposal_integrity(NEW.entity_uuid);
 END CASE;
 DELETE FROM public.pending_integrity_check WHERE uuid=NEW.uuid;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER pending_integrity_check_verify AFTER INSERT ON pending_integrity_check
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION verify_pending_integrity();

CREATE FUNCTION check_flow_integrity() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r receivable; a settlement_request_item; req settlement_request; t receivable_terms; p receivable_processing; x audit_event;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'batch' THEN PERFORM queue_integrity_check('batch',NEW.uuid);
 WHEN 'settlement_request' THEN PERFORM queue_integrity_check('request',NEW.uuid);
 WHEN 'settlement_request_item' THEN
 PERFORM queue_integrity_check('attempt',NEW.uuid);
 SELECT * INTO STRICT req FROM settlement_request WHERE uuid=NEW.request_uuid;
 PERFORM queue_integrity_check('request',req.uuid);
 PERFORM queue_integrity_check('batch',req.batch_uuid);
 WHEN 'receivable' THEN PERFORM queue_integrity_check('batch',NEW.batch_uuid);
 WHEN 'receivable_processing' THEN
 SELECT * INTO STRICT p FROM receivable_processing WHERE uuid=NEW.uuid;
 SELECT * INTO STRICT r FROM receivable WHERE uuid=p.receivable_uuid;
 IF p.active_attempt_uuid IS NOT NULL THEN PERFORM queue_integrity_check('attempt',p.active_attempt_uuid); END IF;
 PERFORM queue_integrity_check('batch',r.batch_uuid);
 WHEN 'receivable_terms' THEN PERFORM queue_integrity_check('attempt',NEW.attempt_uuid);
 WHEN 'settlement' THEN
 SELECT * INTO STRICT a FROM settlement_request_item WHERE uuid=NEW.attempt_uuid;
 SELECT * INTO STRICT t FROM receivable_terms WHERE uuid=NEW.terms_uuid;
 SELECT * INTO STRICT r FROM receivable WHERE uuid=NEW.receivable_uuid;
 IF a.request_uuid<>NEW.request_uuid OR r.batch_uuid<>NEW.batch_uuid OR t.attempt_uuid<>a.uuid OR r.payment_currency<>NEW.payment_currency OR r.face_value_brl-NEW.present_value_brl<>NEW.discount_brl THEN
 RAISE EXCEPTION 'Vínculos ou valores da liquidação inválidos' USING ERRCODE='23514'; END IF;
 PERFORM queue_integrity_check('attempt',NEW.attempt_uuid);
 WHEN 'outbox_message' THEN
 IF TG_OP='UPDATE' THEN RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM settlement_request_item WHERE uuid=NEW.attempt_uuid;
 SELECT * INTO STRICT req FROM settlement_request WHERE uuid=NEW.request_uuid;
 SELECT * INTO STRICT r FROM receivable WHERE uuid=NEW.receivable_uuid;
 IF a.request_uuid<>NEW.request_uuid OR r.batch_uuid<>NEW.batch_uuid OR NEW.payload<>jsonb_build_object('batchUuid',NEW.batch_uuid::TEXT,'receivableUuid',NEW.receivable_uuid::TEXT,'requestUuid',NEW.request_uuid::TEXT,'idempotencyKey',req.idempotency_key) THEN
 RAISE EXCEPTION 'Payload ou vínculos da outbox inválidos' USING ERRCODE='23514'; END IF;
 PERFORM queue_integrity_check('attempt',NEW.attempt_uuid);
 WHEN 'exchange_rate_proposal' THEN PERFORM queue_integrity_check('proposal',NEW.uuid);
 WHEN 'exchange_rate' THEN PERFORM queue_integrity_check('proposal',NEW.proposal_uuid);
 WHEN 'audit_event' THEN
 x:=NEW;
 IF x.request_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM settlement_request WHERE uuid=x.request_uuid AND batch_uuid=x.batch_uuid) THEN RAISE EXCEPTION 'Solicitação da auditoria inválida' USING ERRCODE='23514'; END IF;
 IF x.attempt_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM settlement_request_item WHERE uuid=x.attempt_uuid AND request_uuid=x.request_uuid AND receivable_uuid=x.receivable_uuid) THEN RAISE EXCEPTION 'Tentativa da auditoria inválida' USING ERRCODE='23514'; END IF;
 IF x.settlement_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM settlement WHERE uuid=x.settlement_uuid AND attempt_uuid=x.attempt_uuid) THEN RAISE EXCEPTION 'Resultado da auditoria inválido' USING ERRCODE='23514'; END IF;
 IF x.exchange_rate_uuid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM exchange_rate WHERE uuid=x.exchange_rate_uuid AND proposal_uuid=x.proposal_uuid) THEN RAISE EXCEPTION 'Cotação da auditoria inválida' USING ERRCODE='23514'; END IF;
 IF x.attempt_uuid IS NOT NULL THEN PERFORM queue_integrity_check('attempt',x.attempt_uuid); END IF;
 IF x.proposal_uuid IS NOT NULL THEN PERFORM queue_integrity_check('proposal',x.proposal_uuid); END IF;
 END CASE;
 RETURN NULL;
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['batch','receivable','receivable_processing','settlement_request','settlement_request_item','receivable_terms','settlement','outbox_message','audit_event','exchange_rate_proposal','exchange_rate'] LOOP
 EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION check_flow_integrity()',t||'_flow_integrity',t);
 END LOOP;
END $$;
