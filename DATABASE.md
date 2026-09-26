# DATABASE — SRM Credit Engine

**Status: modelo para implementação; migrations e aplicações ainda não existem.**

Este documento detalha o modelo PostgreSQL exigido por [SPEC.md](SPEC.md) e [AGENTS.md](AGENTS.md). As regras abaixo são requisitos de implementação, não evidências de controles já executados. A SPEC permanece como fonte dos contratos funcionais.

## Convenções e garantias comuns

- Todas as tabelas têm `uuid UUID PRIMARY KEY`, gerado no backend, e `date_register TIMESTAMPTZ NOT NULL`, preenchido na inserção e imutável. Não há identificador numérico auxiliar.
- Nas tabelas abaixo, **obrigatório** significa `NOT NULL`; **opcional** significa que `NULL` é permitido somente nas condições descritas. Campos sem default devem ser fornecidos explicitamente. Textos obrigatórios não podem ser vazios nem conter somente espaços; aplicar `CHECK` além de `NOT NULL`.
- Toda referência indicada como FK aponta para `uuid` da tabela citada. Não usar exclusão ou atualização em cascata: preservar referências e histórico. As FKs compostas e verificações adicionais estão descritas nas respectivas tabelas e na seção de integridade entre tabelas.
- Tabelas mutáveis têm `date_updated`, inicialmente nulo, atualizado a cada alteração, e `version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)`. Alterações usam a versão esperada no predicado e incrementam a versão. A coluna sozinha não implementa optimistic locking.
- Instantes usam UTC na aplicação e nas conexões; datas financeiras usam `America/Sao_Paulo`. Não converter vencimento em instante. Validar datas finitas e limites aceitos antes de persistir.
- Dinheiro usa `NUMERIC(19,2)`; taxas e câmbio usam `NUMERIC(24,12)`. Rejeitar valores não finitos e overflow, inclusive após conversão e soma. Validar escala antes da gravação: o arredondamento implícito do banco não substitui `HALF_EVEN` no motor `BigDecimal`.
- Não introduzir um limite de sinal para a taxa base configurável sem contrato funcional correspondente. Validar `1 + base_rate + spread > 0` para cada item. Valor de face e câmbio são estritamente positivos; resultados arredondados de VP e pagamento podem ser zero. O deságio é a diferença entre face e VP, sem impor uma regra adicional de sinal não prevista na SPEC.
- PKs, FKs, unicidades, defaults e verificações da própria linha devem ser implementados nas migrations. Invariantes entre tabelas, agregados e transições exigem os controles transacionais descritos adiante; não tratá-los como um simples `CHECK` de linha.

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
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| active_request_uuid | UUID | Opcional somente em `READY`; FK para `settlement_request`; deve pertencer ao próprio lote. |
| source | VARCHAR | Obrigatório; `CHECK` em `FORM`, `CSV`, `CNAB`; imutável. |
| status | VARCHAR | Obrigatório; `DEFAULT 'READY'`; `CHECK` em `READY`, `PENDING`, `SETTLED`, `FAILED`. |
| created_by_issuer | VARCHAR | Obrigatório; `iss` autenticado; imutável. |
| created_by_subject | VARCHAR | Obrigatório; `sub` autenticado; imutável. |
| version | BIGINT | Obrigatório; `DEFAULT 0`; não negativo; controle de versão otimista. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |
| date_updated | TIMESTAMPTZ | Opcional na inserção; obrigatório após alteração; atualizado pelo serviço. |

**Integridade:** `CHECK` associa `READY` a `active_request_uuid IS NULL` e todos os demais estados a uma referência preenchida. Criar `UNIQUE(uuid, batch_uuid)` em `settlement_request` e FK composta `(active_request_uuid, uuid)` para `(uuid, batch_uuid)`, impedindo solicitação ativa de outro lote.

**Transições:** `READY` para `PENDING`; `PENDING` para `SETTLED` ou `FAILED`; `FAILED` para `PENDING` somente por novo aceite manual. `SETTLED` é terminal. Em estado terminal, manter a referência da última solicitação. Nova tentativa substitui apenas essa referência e preserva o histórico. Cadastro contém 1–1.000 recebíveis, sujeito ao limite configurado na SPEC, e uma outbox bloqueada; não existe lote vazio após commit.

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

