CREATE TABLE assignor (
 uuid UUID PRIMARY KEY, document_number VARCHAR(14) NOT NULL UNIQUE CHECK (document_number ~ '^[0-9]{14}$'),
 name VARCHAR(200) NOT NULL CHECK (btrim(name) <> ''), deleted BOOLEAN NOT NULL DEFAULT FALSE,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version >= 0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ
);
CREATE TABLE batch (
 uuid UUID PRIMARY KEY, active_request_uuid UUID, source VARCHAR NOT NULL CHECK(source IN ('FORM','CSV','CNAB')),
 status VARCHAR NOT NULL CHECK(status IN ('READY','PENDING','SETTLED','PARTIALLY_SETTLED','FAILED')),
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 1000),
 ready_count INTEGER NOT NULL CHECK(ready_count >= 0), pending_count INTEGER NOT NULL CHECK(pending_count >= 0),
 settled_count INTEGER NOT NULL CHECK(settled_count >= 0), failed_count INTEGER NOT NULL CHECK(failed_count >= 0),
 created_by_issuer VARCHAR NOT NULL CHECK(btrim(created_by_issuer) <> ''), created_by_subject VARCHAR NOT NULL CHECK(btrim(created_by_subject) <> ''),
 version BIGINT NOT NULL DEFAULT 0 CHECK(version >= 0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 CHECK(ready_count + pending_count + settled_count + failed_count = item_count),
 CHECK((status='READY' AND ready_count=item_count AND active_request_uuid IS NULL)
 OR (status<>'READY' AND ready_count=0 AND active_request_uuid IS NOT NULL AND
 ((status='PENDING' AND pending_count>0) OR (status='SETTLED' AND settled_count=item_count)
 OR (status='FAILED' AND failed_count=item_count) OR (status='PARTIALLY_SETTLED' AND pending_count=0 AND settled_count>0 AND failed_count>0))))
);
CREATE TABLE receivable (
 uuid UUID PRIMARY KEY, batch_uuid UUID NOT NULL REFERENCES batch(uuid), assignor_uuid UUID NOT NULL REFERENCES assignor(uuid),
 external_reference VARCHAR NOT NULL CHECK(external_reference=btrim(external_reference) AND external_reference<>''),
 type VARCHAR NOT NULL CHECK(type IN ('DUPLICATA_MERCANTIL','CHEQUE_PRE_DATADO')),
 face_value_brl NUMERIC(19,2) NOT NULL CHECK(face_value_brl>0 AND face_value_brl<>'NaN'::numeric),
 due_date DATE NOT NULL CHECK(isfinite(due_date)), payment_currency VARCHAR NOT NULL CHECK(payment_currency IN ('BRL','USD')),
 date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), UNIQUE(assignor_uuid,type,external_reference)
);
CREATE TABLE exchange_rate_proposal (
 uuid UUID PRIMARY KEY, base_currency VARCHAR NOT NULL CHECK(base_currency='USD'), quote_currency VARCHAR NOT NULL CHECK(quote_currency='BRL'),
 proposed_rate NUMERIC(24,12) NOT NULL CHECK(proposed_rate>0 AND proposed_rate<>'NaN'::numeric), justification TEXT NOT NULL CHECK(btrim(justification)<>''),
 status VARCHAR NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
 requested_by_issuer VARCHAR NOT NULL CHECK(btrim(requested_by_issuer)<>''), requested_by_subject VARCHAR NOT NULL CHECK(btrim(requested_by_subject)<>''),
 decided_by_issuer VARCHAR, decided_by_subject VARCHAR, decided_at TIMESTAMPTZ, decision_reason TEXT,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 CHECK((status='PENDING' AND decided_by_issuer IS NULL AND decided_by_subject IS NULL AND decided_at IS NULL AND decision_reason IS NULL)
 OR (status<>'PENDING' AND decided_by_issuer IS NOT NULL AND btrim(decided_by_issuer)<>'' AND decided_by_subject IS NOT NULL AND btrim(decided_by_subject)<>''
 AND decided_at IS NOT NULL AND isfinite(decided_at) AND decided_at>=date_register
 AND (decided_by_issuer<>requested_by_issuer OR decided_by_subject<>requested_by_subject)
 AND (status='APPROVED' OR (decision_reason IS NOT NULL AND btrim(decision_reason)<>''))))
);
CREATE TABLE exchange_rate (
 uuid UUID PRIMARY KEY, proposal_uuid UUID NOT NULL UNIQUE REFERENCES exchange_rate_proposal(uuid),
 base_currency VARCHAR NOT NULL CHECK(base_currency='USD'), quote_currency VARCHAR NOT NULL CHECK(quote_currency='BRL'),
 rate NUMERIC(24,12) NOT NULL CHECK(rate>0 AND rate<>'NaN'::numeric), effective_from TIMESTAMPTZ NOT NULL CHECK(isfinite(effective_from)),
 date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), UNIQUE(base_currency,quote_currency,effective_from)
);
CREATE TABLE settlement_request (
 uuid UUID PRIMARY KEY, batch_uuid UUID NOT NULL REFERENCES batch(uuid), operation VARCHAR NOT NULL CHECK(operation='SETTLEMENT'),
 kind VARCHAR NOT NULL CHECK(kind IN ('INITIAL','REPROCESS')), reason VARCHAR(500), idempotency_key VARCHAR NOT NULL CHECK(btrim(idempotency_key)<>''),
 request_fingerprint TEXT NOT NULL CHECK(btrim(request_fingerprint)<>''), status VARCHAR NOT NULL CHECK(status IN ('PENDING','SETTLED','PARTIALLY_SETTLED','FAILED')),
 item_count INTEGER NOT NULL CHECK(item_count BETWEEN 1 AND 1000), pending_count INTEGER NOT NULL CHECK(pending_count>=0),
 settled_count INTEGER NOT NULL CHECK(settled_count>=0), failed_count INTEGER NOT NULL CHECK(failed_count>=0),
 accepted_at TIMESTAMPTZ NOT NULL CHECK(isfinite(accepted_at)), completed_at TIMESTAMPTZ,
 requested_by_issuer VARCHAR NOT NULL CHECK(btrim(requested_by_issuer)<>''), requested_by_subject VARCHAR NOT NULL CHECK(btrim(requested_by_subject)<>''),
 calculation_date DATE NOT NULL CHECK(isfinite(calculation_date)), term_convention VARCHAR NOT NULL CHECK(term_convention='ACTUAL_30'),
 base_rate NUMERIC(24,12) NOT NULL CHECK(base_rate<>'NaN'::numeric), rule_version VARCHAR NOT NULL CHECK(btrim(rule_version)<>''),
 calculation_policy VARCHAR NOT NULL CHECK(calculation_policy='DECIMAL_50'), rounding_policy VARCHAR NOT NULL CHECK(rounding_policy='HALF_EVEN'),
 exchange_rate_uuid UUID REFERENCES exchange_rate(uuid), exchange_rate_value NUMERIC(24,12), exchange_rate_effective_from TIMESTAMPTZ,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 UNIQUE(operation,idempotency_key), UNIQUE(uuid,batch_uuid),
 CHECK((kind='INITIAL' AND reason IS NULL) OR (kind='REPROCESS' AND reason IS NOT NULL AND reason=btrim(reason) AND reason<>'')),
 CHECK(pending_count+settled_count+failed_count=item_count),
 CHECK((status='PENDING' AND pending_count>0 AND completed_at IS NULL)
 OR (completed_at IS NOT NULL AND isfinite(completed_at) AND completed_at>=accepted_at AND pending_count=0 AND
 ((status='SETTLED' AND settled_count=item_count) OR (status='FAILED' AND failed_count=item_count) OR (status='PARTIALLY_SETTLED' AND settled_count>0 AND failed_count>0)))),
 CHECK((exchange_rate_uuid IS NULL AND exchange_rate_value IS NULL AND exchange_rate_effective_from IS NULL)
 OR (exchange_rate_uuid IS NOT NULL AND exchange_rate_value IS NOT NULL AND exchange_rate_value>0 AND exchange_rate_value<>'NaN'::numeric
 AND exchange_rate_effective_from IS NOT NULL AND isfinite(exchange_rate_effective_from)))
);
ALTER TABLE batch ADD CONSTRAINT batch_active_request_fk FOREIGN KEY(active_request_uuid,uuid) REFERENCES settlement_request(uuid,batch_uuid) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX settlement_request_pending_uq ON settlement_request(batch_uuid) WHERE status='PENDING';
CREATE UNIQUE INDEX settlement_request_initial_uq ON settlement_request(batch_uuid) WHERE kind='INITIAL';
CREATE TABLE settlement_request_item (
 uuid UUID PRIMARY KEY, request_uuid UUID NOT NULL REFERENCES settlement_request(uuid), receivable_uuid UUID NOT NULL REFERENCES receivable(uuid),
 previous_attempt_uuid UUID, attempt_number INTEGER NOT NULL CHECK(attempt_number>0), status VARCHAR NOT NULL CHECK(status IN ('PENDING','SETTLED','FAILED')),
 has_error BOOLEAN GENERATED ALWAYS AS(status='FAILED') STORED NOT NULL,
 retry_count INTEGER NOT NULL DEFAULT 0 CHECK(retry_count BETWEEN 0 AND 3), next_retry_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
 failure_code VARCHAR, failure_message TEXT, failure_stage VARCHAR, failure_occurred_at TIMESTAMPTZ,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 UNIQUE(request_uuid,receivable_uuid), UNIQUE(receivable_uuid,attempt_number), UNIQUE(uuid,receivable_uuid),
 FOREIGN KEY(previous_attempt_uuid,receivable_uuid) REFERENCES settlement_request_item(uuid,receivable_uuid),
 CHECK((attempt_number=1 AND previous_attempt_uuid IS NULL) OR (attempt_number>1 AND previous_attempt_uuid IS NOT NULL)),
 CHECK((status='PENDING' AND completed_at IS NULL) OR (status<>'PENDING' AND completed_at IS NOT NULL AND isfinite(completed_at) AND completed_at>=date_register AND next_retry_at IS NULL)),
 CHECK(next_retry_at IS NULL OR (isfinite(next_retry_at) AND retry_count>0)),
 CHECK((status='FAILED' AND failure_code IS NOT NULL AND btrim(failure_code)<>'' AND failure_message IS NOT NULL AND btrim(failure_message)<>''
 AND failure_stage IS NOT NULL AND failure_stage IN ('ACCEPTANCE','PROCESSING') AND failure_occurred_at IS NOT NULL AND isfinite(failure_occurred_at))
 OR (status<>'FAILED' AND failure_code IS NULL AND failure_message IS NULL AND failure_stage IS NULL AND failure_occurred_at IS NULL)),
 CHECK(failure_stage IS DISTINCT FROM 'ACCEPTANCE' OR retry_count=0)
);
CREATE UNIQUE INDEX settlement_request_item_pending_uq ON settlement_request_item(receivable_uuid) WHERE status='PENDING';
CREATE TABLE receivable_processing (
 uuid UUID PRIMARY KEY, receivable_uuid UUID NOT NULL UNIQUE REFERENCES receivable(uuid), active_attempt_uuid UUID,
 status VARCHAR NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','PENDING','SETTLED','FAILED')),
 has_error BOOLEAN GENERATED ALWAYS AS(status='FAILED') STORED NOT NULL, attempt_number INTEGER NOT NULL CHECK(attempt_number>=0),
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 FOREIGN KEY(active_attempt_uuid,receivable_uuid) REFERENCES settlement_request_item(uuid,receivable_uuid) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status='READY' AND active_attempt_uuid IS NULL AND attempt_number=0) OR (status<>'READY' AND active_attempt_uuid IS NOT NULL AND attempt_number>0))
);
CREATE TABLE receivable_terms (
 uuid UUID PRIMARY KEY, attempt_uuid UUID NOT NULL UNIQUE REFERENCES settlement_request_item(uuid), term_days INTEGER NOT NULL CHECK(term_days>=0),
 spread NUMERIC(24,12) NOT NULL CHECK(spread<>'NaN'::numeric), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register))
);
CREATE TABLE settlement (
 uuid UUID PRIMARY KEY, batch_uuid UUID NOT NULL REFERENCES batch(uuid), request_uuid UUID NOT NULL,
 receivable_uuid UUID NOT NULL UNIQUE REFERENCES receivable(uuid), attempt_uuid UUID NOT NULL UNIQUE,
 terms_uuid UUID NOT NULL UNIQUE REFERENCES receivable_terms(uuid), settled_at TIMESTAMPTZ NOT NULL CHECK(isfinite(settled_at)),
 present_value_brl NUMERIC(19,2) NOT NULL CHECK(present_value_brl>=0 AND present_value_brl<>'NaN'::numeric),
 discount_brl NUMERIC(19,2) NOT NULL CHECK(discount_brl<>'NaN'::numeric),
 payment_amount NUMERIC(19,2) NOT NULL CHECK(payment_amount>=0 AND payment_amount<>'NaN'::numeric),
 payment_currency VARCHAR NOT NULL CHECK(payment_currency IN ('BRL','USD')), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)),
 FOREIGN KEY(request_uuid,batch_uuid) REFERENCES settlement_request(uuid,batch_uuid),
 FOREIGN KEY(attempt_uuid,receivable_uuid) REFERENCES settlement_request_item(uuid,receivable_uuid),
 CHECK(payment_currency<>'BRL' OR payment_amount=present_value_brl)
);
CREATE TABLE outbox_message (
 uuid UUID PRIMARY KEY, batch_uuid UUID NOT NULL REFERENCES batch(uuid), request_uuid UUID NOT NULL, receivable_uuid UUID NOT NULL REFERENCES receivable(uuid), attempt_uuid UUID NOT NULL,
 topic VARCHAR NOT NULL CHECK(topic IN ('credit-receivable','credit-receivable.dlq')), status VARCHAR NOT NULL CHECK(status IN ('READY','CLAIMED','SENT')),
 payload JSONB NOT NULL, publish_attempts INTEGER NOT NULL DEFAULT 0 CHECK(publish_attempts>=0), next_attempt_at TIMESTAMPTZ,
 claim_token UUID, claim_expires_at TIMESTAMPTZ, sent_at TIMESTAMPTZ,
 version BIGINT NOT NULL DEFAULT 0 CHECK(version>=0), date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)), date_updated TIMESTAMPTZ,
 UNIQUE(attempt_uuid,topic), FOREIGN KEY(request_uuid,batch_uuid) REFERENCES settlement_request(uuid,batch_uuid),
 FOREIGN KEY(attempt_uuid,receivable_uuid) REFERENCES settlement_request_item(uuid,receivable_uuid),
 CHECK(jsonb_typeof(payload)='object' AND payload ?& ARRAY['batchUuid','receivableUuid','requestUuid','idempotencyKey']
 AND payload - ARRAY['batchUuid','receivableUuid','requestUuid','idempotencyKey'] = '{}'::jsonb
 AND jsonb_typeof(payload->'batchUuid')='string' AND jsonb_typeof(payload->'receivableUuid')='string'
 AND jsonb_typeof(payload->'requestUuid')='string' AND jsonb_typeof(payload->'idempotencyKey')='string'),
 CHECK((status='READY' AND next_attempt_at IS NOT NULL AND isfinite(next_attempt_at) AND claim_token IS NULL AND claim_expires_at IS NULL AND sent_at IS NULL)
 OR (status='CLAIMED' AND next_attempt_at IS NULL AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL AND isfinite(claim_expires_at) AND sent_at IS NULL)
 OR (status='SENT' AND next_attempt_at IS NULL AND claim_token IS NULL AND claim_expires_at IS NULL AND sent_at IS NOT NULL AND isfinite(sent_at)))
);
CREATE TABLE audit_event (
 uuid UUID PRIMARY KEY, batch_uuid UUID REFERENCES batch(uuid), request_uuid UUID REFERENCES settlement_request(uuid),
 receivable_uuid UUID REFERENCES receivable(uuid), attempt_uuid UUID REFERENCES settlement_request_item(uuid), settlement_uuid UUID UNIQUE REFERENCES settlement(uuid),
 retry_number INTEGER CHECK(retry_number BETWEEN 0 AND 3), assignor_uuid UUID REFERENCES assignor(uuid),
 proposal_uuid UUID REFERENCES exchange_rate_proposal(uuid), exchange_rate_uuid UUID REFERENCES exchange_rate(uuid),
 event_type VARCHAR NOT NULL CHECK(event_type IN ('ASSIGNOR_CREATED','ASSIGNOR_UPDATED','ASSIGNOR_DELETED','ASSIGNOR_RESTORED','BATCH_CREATED',
 'SETTLEMENT_REQUESTED','SETTLEMENT_REPROCESS_REQUESTED','RECEIVABLE_ATTEMPT_ACCEPTED','RECEIVABLE_ATTEMPT_REJECTED',
 'RECEIVABLE_PROCESSING_RETRY_SCHEDULED','RECEIVABLE_PROCESSING_ATTEMPT_FAILED','RECEIVABLE_SETTLED','RECEIVABLE_SETTLEMENT_FAILED',
 'EXCHANGE_RATE_PROPOSED','EXCHANGE_RATE_APPROVED','EXCHANGE_RATE_REJECTED')),
 actor_issuer VARCHAR NOT NULL CHECK(btrim(actor_issuer)<>''), actor_subject VARCHAR NOT NULL CHECK(btrim(actor_subject)<>''),
 correlation_id VARCHAR NOT NULL CHECK(btrim(correlation_id)<>''), details JSONB NOT NULL CHECK(jsonb_typeof(details)='object'),
 date_register TIMESTAMPTZ NOT NULL CHECK(isfinite(date_register)),
 CHECK((event_type LIKE 'ASSIGNOR_%' AND assignor_uuid IS NOT NULL AND batch_uuid IS NULL AND proposal_uuid IS NULL)
 OR (event_type='BATCH_CREATED' AND batch_uuid IS NOT NULL AND request_uuid IS NULL AND assignor_uuid IS NULL AND proposal_uuid IS NULL)
 OR (event_type IN ('SETTLEMENT_REQUESTED','SETTLEMENT_REPROCESS_REQUESTED') AND batch_uuid IS NOT NULL AND request_uuid IS NOT NULL AND receivable_uuid IS NULL AND assignor_uuid IS NULL AND proposal_uuid IS NULL)
 OR (event_type LIKE 'RECEIVABLE_%' AND batch_uuid IS NOT NULL AND request_uuid IS NOT NULL AND receivable_uuid IS NOT NULL AND attempt_uuid IS NOT NULL AND assignor_uuid IS NULL AND proposal_uuid IS NULL)
 OR (event_type LIKE 'EXCHANGE_RATE_%' AND proposal_uuid IS NOT NULL AND batch_uuid IS NULL AND assignor_uuid IS NULL)),
 CHECK((event_type='RECEIVABLE_SETTLED')=(settlement_uuid IS NOT NULL)),
 CHECK((event_type='EXCHANGE_RATE_APPROVED')=(exchange_rate_uuid IS NOT NULL)),
 CHECK((event_type IN ('RECEIVABLE_PROCESSING_RETRY_SCHEDULED','RECEIVABLE_PROCESSING_ATTEMPT_FAILED'))=(retry_number IS NOT NULL)),
 CHECK(event_type<>'RECEIVABLE_PROCESSING_RETRY_SCHEDULED' OR retry_number BETWEEN 1 AND 3),
 CHECK(request_uuid IS NULL OR batch_uuid IS NOT NULL),
 CHECK(attempt_uuid IS NULL OR (request_uuid IS NOT NULL AND receivable_uuid IS NOT NULL)),
 CHECK(event_type LIKE 'RECEIVABLE_%' OR (attempt_uuid IS NULL AND receivable_uuid IS NULL))
);
CREATE UNIQUE INDEX audit_attempt_terminal_uq ON audit_event(attempt_uuid) WHERE event_type IN ('RECEIVABLE_ATTEMPT_REJECTED','RECEIVABLE_SETTLED','RECEIVABLE_SETTLEMENT_FAILED');
CREATE UNIQUE INDEX audit_attempt_retry_uq ON audit_event(attempt_uuid,event_type,retry_number) WHERE retry_number IS NOT NULL;
CREATE UNIQUE INDEX audit_request_uq ON audit_event(request_uuid,event_type) WHERE event_type IN ('SETTLEMENT_REQUESTED','SETTLEMENT_REPROCESS_REQUESTED');
CREATE UNIQUE INDEX audit_proposal_terminal_uq ON audit_event(proposal_uuid) WHERE event_type IN ('EXCHANGE_RATE_APPROVED','EXCHANGE_RATE_REJECTED');
CREATE INDEX receivable_batch_idx ON receivable(batch_uuid,uuid);
CREATE INDEX request_history_idx ON settlement_request(batch_uuid,date_register DESC,uuid DESC);
CREATE INDEX attempt_request_status_idx ON settlement_request_item(request_uuid,status,receivable_uuid);
CREATE INDEX settlement_period_idx ON settlement(settled_at DESC,uuid DESC);
CREATE INDEX settlement_batch_idx ON settlement(batch_uuid,uuid);
CREATE INDEX settlement_request_idx ON settlement(request_uuid,uuid);
CREATE INDEX proposal_pending_idx ON exchange_rate_proposal(date_register,uuid) WHERE status='PENDING';
CREATE INDEX outbox_ready_idx ON outbox_message(next_attempt_at,uuid) WHERE status='READY';
CREATE INDEX outbox_claim_idx ON outbox_message(claim_expires_at,uuid) WHERE status='CLAIMED';
CREATE INDEX outbox_batch_idx ON outbox_message(batch_uuid,date_register,uuid);
DO $$ DECLARE col TEXT; BEGIN
 FOREACH col IN ARRAY ARRAY['batch_uuid','request_uuid','receivable_uuid','attempt_uuid','assignor_uuid','proposal_uuid','exchange_rate_uuid'] LOOP
 EXECUTE format('CREATE INDEX audit_%s_idx ON audit_event(%I,date_register,uuid) WHERE %I IS NOT NULL',col,col,col);
 END LOOP;
END $$;
