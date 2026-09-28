# Diagnóstico de carga do spe-j-workflow

## Estado da evidência

### Execução mais recente — `codex5` (27/09/2026)

A execução completa do Playwright terminou aprovada: duas ondas com concorrência
10, 20 lotes de 1.000 recebíveis (20.000 títulos), sem erros no diagnóstico,
falhas HTTP ou falhas de liquidação. Todos os 20 lotes chegaram ao estado
terminal `SETTLED`, com 1.000 títulos cada e zero falhas. O processo levou
3,6 minutos, incluindo preparação, interface e acompanhamento.

| Métrica | Amostras | P50 | P95 | P99 | Máximo |
|---|---:|---:|---:|---:|---:|
| Aceite até estado terminal (`acceptedToTerminal`) | 20 | 36,174 s | 51,227 s | 51,708 s | 51,708 s |
| Acompanhamento pela UI (`uiElapsed`) | 20 | 38,019 s | 53,997 s | 55,480 s | 55,480 s |
| Confirmação HTTP de aceite | 20 | 6,434 s | 8,363 s | 8,882 s | 8,882 s |

`acceptedToTerminal` inclui fila Kafka e processamento, portanto não equivale
ao tempo interno do worker definido na SPEC. `uiElapsed` também inclui o polling
da tela. A amostra confirma o fluxo nominal sob esta configuração; duas rodadas
em uma máquina local não caracterizam SLA nem demonstram capacidade sustentada.
O diagnóstico não contém amostras de latência para simulação; cadastro, login e
preparação também ficam fora da janela de confirmações concorrentes.

O teste usou `LOAD_SEED=load-matrix10-20260927-codex5`, `LOAD_ROUNDS=2`,
`LOAD_ITEM_COUNT=1000`, `LOAD_CONCURRENCY=10` e `LOAD_WARMUP=0`. O ambiente era
macOS arm64, Node 20.20.2 e Compose local com duas instâncias de workflow; o host
Docker reportou 8 CPUs e 7,75 GiB. É diferente da referência da SPEC (4 vCPU,
8 GiB disponíveis, aplicação aquecida e um lote por vez) e do perfil de carga
fixo de 5 solicitações/s por 5 minutos. Não houve aquecimento de carga de um
minuto: `LOAD_WARMUP=0`. A data é 27/09 em `America/Sao_Paulo`; os instantes
persistidos após 00:00 aparecem como 28/09 em UTC.

Os percentis usam nearest-rank, com índice `ceil(n × p)`. Assim, nesta amostra de
20 itens, P99 é igual ao máximo.

Os artefatos preservados por execução estão em
`ui-r-credit/test-results/load/browser/load-batches-cadastro-impo-39867-la-UI-em-ondas-concorrentes-load-desktop-chromium/diagnostic-matrix-codex5.json`,
`network-matrix-codex5.json`, `wave-10-1-codex5.json` e `wave-10-2-codex5.json`,
com resultado em `ui-r-credit/test-results/load/playwright-matrix-codex5.json`.
Ficam no diretório local ignorado pelo Git; precisam ser incluídos
separadamente ao arquivar evidência.

Reprodução (carregue `.env` silenciosamente, sem imprimir credenciais):

```sh
cd ui-r-credit
set +x
set -a
source ../.env >/dev/null 2>&1
set +a
LOAD_DATE=2026-09-27 LOAD_CONCURRENCY=10 LOAD_ROUNDS=2 LOAD_ITEM_COUNT=1000 LOAD_WARMUP=0 LOAD_SEED=load-matrix10-20260927-codex5 npm run test:e2e:load
```

### Limites e tentativas anteriores da `matrix10`

Os artefatos brutos das matrizes históricas `matrix7` a `matrix9` não estão
disponíveis para reconciliação. Os números dessas seções abaixo são registros
históricos reportados, sem base para conclusão independente de latência, ganho
estável ou escalabilidade. Há também uma contradição de unidade/escopo: a matriz
de uma instância reporta P95 de terminalização de 8,429 s a 73,995 s, mas outro
parágrafo chama 33,946 ms/69,978 ms de P50/P95 de `acceptedToTerminal`; a matriz
V4 reporta P95 global de 50,148 s. Sem timestamps brutos por lote, não é possível
reconciliar esses valores.

Na primeira tentativa desta matriz, `codex1`, a imagem Nginx servida era antiga.
O teste parou durante a navegação, antes do aceite, e não gerou amostra de carga.
Na tentativa `codex2`, a liquidação de aquecimento foi concluída pelo backend em
cerca de 9,2 s, mas a harness permaneceu na lista e procurou o estado terminal
na página de detalhe; por isso não registrou a amostra. `codex3` validou a
navegação corrigida com duas liquidações pequenas. `codex4` registrou
parcialmente 34 lotes medidos (34.000 títulos) nos níveis 1, 2, 5 e na primeira
onda de 10. Os 34 chegaram a `SETTLED`, mas a execução foi interrompida durante
screenshots. Seus diagnósticos foram substituídos pela execução posterior;
restam o resumo de 34 lotes e os percentis capturados durante a execução, não os
registros individuais para novo cálculo. Para concorrência 10, esse resumo
reportou P50/P95 de 47,784/61,314 s e UI P95 de 339,915 s; os dois outliers de
UI impedem tratar esse resultado como medida confiável de experiência.