**Integridade:** `UNIQUE(assignor_uuid, type, external_reference)`, sem filtro por estado do lote ou exclusão lógica do cedente. Referência normalizada também deve ser validada na gravação; sua comparação preserva caracteres e zeros, sem conversão numérica ou alteração de caixa implícita. Todos os campos são imutáveis após o cadastro; não adicionar títulos a um lote já cadastrado. `status`, `version`, `date_updated` e `deleted` não são necessários aqui: estado operacional pertence ao lote e à solicitação.

## settlement_request

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Obrigatório; FK para `batch`; várias solicitações históricas por lote. |
| exchange_rate_uuid | UUID | Opcional para lote exclusivamente BRL; FK para `exchange_rate`; obrigatório se houver USD. |
| operation | VARCHAR | Obrigatório; `CHECK (operation = 'SETTLEMENT')` nesta entrega. |
| idempotency_key | VARCHAR | Obrigatório; comparação exata; escopo global por operação, sem incluir operador. |
| status | VARCHAR | Obrigatório; `DEFAULT 'PENDING'`; `CHECK` em `PENDING`, `SETTLED`, `FAILED`. |
| accepted_at | TIMESTAMPTZ | Obrigatório; instante do aceite; imutável. |
| requested_by_issuer | VARCHAR | Obrigatório; `iss` autenticado; imutável. |
| requested_by_subject | VARCHAR | Obrigatório; `sub` autenticado; imutável. |
| calculation_date | DATE | Obrigatório; data de `accepted_at` em `America/Sao_Paulo`. |
| term_convention | VARCHAR | Obrigatório; `CHECK (term_convention = 'ACTUAL_30')`: dias corridos divididos por 30. |
| base_rate | NUMERIC(24,12) | Obrigatório; fração decimal mensal, copiada da configuração vigente no aceite. |
| rule_version | VARCHAR | Obrigatório; identifica versão suportada pelos dois motores. |
| calculation_policy | VARCHAR | Obrigatório; `CHECK (calculation_policy = 'DECIMAL_50')`: 50 algarismos significativos, inclusive na potência. |
| rounding_policy | VARCHAR | Obrigatório; `CHECK (rounding_policy = 'HALF_EVEN')`; etapas de arredondamento conforme SPEC. |
| exchange_rate_value | NUMERIC(24,12) | Opcional junto com a referência cambial; se presente, finito e positivo; BRL por USD. |
| exchange_rate_effective_from | TIMESTAMPTZ | Opcional junto com a referência cambial; vigência copiada no aceite. |
| retry_count | INTEGER | Obrigatório; `DEFAULT 0`; `CHECK (retry_count BETWEEN 0 AND 3)`; repetições adicionais, não a tentativa inicial. |
| next_retry_at | TIMESTAMPTZ | Opcional; preenchido somente quando houver repetição automática agendada em `PENDING`. |
| failure_code | VARCHAR | Obrigatório e não vazio em `FAILED`; nulo nos demais estados. |
| failure_message | TEXT | Obrigatório e não vazio em `FAILED`; nulo nos demais estados; diagnóstico sem segredos. |
| version | BIGINT | Obrigatório; `DEFAULT 0`; não negativo; controle de versão otimista. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |
| date_updated | TIMESTAMPTZ | Opcional na inserção; obrigatório após alteração; atualizado pelo serviço. |

**Unicidade:** `UNIQUE(operation, idempotency_key)` e índice único parcial em `batch_uuid WHERE status = 'PENDING'`. A unicidade `(uuid, batch_uuid)` dá suporte às FKs compostas. Não aplicar unicidade global a `batch_uuid`, pois o lote pode ter tentativas manuais históricas.

