# DECISIONS — SRM Credit Engine

**Decisões aprovadas em 25/09/2026 · Estado atualizado em 27/09/2026 · Escopo Sênior.**

Este documento registra escolhas, alternativas, custos e limites de evidência. Os contratos funcionais e operacionais permanecem em [SPEC.md](SPEC.md); as convenções estão em [AGENTS.md](AGENTS.md). A implementação atual inclui API, workflow, frontend, migrations e infraestrutura local. O Compose é ambiente de desenvolvimento, não configuração de produção.

## 1. Separar o processamento de liquidações da API

### Contexto e decisão

Manter `spe-j-engine` e `spe-j-workflow` como aplicações Maven independentes. A premissa é que o processamento dos lotes concentre a maior carga de cálculo e gravação: o worker calcula os valores definitivos a partir do snapshot aceito e executa uma liquidação atômica por recebível, preservando sucessos quando outro título falha.

O engine atende às requisições HTTP, autentica e autoriza usuários, mantém os cadastros, realiza simulações, valida o aceite, fixa as condições financeiras e publica os comandos pela outbox. O worker consome esses comandos, realiza os cálculos da liquidação e persiste resultado, auditoria, conclusão individual e atualização dos agregados em uma transação por título.

A separação permite aumentar a capacidade dos workers conforme a demanda de liquidação, sem replicar a API na mesma proporção, e isola os recursos de execução do processamento em relação ao atendimento HTTP. O engine continua calculando as simulações; o worker concentra o cálculo definitivo e a execução das liquidações.

### Papel do Kafka e garantias de integridade

Kafka desacopla o aceite HTTP do processamento, mantém os comandos disponíveis conforme sua configuração de durabilidade e retenção e distribui títulos entre os workers de um mesmo consumer group. O UUID do título é a chave de particionamento, preservando o processamento ordenado por partição conforme o contrato da SPEC. A fila permite absorver picos enquanto os workers processam a demanda.

A integridade e a unicidade do efeito financeiro dependem do conjunto de mecanismos:

- **Outbox transacional:** associa a publicação à solicitação aceita e permite recuperar falhas de envio.
- **Kafka:** transporta os comandos e permite reentregas; a aplicação assume entrega pelo menos uma vez.
- **Idempotência persistida:** reconhece uma solicitação já aceita e impede sua reexecução financeira.
- **PostgreSQL:** transação por título, optimistic locking e unicidade por recebível impedem liquidação duplicada; o lote admite resultados parciais e preserva cada sucesso.

Kafka e o consumer group, isoladamente, não garantem liquidação única. Uma falha após o commit e antes da confirmação do consumo pode repetir a mensagem; o worker deve reconhecer o resultado existente. A recuperação detalhada está no anexo D da SPEC.

### Alternativa considerada

Uma única aplicação modular poderia atender à API e às liquidações com menor custo operacional. Essa alternativa seria suficiente para demonstrar os requisitos mínimos do desafio. A separação foi mantida para permitir escalabilidade independente do processamento e tornar explícitos o isolamento da execução, a fila e a recuperação de falhas assíncronas.

### Custos e limites aceitos

- Dois builds e processos de implantação, além da operação do Kafka, outbox, retries e DLQ.
- Maior esforço de configuração, observabilidade, testes de integração e diagnóstico do fluxo assíncrono.
- PostgreSQL compartilhado: permanece o acoplamento ao schema e à capacidade do banco; separar processos não elimina disputa por conexões, CPU ou I/O no banco.
- Escala do consumo limitada pelo número de partições, pelos recursos do banco e pelo tamanho dos lotes. O paralelismo passa a incluir títulos do mesmo lote; a atomicidade permanece obrigatória por título, com contenção possível na atualização dos agregados.
- Motores próprios no engine e no worker exigem golden cases, casos de borda e compatibilidade de versões para prevenir divergências. Não haverá biblioteca de aplicação compartilhada.

O desafio penaliza complexidade sem justificativa. Esta escolha assume conscientemente custo adicional. O [relatório de carga](docs/WORKFLOW_LOAD_REPORT.md) registra 20 lotes/20.000 títulos liquidados em duas ondas de concorrência 10, com P95 aceite-terminal de 51,227 s e UI de 53,997 s. O teste local não corresponde ao perfil de 5 solicitações/s por 5 minutos nem ao ambiente de referência da SPEC; as matrizes históricas 7–9 não têm artefatos brutos. Não inferir SLA, ganho estável ou escalabilidade.

