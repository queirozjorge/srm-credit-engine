# SRM Credit Engine

**Revisão contratual de 27/09/2026:** engine, workflow e UI implementam liquidação por título, sucesso parcial, erro individual e reprocessamento auditado. Execuções locais e limites da evidência de carga estão em [WORKFLOW_LOAD_REPORT.md](docs/WORKFLOW_LOAD_REPORT.md); não representam SLA de produção.

Plataforma de antecipação de recebíveis com pagamentos em reais ou dólares. Permite cadastrar lotes, simular valores, solicitar liquidações e consultar o histórico das operações.

## Tecnologias

| Tecnologia | Justificativa |
|---|---|
| React, Vite, Material UI e TypeScript | Desenvolvimento ágil da interface, componentes reutilizáveis e contratos tipados. |
| Java e Spring Boot | Tipagem forte, precisão decimal com BigDecimal e ecossistema maduro para aplicações financeiras. |
| PostgreSQL | Persistência relacional, transações ACID e integridade dos dados. |
| Kafka | Processamento assíncrono dos lotes e distribuição do consumo entre workers. |
| Keycloak | Autenticação centralizada via OpenID Connect. |
| Nginx | Entrega do frontend, HTTPS, encaminhamento das requisições e rate limiting. |
| Docker e Docker Compose | Ambiente de execução reproduzível para aplicações e dependências. |

## Componentes

- **ui-r-credit:** interface do operador e do gestor.
- **spe-j-engine:** API, cadastros, simulações e envio de solicitações para processamento.
- **spe-j-workflow:** base do processamento das liquidações, anteriormente chamada `spe-j-worker` na especificação.

## Estado e execução

O Compose inicia a infraestrutura local: Nginx com HTTPS, Keycloak com realm de demonstração, PostgreSQL, Kafka, engine, duas instâncias do workflow e frontend. A configuração está descrita em [DECISIONS.md](DECISIONS.md); contratos de negócio e do gateway estão em [SPEC.md](SPEC.md).

O engine fornece APIs de cedentes, lotes/importação, simulação, câmbio, aceite, histórico, extrato e dashboard, com persistência PostgreSQL, autenticação JWT e relay concorrente da outbox Kafka. O workflow valida o schema, consome `credit-receivable`, liquida cada título em transação própria e publica falhas definitivas na DLQ. O frontend usa Keycloak e não contém um modo de demonstração; as fixtures ficam nos testes. A homologação autenticada de ponta a ponta depende das credenciais locais de operador e gestor.

### Requisitos

- JDK 21.
- Acesso à internet na primeira execução para baixar Maven e dependências.
- Maven Wrapper incluído em cada projeto; não é necessário instalar Maven globalmente. No Windows, substituir `./mvnw` por `mvnw.cmd`.