**Snapshot:** referência, valor e vigência cambial são todos nulos ou todos preenchidos, protegidos por `CHECK`. Para lote exclusivamente BRL, gravar todos nulos; para qualquer item USD, gravar todos preenchidos e conferir a cotação vigente mais recente, não futura e com idade de até 24 horas em `accepted_at`. Identidade, operação/chave, lote, aceite, data, políticas, taxas e câmbio ficam imutáveis. Somente estado, retry, diagnóstico, versão e data de atualização podem mudar.

**Estados:** `PENDING` para `SETTLED` ou `FAILED`; estados terminais não reabrem. `next_retry_at` deve ser nulo em estado terminal; diagnóstico definitivo existe somente em `FAILED`. O orçamento é uma tentativa inicial e até três adicionais. Cada repetição é reservada atomicamente, incrementando o contador antes da execução; reinício nunca o zera. Persistir a reserva e o agendamento fora da transação financeira sujeita a rollback, verificando versão e solicitação ativa, para que a falha não devolva orçamento consumido. O agendamento de 1, 5 e 15 segundos é persistido e consumido sem autorizar repetições extras. Nova tentativa manual cria outra linha e outra chave, mantendo a anterior intacta.

Não revalidar envelhecimento da cotação ou vencimento com a data corrente durante retries automáticos. Mesma chave/lote consulta a solicitação existente; mesma chave em outro lote conflita. Conferir solicitação ativa junto ao controle de versão antes de qualquer efeito financeiro.

## receivable_terms

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| request_uuid | UUID | Obrigatório; FK para `settlement_request`. |
| receivable_uuid | UUID | Obrigatório; FK para `receivable`; mesmo lote da solicitação. |
| term_days | INTEGER | Obrigatório; `CHECK (term_days >= 0)`; vencimento menos data do cálculo. |
| spread | NUMERIC(24,12) | Obrigatório; fração decimal mensal fixada por tipo no aceite. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** `UNIQUE(request_uuid, receivable_uuid)`; uma condição por recebível em cada solicitação. Solicitação e recebível pertencem ao mesmo lote. O aceite grava exatamente uma linha para cada título do lote e confere dias e spread contra a regra suportada; os spreads desta entrega são os da SPEC. Linhas imutáveis, sem inclusão tardia após o aceite. Prazo zero é permitido.

## settlement

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Obrigatório; FK para `batch`; `UNIQUE`. |
| request_uuid | UUID | Obrigatório; FK para `settlement_request`; `UNIQUE`; solicitação do mesmo lote. |
| settled_at | TIMESTAMPTZ | Obrigatório; instante financeiro da conclusão, gravado na transação de sucesso. |
| total_face_value_brl | NUMERIC(19,2) | Obrigatório; positivo; soma das faces de todos os recebíveis. |
| total_present_value_brl | NUMERIC(19,2) | Obrigatório; não negativo; soma dos VPs individuais em BRL, já arredondados. |
| total_discount_brl | NUMERIC(19,2) | Obrigatório; `CHECK (total_discount_brl = total_face_value_brl - total_present_value_brl)`. |
| total_payment_brl | NUMERIC(19,2) | Obrigatório; não negativo; soma dos pagamentos em BRL; zero se não houver. |
| total_payment_usd | NUMERIC(19,2) | Obrigatório; não negativo; soma dos pagamentos em USD; zero se não houver. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** `UNIQUE(batch_uuid)` e `UNIQUE(request_uuid)`. FK composta `(request_uuid, batch_uuid)` para `settlement_request(uuid, batch_uuid)`. Existência do cabeçalho implica conclusão de todos os recebíveis do lote na mesma transação. Conferir somas por moeda e soma do deságio contra os itens; não somar BRL e USD no mesmo total nem arredondar uma soma de valores não finalizados. Campos não têm default financeiro: o serviço fornece os totais calculados, incluindo zeros de moedas ausentes.

