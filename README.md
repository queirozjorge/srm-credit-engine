# SRM Credit Engine

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

O Compose inicia a infraestrutura local: Nginx com HTTPS, Keycloak com realm de demonstração, PostgreSQL, Kafka, engine, workflow e frontend. A configuração está descrita em [DECISIONS.md](DECISIONS.md); contratos de negócio e do gateway estão em [SPEC.md](SPEC.md).

Engine e workflow têm Spring Boot, Swagger e health checks do Actuator, mas ainda não têm endpoints de negócio, serviços, persistência conectada ou consumers. O frontend tem tema, cabeçalho, menu, rotas e telas de cedentes, consulta, cadastro manual e importação de lotes conectadas ao cliente HTTP, verificadas com mocks. O login OIDC com Keycloak está implementado; a integração funcional com APIs de negócio reais permanece pendente. O listener Kafka do workflow permanece desativado. A infraestrutura disponível não comprova autenticação no engine nem liquidação financeira.

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

O Swagger abre sem operações de negócio. No workflow, o servidor HTTP serve apenas documentação e health; a entrada de negócio futura continua sendo o consumer Kafka. O Actuator expõe apenas health, sem detalhes, na porta de gerenciamento.

Para executar apenas essas aplicações pelo Maven, não é preciso iniciar PostgreSQL, Kafka ou Keycloak. O engine ainda não valida JWT nem usa o banco; o frontend autentica pelo gateway Keycloak quando a infraestrutura está disponível. O consumo Kafka está desabilitado por `spring.kafka.listener.auto-startup: false` até existir um consumer implementado.

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
├── settlement/   # consumer como futura entrada de negócio
├── pricing/
└── outbox/
```

Os domínios reservam as pastas aplicáveis de DTOs, enums, exceções, modelos, proxies, repositories e services. Resources ficam no engine; o workflow reserva `settlement/consumer`. Contratos de serviço ficam em `service`, implementações em `service/impl`. Arquivos `.gitkeep` preservam as pastas vazias.

`src/test/java/com/backend` acompanha os domínios e `src/test/resources` está reservado em cada projeto. Cada serviço tem testes para readiness do Actuator e bloqueio do endpoint de ambiente; ainda não há testes de regras de negócio. Somente o engine reserva `src/main/resources/db/migration`, sem migrations nesta etapa.

### Verificar e empacotar

Na pasta de cada projeto:

```sh
./mvnw verify
```

O comando produz o JAR executável em `target/`. Os testes atuais cobrem somente configuração de health, não comportamento financeiro.

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

No console administrativo, use o usuário mestre `local-admin` e a senha definida por `KEYCLOAK_ADMIN_PASSWORD`. No realm `srm-credit`, os usuários de demonstração são `operador` (`KEYCLOAK_OPERATOR_PASSWORD`) e `gestor` (`KEYCLOAK_MANAGER_PASSWORD`). `.env.example` contém somente valores de demonstração local; não os reutilize fora deste ambiente. O cliente público `ui-r-credit` exige Authorization Code com PKCE S256. A UI inicia login no Keycloak, renova a sessão e envia Bearer; o engine ainda não valida os tokens.

Somente o Nginx publica portas no host, vinculadas a `127.0.0.1`. PostgreSQL (`postgres:5432`), Kafka (`kafka:9092`), Keycloak e portas HTTP/management das aplicações permanecem na rede do Compose. O gateway encaminha `/api/` ao engine e `/auth/` ao Keycloak. Detalhes dos prefixos, limites e respostas estão em [SPEC.md](SPEC.md).

Para reconstruir imagens após alterações, rode novamente `docker compose up --build --detach --wait`. Para reconstrução sem cache:

```sh
docker compose build --no-cache
docker compose up --detach --wait
```

Verifique saúde e diagnóstico com:

```sh
docker compose ps --all
docker compose logs --tail=100 postgres kafka keycloak spe-j-engine spe-j-workflow nginx
docker compose config --quiet
```

O realm é importado na primeira inicialização; importações posteriores preservam o realm já existente. Alterações no JSON do realm não substituem automaticamente valores já salvos no volume PostgreSQL. Consulte os logs de `keycloak` para investigar falhas de inicialização.

Se a stack não ficar saudável, consulte `docker compose ps --all` e os logs do serviço indicado; confirme também que as portas locais `8088` e `8443` estão livres e que `.env` contém todas as variáveis exigidas. Se o console rejeitar uma senha após alteração no `.env`, a credencial existente no banco não é atualizada pela nova importação: ajuste-a pelo console ou reinicialize conscientemente o ambiente apagando os volumes. O aviso de certificado no navegador é esperado para o certificado autoassinado local.

Para parar e remover containers/rede, mantendo os dados e o certificado, execute `docker compose down`. Para parar sem remover containers, use `docker compose stop`; a próxima execução de `docker compose up` inicia a stack novamente. **Remover dados é explícito e destrutivo:** `docker compose down --volumes` apaga PostgreSQL, Kafka e certificado local.

Com Docker e Python 3 em execução, valide a infraestrutura com `python3 scripts/infra-smoke-test.py`. O teste reinicia a stack, preserva os volumes nomeados e deixa os serviços em execução ao terminar.

O ambiente Compose é para desenvolvimento local, não configuração de produção. Login na UI, validação JWT no engine, integração com banco, migrations e liquidação permanecem pendentes. As áreas reservadas não usam dados fictícios nem simulam operações.

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

Os domínios de negócio reservam `components`, `pages`, `services` e `styles` com `.gitkeep`. A aplicação reutiliza o tema Material UI, com espaçamentos, tipografia, cores e respeito à preferência por movimento reduzido. `AppLoader.tsx` reserva a apresentação de carregamento global para os fluxos futuros; não há carregamento de dados nesta etapa.

A fundação técnica inclui BrowserRouter e provedores de tema/consultas. A navegação oferece dashboard, lotes, novo lote, detalhe, cedentes, câmbio, extrato e apresentações iniciais de acesso, além da página inexistente. Cedentes já oferece lista, busca, detalhe, cadastro e edição. Lotes oferece busca por UUID/cedente, filtro de estado, paginação, detalhe e recebíveis paginados, preservando o contexto no retorno. O cadastro manual permite incluir, editar e revisar de 1 a 1.000 recebíveis antes de criar um lote READY, sem liquidação automática. A importação CSV/CNAB oferece upload, prévia, problemas por linha e escolha de moeda CNAB. Na demonstração, use os exemplos da tela; arquivos próprios dependem do parser externo e da integração real. Simulação indicativa, confirmação integral, recuperação com idempotência, condições aceitas e acompanhamento da liquidação estão implementados na UI. A demonstração financeira usa somente uma duplicata de R$ 1.000,00, BRL, vencimento em 26/09/2026; outros cenários dependem do motor real. Câmbio permite consultar referência e histórico, propor taxa e decidir com outro gestor, sem disparar liquidação. Rotas de negócio exigem sessão; o modo demonstrativo oferece perfis explícitos e guards. Login real com Keycloak usa PKCE S256, renovação e logout, com tokens somente em memória. Menu recolhível libera espaço no desktop e fica abaixo do cabeçalho no celular. Query strings das consultas e scroll são preservados durante a navegação, sem recarregar a página.

TanStack Query reutiliza dados recentes por 30 segundos, sem retry genérico de consultas/mutações, refetch por foco/reconexão ou polling global. Consultas desatualizadas podem atualizar ao montar; acompanhamento e invalidação por domínio serão explícitos nos fluxos seguintes. Schemas Zod, cliente HTTP e sessão demonstrativa estão implementados. Os contratos e os limites dos mocks estão no [guia HTTP e sessão](docs/FRONTEND_HTTP.md).

Para explorar a sessão demonstrativa, executar `npm run dev:demo` na pasta `ui-r-credit` e acessar [localhost:5174](http://localhost:5174). Escolher operador, gestor ou ambos. `npm run dev` e o build de produção não ativam mocks por padrão; produção nunca habilita a demonstração. Dados fictícios ficam em memória e reiniciam ao recarregar. Cedentes, lotes, simulação/liquidação, câmbio, extrato paginado e dashboard agregado estão disponíveis com mocks. Extrato e totais do dashboard refletem somente liquidações demonstrativas concluídas; BRL e USD são apresentados separadamente. A integração com APIs reais permanece na task 14.

### Verificar e empacotar

Na pasta `ui-r-credit`:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

O build gera `dist/`. Para conferir esse resultado localmente, executar `npm run preview` e acessar [localhost:4174](http://localhost:4174).

Vitest executa testes `src/**/*.test.ts` e `src/**/*.test.tsx` com jsdom e React Testing Library. `npm run test:watch` mantém a execução interativa. Nos testes, MSW intercepta HTTP; requisições sem handler falham e handlers são restaurados entre testes. O Service Worker de mocks é ativado somente no modo demonstrativo explícito de desenvolvimento. Testes ficam junto ao domínio; setup, servidor e utilitários compartilhados de cenários ficam em `common/testing`.

Para verificar o build no Chromium:

```sh
npm run test:e2e:install
npm run test:e2e
npm run test:e2e:demo
npm run test:e2e:components
```

A instalação baixa o navegador uma vez; em Linux, dependências de sistema podem ser instaladas com `npx playwright install --with-deps chromium`. Playwright constrói o frontend, inicia um preview próprio em `127.0.0.1:4175` e encerra o servidor após os testes. A porta deve estar livre; não reutiliza processos existentes. Os projetos cobrem desktop 1366×768 e viewport móvel 390×844. Relatório HTML fica em `playwright-report/`; traces/screenshots de falhas em `test-results/`, ambos ignorados pelo Git. `PLAYWRIGHT_BROWSERS_PATH` pode selecionar outro cache de navegadores, desde que usado tanto na instalação quanto na execução.

A suíte cobre renderização/rotas, deduplicação/cache de consultas, ausência de retries e de refetch por foco/reconexão, atualização explícita e carregamento do build. Playwright também verifica menu, histórico, preservação de consulta/scroll, responsividade, texto ampliado e movimento reduzido. A fundação também verifica transporte, contratos, permissões e handlers demonstrativos; ainda não há homologação dos fluxos financeiros. Vitest 4 e React Router 7 preservam os requisitos de Node existentes; as versões exatas estão fixadas no manifesto e no lockfile.

A suíte de componentes usa uma fixture isolada no Vite, porta 5176, sem adicionar telas demonstrativas ao build de produção. Ela verifica modais, avisos, carregamentos simultâneos, campos formatados e paginação. O [guia de componentes](docs/FRONTEND_COMPONENTS.md) descreve seus contratos de uso.

## Documentação

- [HTTP e sessão demonstrativa](docs/FRONTEND_HTTP.md) — execução, cliente, contratos, permissões e limites dos mocks.
- [Backlog do frontend](docs/FRONTEND_TASKS.md) — mapa das telas, tasks, dependências e critérios de aceite; contratos, fundação técnica, cedentes, consulta, cadastro manual e interface de importação de lotes concluídos; demais fluxos em evolução.
- [SPEC.md](SPEC.md) — decisões de negócio, arquitetura, contratos e critérios de aceite.
- [AGENTS.md](AGENTS.md) — convenções e diretrizes de implementação.
- [DECISIONS.md](DECISIONS.md) — decisões arquiteturais, alternativas, custos e cortes de escopo.
- [REVIEW.md](REVIEW.md) — estrutura inicial para a revisão do Anexo A; análise pendente.
- [AI_USAGE.md](AI_USAGE.md) — registro inicial da colaboração com IA e evidências a completar.
- [Desafio técnico](desafio-tecnico-srm-credit-engine-v2.md) — enunciado e requisitos de avaliação.


### Acesso real (task 13)

Acesse a UI pelo gateway [https://localhost:8443](https://localhost:8443), com o build atualizado e a infraestrutura disponível. O botão **Entrar com minha conta** encaminha ao Keycloak; senha é informada somente no provedor. A configuração usa `/auth`, realm `srm-credit` e cliente público `ui-r-credit` na mesma origem. O retorno de login/logout é a raiz, conforme as URLs exatas permitidas no realm. O servidor Vite isolado não fornece Keycloak; para explorar telas sem infraestrutura, use `npm run dev:demo`.

Tokens ficam em memória. Recarregar retorna à entrada; um novo clique aproveita a sessão SSO existente, quando válida. A renovação silenciosa preserva filtros, campos e cache; sair ou expirar encerra o acesso local. Destino local de retorno tem validade de dez minutos e é descartado após o callback. APIs de negócio e validação JWT no engine permanecem na task 14.

Teste opcional contra Keycloak local: após `npm run build`, execute `npm run test:e2e:oidc` com `KEYCLOAK_OPERATOR_PASSWORD` e `KEYCLOAK_MANAGER_PASSWORD` disponíveis no ambiente de teste, sem registrar seus valores. A suíte usa o provedor real na origem permitida, serve o build local por interceptação do navegador e substitui apenas APIs de negócio ausentes por fixtures. Não habilita trace, vídeo ou captura automática de falhas para evitar artefatos com credenciais. Sem as senhas, cenários autenticados são ignorados; o callback inválido continua verificável.


A task 14 está bloqueada pelas APIs de negócio ausentes: o OpenAPI local ainda publica `paths: {}`. Consulte as [evidências e dependências de integração](docs/FRONTEND_INTEGRATION.md). O frontend já corrige o polling exclusivo do lote e a paginação 20/50/100 do extrato; isso não representa homologação dos serviços reais.


### Homologação e CI (task 15)

O [guia de homologação](docs/FRONTEND_ACCEPTANCE.md) reúne comandos, cobertura, limites e critérios pendentes. O workflow `.github/workflows/frontend.yml` verifica qualidade e três suítes de navegador em jobs separados. Testes demonstrativos têm data inicial controlada e navegador em fuso diferente do calendário financeiro. A configuração da CI não implica execução remota; homologação integrada depende da conclusão das tasks 13/14.
