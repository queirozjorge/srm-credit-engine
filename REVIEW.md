# REVIEW — Revisão reversa do Anexo A

**Escopo e estado atual (27/09/2026):** o parecer abaixo avalia o trecho legado TypeScript do Anexo A, não a implementação atual em engine/workflow. Use [SPEC.md](SPEC.md), [DATABASE.md](DATABASE.md), [DECISIONS.md](DECISIONS.md) e [relatório de carga](docs/WORKFLOW_LOAD_REPORT.md) para contratos, estado implementado e evidências. A carga nominal recente passou para 20.000 títulos; isso não comprova SLA nem substitui cenários integrados que seguem sem evidência.

**Parecer: bloquear o merge.** O trecho pode gravar liquidações duplicadas ou incompletas, expõe o banco a injeção SQL e calcula valores financeiros fora das premissas do desafio. A correção precisa cobrir aplicação, persistência, contratos e testes; uma correção apenas no handler não protege contra concorrência ou repetição de rede.

## Achados por severidade

### P0 — Injeção SQL nos identificadores

**Referência:** interpolação de `receivableId` nas consultas `SELECT` e `INSERT`/`UPDATE`.

**Cenário e impacto:** um cliente envia um identificador construído para alterar a consulta. A entrada pode expor ou modificar dados além do recebível solicitado, conforme permissões do usuário do banco. JWT válido não neutraliza uma consulta vulnerável.

**Correção:** usar consultas parametrizadas (`PreparedStatement`/parâmetros do ORM), validar o formato UUID antes da chamada e executar cada operação com credenciais de banco de privilégio mínimo. Nunca concatenar valor recebido em SQL.

**Prevenção:** revisão estática e testes de integração com entradas malformadas/injetadas; não registrar payload financeiro ou credenciais nos logs.

### P0 — Fórmula e representação numérica produzem valores incorretos

**Referência:** `BASE_RATE = 1.0`, spreads `1.5`/`2.5`, `Math.pow(...)` e `toFixed(2)`.

**Cenário e impacto:** a fórmula trata percentuais como unidades inteiras: 1,00% deveria ser `0.01` e 1,5%/2,5% deveriam ser `0.015`/`0.025`. O fator mensal usado passa a ser 3,5 ou 4,5, em vez dos fatores previstos pelos golden cases. Além disso, `number`/`Math.pow` usam ponto flutuante binário, e `toFixed` não implementa o arredondamento financeiro `HALF_EVEN`. O resultado pode divergir muito do esperado e variar em centavos.

**Correção:** representar taxas como frações decimais e valores como `BigDecimal` de ponta a ponta; explicitar a unidade do prazo; aplicar a política de precisão definida na SPEC e arredondar somente nos pontos contratados. A potência fracionária também precisa permanecer decimal. Usar os três golden cases do desafio como aferição obrigatória.

**Prevenção:** testes determinísticos para C1–C3 e casos de prazo fracionário, zero, limites e arredondamento; executar os mesmos casos nos motores independentes do engine e do workflow.

### P0 — Persistência parcial é reportada como sucesso

**Referência:** `INSERT` de `settlements` e `UPDATE` de `receivables` em comandos separados; `catch` vazio; resposta final `200 { ok: true }`.

**Cenário e impacto:** se o `INSERT` confirmar e o `UPDATE` falhar, a liquidação existe enquanto o recebível continua disponível para nova liquidação. Se qualquer comando falhar, a exceção é descartada e a API afirma sucesso. Isso causa estado inconsistente, possível pagamento duplicado e impede o cliente de distinguir sucesso de falha.

**Correção:** persistir resultado, conclusão do título, auditoria e atualização dos agregados na mesma transação PostgreSQL por título. Propagar falhas com causa original e log estruturado; responder erro quando não houver commit confirmado. No contrato atual, o engine persiste solicitação/tentativa/outbox atomicamente e responde `202` após o commit; o workflow conclui cada título em transação própria.

**Prevenção:** testes integrados que provoquem falha entre gravações e confirmem rollback isolado do título; verificar que sucessos de outros títulos permanecem, e que não há resposta de sucesso sem persistência.

### P1 — Concorrência e repetição podem criar liquidações duplicadas

**Referência:** leitura do recebível sem bloqueio/versão, seguida de gravação sem chave de idempotência ou restrição de unicidade visível.

**Cenário e impacto:** duas solicitações simultâneas — inclusive retries após timeout — podem ler o mesmo recebível ainda não liquidado e inserir duas liquidações. Consumer group ou botão desabilitado no navegador não protegem contra clientes diferentes, operadores diferentes ou reentrega Kafka.

**Correção:** persistir chave de idempotência com fingerprint da operação; impor `UNIQUE` global de liquidação por recebível no banco; usar optimistic locking/controle de versão e tratar conflito por rollback, releitura e retorno do resultado existente ou `409`, conforme o contrato. No fluxo atual, processar comandos com entrega pelo menos uma vez e confirmar consumo somente após persistência do resultado/falha definitiva.

**Prevenção:** teste concorrente com chaves iguais e diferentes, repetição após resposta perdida e reentrega após commit; verificar uma liquidação e uma auditoria de sucesso por título.

### P1 — Entrada, existência, estado e autorização não são validados

**Referência:** leitura direta dos campos de `req.body`; `receivable` é usado sem verificar ausência; qualquer tipo diferente de `DUPLICATA` recebe spread de cheque; qualquer `currency` diferente de `USD` é aceita como BRL.

