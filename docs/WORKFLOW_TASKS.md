# Implementação e homologação do spe-j-workflow

Este documento acompanha a implementação do worker definido em `SPEC.md`. O nome
canônico do projeto é `spe-j-workflow`; `spe-j-worker` é o nome histórico usado
na solicitação.

## Dependências e responsáveis

| ID | Entrega | Dependência | Responsável | Estado |
|---|---|---|---|---|
| W0 | Contratos do comando Kafka, auditoria, ator técnico e falhas | — | Coordenação | Concluída |
| W1 | Precificação decimal pelo snapshot | W0 | Worker | Concluída |
| W2 | Persistência atômica por título e optimistic locking | W0 | Worker | Concluída |
| W3 | Consumer, retries persistidos, reentrega e DLQ | W0, W1, W2 | Worker | Concluída |
| E1 | Relay da outbox e consulta consistente do lote | W0 | Engine | Concluída |
| U1 | Estado de retry na UI e datasets CSV/CNAB | W0 | Frontend/QA | Concluída |
| U2 | Jornada Playwright real e barreira de carga | E1, W3, U1 | Frontend/QA | Concluída |
| Q1 | Testes integrados PostgreSQL/Kafka e observabilidade | W1–W3, E1 | Coordenação | Concluída |
| Q2 | Carga de 1, 2, 5 e 10 lotes de 1.000 títulos | Q1, U2 | Todos | Concluída — 18 lotes/18.000 títulos |
| Q3 | Diagnóstico e reconciliação final | Q2 | Coordenação | Concluída |

Nenhum cenário de carga começa enquanto os testes de integridade, reentrega,
rollback isolado e reprocessamento seletivo não estiverem aprovados.

## Contrato operacional congelado

- Projeto: `spe-j-workflow`; schema esperado: versão `4`.
- Tópico: `credit-receivable`; DLQ: `credit-receivable.dlq`.
- Payload e chave: `batchUuid`, `receivableUuid`, `requestUuid`, `idempotencyKey`; chave Kafka igual a `receivableUuid`.
- Ator técnico: `urn:srm-credit:service` / `spe-j-workflow`.
- Cálculo: versão `1`, convenção `ACTUAL_30`, `BigDecimal` com 50 algarismos e `HALF_EVEN` apenas no fechamento monetário.
- Retry financeiro: três repetições adicionais, em 1, 5 e 15 segundos; reserva e auditoria persistidas.
- ACK somente depois de persistir resultado ou falha definitiva. Reentrega após commit é idempotente.

## Carga planejada

Os arquivos serão determinísticos e terão manifesto com seed, hash, cedentes,
quantidade, somas e referências. A UI fará cadastro de cedentes, upload, prévia,
revisão, confirmação, simulação e aceite. Leituras de API ou banco servirão
somente para reconciliação.

Executar uma onda por nível de concorrência: 1, 2, 5 e 10 lotes simultâneos,
cada um com 1.000 recebíveis, totalizando 18 lotes e 18.000 títulos. Alternar
CSV e CNAB, com dez cedentes distribuídos e três partições Kafka. Cenários de
falha e reprocessamento ficam separados da carga nominal.

Medir separadamente cadastro, aceite, espera da outbox, processamento entre
timestamps persistidos e atualização visual por polling. A carga nominal não
configura SLA: a amostra é uma onda por nível e o ambiente local possui três
consumidores em uma única réplica. Os resultados observados estão em
[WORKFLOW_LOAD_REPORT.md](WORKFLOW_LOAD_REPORT.md).
