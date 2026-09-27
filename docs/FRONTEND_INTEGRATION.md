# Integração do frontend com o engine

Em 27/09/2026 foram implementadas as APIs do engine e o frontend removeu a demonstração executável. O frontend chama Keycloak e o gateway reais; MSW/fixtures existem somente no harness de testes. Os contratos funcionais têm fonte única em [SPEC.md](../SPEC.md). O trabalho restante e as respectivas evidências estão no [backlog do engine](ENGINE_TASKS.md).

## Verificação

- `npm run typecheck`, `npm run lint`, testes Vitest e build verificam tipagem, serviços, componentes e saída distribuída.
- `npm run test:e2e:isolated` valida interação responsiva com fixtures isoladas; seus resultados não comprovam regras de backend.
- `npm run test:e2e:integration` usa login PKCE real e chamadas sem interceptação, em `https://localhost:8443`; exige `KEYCLOAK_OPERATOR_PASSWORD` e `KEYCLOAK_MANAGER_PASSWORD`.
- `./mvnw verify` em `spe-j-engine` executa testes unitários e integração com PostgreSQL/Kafka reais via Testcontainers.

Execução local de 27/09/2026: os 4 cenários autenticados passaram no Chrome em desktop e celular. Cobriram cadastro de cedente/lote, prévia de CSV, simulação, aceite e replay idempotentes, consultas e auditoria, além da decisão cambial por gestor diferente. A carga real do workflow, com 18 lotes de 1.000 títulos em ondas de concorrência 1/2/5/10, está documentada em [WORKFLOW_LOAD_REPORT.md](WORKFLOW_LOAD_REPORT.md).

O engine aceita e publica solicitações por título; o `spe-j-workflow` consome a outbox e confirma os títulos em transações independentes. O relatório de carga registra a reconciliação do banco, o lag Kafka e os limites da amostra.