## settlement_item

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| settlement_uuid | UUID | Obrigatório; FK para `settlement`. |
| receivable_uuid | UUID | Obrigatório; FK para `receivable`; `UNIQUE` global. |
| terms_uuid | UUID | Obrigatório; FK para `receivable_terms`; `UNIQUE`; condições do mesmo recebível e da solicitação liquidada. |
| present_value_brl | NUMERIC(19,2) | Obrigatório; não negativo; VP final em BRL, arredondado a duas casas. |
| discount_brl | NUMERIC(19,2) | Obrigatório; face do recebível menos `present_value_brl`. |
| payment_amount | NUMERIC(19,2) | Obrigatório; não negativo; valor final na moeda de pagamento. |
| payment_currency | VARCHAR | Obrigatório; `CHECK` em `BRL`, `USD`; igual à moeda do recebível. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** `UNIQUE(receivable_uuid)` impede liquidar novamente o título, mesmo com outra chave. `UNIQUE(terms_uuid)` impede reutilizar condições. Recebível deve pertencer ao lote do cabeçalho; condições devem corresponder ao recebível e à solicitação do cabeçalho. Pagamento BRL deve ser igual ao VP em BRL (`CHECK` na própria linha); pagamento USD utiliza o VP em BRL já arredondado, dividido pelo câmbio do snapshot e arredondado novamente. Validar deságio e moeda contra o recebível. Não duplicar valor de face ou vencimento: a origem referenciada é imutável.

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

**Inicialização:** não há cotação automática ou importada do mock nesta entrega. A primeira cotação usa o mesmo fluxo de proposta e aprovação por usuários distintos. Enquanto não existir cotação válida, lotes USD são bloqueados no aceite; BRL continua disponível. Massa de teste deve preservar essas relações.

## outbox_message

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Obrigatório; FK para `batch`; chave de particionamento Kafka. |
| request_uuid | UUID | Nulo em `BLOCKED`; obrigatório nos demais estados; FK para `settlement_request` do mesmo lote. |
| topic | VARCHAR | Obrigatório; `CHECK` em `credit-lot`, `credit-lot.dlq`. |
| status | VARCHAR | Obrigatório; `CHECK` em `BLOCKED`, `READY`, `CLAIMED`, `SENT`; fornecido conforme o fluxo. |
| payload | JSONB | Nulo em `BLOCKED`; obrigatório nos demais estados; objeto JSON com apenas `batchUuid` e `idempotencyKey`, ambos strings. |
| publish_attempts | INTEGER | Obrigatório; `DEFAULT 0`; não negativo; incrementado ao reivindicar uma tentativa de envio. |
| next_attempt_at | TIMESTAMPTZ | Obrigatório em `READY`; nulo nos demais estados; controla elegibilidade de envio. |
| claim_token | UUID | Obrigatório somente em `CLAIMED`; nulo nos demais estados; token de propriedade da reivindicação, não FK. |
| claim_expires_at | TIMESTAMPTZ | Obrigatório somente em `CLAIMED`; nulo nos demais estados. |
| sent_at | TIMESTAMPTZ | Obrigatório somente em `SENT`; nulo nos demais estados; preenchido após confirmação do broker. |
| version | BIGINT | Obrigatório; `DEFAULT 0`; não negativo; controle de versão otimista. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |
| date_updated | TIMESTAMPTZ | Opcional na inserção; obrigatório após alteração; atualizado pelo serviço. |

**Integridade:** FK composta `(request_uuid, batch_uuid)` para `settlement_request(uuid, batch_uuid)`; `request_uuid` nulo é permitido apenas em `BLOCKED`. Criar índice único parcial em `batch_uuid WHERE status = 'BLOCKED'` e `UNIQUE(request_uuid, topic)` para impedir mais de um comando lógico do mesmo tipo por solicitação. Esses controles complementam a criação transacional de exatamente uma outbox inicial.

**Payload:** `CHECK` valida objeto, conjunto exato de duas chaves e tipos string; o serviço confere `batchUuid` contra `batch_uuid` e `idempotencyKey` contra a solicitação. Não adicionar JWT, dados financeiros, erro ou correlação à mensagem. A chave Kafka deriva de `batch_uuid`. Após liberação, lote, solicitação, tópico e payload ficam imutáveis.

**Estados e nulabilidade:** aplicar `CHECK` para as condições de cada campo acima. `BLOCKED` exige tópico `credit-lot`, payload/solicitação nulos, zero tentativas e ausência de horários de envio/reivindicação. No primeiro aceite, essa linha passa para `READY`; uma nova tentativa manual cria outra linha `READY`. Falha definitiva cria uma linha `READY` para `credit-lot.dlq` na transação de falha.

