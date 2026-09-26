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

Escopo Sênior. Os dois projetos backend possuem uma estrutura modular executável, com apenas a classe de inicialização Spring Boot e o Swagger. Não existem endpoints de negócio, modelos, serviços, persistência ou consumers implementados. O frontend possui uma estrutura executável com React, Vite, Material UI e TypeScript estrito, exibindo somente uma tela inicial, sem fluxos de negócio ou chamadas às APIs.

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

| Projeto | Swagger UI | OpenAPI JSON |
|---|---|---|
| Engine | [localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html) | [localhost:8080/v3/api-docs](http://localhost:8080/v3/api-docs) |
| Workflow | [localhost:18081/swagger-ui.html](http://localhost:18081/swagger-ui.html) | [localhost:18081/v3/api-docs](http://localhost:18081/v3/api-docs) |

O Swagger abre sem operações, pois ainda não há endpoints. No workflow, o servidor HTTP existe apenas para disponibilizar a documentação; a entrada de negócio futura continua sendo o consumer Kafka.

Esta etapa não exige PostgreSQL, Kafka ou Keycloak em execução. O consumo Kafka está desabilitado por `spring.kafka.listener.auto-startup: false`; sua ativação acompanha a futura implementação do processamento. Autenticação e integração com banco ainda não estão configuradas.

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

`src/test/java/com/backend` acompanha os domínios e `src/test/resources` está reservado em cada projeto. O suporte a testes vem de `spring-boot-starter-test`; ainda não há testes implementados. Somente o engine reserva `src/main/resources/db/migration`, sem migrations nesta etapa.

### Verificar e empacotar

Na pasta de cada projeto:

```sh
./mvnw verify
```

O comando produz o JAR executável em `target/`. Sem casos de teste implementados, seu sucesso comprova o build, não cobertura funcional.

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

Não é necessário iniciar os backends, PostgreSQL, Kafka ou Keycloak para visualizar esta estrutura. Login, guards, navegação funcional, formulários e integração HTTP permanecem pendentes. A tela inicial não usa dados fictícios nem simula operações.

### Organização

```text
ui-r-credit/src/
├── app/          # composição da aplicação; routes reservado
├── common/       # AppLoader, tema e pasta http reservada
├── auth/
├── register/
├── batch/
├── pricing/
├── exchange/
├── settlement/
├── home/pages/   # tela inicial provisória
├── i18n/pt-BR.ts # textos e título da página
└── main.tsx
```

Os domínios de negócio reservam `components`, `pages`, `services` e `styles` com `.gitkeep`. A aplicação reutiliza o tema Material UI, com espaçamentos, tipografia, cores e respeito à preferência por movimento reduzido. `AppLoader.tsx` reserva a apresentação de carregamento global para os fluxos futuros; não há carregamento de dados nesta etapa.

### Verificar e empacotar

Na pasta `ui-r-credit`:

```sh
npm run typecheck
npm run lint
npm run build
```

O build gera `dist/`. Para conferir esse resultado localmente, executar `npm run preview` e acessar [localhost:4174](http://localhost:4174). Ainda não há testes automatizados de fluxos de negócio.

## Documentação

- [SPEC.md](SPEC.md) — decisões de negócio, arquitetura, contratos e critérios de aceite.
- [AGENTS.md](AGENTS.md) — convenções e diretrizes de implementação.
- [DECISIONS.md](DECISIONS.md) — decisões arquiteturais, alternativas, custos e cortes de escopo.
- [REVIEW.md](REVIEW.md) — estrutura inicial para a revisão do Anexo A; análise pendente.
- [AI_USAGE.md](AI_USAGE.md) — registro inicial da colaboração com IA e evidências a completar.
- [Desafio técnico](desafio-tecnico-srm-credit-engine-v2.md) — enunciado e requisitos de avaliação.
