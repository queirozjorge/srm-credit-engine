REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO "${engineRole}", "${workflowRole}";
GRANT SELECT ON assignor,batch,receivable,receivable_processing,settlement_request,settlement_request_item,
 receivable_terms,settlement,exchange_rate_proposal,exchange_rate,outbox_message,audit_event TO "${engineRole}", "${workflowRole}";
GRANT INSERT ON assignor,batch,receivable,receivable_processing,settlement_request,settlement_request_item,
 receivable_terms,exchange_rate_proposal,exchange_rate,outbox_message,audit_event TO "${engineRole}";
GRANT UPDATE ON assignor,batch,receivable_processing,settlement_request,settlement_request_item,exchange_rate_proposal,outbox_message TO "${engineRole}";
GRANT INSERT ON settlement,audit_event,outbox_message TO "${workflowRole}";
GRANT UPDATE ON batch,receivable_processing,settlement_request,settlement_request_item TO "${workflowRole}";
-- Protection triggers constrain mutable columns and terminal transitions. Neither role owns tables,
-- can delete/truncate rows, alter historical data, nor create DDL.
GRANT SELECT ON flyway_schema_history TO "${workflowRole}";