O relay move `READY` para `CLAIMED` com versão esperada, token exclusivo e prazo finito de recuperação. Só o detentor do token atual pode concluir a reivindicação. Confirmação do broker move para `SENT`; falha ou reivindicação expirada volta para `READY`, limpa token/prazo e define próximo envio. Ao entrar em `CLAIMED`, limpar `next_attempt_at`; ao entrar em `SENT`, limpar todos os campos de agendamento/reivindicação. `SENT` é terminal. Nunca descartar a mensagem por limite de tentativas de publicação; o orçamento de retries do worker é independente.

## audit_event

| Campo | Tipo PostgreSQL | Obrigatoriedade e regra |
|---|---|---|
| uuid | UUID | Obrigatório; chave primária; gerado no backend; imutável. |
| batch_uuid | UUID | Opcional conforme evento; FK para `batch`. |
| request_uuid | UUID | Opcional conforme evento; FK para `settlement_request`. |
| assignor_uuid | UUID | Opcional conforme evento; FK para `assignor`. |
| proposal_uuid | UUID | Opcional conforme evento; FK para `exchange_rate_proposal`. |
| exchange_rate_uuid | UUID | Opcional conforme evento; FK para `exchange_rate`. |
| event_type | VARCHAR | Obrigatório; valores e referências exigidas definidos na seção de auditoria. |
| actor_issuer | VARCHAR | Obrigatório; emissor da identidade humana validada ou identificador do emissor técnico. |
| actor_subject | VARCHAR | Obrigatório; sujeito humano validado ou identidade técnica do processo responsável. |
| correlation_id | VARCHAR | Obrigatório; correlação gerada/validada pela aplicação; não é credencial. |
| details | JSONB | Obrigatório; objeto JSON com conteúdo validado por tipo de evento; sem JWT, senhas ou arquivos integrais. |
| date_register | TIMESTAMPTZ | Obrigatório; instante de inserção; imutável. |

**Integridade:** referências opcionais dependem do tipo de evento, não de conveniência do chamador. Quando houver solicitação, exigir lote e conferir pertencimento; quando houver cotação e proposta, conferir a relação. `details` deve ser objeto JSON e seguir contrato por evento. Não armazenar dados financeiros exclusivamente no JSON quando já pertencem às tabelas financeiras.

| `event_type` | Referências obrigatórias | Conteúdo mínimo de `details` |
|---|---|---|
| `ASSIGNOR_CREATED` | Cedente | Campos cadastrais registrados, sem segredos. |
| `ASSIGNOR_UPDATED` | Cedente | Campos alterados e valores anterior/novo. |
| `ASSIGNOR_DELETED` / `ASSIGNOR_RESTORED` | Cedente | Transição de exclusão lógica. |
| `BATCH_CREATED` | Lote | Origem e quantidade de recebíveis. |
| `SETTLEMENT_REQUESTED` | Lote e solicitação | Versão da regra e referência ao snapshot persistido. |
| `SETTLEMENT_SUCCEEDED` | Lote e solicitação | Quantidade de itens e totais separados por moeda; resultado localizado pela unicidade de `settlement.batch_uuid`. |
| `SETTLEMENT_FAILED` | Lote e solicitação | Código, mensagem e contador de retries; sem conteúdo sensível. |
| `EXCHANGE_RATE_PROPOSED` | Proposta | Par, valor proposto e justificativa. |
| `EXCHANGE_RATE_APPROVED` | Proposta e cotação | Valor aprovado e vigência. |
| `EXCHANGE_RATE_REJECTED` | Proposta | Justificativa da rejeição. |

Implementar `CHECK` dos tipos e referências obrigatórias. Referências não pertinentes ficam nulas. Para sucesso/falha terminal e decisão cambial, impedir evento duplicado da mesma entidade e tipo com índices únicos parciais. O ator do aceite é humano; o ator da liquidação pode ser o worker, preservando o solicitante autenticado pela solicitação referenciada. Correlação do processamento deve ser recuperável no banco a partir da solicitação/evento de aceite, sem ampliar o payload Kafka. Erros técnicos preservam stack trace nos logs estruturados conforme AGENTS.md.

