# DATABASE — SRM Credit Engine

**Estado em 27/09/2026: liquidação independente por título, erro, reprocessamento auditado e quarentena de mensagens poison. O schema vigente está nas migrations V1–V6 do `spe-j-engine`; o workflow verifica compatibilidade e não aplica migrations.**

Este documento descreve o modelo PostgreSQL implementado conforme [SPEC.md](SPEC.md) e [AGENTS.md](AGENTS.md). As migrations versionadas em `spe-j-engine/src/main/resources/db/migration` são a fonte executável do schema. A cobertura e os limites dos testes estão resumidos na seção final; a presença de uma regra neste documento não implica que todo cenário listado tenha sido exercitado.

## Convenções e garantias comuns

- Todas as tabelas têm `uuid UUID PRIMARY KEY`, gerado no backend, e `date_register TIMESTAMPTZ NOT NULL`, preenchido na inserção e imutável. Não há identificador numérico auxiliar.
- Nas tabelas abaixo, **obrigatório** significa `NOT NULL`; **opcional** significa que `NULL` é permitido somente nas condições descritas. Campos sem default devem ser fornecidos explicitamente. Textos obrigatórios não podem ser vazios nem conter somente espaços; aplicar `CHECK` além de `NOT NULL`.
- Toda referência indicada como FK aponta para `uuid` da tabela citada. Não usar exclusão ou atualização em cascata: preservar referências e histórico. As FKs compostas e verificações adicionais estão descritas nas respectivas tabelas e na seção de integridade entre tabelas.
- Tabelas mutáveis têm `date_updated`, inicialmente nulo, atualizado a cada alteração, e `version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)`. Alterações usam a versão esperada no predicado e incrementam a versão. A coluna sozinha não implementa optimistic locking.
- Instantes usam UTC na aplicação e nas conexões; datas financeiras usam `America/Sao_Paulo`. Não converter vencimento em instante. Validar datas finitas e limites aceitos antes de persistir.
- Dinheiro usa `NUMERIC(19,2)`; taxas e câmbio usam `NUMERIC(24,12)`. Rejeitar valores não finitos e overflow, inclusive após conversão e soma. Validar escala antes da gravação: o arredondamento implícito do banco não substitui `HALF_EVEN` no motor `BigDecimal`.
- Não introduzir um limite de sinal para a taxa base configurável sem contrato funcional correspondente. Validar `1 + base_rate + spread > 0` para cada item. Valor de face e câmbio são estritamente positivos; resultados arredondados de VP e pagamento podem ser zero. O deságio é a diferença entre face e VP, sem impor uma regra adicional de sinal não prevista na SPEC.
- PKs, FKs, unicidades, defaults e verificações da própria linha devem ser implementados nas migrations. Invariantes entre tabelas, agregados e transições exigem os controles transacionais descritos adiante; não tratá-los como um simples `CHECK` de linha.

## Modelo implementado para liquidação por título

- Novas tabelas `receivable_processing` (estado atual do título) e `settlement_request_item` (cada tentativa manual e suas repetições automáticas).
- `batch` e `settlement_request` recebem contadores e estado `PARTIALLY_SETTLED`; a solicitação recebe modalidade, justificativa, fingerprint e instante de conclusão.
- Erro e retries saem do cabeçalho da solicitação e passam à tentativa individual. `has_error` é flag calculada pelo estado, evitando divergência entre booleano e status. Sua expressão deve ser a mesma nas duas tabelas, sempre com estado obrigatório.
- `settlement` passa a representar uma liquidação de um único título, com `UNIQUE(receivable_uuid)` e valores individuais. Remover do modelo a antiga `settlement_item` e a unicidade por lote/solicitação: não há cabeçalho financeiro agregado imutável a atualizar a cada sucesso.
- `outbox_message` e `audit_event` recebem referências ao título e à tentativa. Outbox existe somente após aceite de um título apto, sem estado `BLOCKED`.
- O desenho está implementado nas migrations versionadas do engine. A instalação inicial cria este modelo; mudanças futuras devem adicionar uma migration e preservar compatibilidade com mensagens/outbox já persistidas.

## assignor

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| document_number | VARCHAR | Obrigatório; documento normalizado, sem máscara; `UNIQUE` global, inclusive para excluídos. |
| name | VARCHAR | Obrigatório. |
| deleted | BOOLEAN | Obrigatório; `DEFAULT FALSE`; exclusão somente lógica. |
| version | BIGINT | Obrigatório; `DEFAULT 0`; não negativo; controle de versão otimista. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |
| date_updated | TIMESTAMPTZ | Opcional na inserção; obrigatório após alteração; atualizado pelo serviço. |

**Integridade e ciclo de vida:** documento identifica o cedente em todas as entradas. Normalização deve ser única para formulário, CSV e CNAB, preservar zeros e não converter o documento para número. Manter `UNIQUE(document_number)` sem filtro por `deleted`; reativação reutiliza o UUID. Documento não pode ser alterado para liberar uma identidade já utilizada; correções de identidade exigem contrato específico fora desta entrega. Nome e exclusão lógica são mutáveis. Cedente excluído não aceita novos títulos, mas continua acessível ao histórico e não oculta recebíveis existentes.

## batch

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; gerado no backend; imutável. |
| active_request_uuid | UUID | Nulo somente em `READY`; FK à solicitação atual ou última terminal do próprio lote. |
| source | VARCHAR | Obrigatório; `FORM`, `CSV`, `CNAB`; imutável. |
| status | VARCHAR | Obrigatório; `READY`, `PENDING`, `SETTLED`, `PARTIALLY_SETTLED`, `FAILED`; conforme SPEC D. |
| item_count | INTEGER | Obrigatório; 1–1.000, fixado no cadastro. |
| ready_count | INTEGER | Obrigatório; inicialmente `item_count`. |
| pending_count | INTEGER | Obrigatório; inicialmente zero. |
| settled_count | INTEGER | Obrigatório; inicialmente zero. |
| failed_count | INTEGER | Obrigatório; inicialmente zero. |
| created_by_issuer / created_by_subject | VARCHAR | Dois campos obrigatórios; identidade autenticada do cadastro; imutáveis. |
| version | BIGINT | Obrigatório; default zero; incremento em toda mudança operacional de título; exposto como `progressVersion`. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |
| date_updated | TIMESTAMPTZ | Nulo na inserção; obrigatório após alteração. |