**Cenário e impacto:** body ausente ou malformado causa erro não controlado; UUID inexistente pode resultar em `TypeError` em vez de `404`; tipo/moeda desconhecidos ou recebível já liquidado podem ser processados silenciosamente. O trecho não demonstra validação JWT, papel autorizado ou derivação do ator autenticado.

**Correção:** validar formato e enums na fronteira; a service valida regras de negócio, existência e estado reprocessável, e deriva o ator do token validado, nunca do body. Mapear respostas segundo o contrato: `400` para formato, `401`/`403` para autenticação/autorização, `404` para recurso inexistente, `409` para conflito e `422` para regra inválida. Confirmar que middleware de autenticação e autorização protege a rota.

**Prevenção:** testes de contrato para campos ausentes, enum inválido, UUID inexistente, recebível liquidado, token inválido e papel insuficiente.

### P1 — Câmbio não é validado nem fica reproduzível

**Referência:** chamada a `getLatestRate("USD")` sem prazo, vigência, direção documentada, snapshot ou tratamento de erro.

**Cenário e impacto:** uma cotação antiga pode ser aplicada; a taxa pode mudar entre solicitações/retries; indisponibilidade do provedor acontece fora do `try` e não recebe tratamento definido. O registro persistido não permite provar qual cotação foi usada. A divisão só está correta se a cotação expressar BRL por USD, como exige a SPEC.

**Correção:** obter e validar a cotação vigente (no contrato atual, idade máxima de 24 horas) antes do aceite; fixar valor, referência e vigência no snapshot da solicitação e reutilizar esse snapshot em retries. Aplicar timeout e retries limitados para falhas transitórias. Se USD não puder ser aceito, registrar a falha do item; títulos BRL elegíveis podem seguir.

**Prevenção:** testes para cotação ausente, expirada, direção/taxa inválida, indisponibilidade e mudança de cotação após aceite.

### P1 — Registro financeiro e auditoria não preservam evidências

**Referência:** o `INSERT` salva apenas `receivable_id`, `amount` e `currency`.

**Cenário e impacto:** não há evidência persistida da cotação, valor de face, prazo, taxa base, spread, versão de cálculo, instante de liquidação, solicitação/tentativa ou responsável. Uma contestação, divergência de cálculo ou incidente não pode ser reconstruído; também não há garantia no trecho de que liquidação e auditoria sejam imutáveis.

**Correção:** persistir resultado financeiro imutável por título e evento de auditoria com vínculos à solicitação/tentativa, snapshot efetivamente usado, instante e ator autenticado. Gravar evento, resultado e transição terminal na mesma transação por título; restringir update/delete das tabelas históricas.

**Prevenção:** testes de schema/privilégios e reconciliação que confirmem uma liquidação e evento correspondente, com campos suficientes para reproduzir o cálculo.

### P2 — Handler mistura HTTP, negócio e persistência; contrato de resposta é ambíguo

**Referência:** o `app.post` consulta banco, escolhe spread, calcula preço, chama câmbio e persiste diretamente.

**Cenário e impacto:** regra financeira e tratamento de integração ficam acoplados à rota, dificultando aferir estratégias, reutilizar validações no cadastro/importação e testar cada fronteira. A seleção por `if/else` ainda aceita silenciosamente tipos desconhecidos. O `200` também não diferencia criação, aceite assíncrono ou falha.

**Correção:** manter o Resource como entrada HTTP; encaminhar para service, que valida, instancia os objetos e orquestra contratos de persistência e câmbio. Usar Strategy para spreads de tipos suportados, pois o domínio já possui regras variáveis por tipo; repository executa SQL parametrizado. Documentar OpenAPI e responder conforme operação: `202` para aceite assíncrono persistido no contrato atual, ou código de criação síncrona apropriado. Nenhuma exceção deve virar sucesso.

**Prevenção:** testes de service e contrato HTTP, validação de esquema OpenAPI na CI e revisão que confirme separação de responsabilidades.

## Prevenção sistêmica

- **Banco:** unicidade global de liquidação por recebível, idempotência com fingerprint, optimistic locking, FKs/`CHECK`s e tabelas imutáveis de liquidação/auditoria.
- **Transações e mensageria:** cadastro/aceite/outbox atômicos; confirmação Kafka apenas após persistência do resultado ou falha definitiva; retries limitados e DLQ para falha definitiva, sem apagar histórico.
- **Aferição financeira:** mesmos golden cases no engine e workflow, precisão `BigDecimal`, snapshots imutáveis e testes de borda de prazo/câmbio/arredondamento.
- **Concorrência e recuperação:** testes com operadores/chaves diferentes, reentrega depois do commit, indisponibilidade de banco/provedor e falha injetada em cada fronteira transacional.
- **Operação:** logs estruturados com código, operação, UUIDs e correlação, mensagem e stack trace preservados; métricas de resultado, duração, outbox e DLQ; sem JWT, credenciais ou conteúdo integral de arquivo.
- **Revisão e CI:** executar testes unitários e integrados com PostgreSQL/Kafka compatíveis, linter e validação de contratos; exigir revisão dos cenários de erro e concorrência antes do merge.

## Verificação e limites

Esta revisão é leitura estática do endpoint TypeScript fornecido no Anexo A. Não assume que o trecho esteja no repositório nem que não exista middleware global fora do trecho; a ausência de autorização foi registrada como algo que o PR deve demonstrar. Não executei testes nem reproduzi falhas. As correções e testes citados são propostas de prevenção, não evidência de que já foram implementados ou aprovados.
