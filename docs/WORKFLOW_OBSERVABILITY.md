# Observabilidade da liquidação

Engine e ambas as instâncias do workflow expõem `health` e `metrics` somente nas portas internas de gerenciamento: 8081 e 18082, respectivamente. O Compose não publica essas portas no host e não cria uma rota pelo gateway. `env` permanece desabilitado. A instrumentação reutiliza os binders Hikari e Kafka do Spring Boot; não há outro coletor dentro das transações financeiras.

## Parâmetros operacionais

| Variável | Padrão | Aplicação |
|---|---:|---|
| `ENGINE_DB_POOL_MAX_SIZE` / `WORKFLOW_DB_POOL_MAX_SIZE` | 10 | Máximo de conexões por instância |
| `ENGINE_DB_POOL_MIN_IDLE` / `WORKFLOW_DB_POOL_MIN_IDLE` | 10 | Conexões ociosas mantidas por instância; não exceder o máximo |
| `ENGINE_DB_CONNECTION_TIMEOUT_MS` / `WORKFLOW_DB_CONNECTION_TIMEOUT_MS` | 30000 | Espera máxima por conexão, em milissegundos |
| `WORKFLOW_CONSUMER_CONCURRENCY` | 3 | Consumers por instância do workflow |
| `OUTBOX_CONCURRENCY` | 4 | Publicações simultâneas por engine |
| `OUTBOX_BATCH_SIZE` | 1000 | Máximo de claims por ciclo do relay |
| `OUTBOX_DELAY_MS` | 100 | Intervalo entre ciclos do relay |

As variáveis do workflow se aplicam às duas instâncias pelo anchor do Compose. Os defaults preservam a configuração usada antes da instrumentação. Três partições permitem no máximo três consumers ativos no grupo, independentemente da soma de threads e réplicas. Esta alteração não aumenta partições. Mudanças nas variáveis exigem recriar os containers afetados; apenas modificar `.env` não reconfigura processos em execução.

## Consultas internas

Exemplo sem instalar utilitários adicionais na imagem:

```sh
docker compose exec -T spe-j-workflow bash -ec 'exec 3<>/dev/tcp/127.0.0.1/18082; printf "GET /actuator/metrics HTTP/1.0\r\nHost: localhost\r\n\r\n" >&3; cat <&3'
```

Trocar o serviço por `spe-j-workflow-2` para coletar a segunda instância. Para o engine, usar `spe-j-engine` e porta 8081. Consultar `/actuator/metrics/<nome>` para valores e tags disponíveis; a lista evita pressupor métricas que só aparecem após criar um cliente Kafka ou iniciar o pool. Identificar serviço/container e instante UTC em cada amostra.

| Sinal | Métricas e interpretação |
|---|---|
| Pool | `hikaricp.connections.active`, `.idle`, `.pending`, `.max`, `.acquire`, `.usage` e `.timeout`: conexões ocupadas, espera e duração de uso. Pool ocioso descarta saturação de conexões, mas não descarta locks ou consultas lentas. |
| Kafka consumer | Prefixo `kafka.consumer.`: registros consumidos, lag, atribuição de partições, commits, rebalances e tempos de fetch. Usar tags `client.id`, tópico e partição quando disponíveis. |
| Kafka producer | Prefixo `kafka.producer.`: taxa de envio, latência, retries e erros, relacionando com publicações da outbox. |
| Workflow | `workflow.settlement.outcomes`, tag `outcome`: `settled`, `duplicate`, `concurrency`, `retry`, `failed` e `unacknowledged`; usar deltas por intervalo. `workflow.settlement.duration` mede a chamada do serviço, incluindo disputas/repetições locais. |
| Outbox | `engine.outbox.oldest.age`, `.published`, `.failures` e `.publish.duration`: fila anterior ao Kafka, sucesso e latência de publicação. |
| Processo | `process.cpu.usage`, `system.cpu.usage`, `jvm.memory.used`, pausas de GC e threads: correlacionar uso de CPU/memória com throughput. |

P50/P95/P99 são publicados para duração da liquidação, publicação da outbox e aquisição de conexão. São estimativas locais por janela/instância; não somar nem tirar média dos percentis das duas instâncias. O timer do serviço inclui duplicações/retries e não substitui o tempo entre aceite e término de um lote.

## Diagnóstico antes de aumentar paralelismo

Coletar a cada 1–5 segundos durante pelo menos três rodadas por nível de carga, registrando também CPU/memória dos containers, `pg_stat_activity`/`pg_locks`, tempos de consultas e lag do grupo por partição. Coleta deve ser somente leitura e não registrar senhas ou payloads importados.

- Idade da outbox crescente com lag Kafka baixo: investigar relay/produtor/broker e tempo de banco do engine.
- Pool próximo do máximo com espera crescente: verificar duração de uso e locks antes de ampliar conexões.
- Crescimento de `outcome=concurrency` com locks em agregados: contenção por lote/solicitação; mais consumers podem piorar o resultado.
- Lag crescente, CPU saturada e pouca espera por conexão/locks: investigar custo de cálculo e capacidade do processo.
- Throughput baixo com lag baixo: verificar sincronismo da geração/publicação, distribuição de chaves e consumidores sem partições atribuídas.

Manter número de partições, dataset, seed, aquecimento e configuração constantes durante a comparação. A instrumentação fornece evidências; não demonstra por si só a causa do gargalo.