**Checks:** contadores não negativos, soma igual a `item_count`. `READY` exige todos prontos e referência nula; `PENDING` exige pendentes; `SETTLED` exige todos liquidados; `PARTIALLY_SETTLED` exige zero prontos/pendentes e pelo menos um sucesso e uma falha; `FAILED` exige todos falhos. Estados diferentes de `READY` exigem referência preenchida e zero prontos. FK composta `(active_request_uuid, uuid)` referencia `settlement_request(uuid, batch_uuid)`.

**Transições:** primeira solicitação inclui todos os títulos; lote sai de `READY` para `PENDING` ou `FAILED` se nenhum passar na validação financeira. Depois pode concluir em `SETTLED`, `PARTIALLY_SETTLED` ou `FAILED`. Reprocessamento de falhos pode retornar a `PENDING` ou permanecer parcial/falho se todos os selecionados forem rejeitados no aceite. `SETTLED` é terminal. Uma solicitação pode ter êxito completo sobre uma seleção e deixar falhas fora dela no lote.

Contadores e status são projeções operacionais, nunca resultados financeiros históricos. Atualizá-los por deltas correspondentes à transição efetivamente gravada, com versão esperada, na mesma transação do título/tentativa. Reentrega não aplica delta novamente. Conflito faz rollback e releitura/repetição da transação local; não desfaz commits de outros títulos. Verificações diferidas conferem projeção contra os estados atuais. A contenção dessa linha deve ser medida; processamento independente não promete ausência de disputa pelo agregado.

## receivable

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Obrigatório; FK para `batch`. |
| assignor_uuid | UUID | Obrigatório; FK para `assignor`. |
| external_reference | VARCHAR | Obrigatório; remover somente espaços externos e preservar zeros à esquerda. |
| type | VARCHAR | Obrigatório; `CHECK` em `DUPLICATA_MERCANTIL`, `CHEQUE_PRE_DATADO`. |
| face_value_brl | NUMERIC(19,2) | Obrigatório; finito e `CHECK (face_value_brl > 0)`; valor de origem em BRL. |
| due_date | DATE | Obrigatório; vencimento validado no cadastro e no aceite. |
| payment_currency | VARCHAR | Obrigatório; `CHECK` em `BRL`, `USD`; revisão da importação usa BRL como padrão. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** `UNIQUE(assignor_uuid, type, external_reference)`, sem filtro por estado do lote ou exclusão lógica do cedente. Referência normalizada também deve ser validada na gravação; sua comparação preserva caracteres e zeros, sem conversão numérica ou alteração de caixa implícita. Todos os campos são imutáveis após o cadastro; não adicionar títulos a um lote já cadastrado. `status`, `version`, `date_updated` e `deleted` não são necessários aqui: estado operacional pertence a `receivable_processing`, separado dos dados financeiros imutáveis.

## receivable_processing

Uma linha por recebível, criada no cadastro. O `uuid` é PK própria; `receivable_uuid` tem FK e `UNIQUE`, conforme a convenção global.

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| receivable_uuid | UUID | FK `receivable`; obrigatório e único. |
| active_attempt_uuid | UUID | Nulo em `READY`; FK à tentativa atual/última do mesmo título. |
| status | VARCHAR | Obrigatório; default `READY`; `READY`, `PENDING`, `SETTLED`, `FAILED`. |
| has_error | BOOLEAN | Obrigatório, gerado: `GENERATED ALWAYS AS (status = 'FAILED') STORED`; não editável. |
| attempt_number | INTEGER | Obrigatório; zero em `READY`; maior que zero nos demais; ordinal manual atual. |
| version | BIGINT | Obrigatório; default zero; optimistic locking. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |
| date_updated | TIMESTAMPTZ | Nulo na inserção; preenchido após alteração. |

FK composta `(active_attempt_uuid, receivable_uuid)` para `settlement_request_item(uuid, receivable_uuid)`. `CHECK` associa `READY` a referência nula/ordinal zero e os demais à referência preenchida/ordinal positivo. `SETTLED` é terminal e exige liquidação única confirmada. Nova tentativa manual somente de `FAILED`, incrementando ordinal; não substituir ou apagar a tentativa anterior. O estado acompanha a tentativa referenciada; código/mensagem de erro são lidos dela, sem duplicar diagnóstico nesta tabela. Estado atual e flag são expostos junto ao título na API.

## settlement_request

Cabeçalho operacional de uma seleção fixa de títulos, não cabeçalho de liquidação financeira.

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| batch_uuid | UUID | FK `batch`; obrigatório. |
| operation | VARCHAR | Obrigatório; `SETTLEMENT`. |
| kind | VARCHAR | Obrigatório; `INITIAL` ou `REPROCESS`. |
| reason | VARCHAR(500) | Nulo em `INITIAL`; obrigatório após trim, 1–500 caracteres, em `REPROCESS`. |
| idempotency_key | VARCHAR | Obrigatório; comparação exata; escopo global por operação. |
| request_fingerprint | TEXT | Obrigatório; representação canônica de lote, modalidade, UUIDs ordenados e justificativa normalizada; imutável. |
| status | VARCHAR | Obrigatório; `PENDING`, `SETTLED`, `PARTIALLY_SETTLED`, `FAILED`. |
| item_count | INTEGER | Obrigatório; 1–1.000; tamanho da seleção imutável. |
| pending_count / settled_count / failed_count | INTEGER | Três campos obrigatórios, não negativos; soma igual a `item_count`. |
| accepted_at | TIMESTAMPTZ | Obrigatório; instante de recebimento persistido da solicitação; aceite financeiro é individual. |
| completed_at | TIMESTAMPTZ | Nulo somente em `PENDING`; obrigatório nos demais; não anterior ao aceite. |
| requested_by_issuer / requested_by_subject | VARCHAR | Dois campos obrigatórios; identidade autenticada; imutáveis. |
| calculation_date | DATE | Obrigatório; data de aceite em `America/Sao_Paulo`. |
| term_convention | VARCHAR | Obrigatório; `ACTUAL_30`. |
| base_rate | NUMERIC(24,12) | Obrigatório; taxa vigente fixada no aceite. |
| rule_version | VARCHAR | Obrigatório; versão do cálculo. |
| calculation_policy / rounding_policy | VARCHAR | Obrigatórios; `DECIMAL_50` e `HALF_EVEN`. |
| exchange_rate_uuid | UUID | FK `exchange_rate`; opcional conforme regra abaixo. |
| exchange_rate_value | NUMERIC(24,12) | Nulo com referência nula; se presente, finito e positivo. |
| exchange_rate_effective_from | TIMESTAMPTZ | Nulo com referência nula; vigência da cotação fixada. |
| version | BIGINT | Obrigatório; default zero. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |
| date_updated | TIMESTAMPTZ | Nulo na inserção; preenchido após alteração. |