## Integridade entre tabelas e cardinalidades

| Relação | Cardinalidade e garantia |
|---|---|
| Cedente / recebível | Um cedente possui zero ou muitos títulos; cada título possui exatamente um cedente. Exclusão lógica não desfaz a relação. |
| Lote / recebível | Um lote cadastrado possui de 1 ao limite configurado de títulos, até 1.000 nesta entrega; cada título pertence a um lote. Composição não muda após cadastro. |
| Lote / solicitação | Zero ou muitas solicitações históricas; no máximo uma `PENDING`. A referência ativa aponta à solicitação atual ou à última terminal. |
| Solicitação / condições | Uma condição para cada recebível do lote; novas tentativas manuais geram outro conjunto. |
| Lote / liquidação / itens | Zero ou uma liquidação por lote; quando existente, exatamente um item por recebível, sem omissões ou itens extras. |
| Proposta / cotação | Zero cotações para proposta pendente/rejeitada; exatamente uma para aprovada. Toda cotação possui uma proposta. |
| Lote / outbox | Uma outbox bloqueada no cadastro, reutilizada no primeiro aceite; outras linhas somente para novas solicitações ou DLQ. |
| Solicitação / outbox | Um comando `credit-lot` por aceite; no máximo um comando `credit-lot.dlq` após falha definitiva. |

FK simples prova existência, mas não prova que duas referências pertencem ao mesmo fluxo. Usar as FKs compostas especificadas em `batch`, `settlement` e `outbox_message`. Nas migrations, criar a FK de `batch` após as duas tabelas existirem. No cadastro, inserir lote sem solicitação ativa. No aceite posterior, inserir a solicitação e só então atualizar a referência do lote existente, na mesma transação.

Para relações que exigem percorrer tabelas sem duplicar colunas — condições/recebível/solicitação, item/condições/cabeçalho e cotação/proposta — implementar verificações de integridade por triggers nas migrations, além da validação antecipada dos serviços. Validar também referências simultâneas de auditoria e correspondência do payload da outbox. Os dados financeiros e vínculos verificados permanecem imutáveis, evitando que uma alteração posterior invalide a checagem.

Verificações que dependem do conjunto final de uma transação, como cobertura de todos os itens, totais, estado terminal, auditoria de sucesso e correspondência entre proposta aprovada e cotação, devem usar constraint triggers diferidas até o commit. Cobrir também inserções tardias de itens/condições/recebíveis que alterariam conjuntos já finalizados. Não criar consultas por linha que reprocessam o lote inteiro: limitar as verificações ao lote ou à solicitação afetada, agrupar consultas quando possível e medir com 1.000 itens. O serviço continua responsável pelo fluxo e pelas mensagens de negócio; triggers são a proteção de integridade persistida.

## Transações e controle de concorrência

| Operação | Escritas que pertencem ao mesmo commit | Validações do serviço |
|---|---|---|
| Cadastro | Lote `READY`, todos os recebíveis, outbox `BLOCKED` e auditoria do cadastro. | Cedentes existentes e ativos, tamanho do lote, normalização, vencimentos, valores, tipos, moedas e duplicidades. Rejeitar o lote inteiro em qualquer falha. |
| Aceite | Nova solicitação e condições de todos os itens, atualização versionada do lote para `PENDING`, referência ativa, liberação/criação da outbox e auditoria. | Autorização, idempotência, estado, vencimentos, regra suportada, limites numéricos e câmbio válido se necessário. Responder `202` somente após commit. |
| Sucesso | Cabeçalho, todos os itens, auditoria de sucesso e estados `SETTLED` de solicitação/lote, com controle de versão. | Solicitação ativa, snapshot completo, cálculo reproduzível, totais e unicidade. Erro em qualquer item desfaz toda a transação. |
| Falha definitiva | Após rollback financeiro: solicitação/lote `FAILED`, diagnóstico, auditoria e outbox de DLQ em transação separada. | Solicitação ainda ativa, pendente e sem liquidação confirmada. Nunca sobrescrever conclusão concorrente. |
| Decisão cambial | Decisão versionada, auditoria e, somente na aprovação, nova cotação. | Papel do gestor, identidade diferente, estado pendente e dados da decisão. |

