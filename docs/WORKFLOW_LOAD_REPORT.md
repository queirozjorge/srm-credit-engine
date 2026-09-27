# Diagnóstico de carga do spe-j-workflow

Execução real em 27/09/2026, contra Compose, Nginx, Keycloak, PostgreSQL,
Kafka, `spe-j-engine` e uma instância de `spe-j-workflow`. A suíte usou a UI autenticada, sem
interceptar ações de negócio, com seed `load-matrix7-20260927` e data-base
`2026-09-27`.

## Escopo executado

- 18 lotes de 1.000 recebíveis, total de 18.000 títulos.
- Ondas de confirmação concorrente com 1, 2, 5 e 10 lotes.
- Arquivos CSV e CNAB alternados; dez cedentes foram cadastrados pela UI e
  distribuídos entre os títulos.
- Cada lote percorreu cadastro, prévia, confirmação, simulação, aceite `202` e
  acompanhamento até o estado terminal.
- Resultado da suíte Playwright: **1 teste aprovado em 4 minutos**; 18/18
  lotes aprovados; 18.000/18.000 títulos liquidados; 0 falhas.

## Tempos observados

Os tempos abaixo são descritivos do ambiente local. `acceptedToTerminal` inclui
fila Kafka e processamento; `uiElapsed` inclui o acompanhamento visual por
polling. A amostra tem uma onda por nível e não estabelece SLA.

| Concorrência | Lotes | Terminalização P50 | Terminalização P95 | UI P95 |
|---:|---:|---:|---:|---:|
| 1 | 1 | 8,429 s | 8,429 s | 11,854 s |
| 2 | 2 | 9,963 s | 17,734 s | 22,240 s |
| 5 | 5 | 25,142 s | 36,672 s | 38,107 s |
| 10 | 10 | 50,165 s | 73,995 s | 79,830 s |

Na amostra completa, o P50 de aceite até terminalização foi 33,946 ms e o P95
foi 69,978 ms. Simulação teve P95 de 153,456 ms. A confirmação HTTP teve P95
de 4,443 ms; esse valor inclui a criação da solicitação e da outbox por título.
Não houve resposta HTTP com status de erro.

O cálculo por título, medido entre os eventos persistidos de tentativa aceita e
título liquidado, teve P50 de 26,731 ms, P95 de 65,896 ms e máximo de 73,620 ms.
Esse intervalo também inclui a espera de cada consumidor por recursos do banco;
não deve ser interpretado como tempo puro de CPU.

## Reconciliação

Para a janela da matriz (`accepted_at >= 2026-09-27 15:55:00+00`):

- `settlement_request`: 18 `SETTLED`.
- `settlement_request_item`: 18.000 `SETTLED`, `retry_count > 0` em 0 itens,
  `has_error = true` em 0 itens.
- `settlement`: 18.000 registros, um por recebível.
- Eventos: 18.000 `RECEIVABLE_ATTEMPT_ACCEPTED` e 18.000
  `RECEIVABLE_SETTLED`.
- Outbox `credit-receivable`: todas as mensagens observadas em `SENT`.
- Consumer group `srm-credit-settlement`: três partições, lag `0` em todas.
- Logs do workflow não registraram `FALHA`, `DLQ` ou
  `CONSUMO_NAO_CONFIRMADO`. Foram observadas três mensagens informativas de
  re-seek do Kafka durante a janela; a reconciliação final confirma que não
  produziram falha ou retry persistido.

O banco local também contém jornadas de smoke e tentativas interrompidas antes
da correção da orquestração da UI. Por isso, o total global posterior à
execução é 31 lotes, 24.007 títulos e 24.007 liquidações; esses totais não são
usados para os percentis da matriz.

## Diagnóstico

O fluxo nominal está íntegro: a UI cadastra e aceita, o engine publica a
outbox, o workflow consome com três consumidores, cada título é confirmado em
transação independente e os agregados terminam consistentes. A degradação
observada é de fila/concorrência: ao passar de um para dez lotes simultâneos, o
P95 de terminalização cresce de 8,4 s para 74,0 s, enquanto o Kafka termina com
lag zero. O gargalo está depois do aceite, na capacidade combinada de transações
por título e atualizações agregadas no PostgreSQL, e não em mensagens presas no
tópico.

Para uma referência de produção, repetir com réplicas do workflow, métricas de
CPU/IO/conexões do PostgreSQL e mais de uma rodada por nível. A carga executada
valida a integridade e o comportamento nominal; não cobre falha terminal
induzida nem reprocessamento seletivo de um título falho.

O Compose agora inicia duas instâncias (`spe-j-workflow` e
`spe-j-workflow-2`) no mesmo grupo Kafka. A carga descrita acima foi executada
antes dessa configuração e continua sendo a referência de instância única;
deve ser repetida para medir o ganho e o comportamento de rebalanceamento.

## Reexecução com duas instâncias

Em 27/09/2026, a mesma matriz foi repetida com as duas instâncias saudáveis,
seed `load-matrix8-20260927` e 18.000 novos títulos. O teste terminou com
18/18 lotes e 18.000/18.000 títulos liquidados, sem falhas HTTP, erro de
workflow ou lag Kafka.