Versões fixadas: Spring Boot 4.0.8, springdoc-openapi 3.0.3 e Maven 3.9.11. A combinação Spring Boot 4.0.x/springdoc 3.0.x segue a [matriz oficial de compatibilidade](https://springdoc.org/#what-is-the-compatibility-matrix-of-springdoc-openapi-with-spring-boot).

### Iniciar localmente

Em um terminal, a partir da raiz:

```sh
cd spe-j-engine
./mvnw spring-boot:run
```

Em outro terminal, a partir da raiz:

```sh
cd spe-j-workflow
./mvnw spring-boot:run
```

| Projeto | Swagger UI | OpenAPI JSON | Health interno |
|---|---|---|---|
| Engine | [localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html) | [localhost:8080/v3/api-docs](http://localhost:8080/v3/api-docs) | `localhost:8081/actuator/health/readiness` |
| Workflow | [localhost:18081/swagger-ui.html](http://localhost:18081/swagger-ui.html) | [localhost:18081/v3/api-docs](http://localhost:18081/v3/api-docs) | `localhost:18082/actuator/health/readiness` |

O OpenAPI do engine descreve as APIs implementadas. O servidor HTTP do workflow serve documentação e health; o processamento financeiro entra pelo consumer Kafka. Nas portas internas de gerenciamento, o Actuator expõe `health` e `metrics`; `env` permanece desabilitado e essas portas não são publicadas no host nem no gateway.

Para iniciar o engine localmente, configure as credenciais PostgreSQL, execute `engine-migrate` pelo Compose e disponibilize Kafka e JWKS do Keycloak. O relay publica outboxes aceitas e o workflow as consome. Para testes integrados, `./mvnw verify` executa PostgreSQL/Kafka com Testcontainers.

O workflow atual exige schema versão 6. A migration V6 cria a quarentena durável de comandos Kafka inválidos; aplique-a pelo engine antes de iniciar ou atualizar o workflow. O workflow verifica a versão e nunca aplica migrations.

Cada `src/main/resources/application.yml` permite substituir a porta com `SERVER_PORT` e desabilitar Swagger/OpenAPI com `SWAGGER_ENABLED=false`. Encerrar cada aplicação com `Ctrl+C`.

### Estrutura modular

Cada projeto tem `pom.xml`, versão, build, configuração e testes independentes, sem biblioteca compartilhada.

```text
spe-j-engine/src/main/java/com/backend/
├── EngineApplication.java
├── common/       # audit, config, enums, exceptions
├── auth/
├── register/
├── batch/
├── pricing/
├── exchange/
├── settlement/
└── outbox/

spe-j-workflow/src/main/java/com/backend/
├── WorkflowApplication.java
├── common/       # audit, config, enums, exceptions
├── settlement/   # consumer Kafka e liquidação por título
├── pricing/
└── outbox/
```

Os domínios reservam as pastas aplicáveis de DTOs, enums, exceções, modelos, proxies, repositories e services. Resources ficam no engine; o workflow reserva `settlement/consumer`. Contratos de serviço ficam em `service`, implementações em `service/impl`. Arquivos `.gitkeep` preservam as pastas vazias.

`src/test/java/com/backend` acompanha os domínios. Os testes cobrem cálculo, APIs, validação e persistência; o workflow usa PostgreSQL/Kafka com Testcontainers para verificar liquidação por título, reentrega, rollback, retries, DLQ e concorrência. As migrations versionadas ficam somente no engine; o workflow verifica a compatibilidade do schema.

### Verificar e empacotar

Na pasta de cada projeto:

```sh
./mvnw verify
```

O comando produz o JAR executável em `target/`, além dos testes unitários e dos testes integrados com PostgreSQL e Kafka. O workflow inclui casos de sucesso, concorrência, rollback isolado, retries e DLQ.

## Frontend

### Iniciar localmente

Requisitos: Node.js 20.19+ na linha 20, 22.13+ na linha 22 ou 24+, e npm. A primeira instalação exige acesso à internet. As dependências ficam fixadas em `package-lock.json`.

Na raiz do repositório:

```sh
cd ui-r-credit
npm ci
npm run dev
```

Acessar [localhost:5174](http://localhost:5174). A porta é fixa para evitar mudanças silenciosas de endereço; para escolher outra, usar `npm run dev -- --port 5175`.

### Executar o ambiente Docker

Requer Docker Engine ou Docker Desktop com Docker Compose v2 e acesso à internet na primeira construção. Não exige JDK, Maven ou Node.js no host.

Na raiz do repositório, copie as credenciais locais e inicie a stack pela primeira vez:

```sh
cp .env.example .env
docker compose up --build --detach --wait
```

Em execuções seguintes, use `docker compose up --detach --wait`; as imagens construídas e os dados nos volumes são reutilizados.

Endereços locais:

- Frontend: [https://localhost:8443](https://localhost:8443). [http://localhost:8088](http://localhost:8088) redireciona com `308` para HTTPS.
- Swagger do engine: [https://localhost:8443/api/swagger-ui.html](https://localhost:8443/api/swagger-ui.html).
- Console administrativo do Keycloak: [https://localhost:8443/auth/admin/](https://localhost:8443/auth/admin/).
- Discovery OIDC do realm `srm-credit`: [https://localhost:8443/auth/realms/srm-credit/.well-known/openid-configuration](https://localhost:8443/auth/realms/srm-credit/.well-known/openid-configuration).

O certificado TLS é autoassinado e fica no volume `nginx_certificates`. O navegador avisará que não confia nele; o projeto não altera automaticamente a confiança do sistema. Para desenvolvimento, pode-se confiar no certificado manualmente.

Com `.env` baseado em `.env.example`, estas são as credenciais padrão da stack local:

| Acesso | Usuário | Senha padrão |
| --- | --- | --- |
| Console administrativo do Keycloak (realm `master`) | `local-admin` | `Local-Admin-2026!` |
| Aplicação no realm `srm-credit` (papel operador) | `operador` | `Local-Operator-2026!` |
| Aplicação no realm `srm-credit` (papel gestor) | `gestor` | `Local-Manager-2026!` |

As senhas vêm de `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_OPERATOR_PASSWORD` e `KEYCLOAK_MANAGER_PASSWORD`, respectivamente. Se essas variáveis forem alteradas no `.env`, use os valores definidos ali. Em um volume Keycloak já inicializado, mudar `.env` não troca a senha dos usuários existentes; atualize-a pelo console administrativo. São credenciais exclusivas para desenvolvimento local; não as reutilize fora deste ambiente. O cliente público `ui-r-credit` exige Authorization Code com PKCE S256. A UI inicia login no Keycloak, renova a sessão e envia Bearer; o engine valida assinatura, emissor, audiência, validade e papel.

Somente o Nginx publica portas no host, vinculadas a `127.0.0.1`. PostgreSQL (`postgres:5432`), Kafka (`kafka:9092`), Keycloak e portas HTTP/management das aplicações permanecem na rede do Compose. O gateway encaminha `/api/` ao engine e `/auth/` ao Keycloak. Detalhes dos prefixos, limites e respostas estão em [SPEC.md](SPEC.md).

Para reconstruir imagens após alterações, rode novamente `docker compose up --build --detach --wait`. Para reconstrução sem cache:

```sh
docker compose build --no-cache
docker compose up --detach --wait
```

Verifique saúde e diagnóstico com:

```sh
docker compose ps --all
docker compose logs --tail=100 postgres kafka keycloak spe-j-engine spe-j-workflow spe-j-workflow-2 nginx
docker compose config --quiet
```

O realm é importado na primeira inicialização; importações posteriores preservam o realm já existente. Alterações no JSON do realm não substituem automaticamente valores já salvos no volume PostgreSQL. Consulte os logs de `keycloak` para investigar falhas de inicialização.

Se a stack não ficar saudável, consulte `docker compose ps --all` e os logs do serviço indicado; confirme também que as portas locais `8088` e `8443` estão livres e que `.env` contém todas as variáveis exigidas. Se o console rejeitar uma senha após alteração no `.env`, a credencial existente no banco não é atualizada pela nova importação: ajuste-a pelo console ou reinicialize conscientemente o ambiente apagando os volumes. O aviso de certificado no navegador é esperado para o certificado autoassinado local.

Para parar e remover containers/rede, mantendo os dados e o certificado, execute `docker compose down`. Para parar sem remover containers, use `docker compose stop`; a próxima execução de `docker compose up` inicia a stack novamente. **Remover dados é explícito e destrutivo:** `docker compose down --volumes` apaga PostgreSQL, Kafka e certificado local.

Com Docker e Python 3 em execução, valide a infraestrutura com `python3 infra/scripts/infra-smoke-test.py`. O teste reinicia a stack, preserva os volumes nomeados e deixa os serviços em execução ao terminar.

O ambiente Compose é para desenvolvimento local, não configuração de produção. Ele sobe gateway, Keycloak, PostgreSQL, Kafka, engine e duas instâncias do workflow no mesmo grupo de consumidores. O engine valida JWT, aplica migrations e publica solicitações pela outbox; as instâncias do workflow distribuem o consumo e liquidam os títulos. As credenciais de teste são configuradas localmente e nunca devem ser registradas em logs.

### Organização

```text
ui-r-credit/src/
├── app/          # composição, provedores, cabeçalho/menu e rotas
├── common/       # AppLoader, tema, QueryClient e infraestrutura compartilhada de testes
├── auth/
├── register/
├── batch/
├── pricing/
├── exchange/
├── settlement/
├── i18n/pt-BR.ts # textos e título da página
└── main.tsx
```

Os domínios de negócio mantêm seus próprios componentes, páginas, serviços e estilos. A aplicação reutiliza tema Material UI, `AppLoader`, traduções centrais, validação Zod e cliente HTTP autenticado, com respeito a movimento reduzido e navegação por teclado.

O frontend oferece dashboard, lotes, cadastro e detalhe, cedentes, câmbio e extrato. Cadastro manual e importação CSV/CNAB enviam o conteúdo original ao engine para validação, prévia e gravação. Simulação, aceite, histórico por título, auditoria, reprocessamento seletivo e acompanhamento usam as APIs reais. Valores monetários permanecem strings decimais. O engine decide elegibilidade e persistência; o frontend não calcula nem simula liquidações. O workflow conclui cada título de forma independente e o detalhe acompanha estados parciais. Login Keycloak usa PKCE S256, renovação e logout, com tokens somente em memória. Mocks ficam isolados nos testes; o build de produção não contém modo demonstrativo.

TanStack Query reutiliza dados recentes por 30 segundos, sem retry genérico de consultas/mutações, refetch por foco/reconexão ou polling global. A tela de lote consulta o estado pendente e atualiza somente o conteúdo afetado. Os contratos de API e frontend estão na seção H da [SPEC.md](SPEC.md); login, sessão e execução local estão descritos neste README.

O modo local padrão usa o gateway e o Keycloak do Compose. MSW e fixtures são usados somente em testes e não podem substituir silenciosamente uma API indisponível.

### Verificar e empacotar

Na pasta `ui-r-credit`:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

O build gera `dist/`. Para conferir esse resultado localmente, executar `npm run preview` e acessar [localhost:4174](http://localhost:4174).

Vitest executa testes `src/**/*.test.ts` e `src/**/*.test.tsx` com jsdom e React Testing Library. `npm run test:watch` mantém a execução interativa. Nos testes, MSW intercepta HTTP; requisições sem handler falham e handlers são restaurados entre testes. MSW e fixtures permanecem no harness de teste e não entram no build de produção.

Para verificar as jornadas de navegador:

```sh
npm run test:e2e:install
npm run test:e2e -- --workers=2
npm run test:e2e:isolated -- --workers=2
npm run test:e2e:components -- --workers=2
```

A instalação baixa o navegador uma vez; em Linux, dependências de sistema podem ser instaladas com `npx playwright install --with-deps chromium`. Playwright constrói o frontend, inicia um preview próprio em `127.0.0.1:4175` e encerra o servidor após os testes. A porta deve estar livre; não reutiliza processos existentes. Os projetos cobrem desktop 1366×768 e viewport móvel 390×844. Relatório HTML fica em `playwright-report/`; traces/screenshots de falhas em `test-results/`, ambos ignorados pelo Git. `PLAYWRIGHT_BROWSERS_PATH` pode selecionar outro cache de navegadores, desde que usado tanto na instalação quanto na execução.

A suíte cobre fluxos e componentes em desktop/celular; a suíte integrada usa gateway, Keycloak e engine reais, requer credenciais de teste e não faz parte da execução sem configuração local. Testes unitários e suítes isoladas usam dados sintéticos, sem comprovar processamento financeiro.

A suíte de componentes usa uma fixture isolada no Vite, porta 5176, sem adicionar telas demonstrativas ao build de produção. Ela verifica modais, avisos, carregamentos simultâneos, campos formatados e paginação.

## Documentação

- [SPEC.md](SPEC.md) — decisões de negócio, arquitetura, contratos e critérios de aceite.
- [AGENTS.md](AGENTS.md) — convenções e diretrizes de implementação.
- [Arquitetura](docs/ARCHITECTURE.md) — C4 níveis 1 e 2 e modelo ER.
- [Observabilidade](docs/WORKFLOW_OBSERVABILITY.md) — métricas, limites operacionais e diagnóstico.
- [Relatório de carga](docs/WORKFLOW_LOAD_REPORT.md) — medições locais, configuração e limites da amostra.
- [DATABASE.md](DATABASE.md) — modelo relacional e invariantes.
- [DECISIONS.md](DECISIONS.md) — decisões arquiteturais, alternativas, custos e cortes de escopo.
- [REVIEW.md](REVIEW.md) — revisão reversa do Anexo A.
- [AI_USAGE.md](AI_USAGE.md) — decisões e evidências da colaboração com IA.
- [Desafio técnico](docs/desafio-tecnico-srm-credit-engine-v2.md) — enunciado e requisitos de avaliação.


### Acesso real e integração de APIs

Acesse a UI pelo gateway [https://localhost:8443](https://localhost:8443), com o build atualizado e a infraestrutura disponível. O botão **Entrar com minha conta** encaminha ao Keycloak; senha é informada somente no provedor. A configuração usa `/auth`, realm `srm-credit` e cliente público `ui-r-credit` na mesma origem. O retorno de login/logout é a raiz, conforme as URLs exatas permitidas no realm. O servidor Vite isolado não fornece Keycloak; use `npm run dev` e configure o gateway/Keycloak e o engine reais.

Tokens ficam em memória. Recarregar retorna à entrada; um novo clique aproveita a sessão SSO existente, quando válida. A renovação silenciosa preserva filtros, campos e cache; sair ou expirar encerra o acesso local. Destino local de retorno tem validade de dez minutos e é descartado após o callback. O engine oferece APIs H.1–H.8 e valida JWT e papéis antes de processar chamadas.

Teste integrado: execute `npm run test:e2e:integration` com `KEYCLOAK_OPERATOR_PASSWORD` e `KEYCLOAK_MANAGER_PASSWORD` disponíveis no ambiente, sem registrar seus valores. A suíte acessa `https://localhost:8443`, não intercepta APIs de negócio e mantém artefatos de credenciais desativados. Sem essas variáveis, os cenários autenticados não podem ser considerados aprovados.


O backend expõe OpenAPI e APIs reais. O código e os testes de integração estão em `spe-j-engine` e `spe-j-workflow`; as limitações de cada verificação estão registradas em [DECISIONS.md](DECISIONS.md). As medições e o diagnóstico de carga estão em [WORKFLOW_LOAD_REPORT.md](docs/WORKFLOW_LOAD_REPORT.md).


### CI e limites da verificação

Os workflows `.github/workflows/frontend.yml` e `backend.yml` executam typecheck, lint e build do frontend, testes de navegador, além de testes backend e integração PostgreSQL/Kafka. Os cenários frontend autenticados contra o Keycloak local requerem `KEYCLOAK_OPERATOR_PASSWORD` e `KEYCLOAK_MANAGER_PASSWORD`; não fazem parte da CI padrão. Um relatório local de carga não substitui repetição controlada no ambiente de referência da SPEC.