**Unicidades:** `UNIQUE(operation, idempotency_key)`, `UNIQUE(uuid, batch_uuid)`, índice único parcial em `batch_uuid WHERE status = 'PENDING'` e em `batch_uuid WHERE kind = 'INITIAL'`. Não há unicidade global por lote: reprocessamentos geram solicitações novas. Reservar idempotência e atualizar a versão do lote no mesmo aceite; operações concorrentes não podem aceitar seleções conflitantes.

**Snapshot:** referência/valor/vigência cambial todos nulos ou preenchidos. Se houver USD apto, exigir cotação vigente mais recente com idade de até 24 horas no aceite. Sem cotação válida, títulos USD falham no aceite sem condições ou outbox; BRL prossegue. Lote exclusivamente BRL mantém campos cambiais nulos. Os campos de identidade, seleção, motivo, chave, fingerprint, aceite e condições são imutáveis. Estado, contadores, conclusão, versão e atualização são operacionais. Remover deste cabeçalho `retry_count`, `next_retry_at`, `failure_code` e `failure_message`; pertencem às tentativas individuais.

**Estados:** correspondem aos contadores somente desta seleção; `PENDING` se há pendentes, `SETTLED` se todos concluídos, `FAILED` se todos falhos, `PARTIALLY_SETTLED` se há ambos sem pendentes. Terminais não reabrem. Falha financeira de todos no aceite cria solicitação já `FAILED`, com tentativas rejeitadas e auditoria; POST retorna `422 NENHUM_TITULO_APTO` e referência para consulta, inclusive em replay da mesma chave. Nenhum comando é criado. O lote continua refletindo todos os títulos, inclusive os ausentes da seleção. Totais da API são calculados sobre liquidações da solicitação; não inserir um resultado agregado imutável que precise ser alterado depois.

## settlement_request_item

Cada linha representa uma tentativa manual de um título; retries automáticos pertencem à mesma linha e geram eventos de auditoria próprios.

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório; identifica a tentativa. |
| request_uuid | UUID | FK `settlement_request`; obrigatório. |
| receivable_uuid | UUID | FK `receivable`; obrigatório; mesmo lote da solicitação. |
| previous_attempt_uuid | UUID | Nulo na primeira tentativa; FK à tentativa imediatamente anterior, falha, do mesmo título. |
| attempt_number | INTEGER | Obrigatório; positivo; ordinal manual crescente por título. |
| status | VARCHAR | Obrigatório; `PENDING`, `SETTLED`, `FAILED`. |
| has_error | BOOLEAN | Obrigatório, gerado por `status = 'FAILED'`; não editável. |
| retry_count | INTEGER | Obrigatório; default zero; 0–3 repetições adicionais. |
| next_retry_at | TIMESTAMPTZ | Somente em `PENDING` com retry agendado; nulo em estado terminal. |
| completed_at | TIMESTAMPTZ | Nulo em `PENDING`; obrigatório em estado terminal. |
| failure_code | VARCHAR | Obrigatório e não vazio somente em `FAILED`. |
| failure_message | TEXT | Obrigatório somente em `FAILED`; mensagem segura em pt-BR. |
| failure_stage | VARCHAR | Obrigatório somente em `FAILED`; `ACCEPTANCE` ou `PROCESSING`. |
| failure_occurred_at | TIMESTAMPTZ | Obrigatório somente em `FAILED`; instante do erro final. |
| version | BIGINT | Obrigatório; default zero; verificado junto ao estado e tentativa ativa. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |
| date_updated | TIMESTAMPTZ | Nulo na inserção; preenchido após alteração. |

**Unicidades:** `UNIQUE(request_uuid, receivable_uuid)`, `UNIQUE(receivable_uuid, attempt_number)`, `UNIQUE(uuid, receivable_uuid)` e índice único parcial em `receivable_uuid WHERE status = 'PENDING'`. FK composta `(previous_attempt_uuid, receivable_uuid)` para `(uuid, receivable_uuid)` desta tabela. Conferir ordinal anterior, modalidade `REPROCESS` e estado anterior `FAILED`; primeira tentativa é ordinal 1 em `INITIAL`. Vínculos e ordinal são imutáveis.

**Checks e fluxo:** campos de falha são todos preenchidos somente em `FAILED`, todos nulos nos demais. Conclusão não antecede cadastro; próximo retry é nulo nos terminais. Falha `ACCEPTANCE` não tem condições, comando ou retries. Tentativa `PENDING` tem condições fixadas e comando; sucesso tem liquidação e auditoria no mesmo commit. Falha `PROCESSING` tem condições e nenhuma liquidação própria. Estados terminais são imutáveis; nova tentativa cria outra linha e preserva o erro antigo.

Persistir reserva de cada repetição em transação operacional, antes da execução financeira, verificando versão, estado, tentativa ativa e agendamento. Uma reentrega não reserva outra repetição antes do prazo nem zera o contador. Registrar ordinal e agendamento em auditoria no mesmo commit da reserva, com unicidade por tentativa/ordinal/tipo. Conflito de concorrência exige reler antes de classificar falha; não gastar retries financeiros por disputa de projeção do lote. Snapshot permanece fixo, mesmo que cotações envelheçam ou a data mude. A interrupção exige retomar a execução reservada, não criar orçamento extra.