| Concorrência | P95 uma instância | P95 duas instâncias | Variação | UI P95 uma | UI P95 duas | Variação |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8,429 s | 18,309 s | +117,2% | 11,854 s | 22,494 s | +89,8% |
| 2 | 17,734 s | 27,639 s | +55,9% | 22,240 s | 32,797 s | +47,5% |
| 5 | 36,672 s | 46,765 s | +27,5% | 38,107 s | 48,248 s | +26,6% |
| 10 | 73,995 s | 55,917 s | **−24,4%** | 79,830 s | 59,948 s | **−24,9%** |

O ganho aparece na onda de maior concorrência: a terminalização P95 caiu
18,078 s e o acompanhamento da UI caiu 19,882 s. Nas ondas menores, esta
execução ficou mais lenta; uma rodada por nível não separa o efeito de cache,
rebalanceamento e variação de carga do PostgreSQL. A suíte completa durou 4,3
minutos, contra 4,0 minutos na execução anterior, pois inclui preparação,
cadastro e polling da UI.

O diagnóstico completo desta execução está em
`ui-r-credit/test-results/load/browser/**/diagnostic.json`. Para afirmar ganho
estável, repetir cada nível por pelo menos três rodadas e acompanhar CPU, I/O,
pool de conexões, locks e lag por partição.

## Reexecução após a integridade incremental (V4)

Depois da migration V4 e da configuração de métricas, a matriz foi repetida em
27/09/2026 com as mesmas ondas e 18.000 novos títulos, seed
`load-matrix9-20260927`. O teste Playwright terminou em 3,6 minutos. Foram
18/18 lotes e 18.000/18.000 títulos liquidados, sem falhas.

| Concorrência | Terminalização P95 | UI P95 | Variação vs. duas instâncias anterior | UI vs. anterior |
|---:|---:|---:|---:|---:|
| 1 | 11,979 s | 13,359 s | −34,6% | −40,6% |
| 2 | 12,738 s | 17,579 s | −53,9% | −46,4% |
| 5 | 27,737 s | 28,667 s | −40,7% | −40,6% |
| 10 | 50,148 s | 52,200 s | −10,3% | −12,9% |

Na matriz V4, o P50 de aceite até terminalização foi 23,846 s e o P95 foi
50,148 s. O P50 de acompanhamento da UI foi 27,753 s e o P95 foi 52,200 s.
As amostras continuam sendo uma onda por nível; a comparação é indicativa e
deve ser repetida por pelo menos três rodadas para separar variação de cache,
rebalanceamento e carga do PostgreSQL.

A reconciliação da janela confirmou 18 solicitações `SETTLED`, 18.000 itens
`SETTLED` sem erro e 18.000 liquidações. O grupo Kafka terminou com lag zero nas
três partições. A fila privada de validação incremental terminou vazia. As
duas instâncias expuseram a métrica `workflow.settlement.duration`; a coleta
acumulada após a subida registrava 12.059 e 5.947 chamadas, respectivamente,
com máximo de 0,577 s e 0,546 s.

O benchmark de gatilhos V3/V4, isolado em 100 commits de um lote de 1.000
títulos, passou de 200.000 para zero linhas lidas na validação de projeção e
mediu 107,31 ms contra 67,94 ms. Isso confirma a redução do trabalho de banco,
mas não substitui o tempo fim a fim da carga, que ainda inclui fila Kafka,
concorrência e atualizações transacionais por título.

## Corrida do mesmo lote entre operadores

Também foi executado um cenário real pela UI com duas contas `OPERADOR`, dois
cedentes e 20 recebíveis no mesmo lote. As sessões tinham `iss` iguais e `sub`
distintos; cada sessão gerou sua própria `Idempotency-Key` e confirmou ao mesmo
tempo.

O resultado foi exatamente um `202 Accepted` e um `409 LOTE_EM_PROCESSAMENTO`.
A reconciliação posterior confirmou uma solicitação, 20 tentativas, 20
liquidações e 20 eventos `RECEIVABLE_SETTLED`, sem duplicidade. A constraint
global de liquidação também rejeitou uma segunda inserção financeira para o
mesmo recebível. A conta secundária usada no teste foi temporária e removida
após a execução.

O teste automatizado também cobre o caso de dois operadores com a mesma chave:
ambos recebem a mesma solicitação persistida e os replays posteriores retornam
o mesmo resultado sem criar novos efeitos.

## Artefatos e reprodução

- Suíte: [`ui-r-credit/e2e/load-batches.spec.ts`](../ui-r-credit/e2e/load-batches.spec.ts)
- Gerador CSV/CNAB: [`ui-r-credit/tests/load/dataset.ts`](../ui-r-credit/tests/load/dataset.ts)
- Diagnóstico JSON: `ui-r-credit/test-results/load/browser/**/diagnostic.json`
- Execução original: `cd ui-r-credit && set -a && source ../.env && set +a && PLAYWRIGHT_CHANNEL=chrome LOAD_DATE=2026-09-27 LOAD_CONCURRENCY=1,2,5,10 LOAD_ROUNDS=1 LOAD_ITEM_COUNT=1000 LOAD_WARMUP=0 LOAD_SEED=load-matrix7-20260927 npm run test:e2e:load`
- Execução V4: `cd ui-r-credit && set -a && source ../.env && set +a && PLAYWRIGHT_CHANNEL=chrome LOAD_DATE=2026-09-27 LOAD_CONCURRENCY=1,2,5,10 LOAD_ROUNDS=1 LOAD_ITEM_COUNT=1000 LOAD_WARMUP=0 LOAD_SEED=load-matrix9-20260927 npm run test:e2e:load`