- Todas as alterações concorridas verificam versão e estado esperado. Tratar conflito de unicidade ou versão após rollback, relendo o estado em uma nova transação; não continuar usando uma transação que falhou.
- Idempotência permanece associada à operação e ao lote por todo o ciclo financeiro. Chaves iguais não criam nova outbox; outra chave em lote pendente conflita; lote concluído devolve resultado existente. Uma solicitação `FAILED` não é reutilizada para nova execução.
- Mensagem de solicitação antiga não altera o lote nem a solicitação nova. Worker confere operação, chave e solicitação ativa sob controle de versão antes do commit. Kafka, consumer group e bloqueio de botões não substituem garantias PostgreSQL.
- Reconhecer consumo somente após resultado confirmado ou falha definitiva persistida. Banco indisponível para registrar falha impede reconhecimento e exige recuperação do consumo. Falha após commit pode causar reentrega, nunca novo efeito financeiro.
- Consulta de cotação e fixação do snapshot ocorrem no aceite; chamadas ao mock ficam fora da transação financeira. Datas e taxas atuais não substituem condições já aceitas. Autorizações são verificadas no engine, nunca inferidas do payload Kafka ou de identidade enviada no body.

## Imutabilidade e privilégios

As credenciais de execução não podem ser proprietárias do schema/tabelas, executar DDL, `TRUNCATE` ou assumir o papel de migrations. Usar papel separado para migrations do engine. Conceder somente permissões necessárias, sem `UPDATE` ou `DELETE` em tabelas históricas e sem exclusão física nas tabelas operacionais desta entrega.

| Grupo | Escritas permitidas às aplicações |
|---|---|
| `receivable`, `receivable_terms`, `exchange_rate` | Engine insere no fluxo autorizado; engine/worker leem. Não permitir atualização ou exclusão. |
| `settlement`, `settlement_item` | Worker insere na liquidação; engine/worker leem. Não permitir atualização ou exclusão. |
| `audit_event` | Engine/worker inserem e leem conforme seu papel. Não permitir atualização ou exclusão. |
| `assignor` | Engine cadastra e altera campos autorizados, com exclusão lógica. Worker somente lê. |
| `exchange_rate_proposal` | Engine cadastra e decide; conteúdo original permanece imutável. Worker não precisa escrever. |
| `batch`, `settlement_request` | Engine cadastra/aceita; worker conclui ou registra falha/retry. Atualizar somente campos operacionais autorizados. |
| `outbox_message` | Engine cria/libera e relay reivindica/publica; worker insere DLQ. Payload liberado e vínculos não podem mudar. |

Aplicar grants por coluna e/ou triggers de proteção para campos imutáveis dentro de tabelas mutáveis. Validação de transições deve impedir reabertura de solicitações e propostas terminais, lotes liquidados e mensagens enviadas; conferir valores antigos e novos, não somente o domínio do `status`. A exceção operacional é o lote `FAILED`, que pode voltar a `PENDING` mediante uma nova solicitação, preservando a anterior. Não é necessário adicionar `date_updated` a tabelas imutáveis nem criar `deleted` em registros financeiros ou auditoria. Restrições de privilégios complementam FKs, unicidades, triggers e transações; nenhuma dessas camadas isoladamente substitui as demais.

## Índices e consultas previstas

PKs e restrições `UNIQUE` já fornecem seus índices; não criar cópias equivalentes. Os índices abaixo são candidatos iniciais para os caminhos de consulta contratados, sujeitos à verificação com planos de execução e massa representativa. As unicidades exigidas não são opcionais.