`codex5` é uma execução completa independente de duas ondas de concorrência 10,
descrita acima, e não uma continuação transacional da suíte interrompida. Em
conjunto, as execuções observaram 54 lotes e 54.000 títulos terminalizados, mas
somente os 20 de `codex5` têm diagnóstico bruto completo disponível agora. Não
se calcula um percentil combinado para os 54 lotes.

### Reconciliação persistida de `codex4` e `codex5`

Consulta somente leitura ao PostgreSQL encontrou 35 lotes de `codex4` (34
medidos e um aquecimento) e confirmou os 20 UUIDs de `codex5`. Os 55 lotes
persistidos somam 55.000 títulos: todos `SETTLED`, sem títulos `FAILED`,
`PENDING` ou `READY`; há 55.000 liquidações, 55.000 mensagens da outbox normal
em `SENT` e nenhuma mensagem na DLQ. O consumer group terminou com lag zero nas
três partições; esse snapshot é global e não separa as execuções. Para a amostra
medida, excluindo o aquecimento, são 54.000 títulos sem falhas. Essa
reconciliação confirma o estado persistido observado, mas não recupera os
timestamps individuais perdidos de `codex4`.

Para reconciliar futuras execuções, preserve por execução `diagnostic.json` com
timestamps de aceite e terminalização por lote, tempos de UI, definições e
unidades das métricas, seed e configuração; consultas/exportações do banco para
contagens e janela `accepted_at`; e snapshots de lag por partição, pool/locks e
CPU/I/O do PostgreSQL. Declare o método de percentil e ambiente. Para conclusão
operacional, seguir o perfil e as repetições definidos na SPEC.

## Primeira tentativa `codex1` — falha antes da medição

Em 27/09/2026, o pré-flight encontrou Nginx, Keycloak, PostgreSQL, Kafka,
`spe-j-engine` e as duas instâncias de `spe-j-workflow` em estado saudável. O
PostgreSQL respondeu a `pg_isready`. Docker informou 8 CPUs e 8.321.994.752 bytes
de memória (7,75 GiB); o ambiente não corresponde exatamente à referência de
4 vCPU/8 GiB da `SPEC.md`. O Chromium empacotado pelo Playwright está disponível.

As credenciais necessárias foram carregadas silenciosamente do ambiente local;
nenhum valor foi exibido. A suíte iniciou e falhou em aproximadamente um minuto,
antes da primeira confirmação: depois de um `POST /api/batches` com resposta
`201` e um `GET /api/batches/{uuid}` com resposta `200`, a página de detalhe não
exibiu a tabela acessível “Recebíveis” dentro do timeout de 30 segundos
(`e2e/load/ui.ts:87`). O diagnóstico registra cinco requisições da sessão, sem
status HTTP de erro. A execução não chegou à simulação nem ao aceite da
liquidação; por isso registrou zero lotes/títulos medidos e percentis nulos.
O cadastro de preparação pode ter deixado um lote sintético no banco; a suíte não
remove dados criados.

Comando executado (as credenciais foram carregadas silenciosamente e seus valores
não foram exibidos):

```sh
cd ui-r-credit
set +x
set -a
source ../.env >/dev/null 2>&1
set +a
LOAD_SEED=load-matrix10-20260927-codex1 LOAD_DATE=2026-09-27 LOAD_CONCURRENCY=1,2,5,10 LOAD_ROUNDS=3 LOAD_ITEM_COUNT=1000 LOAD_WARMUP=1 npm run test:e2e:load
```

`LOAD_WARMUP=1` habilitou uma onda de aquecimento. A configuração previa 54 lotes
medidos (54.000 títulos) e um lote de aquecimento (1.000 títulos), mas nenhum foi
medido porque a suíte parou durante a navegação do primeiro lote.

### Registro histórico `matrix7` — números não reconciliados

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

O registro histórico atribuía a diferença entre concorrências à fila e levantava
como hipótese contenção em transações por título e atualização de agregados no
PostgreSQL. Como os artefatos individuais e a telemetria daquela execução não
estão disponíveis, essa causa não foi demonstrada. A execução recente `codex5`
observou a terminalização do fluxo e lag global zero ao final, sem telemetria
por partição durante as ondas para localizar gargalo.

Para uma referência de produção, repetir com réplicas do workflow, métricas de
CPU/IO/conexões do PostgreSQL e mais de uma rodada por nível. A carga executada
valida a integridade e o comportamento nominal; não cobre falha terminal
induzida nem reprocessamento seletivo de um título falho.

O Compose atual inicia duas instâncias (`spe-j-workflow` e
`spe-j-workflow-2`) no mesmo grupo Kafka. `codex5` exercitou essa configuração,
mas em somente duas ondas de dez lotes; a execução não mede ganho de escala nem
comportamento de rebalanceamento de forma controlada.

### Registro histórico `matrix8` — números não reconciliados

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

O registro histórico apontava para um `diagnostic.json`, mas o arquivo bruto não
está disponível nesta revisão. Para afirmar ganho estável, repetir cada nível
por pelo menos três rodadas e acompanhar CPU, I/O, pool de conexões, locks e lag
por partição.

### Registro histórico `matrix9` — números não reconciliados

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
