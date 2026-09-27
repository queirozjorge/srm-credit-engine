# Homologação de carga pela UI

Executar contra o Compose real, com engine, workflow consumidor, PostgreSQL, Kafka,
Keycloak e frontend saudáveis. Definir `KEYCLOAK_OPERATOR_PASSWORD` no ambiente sem
imprimir seu valor. A suíte cadastra cedentes e lotes e solicita liquidações somente
por controles da interface; não usa `fetch`, API de escrita ou mocks.

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:load
```

Padrão: dez cedentes sintéticos, uma onda de aquecimento, uma rodada por concorrência
1, 2, 5 e 10, 1.000 títulos em cada lote. São 19.000 títulos incluindo aquecimento.
CSV e CNAB alternam entre lotes. Ambos os arquivos de cada massa ficam disponíveis
para inspeção; somente um formato de cada identidade é cadastrado.

```sh
PLAYWRIGHT_CHANNEL=chrome LOAD_ROUNDS=5 npm run test:e2e:load
PLAYWRIGHT_CHANNEL=chrome LOAD_CONCURRENCY=1 LOAD_ITEM_COUNT=1 LOAD_WARMUP=0 npm run test:e2e:load
PLAYWRIGHT_CHANNEL=chrome LOAD_GENERATE_ONLY=1 LOAD_SEED=homologacao-20260927 LOAD_DATE=2026-09-27 npm run test:e2e:load
```

`LOAD_GENERATE_ONLY=1` grava arquivos e manifests, sem login ou ação de negócio.
O Chrome instalado pode ser substituído pelo Chromium do Playwright, omitindo
`PLAYWRIGHT_CHANNEL` quando ele estiver disponível. Outros parâmetros:
`LOAD_BASE_URL` (padrão `https://localhost:8443`), `LOAD_OPERATOR_USERNAME`
(padrão `operador`), `LOAD_CONCURRENCY`, `LOAD_ROUNDS` (1–20), `LOAD_ITEM_COUNT`
(1–1.000), `LOAD_DATE` (hoje em São Paulo), `LOAD_SEED` (instante da execução).
Reutilizar seed/data reproduz a massa; cadastros já existentes serão rejeitados.
Nova execução no mesmo banco deve usar nova seed. Nenhum dado prévio é apagado.

## Evidências

Resultados ficam em `test-results/load/browser`, incluindo diretório `datasets`
com CSV, CNAB 240 e manifests JSON com SHA-256, cedentes e títulos. Os arquivos
usam documentos sintéticos válidos, dois tipos, valores variados e vencimentos
0/1/29/30/31/60/90 dias. CNAB agrupa por cedente em lotes internos, com P/Q e
contagens de trailers; o lote da aplicação continua limitado a 1.000 títulos.

`diagnostic.json` registra UUIDs de lote/solicitação, contagens, totais, latências
e percentis com tamanho da amostra; `network.json` contém somente método, caminho,
status e duração, sem headers, corpo ou credenciais. Cada onda registra falhas
antes de interromper as próximas; uma submissão financeira nunca é repetida
automaticamente pelo teste. Screenshots são capturadas apenas após liquidação.
Traces, HAR e vídeo de sessões autenticadas permanecem desativados.

A geração e os testes unitários também cobrem 1.001 itens como fronteira negativa.
A execução padrão usa BRL para dispensar alterações cambiais globais. O gerador
aceita `includeUsd` e informa índices para revisão CNAB, como base para cenários
adicionais de câmbio e reprocessamento; a suíte de carga não afirma cobri-los.

## Interpretação

Preparação e login são sequenciais; os cliques de confirmação de cada onda são
disparados juntos em sessões isoladas. O limite real do gateway permanece ativo.
Respostas 429 são registradas como falhas, nunca ocultadas por retries do teste.

`acceptedToTerminalMs` inclui espera em fila. `uiElapsedMs` inclui atualização
periódica da UI a cada cinco segundos. Nenhuma dessas métricas substitui duração
do processamento do worker. Telemetria de fila, banco e worker, reconciliação de
liquidações/auditoria e golden cases devem ser combinadas com este relatório.
Comparar metas somente no ambiente de referência e protocolo definidos em SPEC;
a carga pela UI não substitui medição HTTP sustentada de cinco solicitações/s.
Aquecer separadamente cada operação para estudos formais; uma onda nesta suíte
é aquecimento funcional, não um minuto de carga HTTP.

## Concorrência entre operadores

O realm local contém apenas uma conta `OPERADOR`. Para comprovar concorrência
entre identidades, disponibilizar outra conta real com esse papel e definir
`LOAD_OPERATOR2_USERNAME` e `LOAD_OPERATOR2_PASSWORD`, além da credencial
principal. A suíte não cria usuários administrativos nem promove gestor.

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e:race
```

O teste exige identidades (`iss`/`sub`) distintas, cadastra dois cedentes e vinte
títulos pela UI e prepara a confirmação do mesmo lote nas duas sessões. Ambos
os cliques são disparados juntos com chaves geradas pela própria UI. Exige um
aceite 202 e um conflito 409; depois verifica liquidação completa e uma única
solicitação, tentativa/resultado por título e auditoria de sucesso por recebível.
Reconciliação usa somente GET; nenhum token ou senha é gravado.

Sem segunda credencial, o teste é **ignorado**, não aprovado. Os testes integrados
existentes de engine cobrem concorrência com mesma chave/mesma identidade;
essa evidência sozinha não comprova duas identidades autenticadas distintas.
A UI cria chaves independentes; esta suíte não força mesma chave entre sessões.
