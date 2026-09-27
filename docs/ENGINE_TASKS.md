# Engine — backlog de implementação paralela

Escopo: engine, workflow e integração real. SPEC.md e DATABASE.md prevalecem. Mocks só em testes; referência cambial mockada no backend é contratual.

Equipe: coordenador e três agentes; responsáveis ajustados à especialidade efetiva. Dependências são gates de integração; implementação independente pode avançar com contratos fixados. Nenhuma tarefa é considerada concluída apenas por código escrito.

| ID | Objetivo | Dependências | Responsável | Arquivos/diretórios | Critérios de aceite | Validações | Status |
|---|---|---|---|---|---|---|---|
| ENG-01 | Contratos, backlog e coordenação | — | Coordenador | docs/ENGINE_TASKS.md, SPEC.md, DATABASE.md | Contratos H e propriedades definidos | Revisão SPEC, schemas e dependências | Concluída |
| ENG-02 | Fundação Spring e testes | 01 | Agente 1 | spe-j-engine/pom.xml, common/config, application.yml | Dependências, relógio, testes e persistência configurados | Maven unitário e contexto | Concluída |
| ENG-03 | Schema e migrações | 02 | Agente 1 | db/migration, compose.yaml, infra/postgres | Schema completo; migrations exclusivas; privilégios | PostgreSQL/Testcontainers, constraints e rollback | Concluída |
| ENG-04A | Segurança e erros | 02 | Agente 3 | common/security, common/exceptions | JWT e H.2; ApiError pt-BR | Token inválido, papéis, serialização e HTTP IT | Concluída |
| ENG-04B | Auditoria e logs | 03,04A | Agente 3 | common/audit | Auditoria atômica e imutável | Testes de auditoria/transação e logs | Concluída |
| ENG-05B | API cedentes | 04B | Coordenador | register | H.3, unicidade e versão | Unitários e HTTP IT | Concluída |
| ENG-05F | UI cedentes | 05B,14A | Agente 2 | ui-r-credit/src/register | API real preservando edição | Vitest, lint, typecheck e navegador | Concluída; integração real incluída abaixo |
| ENG-06B | Lotes e cadastro | 05B | Coordenador | batch | Cadastro integral READY sem outbox | Limites, rollback, filtros e HTTP IT | Concluída |
| ENG-06F | UI lotes | 06B,05F | Agente 2 | ui-r-credit/src/batch | Consultas reais e timeout incerto | Vitest e navegador | Concluída; integração real incluída abaixo |
| ENG-07B | CSV e CNAB | 06B | Coordenador | batch import adapters | Prévia sem persistência e confirmação integral | Arquivos válidos/inválidos e equivalência | Concluída |
| ENG-07F | UI importação | 07B,06F | Agente 2 | ui-r-credit/src/batch | Parser real e arquivo original | Testes de parser e navegador | Concluída; integração real incluída abaixo |
| ENG-08B | Câmbio | 04B | Agente 3 | exchange | Decisão única por outro gestor | Autoaprovação, concorrência, validade 24h | Concluída |
| ENG-08F | UI câmbio | 08B,14A | Agente 2 | ui-r-credit/src/exchange | Proposta e decisão reais | Unitários e navegador | Concluída; integração real incluída abaixo |
| ENG-09A | Motor decimal | 02 | Agente 3 | common/pricing | BigDecimal50 e HALF_EVEN | Golden cases e limites | Concluída |
| ENG-09B | API simulação | 06B,08B,09A | Coordenador | pricing | H.5 sem persistência | Unitários e HTTP IT | Concluída |
| ENG-09F | UI simulação | 09B,06F,08F | Agente 2 | ui-r-credit/src/pricing | Debounce e respostas antigas | Unitários, lint e navegador | Concluída |
| ENG-10B | Aceite e reprocessamento | 09B | Coordenador | settlement comandos | Idempotência global e transação do aceite | Replay, concorrência, 202/422 e PostgreSQL IT | Concluída; processamento final integrado ao workflow |
| ENG-10F | UI confirmação | 10B,09F | Agente 2 | ui-r-credit/src/settlement | Intenção preservada após rede | Duplo clique, 422, replay e regressão UI | Concluída |
| ENG-11 | Kafka e relay | 04B | Agente 1 | outbox, infra/kafka | Publicação recuperável e payload exato | Broker, claims e republicação via IT | Concluída |
| ENG-12B | Consultas históricas | 06B,04B | Coordenador | settlement consultas | H.6 paginado | Histórico, erro e estado atual via HTTP IT | Concluída |
| ENG-12F | UI acompanhamento | 12B,10F,11,07F | Agente 2 | ui-r-credit/src/settlement e batch | Polling real, sem conclusão fictícia | Polling e regressão responsiva | Concluída; terminalização validada na carga do workflow |
| ENG-13B | Extrato/dashboard | 06B,08B | Coordenador | dashboard, settlement extrato | Somente valores confirmados | Filtros, fusos e agregações | Concluída |
| ENG-13F | UI relatórios | 13B,08F,14A | Agente 2 | ui-r-credit/src/dashboard e settlement | Vazio real e falha recuperável | Unitários e navegador | Concluída |
| ENG-14A | Isolar mocks de teste | 01 | Agente 2 | ui-r-credit testes | Mocks exclusivamente testes | Bundle e regressão | Concluída |
| ENG-14B | Remover demo | 05F,06F,07F,08F,09F,10F,12F,13F | Agente 2 | ui-r-credit app/auth/config | Build sem infraestrutura demo | Bundle, build e busca de imports | Concluída |
| ENG-15A | Homologação backend | 07B,10B,11,12B,13B | Coordenador/Agente 1 | testes integrados, CI | Garantias banco/Kafka comprovadas | 28 unitários + 16 IT engine; 5 testes workflow; Docker Compose saudável | Concluída localmente |
| ENG-15B | Homologação frontend | 14B,15A | Agente 2 | e2e, CI frontend | Jornadas reais e acessibilidade | 58 E2E isolados + 10 regressões de produção + 4 E2E autenticadas em desktop/mobile | Concluída para o escopo desta entrega |
| ENG-15C | Documentação final | 15A,15B | Coordenador | docs, README, diagramas | Evidências e limites consistentes | Revisão cruzada e `git diff --check` | Concluída |

## Evidências

- Início: checkout sem alterações locais; Java 21 e Node 20 disponíveis; Docker acessível com permissão de execução fora do sandbox.
- Evidências desta execução: `spe-j-engine ./mvnw verify` (28 unitários e 16 IT aprovados); `spe-j-workflow ./mvnw verify` (12 testes unitários/infra e 6 IT, sendo 5 PostgreSQL e 1 Kafka); Compose reconstruído, serviços saudáveis e OpenAPI publicado com 17 paths. Frontend: 161 testes Vitest, typecheck, lint, build, 58 cenários isolados Chrome, 10 regressões de produção, 4 E2E autenticadas e 18 lotes de carga com 1.000 títulos. A suíte autenticada cobriu cadastro, prévia, simulação, aceite/idempotência, consultas/auditoria e decisão cambial por outro gestor.
- Limite de escopo: a carga nominal comprova sucesso, concorrência e reconciliação; falha terminal induzida e reprocessamento seletivo de um título falho permanecem cenários específicos. Os tempos e a amostra estão em [WORKFLOW_LOAD_REPORT.md](WORKFLOW_LOAD_REPORT.md).
- Propriedade: Agente 1 fundação/schema/infra/outbox; Agente 2 frontend; Agente 3 segurança/auditoria/câmbio/cálculo; coordenador demais domínios e integração.