## receivable_terms

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| attempt_uuid | UUID | FK `settlement_request_item`; obrigatório e único. |
| term_days | INTEGER | Obrigatório; não negativo; vencimento menos data fixada no aceite. |
| spread | NUMERIC(24,12) | Obrigatório; fixado por tipo no aceite. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |

Condições existem somente para tentativas financeiramente aptas no aceite, uma por tentativa. Solicitação e título são obtidos pela tentativa; não duplicar vínculos. No novo modelo, `attempt_uuid` substitui `request_uuid`/`receivable_uuid` desta tabela. Condições e composição da seleção ficam imutáveis após aceite; prazo zero é permitido. Nova tentativa manual válida recebe nova linha; nunca reutilizar condições de tentativa antiga. Precisão e golden cases permanecem os mesmos.

## settlement

Resultado financeiro imutável de **um título**. Consolida os antigos cabeçalho por lote e `settlement_item`; totais por lote/solicitação passam a ser consultas agregadas. A tabela `settlement_item` deixa de ser necessária no modelo proposto.

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| batch_uuid | UUID | FK `batch`; obrigatório; sem unicidade por lote. |
| request_uuid | UUID | FK `settlement_request`; obrigatório; sem unicidade por solicitação. |
| receivable_uuid | UUID | FK `receivable`; obrigatório; `UNIQUE` global. |
| attempt_uuid | UUID | FK `settlement_request_item`; obrigatório; `UNIQUE`. |
| terms_uuid | UUID | FK `receivable_terms`; obrigatório; `UNIQUE`. |
| settled_at | TIMESTAMPTZ | Obrigatório; instante individual da liquidação. |
| present_value_brl | NUMERIC(19,2) | Obrigatório; não negativo; VP final arredondado. |
| discount_brl | NUMERIC(19,2) | Obrigatório; face imutável menos VP. |
| payment_amount | NUMERIC(19,2) | Obrigatório; não negativo; pagamento na moeda definida. |
| payment_currency | VARCHAR | Obrigatório; `BRL`/`USD`; igual ao título. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |

`UNIQUE(receivable_uuid)` é a garantia final contra liquidação duplicada, independentemente do operador, chave, tentativa ou lote informado. FK composta `(request_uuid, batch_uuid)` para a solicitação e `(attempt_uuid, receivable_uuid)` para a tentativa. Trigger confere título no lote, solicitação da tentativa, condições da mesma tentativa e versão ativa antes do efeito financeiro. Pagamento BRL igual ao VP é `CHECK` local; USD usa o câmbio fixado, conforme SPEC. Não duplicar valor de face/vencimento, já imutáveis no título.

Existência desta linha exige tentativa e estado atual `SETTLED`, mais auditoria de sucesso no mesmo commit. Não exige sucesso dos demais títulos. Remover os antigos totais e `UNIQUE(batch_uuid)`/`UNIQUE(request_uuid)` do desenho anterior. Totais confirmados são somas dos resultados existentes, por moeda, incluindo sucessos de lotes pendentes/parciais. Validar limites de valores e agregados na política de aceite considerando sucessos anteriores e a nova seleção; falha de um cálculo afeta somente seu título, sem invalidar valores já confirmados.

## exchange_rate_proposal

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| base_currency | VARCHAR | Obrigatório; `CHECK (base_currency = 'USD')`. |
| quote_currency | VARCHAR | Obrigatório; `CHECK (quote_currency = 'BRL')`. |
| proposed_rate | NUMERIC(24,12) | Obrigatório; finito e positivo; quantidade de BRL por USD. |
| justification | TEXT | Obrigatório; motivo da proposta. |
| status | VARCHAR | Obrigatório; `DEFAULT 'PENDING'`; `CHECK` em `PENDING`, `APPROVED`, `REJECTED`. |
| requested_by_issuer | VARCHAR | Obrigatório; `iss` autenticado do solicitante; imutável. |
| requested_by_subject | VARCHAR | Obrigatório; `sub` autenticado do solicitante; imutável. |
| decided_by_issuer | VARCHAR | Nulo em `PENDING`; obrigatório após decisão; `iss` autenticado do gestor. |
| decided_by_subject | VARCHAR | Nulo em `PENDING`; obrigatório após decisão; `sub` autenticado do gestor. |
| decided_at | TIMESTAMPTZ | Nulo em `PENDING`; obrigatório após decisão. |
| decision_reason | TEXT | Nulo em `PENDING`; obrigatório e não vazio em `REJECTED`; opcional em `APPROVED`. |
| version | BIGINT | Obrigatório; `DEFAULT 0`; não negativo; controle de versão otimista. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |
| date_updated | TIMESTAMPTZ | Opcional na inserção; obrigatório após alteração; atualizado pelo serviço. |

**Integridade:** `CHECK` combina estado, identidade do decisor, horário e motivo de rejeição. Quando decidida, exigir `decided_at >= date_register` e diferença entre as identidades completas: `decided_by_issuer <> requested_by_issuer OR decided_by_subject <> requested_by_subject`. `NOT NULL` condicional deve ser explícito para impedir passagem indevida por valores nulos.

**Transições:** `PENDING` para `APPROVED` ou `REJECTED`, uma única vez. Conteúdo proposto não é editado; nova proposta requer nova linha. O engine valida papel `GESTOR` pela identidade autenticada; a restrição do banco não substitui autorização. Decisão usa status e versão esperados; aprovação grava cotação e auditoria na mesma transação, rejeição grava auditoria sem cotação. Aprovação não cria solicitação de liquidação nem libera outbox.

## exchange_rate

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| proposal_uuid | UUID | Obrigatório; FK para `exchange_rate_proposal`; `UNIQUE`; proposta aprovada. |
| base_currency | VARCHAR | Obrigatório; `CHECK (base_currency = 'USD')`. |
| quote_currency | VARCHAR | Obrigatório; `CHECK (quote_currency = 'BRL')`. |
| rate | NUMERIC(24,12) | Obrigatório; finito e positivo; quantidade de BRL por USD, igual à proposta. |
| effective_from | TIMESTAMPTZ | Obrigatório; instante da aprovação; histórico imutável. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** `UNIQUE(base_currency, quote_currency, effective_from)` impede empate de vigência; `UNIQUE(proposal_uuid)` limita uma cotação por aprovação. Par e valor devem corresponder à proposta `APPROVED`; `effective_from = decided_at`. Cotação é somente inserção/leitura, sem substituição de histórico.

