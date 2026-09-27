# DECISIONS — SRM Credit Engine

**Decisões aprovadas em 25/09/2026 · Estado atualizado em 27/09/2026 · Escopo Sênior.**

Este documento registra escolhas, alternativas e custos. Os contratos funcionais e operacionais permanecem em [SPEC.md](SPEC.md); as convenções de implementação estão em [AGENTS.md](AGENTS.md). A infraestrutura local com Docker Compose, Nginx e Keycloak está configurada. As funcionalidades de negócio ainda não foram implementadas; as expectativas de carga abaixo precisam ser verificadas por medição.

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

O desafio penaliza complexidade sem justificativa. Esta escolha assume conscientemente custo adicional e não representa evidência de ganho de desempenho já medido. Antes de afirmar benefício, verificar latência HTTP sob carga de liquidação, tempo de processamento, espera em fila e saturação do banco ao variar a quantidade de workers, respeitando os critérios da SPEC.

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

## 4. Evidências e validações pendentes

O teste de infraestrutura `scripts/infra-smoke-test.py` validou a inicialização reproduzível, o gateway HTTPS, a autenticação OIDC do realm de demonstração, os limites e erros HTTP, a persistência dos volumes e a ausência de credenciais nos logs. Os testes de backend cobrem readiness do Actuator e bloqueio do endpoint de ambiente; não comprovam regras financeiras.

Continuam pendentes testes de golden cases financeiros, concorrência e recuperação da liquidação, rollback isolado por título, reprocessamento seletivo auditado, aprovação cambial, medições de carga do worker e diagramas ER/C4. As evidências devem ser associadas às decisões quando essas funcionalidades forem implementadas. A validação do Compose é local e não demonstra disponibilidade ou segurança de produção.

## 5. Estado funcional atual

O Compose inicia Nginx, Keycloak, PostgreSQL, Kafka, engine, workflow e frontend. Engine e workflow expõem Swagger sem operações de negócio e health checks do Actuator. O HTTP do workflow serve apenas à documentação; seu consumer Kafka permanece desativado. O engine ainda não valida tokens nem usa o banco, o frontend ainda não implementa login OIDC e não há cadastro, simulação ou liquidação implementados.

## 6. Infraestrutura do ambiente local

- **Nginx como única entrada publicada:** as portas `8088` e `8443` ficam vinculadas a `127.0.0.1`; os serviços internos não publicam portas no host. TLS termina no Nginx, que encaminha HTTP dentro da rede privada do Compose. Isso simplifica o acesso local e centraliza limites, cache e logs, mas cria um único ponto de entrada e não define a arquitetura TLS de produção.
- **Certificado autoassinado:** um serviço inicializador cria o certificado local em volume persistente. Evita dependência de autoridade certificadora durante o desenvolvimento; navegadores não confiam nele automaticamente.
- **PostgreSQL em uma instância, bancos separados:** `srm_credit` atende às aplicações e `keycloak` armazena a identidade; roles distintos separam engine, workflow, migrações e Keycloak. A separação reduz o acoplamento lógico, mas banco e instância continuam compartilhando recursos e domínio de falha.
- **Kafka single-node em KRaft:** um broker local usa três partições e fator de replicação 1. Evita operar um cluster no ambiente de desenvolvimento, ao custo de não oferecer quorum ou alta disponibilidade.
- **Keycloak importado como configuração inicial:** o realm `srm-credit` define usuários de demonstração, papéis, cliente público `ui-r-credit` com PKCE S256 e audiência `spe-j-engine`. O cliente de API é bearer-only. Uma importação inicial reduz configuração manual; o Keycloak preserva um realm já existente, então mudanças posteriores no JSON exigem atualização explícita do realm ou recriação consciente dos dados locais.
- **Persistência explícita:** PostgreSQL, Kafka e certificado usam volumes nomeados. `docker compose down` preserva os volumes; `docker compose down --volumes` remove dados e certificado e é uma operação destrutiva deliberada.
- **Segredos locais:** `.env.example` oferece credenciais de demonstração para inicialização. Cada pessoa pode substituí-las em `.env`, ignorado pelo Git. Esses valores e a topologia local não são configurações de produção.

Os contratos detalhados de rotas, limites, respostas, cache e logs do gateway estão em [SPEC.md](SPEC.md). Comandos, endereços, credenciais de demonstração e diagnóstico estão em [README.md](README.md).

## 7. Frontend por marcos e contratos — 26/09/2026

Implementar primeiro as telas com mocks HTTP explícitos por domínio, preservando composição e identidade do wireframe com Material UI; depois integrar Keycloak e APIs reais. Isso permite validar interface e estados enquanto o backend ainda não possui operações de negócio. A alternativa de aguardar cada API adiaria a validação dos fluxos; o custo aceito é manter fixtures e contratos sincronizados com o futuro OpenAPI. Mocks não são fallback de produção nem evidência de integridade financeira.

O responsável aprovou cadastro/edição de cedentes também pelo gestor. A matriz de autorização e os contratos ficam exclusivamente no anexo H da SPEC; dependências, estados das tasks e adaptações do protótipo ficam no [backlog do frontend](docs/FRONTEND_TASKS.md). Nesta etapa foram definidos contratos documentais, sem introduzir patterns, camadas executáveis, dependências ou endpoints.

## 8. Liquidação independente e reprocessamento por título — 27/09/2026

O responsável alterou a regra: falha de um título não desfaz as liquidações dos demais. O lote organiza cadastro, confirmação e acompanhamento; o título passa a ser a unidade de processamento financeiro e da mensagem Kafka. O contrato completo está nas seções 4/D/H.6 da SPEC e o modelo físico proposto em DATABASE.md.

A alternativa de manter uma transação única por lote foi descartada porque impediria preservar sucessos parciais. Adotamos comandos por título, flag de erro derivada do estado, histórico de tentativas e reprocessamento explícito apenas de falhos. O custo é acompanhar progresso, erros e snapshots distintos por tentativa, atualizar projeções concorrentes e adaptar telas/mocks. Não é necessário introduzir Saga ou compensar títulos já liquidados, pois o negócio agora exige preservar esses resultados.

O modelo separa dados imutáveis do título, estado operacional atual, tentativas e liquidações imutáveis. Consolida os antigos cabeçalho/itens de liquidação em resultado individual, evitando um cabeçalho financeiro que precisaria mudar após cada sucesso. Novos índices únicos e vínculos mantêm uma liquidação por título e rastreabilidade entre tentativa, condições, comando e auditoria. A outbox é criada no aceite dos títulos aptos, dispensando registros bloqueados no cadastro.

Para esta entrega, permanece no máximo uma solicitação pendente por lote; os títulos nela são processados independentemente. O operador pode selecionar falhos para nova tentativa quando a solicitação terminar, com justificativa e novas condições. Essa escolha simplifica o controle de seleção sem reintroduzir atomicidade financeira do lote. Campos financeiros do título continuam imutáveis e cadastro/importação continuam integrais.

Esta revisão altera documentação, não código, migrations, tópicos, mocks ou telas. A infraestrutura ainda referencia `credit-lot`/`credit-lot.dlq` em `infra/kafka/create-topics.sh` e `scripts/infra-smoke-test.py`; esses arquivos não foram alterados nesta revisão documental. A implementação deverá provisionar os novos tópicos, ajustar produtor/consumer, persistência e UI antes da homologação. As evidências de frontend anteriores não comprovam o novo fluxo.