## 2. Escopo mantido e simplificações

- **CNAB mantido:** somente o subconjunto definido na SPEC. Seu custo adicional envolve parser, validação de posições, sequências e contagens, arquivos de teste e revisão da importação. Outros bancos, variantes e comandos permanecem fora do escopo.
- **Aprovação cambial mantida:** decisão por gestor diferente do solicitante, com histórico auditável. Acrescenta fluxo de interface, autorização, estados e testes de concorrência; não publica liquidações automaticamente.
- **Provedor cambial mockado:** demonstra timeout, retry e indisponibilidade sem depender de serviço externo real.
- **Liquidação como registro da aquisição:** transferências bancárias reais e controle de saldo de caixa ficam fora desta entrega.
- **Moedas, tipos e idioma:** BRL/USD, duplicata mercantil/cheque pré-datado e interface em português brasileiro, conforme a SPEC.

Essas escolhas preservam o escopo funcional aprovado. Novos cortes ou alterações devem registrar motivo e impacto antes da implementação.

## 3. Convenções de construção e injeção

Removida a obrigação de disponibilizar `builder(...)` em toda classe instanciada manualmente. Construtores, fábricas estáticas e builders podem ser usados conforme a complexidade real da criação e as invariantes necessárias.

Removida a proibição de injeção por construtor. Injeção por construtor e por campos são permitidas; a injeção em campos mantém as anotações explícitas definidas no AGENTS.md. Essas flexibilizações evitam impor mecanismos sem benefício concreto.

## 4. Evidências e limites conhecidos

- Os dois motores têm testes automatizados dos golden cases, cálculo decimal fracionário e limites. O workflow tem testes PostgreSQL para resultado por título, reentrega, rollback isolado, retries, DLQ e concorrência de mensagens duplicadas.
- Engine e frontend têm testes unitários; o engine tem testes HTTP/PostgreSQL, e o frontend tem suites Playwright. O relatório registra uma execução de carga autenticada aprovada para 20 lotes/20.000 títulos em concorrência 10, além de uma execução interrompida com resultados reconciliados no banco e os limites dessa evidência; procedimentos e sinais estão em [docs/WORKFLOW_OBSERVABILITY.md](docs/WORKFLOW_OBSERVABILITY.md).
- Os workflows de CI estão em `.github/workflows/backend.yml` e `.github/workflows/frontend.yml`. Configuração local e limites de implantação estão no README.
- A integração real ainda não demonstra por cenário ponta a ponta uma falha de processamento de um título seguida de reprocessamento seletivo, nem a corrida cambial concorrente contra PostgreSQL. Esses casos não devem ser apresentados como homologados.
- As rodadas de carga têm amostra limitada e o relatório atual deve ser lido conforme sua definição de tempo, ambiente e limitações. Não inferir SLA de produção.

Os diagramas de contexto, containers e modelo ER estão em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). A infraestrutura local não demonstra alta disponibilidade ou segurança de produção.

## 5. Estado funcional atual

O Compose inicia Nginx, Keycloak, PostgreSQL, Kafka, engine, duas instâncias do workflow e frontend. O engine expõe APIs OpenAPI, valida JWT/papéis, mantém migrations e outbox, e implementa cadastro, simulação, câmbio, consultas e aceite. O workflow consome `credit-receivable` e liquida cada título em transação própria. O frontend autentica via OIDC/PKCE e usa as APIs reais; os mocks ficam no harness de testes. Os resultados e limitações da carga local estão no relatório vinculado acima.

## 6. Infraestrutura do ambiente local