**Inicialização:** não há cotação automática ou importada do mock nesta entrega. A primeira cotação usa o mesmo fluxo de proposta e aprovação por usuários distintos. Enquanto não existir cotação válida, títulos USD falham no aceite; BRL continua disponível, inclusive no mesmo lote. Massa de teste deve preservar essas relações.

## outbox_message

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| batch_uuid | UUID | FK `batch`; obrigatório. |
| request_uuid | UUID | FK `settlement_request`; obrigatório. |
| receivable_uuid | UUID | FK `receivable`; obrigatório; chave Kafka. |
| attempt_uuid | UUID | FK `settlement_request_item`; obrigatório. |
| topic | VARCHAR | Obrigatório; `credit-receivable` ou `credit-receivable.dlq`. |
| status | VARCHAR | Obrigatório; `READY`, `CLAIMED`, `SENT`; não há `BLOCKED`. |
| payload | JSONB | Obrigatório; exatamente `batchUuid`, `receivableUuid`, `requestUuid`, `idempotencyKey`, todos strings. |
| publish_attempts | INTEGER | Obrigatório; default zero; não negativo; incrementado por reivindicação. |
| next_attempt_at | TIMESTAMPTZ | Obrigatório somente em `READY`. |
| claim_token | UUID | Obrigatório somente em `CLAIMED`; token de propriedade, não FK. |
| claim_expires_at | TIMESTAMPTZ | Obrigatório somente em `CLAIMED`; prazo finito. |
| sent_at | TIMESTAMPTZ | Obrigatório somente em `SENT`, após confirmação do broker. |
| version | BIGINT | Obrigatório; default zero. |
| date_register | TIMESTAMPTZ | Obrigatório; imutável. |
| date_updated | TIMESTAMPTZ | Nulo na inserção; preenchido após alteração. |

`UNIQUE(attempt_uuid, topic)` impede comandos lógicos repetidos para a mesma tentativa/tópico. FK composta `(request_uuid, batch_uuid)` para solicitação e `(attempt_uuid, receivable_uuid)` para tentativa; trigger confere solicitação da tentativa e título no lote. Payload tem `CHECK` de chaves/tipos e conferência contra vínculos e chave de idempotência persistidos. Não incluir JWT, valores financeiros, stack trace ou erro no comando. Referências/tópico/payload são imutáveis desde a criação; chave Kafka deriva do título.

Criar uma linha `READY` no aceite de cada título apto. Falha de validação no aceite não cria comando nem DLQ. Falha definitiva no worker cria uma linha `READY` para a DLQ, no mesmo commit da falha individual. Reprocessamento manual cria outra tentativa e outro comando apenas para cada título selecionado e apto.

Relay muda `READY` para `CLAIMED`, limpa agendamento e grava token/prazo com versão esperada. Somente dono do token atual pode finalizar. Após confirmação do broker, `SENT`, com `sent_at` e sem agendamento/reivindicação. Falha ou prazo expirado devolve a `READY` com nova agenda. Aplicar checks condicionais explícitos a todos esses campos; `SENT` é terminal. Não descartar por limite de envio. Republicação após falha entre envio e marcação é prevista e protegida pela liquidação única no banco.

## settlement_consumer_quarantine

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | PK; obrigatório. |
| source_topic | VARCHAR | Obrigatório; `credit-receivable`. |
| source_partition | INTEGER | Obrigatório; partição não negativa. |
| source_offset | BIGINT | Obrigatório; offset não negativo. |
| key_sha256 / value_sha256 | CHAR(64) | SHA-256 hexadecimal dos bytes originais do registro Kafka; nulo quando chave ou valor não existem. Conteúdo bruto nunca é persistido. |
| key_size_bytes / value_size_bytes | INTEGER | Quantidade de bytes originais, não negativa. |
| failure_code | VARCHAR(80) | Restrito a `COMANDO_MALFORMADO` e `COMANDO_NAO_CORRELACIONADO`; sem mensagem, payload ou stack trace. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de persistência. |

`UNIQUE(source_topic, source_partition, source_offset)` torna a quarentena idempotente. Em reentrega, o worker compara hashes, tamanhos e código com a linha existente; divergência mantém o offset sem confirmação. A tabela é append-only: workflow tem `SELECT`/`INSERT`; engine tem somente `SELECT`. O worker confirma a mensagem depois do commit. Essa quarentena não representa falha financeira, não altera título/tentativa e não substitui a DLQ de um título correlacionado.

## audit_event

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Opcional conforme evento; FK para `batch`. |
| request_uuid | UUID | Opcional conforme evento; FK para `settlement_request`. |
| receivable_uuid | UUID | Opcional conforme evento; FK para `receivable`. |
| attempt_uuid | UUID | Opcional conforme evento; FK para `settlement_request_item`. |
| settlement_uuid | UUID | Obrigatório no sucesso; FK para `settlement`. |
| retry_number | INTEGER | Obrigatório em evento de repetição/falha transitória; ordinal 0–3; nulo nos demais. |
| assignor_uuid | UUID | Opcional conforme evento; FK para `assignor`. |
| proposal_uuid | UUID | Opcional conforme evento; FK para `exchange_rate_proposal`. |
| exchange_rate_uuid | UUID | Opcional conforme evento; FK para `exchange_rate`. |
| event_type | VARCHAR | Obrigatório; valores e referências exigidas definidos na seção de auditoria. |
| actor_issuer | VARCHAR | Obrigatório; emissor da identidade humana validada ou identificador do emissor técnico. |
| actor_subject | VARCHAR | Obrigatório; sujeito humano validado ou identidade técnica do processo responsável. |
| correlation_id | VARCHAR | Obrigatório; correlação gerada/validada pela aplicação; não é credencial. |
| details | JSONB | Obrigatório; objeto JSON com conteúdo validado por tipo de evento; sem JWT, senhas ou arquivos integrais. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** referências opcionais dependem do tipo de evento, não de conveniência do chamador. Quando houver solicitação, exigir lote e conferir pertencimento; quando houver tentativa, exigir título/solicitação e conferir todos os vínculos; quando houver liquidação, conferir tentativa/título correspondentes; quando houver cotação e proposta, conferir a relação. `details` deve ser objeto JSON e seguir contrato por evento. Não armazenar dados financeiros exclusivamente no JSON quando já pertencem às tabelas financeiras.