| Consulta | Índice ou acesso previsto |
|---|---|
| Cedente por documento | Índice de `UNIQUE(document_number)`, sem filtro de exclusão na identidade; serviço verifica `deleted` para novos cadastros. |
| Títulos de um lote | `receivable(batch_uuid, uuid)`. |
| Títulos por cedente | Prefixo do índice único `(assignor_uuid, type, external_reference)`; avaliar complemento somente com evidência de plano. |
| Histórico de solicitações | `settlement_request(batch_uuid, date_register DESC, uuid DESC)`; índice único parcial garante uma pendente por lote. |
| Condições por solicitação | Índice de `UNIQUE(request_uuid, receivable_uuid)`; `receivable_terms(receivable_uuid)` para acesso inverso. |
| Liquidação por período | `settlement(settled_at DESC, uuid DESC)` e índices únicos de lote/solicitação. |
| Itens do extrato | `settlement_item(settlement_uuid, payment_currency, uuid)` e índice único por recebível; filtrar cedente pelo recebível. |
| Cotação vigente | Índice único `(base_currency, quote_currency, effective_from)`; selecionar maior vigência não futura e validar idade no aceite. |
| Propostas pendentes | `exchange_rate_proposal(date_register, uuid) WHERE status = 'PENDING'`. |
| Outbox elegível | `outbox_message(next_attempt_at, uuid) WHERE status = 'READY'`. |
| Reivindicações expiradas | `outbox_message(claim_expires_at, uuid) WHERE status = 'CLAIMED'`. |
| Outbox por lote | `outbox_message(batch_uuid, date_register, uuid)`; acesso por solicitação usa unicidade de solicitação/tópico. |
| Auditoria por entidade | Índices parciais `(batch_uuid, date_register, uuid)`, `(request_uuid, date_register, uuid)`, `(assignor_uuid, date_register, uuid)`, `(proposal_uuid, date_register, uuid)` e `(exchange_rate_uuid, date_register, uuid)`, cada qual com referência não nula. |

Extrato usa apenas liquidações concluídas, período com início inclusivo/fim exclusivo em UTC e filtros de cedente/moeda aplicados aos itens no banco. Ordenação determinística por instante da liquidação e UUID; se houver múltiplos itens por liquidação, usar também UUID do item como desempate. Paginação segue a SPEC, sem carregar toda a base ou avançar páginas automaticamente. Índices e consultas devem ser medidos; esta documentação não comprova metas de desempenho.

## Migrations e critérios de verificação

O `spe-j-engine` mantém migrations versionadas e é o único responsável por aplicá-las, usando o papel de migração separado das credenciais de execução. O worker verifica versão compatível antes de consumir e não executa migrations. Desabilitar criação/alteração automática do schema pelo ORM. Migrations devem incluir constraints, índices, triggers e grants, com nomes em `snake_case`.

Antes de afirmar conformidade da implementação, verificar com PostgreSQL real:

- PKs, nulabilidade/defaults, FKs, valores permitidos, limites numéricos e referências cruzadas incorretas; tentar vincular lote, solicitação, condições e itens de fluxos diferentes.
- Duplicidade de título por entradas/lotes distintos, inclusive após exclusão lógica do cedente; reutilização de chave em outro lote e concorrência com chaves iguais/diferentes.
- Rollback integral ao falhar qualquer item; tentativa de commit com itens faltantes, totais incorretos ou sem auditoria; duplicidade após reentrega e após falha entre commit e confirmação Kafka.
- Imutabilidade por operações diretas com credenciais de execução, incluindo campos de snapshot, inclusão tardia, alterações de histórico e exclusão/truncamento.
- Câmbio no limite exato de 24 horas, futuro, expirado ou ausente; lote BRL sem câmbio; autoaprovação, decisão concorrente, empate de vigência e aprovação sem cotação/auditoria.
- Recuperação de outbox reivindicada, falha após publicação, persistência do orçamento de retries após reinício, falha definitiva com DLQ e mensagem antiga após nova tentativa manual.
- Cálculo e totais com golden cases, prazo zero, frações de mês, valores que arredondam para zero e overflow; filtros/paginação e planos de consulta com massa representativa.

Os testes acima são critérios futuros; nenhum resultado de execução é afirmado por este documento.