- **Nginx como única entrada publicada:** as portas `8088` e `8443` ficam vinculadas a `127.0.0.1`; os serviços internos não publicam portas no host. TLS termina no Nginx, que encaminha HTTP dentro da rede privada do Compose. Isso simplifica o acesso local e centraliza limites, cache e logs, mas cria um único ponto de entrada e não define a arquitetura TLS de produção.
- **Certificado autoassinado:** um serviço inicializador cria o certificado local em volume persistente. Evita dependência de autoridade certificadora durante o desenvolvimento; navegadores não confiam nele automaticamente.
- **PostgreSQL em uma instância, bancos separados:** `srm_credit` atende às aplicações e `keycloak` armazena a identidade; roles distintos separam engine, workflow, migrações e Keycloak. A separação reduz o acoplamento lógico, mas banco e instância continuam compartilhando recursos e domínio de falha.
- **Kafka single-node em KRaft:** um broker local usa três partições e fator de replicação 1. Evita operar um cluster no ambiente de desenvolvimento, ao custo de não oferecer quorum ou alta disponibilidade.
- **Keycloak importado como configuração inicial:** o realm `srm-credit` define usuários de demonstração, papéis, cliente público `ui-r-credit` com PKCE S256 e audiência `spe-j-engine`. O cliente de API é bearer-only. Uma importação inicial reduz configuração manual; o Keycloak preserva um realm já existente, então mudanças posteriores no JSON exigem atualização explícita do realm ou recriação consciente dos dados locais.
- **Persistência explícita:** PostgreSQL, Kafka e certificado usam volumes nomeados. `docker compose down` preserva os volumes; `docker compose down --volumes` remove dados e certificado e é uma operação destrutiva deliberada.
- **Segredos locais:** `.env.example` oferece credenciais de demonstração para inicialização. Cada pessoa pode substituí-las em `.env`, ignorado pelo Git. Esses valores e a topologia local não são configurações de produção.

Os contratos detalhados de rotas, limites, respostas, cache e logs do gateway estão em [SPEC.md](SPEC.md). Comandos, endereços, credenciais de demonstração e diagnóstico estão em [README.md](README.md).

## 7. Histórico da implementação do frontend — 26/09/2026

O trabalho começou pelas telas e pelo contrato de domínio com mocks HTTP de teste, seguido da integração com Keycloak e APIs reais. Essa ordem permitiu validar a interface enquanto os serviços eram implementados; os mocks não são fallback de produção nem evidência de integridade financeira.

O responsável aprovou cadastro/edição de cedentes também pelo gestor. A matriz de autorização e os contratos estão no anexo H da SPEC. Esta seção registra a decisão histórica; o README descreve as funcionalidades atuais.

## 8. Liquidação independente e reprocessamento por título — 27/09/2026

O responsável alterou a regra: falha de um título não desfaz as liquidações dos demais. O lote organiza cadastro, confirmação e acompanhamento; o título passa a ser a unidade de processamento financeiro e da mensagem Kafka. O contrato completo está nas seções 4/D/H.6 da SPEC e o modelo físico implementado está descrito em DATABASE.md e nas migrations do engine.

A alternativa de manter uma transação única por lote foi descartada porque impediria preservar sucessos parciais. Adotamos comandos por título, flag de erro derivada do estado, histórico de tentativas e reprocessamento explícito apenas de falhos. O custo é acompanhar progresso, erros e snapshots distintos por tentativa, atualizar projeções concorrentes e adaptar telas/mocks. Não é necessário introduzir Saga ou compensar títulos já liquidados, pois o negócio agora exige preservar esses resultados.

O modelo separa dados imutáveis do título, estado operacional atual, tentativas e liquidações imutáveis. Consolida os antigos cabeçalho/itens de liquidação em resultado individual, evitando um cabeçalho financeiro que precisaria mudar após cada sucesso. Novos índices únicos e vínculos mantêm uma liquidação por título e rastreabilidade entre tentativa, condições, comando e auditoria. A outbox é criada no aceite dos títulos aptos, dispensando registros bloqueados no cadastro.

Para esta entrega, permanece no máximo uma solicitação pendente por lote; os títulos nela são processados independentemente. O operador pode selecionar falhos para nova tentativa quando a solicitação terminar, com justificativa e novas condições. Essa escolha simplifica o controle de seleção sem reintroduzir atomicidade financeira do lote. Campos financeiros do título continuam imutáveis e cadastro/importação continuam integrais.

O contrato foi implementado em engine, workflow, migrations, frontend e tópicos `credit-receivable`/`credit-receivable.dlq`. O workflow processa cada título independentemente, registra falhas por tentativa e permite reprocessamento manual auditado somente de falhos. O smoke test de infraestrutura deve verificar os mesmos nomes de tópicos provisionados pelo Compose. Evidências anteriores à revisão de 27/09 permanecem históricas; consulte o relatório de carga e a cobertura atual antes de afirmar homologação de um cenário específico.