| `event_type` | Referências obrigatórias | Conteúdo mínimo de `details` |
|---|---|---|
| `ASSIGNOR_CREATED` | Cedente | Campos cadastrais registrados, sem segredos. |
| `ASSIGNOR_UPDATED` | Cedente | Campos alterados e valores anterior/novo. |
| `ASSIGNOR_DELETED` / `ASSIGNOR_RESTORED` | Cedente | Transição de exclusão lógica. |
| `BATCH_CREATED` | Lote | Origem e quantidade de recebíveis. |
| `SETTLEMENT_REQUESTED` | Lote e solicitação | Seleção inicial e referência às condições persistidas. |
| `SETTLEMENT_REPROCESS_REQUESTED` | Lote e solicitação | Seleção explícita, justificativa e referências às tentativas anteriores; ator humano autenticado. |
| `RECEIVABLE_ATTEMPT_ACCEPTED` | Lote, solicitação, título e tentativa | Ordinal manual, vínculo anterior e condições fixadas. |
| `RECEIVABLE_ATTEMPT_REJECTED` | Lote, solicitação, título e tentativa | Código/mensagem/etapa `ACCEPTANCE` e instante; tentativa sem comando. |
| `RECEIVABLE_PROCESSING_RETRY_SCHEDULED` | Lote, solicitação, título e tentativa | Próximo ordinal (1–3), agenda e causa segura. |
| `RECEIVABLE_PROCESSING_ATTEMPT_FAILED` | Lote, solicitação, título e tentativa | Ordinal (0 inicial, 1–3 adicionais), código/mensagem e instante de cada falha de processamento. |
| `RECEIVABLE_SETTLED` | Lote, solicitação, título, tentativa e liquidação | Referência ao resultado e condições; ator técnico, solicitante preservado pela solicitação. |
| `RECEIVABLE_SETTLEMENT_FAILED` | Lote, solicitação, título e tentativa | Falha definitiva `PROCESSING`, instante, código/mensagem e retries; referência à DLQ. |
| `EXCHANGE_RATE_PROPOSED` | Proposta | Par, valor proposto e justificativa. |
| `EXCHANGE_RATE_APPROVED` | Proposta e cotação | Valor aprovado e vigência. |
| `EXCHANGE_RATE_REJECTED` | Proposta | Justificativa da rejeição. |

Implementar `CHECK` dos tipos e referências obrigatórias. Referências não pertinentes ficam nulas. Impedir mais de um evento terminal por tentativa com índice único parcial em `attempt_uuid WHERE event_type IN ('RECEIVABLE_ATTEMPT_REJECTED', 'RECEIVABLE_SETTLED', 'RECEIVABLE_SETTLEMENT_FAILED')`; conferir correspondência com o estado. Exigir `UNIQUE(settlement_uuid)` no vínculo de sucesso. Para eventos automáticos, índice único parcial `(attempt_uuid, event_type, retry_number)`; para aceite/reprocessamento, unicidade por solicitação/tipo; para decisão cambial, unicidade por proposta nos tipos terminais. Uma tentativa histórica falha não é alterada quando uma nova tem sucesso. O ator do aceite é humano; o ator da liquidação pode ser o worker, preservando o solicitante autenticado pela solicitação referenciada. Correlação do processamento deve ser recuperável no banco a partir da solicitação/evento de aceite, sem ampliar o payload Kafka. Erros técnicos preservam stack trace nos logs estruturados conforme AGENTS.md.

## Integridade entre tabelas e cardinalidades

| Relação | Cardinalidade e garantia |
|---|---|
| Cedente / recebível | Um cedente, vários títulos; cada título tem um cedente; identidade global preservada após exclusão lógica. |
| Lote / recebível / estado atual | 1–1.000 títulos fixos; exatamente um estado operacional por título. |
| Lote / solicitação | Várias históricas, no máximo uma `PENDING`; referência atual ou última terminal no lote. |
| Solicitação / tentativa | Exatamente uma por título da seleção fixa; inicial cobre todos, reprocessamento apenas falhos selecionados. |
| Recebível / tentativa | Histórico crescente, no máximo uma pendente; referência atual no estado operacional. |
| Tentativa / condições | Uma para tentativa apta; nenhuma na falha de validação do aceite. |
| Recebível / liquidação | Zero ou uma, independentemente de quantidade de tentativas/operadores. |
| Lote ou solicitação / liquidação | Zero ou várias, sem exigir liquidação de todos os títulos. |
| Tentativa / outbox | Uma normal se apta; no máximo uma DLQ após falha definitiva de processamento. |
| Tentativa / auditoria | Vários eventos; exatamente um desfecho ao terminar; retries individualizados. |
| Proposta / cotação | Zero se pendente/rejeitada; uma se aprovada, com auditoria. |

FK simples verifica existência, não o pertencimento ao mesmo fluxo. Usar FKs compostas definidas acima; criar referências circulares de `batch`/solicitação e estado/tentativa após criar as tabelas. Nos serviços, inserir primeiro a tentativa e então atualizar a referência atual, na mesma transação. Triggers conferem as relações não expressas por FK: solicitação/título no mesmo lote, tentativa anterior, condições, liquidação, payload e auditoria.

Constraint triggers diferidas verificam no commit: cobertura da seleção no aceite, contadores/estados coerentes, sucesso individual acompanhado de resultado e auditoria, falha sem liquidação da mesma tentativa e cotação aprovada com evento correspondente. Não exigir que todos os títulos estejam liquidados para aceitar o commit de um. Uma falha histórica pode coexistir com liquidação de tentativa posterior. Impedir inclusão tardia de títulos, seleção e condições após aceite. Restringir consultas ao lote/solicitação afetados, agrupar verificações e medir contenção com 1.000 títulos; nunca carregar a base inteira.

