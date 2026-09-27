# Integridade incremental dos agregados — schema V4

A migration `V4__incremental_projection_integrity.sql`, mantida e aplicada pelo engine, substitui as recontagens de todos os títulos do lote e de todos os itens da solicitação a cada commit. A transação continua individual por título.

## Garantia preservada

Antes da alteração, a migration bloqueia escritas nas tabelas envolvidas e confere todos os lotes/solicitações pelas funções anteriores. Divergência ou fila de validações pendente aborta a migration inteira. Não há correção silenciosa de dados.

A fila privada `pending_integrity_check` passa a acumular a diferença entre alterações reais nos filhos e alterações declaradas nos contadores. Cadastro contabiliza quantidade e estados; transições contabilizam entrada/saída de cada estado. No commit, todos os deltas de cada lote/solicitação precisam ser zero. Mudanças repetidas na mesma transação são combinadas; entidades e transações diferentes não compensam diferenças entre si. Rollback desfaz também os deltas.

Somente `check_batch_integrity` e `check_request_integrity` são substituídas. São acrescentadas `queue_projection_delta`, `capture_projection_delta` e `check_projection_delta`, gatilhos de captura e índice parcial para localizar o evento `BATCH_CREATED`. `check_attempt_integrity`, validações de vínculos, versão, unicidades, estados, auditoria, snapshot e permissões continuam existentes. A fila e suas funções de escrita não são acessíveis aos usuários de aplicação.

## Verificação

PostgreSQL 17.11, Testcontainers, Docker Desktop: 12 testes de integridade e 1 teste de comparação de custo aprovados. Os casos incluem projeção sem transição correspondente, tentativa de forjar deltas, atualizações repetidas, rollback, `SET CONSTRAINTS ALL IMMEDIATE`, liquidação/auditoria atômicas e permissões de execução.

Comparação focada em um lote de 1.000 títulos e 100 commits de atualização de versão do agregado, após aquecimento:

| Medida | V3 | V4 |
|---|---:|---:|
| Leituras de linhas dos títulos/estados/itens | 200.000 | 0 |
| Tempo observado dos 100 commits | 107,31 ms | 67,94 ms |

Nesta execução, a versão incremental reduziu em 36,7% o tempo observado do
benchmark isolado. O tempo é uma amostra local; a garantia usada na validação é
a eliminação das leituras de linhas, não um limite fixo de milissegundos.

A asserção de desempenho usa a redução de trabalho no banco, não um limite instável de tempo. Este teste isola os gatilhos; não substitui o benchmark de liquidação via UI nem demonstra o SLA de 1.000 liquidações.

## Aplicação, compatibilidade e reversão

Engine aplica V4 com sua credencial de migration. Atualizar a versão esperada do worker para `4` antes de ativar o consumo nesse schema. A aplicação deve aguardar o fim da migration; seu bloqueio pode esperar transações antigas e suspender brevemente novas escritas. Payloads e tabelas públicas de negócio permanecem compatíveis.

Não editar migrations V1–V3 nem executar downgrade manual enquanto houver processamento. Se necessário reverter o algoritmo, entregar uma nova migration: bloquear escritas, conferir integralmente os contadores, restaurar as recontagens de V2, remover gatilhos incrementais e atualizar o contrato de versão. A reversão mantém resultados e auditoria; restaurar um backup para perder liquidações não é parte desse procedimento. Falha durante a aplicação de V4 faz rollback transacional e preserva V3.