## Transações e controle de concorrência

| Operação | Escritas no mesmo commit | Validações |
|---|---|---|
| Cadastro | Lote, todos os títulos, estados `READY` e auditoria; sem outbox. | Cadastro integral; erro/duplicidade rejeita o lote. |
| Aceite inicial ou reprocessamento | Solicitação, fingerprint, tentativas, condições/outboxes dos aptos, falhas de validação individuais, estados atuais, projeções e auditoria. | JWT/papel, chave, seleção, justificativa, elegibilidade e regras financeiras. Erro de infraestrutura desfaz o aceite, não cria sucesso fictício. |
| Reserva de retry | Incremento/agendamento da tentativa e auditoria do erro/repetição. | Tentativa ativa, pendente, orçamento e versão; transação operacional fora do rollback financeiro. |
| Sucesso de um título | Uma liquidação, tentativa/estado atual `SETTLED`, deltas do lote/solicitação e auditoria de sucesso. | Condições, versão/estado ativo e unicidade. Falha desfaz somente esse processamento. |
| Falha definitiva de um título | Após rollback local: tentativa/estado atual `FAILED`, erro, deltas do lote/solicitação, auditoria e outbox DLQ. | Tentativa ainda ativa, pendente, sem sucesso concorrente; demais títulos preservados. |
| Decisão cambial | Decisão, auditoria e cotação se aprovada. | Gestor diferente, estado pendente e versão esperada. |

- Verificar versão e estado em todas as escritas concorridas. Conflito exige rollback e nova leitura; não continuar numa transação inválida. Ao repetir transação local, não repetir auditoria, deltas ou resultado já confirmados.
- Idempotência vincula operação, lote, seleção, modalidade e justificativa. Mesma intenção/chave devolve a solicitação; chave com fingerprint diferente conflita. Consultar registro idempotente antes de validar estado atual. Nova chave não autoriza título já liquidado. Uma tentativa `FAILED` não reabre.
- Bloquear nova solicitação manual enquanto houver outra pendente no lote; reprocessamento seleciona somente falhos e preserva sucessos. Todos os títulos da solicitação podem ser consumidos independentemente. Aceite financeiro inválido por item não impede os aptos.
- Mensagem precisa conferir lote, título, solicitação, chave e tentativa ativa. Comando antigo não executa a nova tentativa; consultar histórico antes de reconhecer como obsoleto. Payload inválido não autoriza marcar um título arbitrário como falho; tratar como erro de contrato e alertar a operação.
- Reconhecer consumo só após resultado/falha definitiva duráveis; não avançar offset sobre registros ainda pendentes da mesma partição. Banco indisponível impede confirmação. Falha após commit pode gerar reentrega, nunca novo efeito financeiro.
- Erro definitivo só do título afetado; não atualizar os demais para `FAILED` nem apagar suas liquidações. Contadores e estado agregado são atualizados no commit individual, não por contagem em memória sujeita a corrida.
- Snapshot novo somente em nova solicitação manual. Retry automático usa condições antigas; consultas externas não ocorrem dentro da transação financeira. Liquidação continua sendo registro de aquisição, sem transferência bancária real.

## Imutabilidade e privilégios

As credenciais de execução não podem ser proprietárias do schema/tabelas, executar DDL, `TRUNCATE` ou assumir o papel de migrations. Usar papel separado para migrations do engine. Conceder somente permissões necessárias, sem `UPDATE` ou `DELETE` em tabelas históricas e sem exclusão física nas tabelas operacionais desta entrega.

| Grupo | Escritas permitidas às aplicações |
|---|---|
| `receivable`, `receivable_terms`, `exchange_rate` | Engine insere no fluxo autorizado; engine/worker leem. Não permitir atualização ou exclusão. |
| `settlement` | Worker insere na liquidação; engine/worker leem. Não permitir atualização ou exclusão. |
| `audit_event` | Engine/worker inserem e leem conforme seu papel. Não permitir atualização ou exclusão. |
| `assignor` | Engine cadastra e altera campos autorizados, com exclusão lógica. Worker somente lê. |
| `exchange_rate_proposal` | Engine cadastra e decide; conteúdo original permanece imutável. Worker não precisa escrever. |
| `batch`, `settlement_request`, `settlement_request_item`, `receivable_processing` | Engine cadastra/aceita e registra falhas no aceite; worker conclui títulos ou registra falha/retry. Atualizar somente campos operacionais autorizados. |
| `outbox_message` | Engine cria e relay reivindica/publica; worker insere DLQ. Payload e vínculos não podem mudar desde a inserção. |
| `settlement_consumer_quarantine` | Worker insere/consulta registros poison sem payload ou chave brutos; engine somente consulta. Sem `UPDATE`/`DELETE`. |

Aplicar grants por coluna e/ou triggers de proteção para campos imutáveis dentro de tabelas mutáveis. Validação de transições deve impedir reabertura de solicitações e propostas terminais, lotes liquidados e mensagens enviadas; conferir valores antigos e novos, não somente o domínio do `status`. Lotes `FAILED`/`PARTIALLY_SETTLED` e títulos falhos podem voltar a `PENDING` somente mediante nova solicitação/tentativa; preservar o histórico, sem reabrir tentativa terminal. Flags geradas nunca são alteradas diretamente. Não é necessário adicionar `date_updated` a tabelas imutáveis nem criar `deleted` em registros financeiros ou auditoria. Restrições de privilégios complementam FKs, unicidades, triggers e transações; nenhuma dessas camadas isoladamente substitui as demais.

## Índices e consultas previstas

PKs e restrições `UNIQUE` já fornecem seus índices; não criar cópias equivalentes. Os índices abaixo são candidatos iniciais para os caminhos de consulta contratados, sujeitos à verificação com planos de execução e massa representativa. As unicidades exigidas não são opcionais.

| Consulta | Índice ou acesso previsto |
|---|---|
| Cedente por documento | Índice de `UNIQUE(document_number)`, sem filtro de exclusão na identidade; serviço verifica `deleted` para novos cadastros. |
| Títulos de um lote | `receivable(batch_uuid, uuid)`. |
| Títulos por cedente | Prefixo do índice único `(assignor_uuid, type, external_reference)`; avaliar complemento somente com evidência de plano. |
| Histórico de solicitações | `settlement_request(batch_uuid, date_register DESC, uuid DESC)`; índice único parcial garante uma pendente por lote. |
| Tentativas por solicitação | `settlement_request_item(request_uuid, status, receivable_uuid)`; unicidade solicitação/título. |
| Histórico por título | `settlement_request_item(receivable_uuid, attempt_number DESC)`; ordinal único. |
| Estados/erros por lote | `receivable(batch_uuid, uuid)` com join no estado por `UNIQUE(receivable_uuid)`; avaliar índice `(status, receivable_uuid)` conforme plano. |
| Condições por tentativa | Índice único `receivable_terms(attempt_uuid)`. |
| Liquidação por período | `settlement(settled_at DESC, uuid DESC)`; `UNIQUE(receivable_uuid)` protege o título. |
| Totais por lote/solicitação | `settlement(batch_uuid, uuid)` e `settlement(request_uuid, uuid)`, sem unicidade nesses vínculos. |
| Extrato por moeda | Avaliar `settlement(payment_currency, settled_at DESC, uuid DESC)`; cedente pelo recebível. |
| Cotação vigente | Índice único `(base_currency, quote_currency, effective_from)`; selecionar maior vigência não futura e validar idade no aceite. |
| Propostas pendentes | `exchange_rate_proposal(date_register, uuid) WHERE status = 'PENDING'`. |
| Outbox elegível | `outbox_message(next_attempt_at, uuid) WHERE status = 'READY'`. |
| Reivindicações expiradas | `outbox_message(claim_expires_at, uuid) WHERE status = 'CLAIMED'`. |
| Outbox por lote | `outbox_message(batch_uuid, date_register, uuid)`; acesso por tentativa usa unicidade de tentativa/tópico. |
| Auditoria por entidade | Índices parciais `(batch_uuid, date_register, uuid)`, `(request_uuid, date_register, uuid)`, `(receivable_uuid, date_register, uuid)`, `(attempt_uuid, date_register, uuid)`, `(assignor_uuid, date_register, uuid)`, `(proposal_uuid, date_register, uuid)` e `(exchange_rate_uuid, date_register, uuid)`, cada qual com referência não nula. |

Extrato usa liquidações individuais confirmadas, inclusive de lotes pendentes/parciais, período com início inclusivo/fim exclusivo em UTC e filtros de cedente/moeda aplicados aos itens no banco. Ordenação determinística por instante individual da liquidação e UUID. Paginação segue a SPEC, sem carregar toda a base ou avançar páginas automaticamente. Índices e consultas devem ser medidos; esta documentação não comprova metas de desempenho.

## Migrations, evidências e verificações restantes

O `spe-j-engine` aplica as migrations versionadas V1–V6 com credencial de migração separada das credenciais de execução. O workflow verifica versão e colunas compatíveis antes de consumir e não executa migrations. A criação/alteração automática do schema pelo ORM fica desabilitada. Migrations incluem constraints, índices, triggers e grants, com nomes em `snake_case`.

Evidência automatizada existente: `spe-j-engine/src/test/java/com/backend/common/config/PostgreSQLIntegrityIT.java` verifica invariantes e privilégios; `spe-j-workflow/src/test/java/com/backend/settlement/SettlementPostgreSQLIT.java` cobre liquidação por título, replay, rollback isolado, retries, DLQ e concorrência de mensagens duplicadas. `spe-j-engine/src/test/java/com/backend/integration/EngineHttpIT.java` cobre contratos HTTP, autorização e aceite concorrente. Testes dos motores de precificação ficam nos dois projetos. O [relatório de carga](docs/WORKFLOW_LOAD_REPORT.md) registra reconciliação de execuções locais.

Não há evidência ponta a ponta automatizada de falha de processamento seguida de reprocessamento seletivo bem-sucedido preservando os demais títulos; também falta uma corrida de aprovação cambial concorrente diretamente contra PostgreSQL. A carga atual não substitui esses cenários.

Antes de afirmar conformidade da implementação, verificar com PostgreSQL real:

- PKs, nulabilidade/defaults, FKs, valores permitidos, limites numéricos e referências cruzadas incorretas; tentar vincular lote, solicitação, condições e itens de fluxos diferentes.
- Duplicidade de título por entradas/lotes distintos, inclusive após exclusão lógica do cedente; reutilização de chave em outro lote e concorrência com chaves iguais/diferentes.
- Lote com dez títulos: um falha, nove liquidam e permanecem no extrato; lote parcial com contagens corretas. Falha local não desfaz commits anteriores nem impede os posteriores.
- Dois títulos finalizando juntos, sucesso e falha concorrentes, contadores sem perda e estado terminal correto; conflito de agregado não classifica falha financeira.
- Reprocessar somente um subconjunto de falhos com outro operador; novos snapshots, ordinal e justificativa preservados, erros antigos consultáveis, títulos já liquidados rejeitados; lote pode continuar parcial após solicitação bem-sucedida.
- Tentar liquidar novamente por nova chave, mensagem antiga e reentrega após commit; unicidade por título e auditoria de sucesso única. Tentativa sem resultado/auditoria ou sucesso com erro deve falhar no commit.
- Imutabilidade por operações diretas com credenciais de execução, incluindo campos de snapshot, inclusão tardia, alterações de histórico e exclusão/truncamento.
- Câmbio no limite exato de 24 horas, futuro, expirado ou ausente; BRL prossegue com USD falho no mesmo lote; todos inválidos no aceite geram falhas auditadas sem comando; autoaprovação, decisão concorrente, empate de vigência e aprovação sem cotação/auditoria.
- Recuperação de outbox reivindicada, falha após publicação, persistência do orçamento de retries após reinício, falha definitiva com DLQ e mensagem antiga após nova tentativa manual.
- Cálculo e totais com golden cases, prazo zero, frações de mês, valores que arredondam para zero e overflow; filtros/paginação e planos de consulta com massa representativa.

Os casos abaixo são verificações adicionais recomendadas. Os relatórios vinculados devem ser atualizados quando forem executados; os itens ainda sem evidência não devem ser apresentados como homologados.
