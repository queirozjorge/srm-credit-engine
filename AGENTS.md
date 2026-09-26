# Diretrizes do projeto

Este arquivo define as regras de implementação para o projeto. As instruções são válidas para o frontend, o backend e a camada de banco de dados.

As decisões funcionais, os contratos e os detalhes operacionais estão em `SPEC.md`. O `README.md` apresenta o projeto, as tecnologias e as instruções de execução disponíveis. Manter os documentos consistentes, evitando duplicar a especificação no README. O escopo acordado é Sênior, com liquidação atômica de todo o lote.

## Skills globais

Antes de analisar, implementar ou revisar qualquer alteração, identificar as skills aplicáveis e seguir integralmente as instruções do respectivo `SKILL.md`. Em tarefas que envolvam mais de uma área, utilizar todas as skills correspondentes.

- **Caveman** — manter respostas objetivas, técnicas e sem conteúdo desnecessário, preservando a clareza e todos os detalhes essenciais.
  - `/Users/jorgequeiroz/.codex/skills/caveman/SKILL.md`
- **Frontend Specialist** — utilizar em alterações no frontend React/Vite, incluindo componentes, responsividade, acessibilidade, estados de interação e validação visual.
  - `/Users/jorgequeiroz/.codex/skills/frontend-specialist/SKILL.md`
- **Java Spring Backend Specialist** — utilizar em alterações no backend Java/Spring Boot, incluindo APIs REST, serviços, persistência, segurança, transações e configuração.
  - `/Users/jorgequeiroz/.codex/skills/java-spring-backend-specialist/SKILL.md`
- **UX/UI Specialist** — utilizar em decisões de fluxo, usabilidade, interface, design system, responsividade, acessibilidade e revisão de experiência.
  - `/Users/jorgequeiroz/.codex/skills/ux-ui-specialist/SKILL.md`

## Diretrizes globais de arquitetura

1. **Aplicar Design Patterns de modo consciente.** Utilizar um pattern somente quando houver um problema concreto de acoplamento, duplicação, complexidade ou variação de comportamento e quando sua adoção facilitar a manutenção e a evolução da aplicação. Antes de introduzi-lo, comparar com a solução direta mais simples e justificar brevemente, na descrição da alteração, o problema resolvido e o benefício obtido. Priorizar `Strategy` para comportamentos variáveis, `Factory` ou `Builder` para criação complexa, `Adapter` para integrações externas, `Facade` para orquestração, `Specification` para filtros combináveis e `Repository` para persistência, somente quando adequados ao contexto. Não aplicar patterns por convenção, antecipar necessidades hipotéticas ou criar camadas e abstrações sem benefício concreto. Reutilizar as estruturas existentes quando elas já resolverem o problema.
2. **Respeitar os princípios SOLID, com foco em S, L, I e D.** Aplicar esses princípios às classes, módulos, componentes e contratos, conforme a responsabilidade de cada camada:
   - **S — Responsabilidade única:** manter uma responsabilidade coesa e um motivo principal para mudança; separar apresentação, regras de negócio, persistência e integrações. Dividir por responsabilidade, sem fragmentação artificial.
   - **L — Substituição de Liskov:** implementações e subtipos devem poder substituir seus contratos sem quebrar o comportamento esperado pelos consumidores. Preservar invariantes, não fortalecer pré-condições nem enfraquecer pós-condições; evitar operações não suportadas ou exceções inesperadas que violem o contrato.
   - **I — Segregação de interfaces:** definir contratos pequenos e específicos para seus consumidores. Nenhum consumidor deve depender de operações que não utiliza, e nenhuma implementação deve ser obrigada a fornecer métodos vazios ou não suportados.
   - **D — Inversão de dependência:** regras de negócio e políticas de alto nível devem depender de contratos adequados ao domínio nas fronteiras com persistência, infraestrutura e serviços externos. Os detalhes devem implementar esses contratos, respeitando as convenções de injeção do projeto. Não criar uma interface para cada classe automaticamente; introduzir abstrações quando houver uma fronteira real de responsabilidade ou necessidade concreta de substituição.
   - **O — Aberto/fechado:** permitir extensão nos pontos de variação identificados, preservando código estável, sem criar mecanismos de extensão para necessidades apenas hipotéticas.

## Instruções Backend

1. Organizar API e worker como projetos Maven separados, cada um com seu próprio build e versão, no mesmo repositório:

   ```text
   spe-j-engine/                 # API HTTP, autenticação e publicação da outbox
   spe-j-workflow/                 # Consumo Kafka e liquidação
   ```

   Cada aplicação mantém `src/main/java/com/backend`, organizado por domínio conforme esta referência:

   ```text
   src/main/java/com/backend
       ├── common
       │   ├── audit
       │   ├── config
       │   ├── enums
       │   └── exceptions
       └── register
           ├── dto
           ├── enums
           ├── exceptions
           ├── model
           ├── proxy
           ├── repository
           ├── resource
           └── service
               └── impl
   ```

   O worker utiliza consumers como pontos de entrada, sem criar Resources HTTP de negócio artificialmente. Separar aplicação, negócio e persistência. Cada microsserviço mantém suas próprias funcionalidades, modelos, contratos, regras e configurações, mesmo quando repetidos. Não criar biblioteca de aplicação compartilhada, dependência de código entre microsserviços ou mecanismo equivalente de compartilhamento de fontes. A reutilização de código deve ocorrer dentro de cada aplicação.

   Interfaces de serviço devem utilizar o prefixo `I` e permanecer diretamente no package `service`, por exemplo `IRegistrationService` e `IAuthService`. As implementações dessas interfaces devem permanecer no package `service.impl` e utilizar o sufixo `Impl`, por exemplo `RegistrationServiceImpl` e `AuthServiceImpl`. Classes auxiliares concretas pertencentes à camada de serviço, quando não possuírem contrato próprio, também devem permanecer em `service.impl`; o package `service` deve ser reservado aos contratos e interfaces da camada.

2. Evitar consultas que carregam todos os registros para depois filtrar em tempo de execução. Filtros de registros em memória de toda a base não devem ser implementados.
3. Priorizar a reutilização de serviços dentro do mesmo microsserviço. A repetição de funcionalidades entre microsserviços é permitida e não justifica criar uma biblioteca compartilhada.
4. Sempre configurar testes unitários.
5. Sempre configurar `application.yml`.
6. Usar `PATCH` para alterações parciais, preservando campos omitidos. Usar `PUT` somente quando houver um contrato de substituição completa; não oferecer edição de liquidações ou auditoria.
7. Para consultas `GET` que necessitam verificar um grande volume de dados, criar uma query/endpoint único que filtre os dados de forma otimizada uma única vez. Se necessário, avaliar a criação de índice nas tabelas relacionadas. É sempre opção do usuário escolher avançar ou regredir nas páginas.
8. Retornar `404` para rota ou recurso inexistente. Consultas sem resultados retornam `200` com coleção vazia (`[]` ou `items: []` no envelope paginado). Usar `201` para criação, `202` para solicitação assíncrona aceita, `409` para conflito e `204` para sucesso que realmente não exija conteúdo. Nunca representar erro como sucesso.
9. Quando houver injeção diretamente nos campos da classe, utilizar `@Autowired` explicitamente em cada dependência. Configurações injetadas nos campos com `@Value` devem ficar em campos separados, cada uma com sua própria anotação.
10. Todas as mensagens retornadas pelas APIs ao frontend devem estar em português brasileiro, com acentuação e pontuação corretas.
11. As APIs devem retornar ao frontend somente os dados necessários para cada operação; quando o sucesso não exigir conteúdo de resposta, retornar `204 No Content`.
12. Ao criar uma funcionalidade, analisar primeiro os componentes do package `common` do próprio microsserviço. Esse package é interno à aplicação e reúne recursos usados por seus domínios. Engine e worker mantêm implementações próprias do motor de precificação e dos contratos necessários, sem importar código um do outro. Preservar compatibilidade de mensagens e schema conforme a documentação; aferir cada implementação do cálculo pelos mesmos golden cases, evitando divergências financeiras.
13. Classes Java podem ser instanciadas por construtores, fábricas estáticas ou builders, conforme a necessidade. Escolher a forma mais simples que preserve as invariantes da classe; aplicar a diretriz global de Design Patterns quando houver benefício concreto, sem exigir um método `builder(...)` em toda classe.
14. Resources são exclusivamente pontos de entrada HTTP: devem receber a requisição, encaminhá-la para a service e devolver a resposta HTTP. Não devem conter regras de negócio, validações de negócio, normalizações ou instanciação de classes da aplicação; a service é responsável pelo fluxo, pelas validações e pela criação dos objetos. Repositories permanecem responsáveis exclusivamente pelo acesso ao banco de dados.
15. Erros que acontecerem na aplicação nunca devem ser mascarados. O stack trace deve ser registrado por log no formato `[handler]:[error]: <code> - <mensagem> - {stackTrace}` ou, quando houver tratamento com `try/catch`, deve ser preservado ao realizar o `throw new`, incluindo a causa original.
16. Permitir injeção de dependências por construtor ou diretamente nos campos, mantendo as dependências explícitas e a consistência da implementação. Quando a injeção ocorrer nos campos, seguir as anotações definidas no item 9.
17. Aplicar a diretriz global de SOLID, com foco em S, L, I e D, aos contratos, serviços e demais classes do backend.
18. Aplicar a diretriz global de Design Patterns ao backend. Não substituir polimorfismo por cadeias extensas de `if`/`switch` quando houver uma solução mais coesa.
19. Manter classes coesas e pequenas. Utilizar até 200 linhas não vazias como referência preferencial; classes entre 201 e 300 linhas são aceitáveis quando houver alta coesão; acima de 300 linhas exigem revisão para possível divisão; e acima de 400 linhas devem ser refatoradas ou possuir justificativa técnica documentada. Como referência, Resources devem ter até 200 linhas e Services até 300 linhas. A divisão deve ocorrer por responsabilidade, nunca apenas para cumprir contagem de linhas.
20. Validar o access token JWT no engine antes do processamento e autorizar cada operação pelo papel do usuário. Qualquer operador autorizado pode acessar e liquidar qualquer lote; não filtrar lotes pelo criador. Auditar os responsáveis pelo cadastro, solicitação e aprovação. Ajustes cambiais exigem gestor diferente do solicitante, comparando a identidade autenticada; não confiar em identidades ou permissões informadas no body.
21. A liquidação é tudo ou nada por lote: todos os recebíveis, resultados financeiros, auditoria de sucesso e conclusão do lote pertencem à mesma transação PostgreSQL. Usar optimistic locking e restrições de unicidade para impedir duplicidade, inclusive entre operadores com chaves diferentes. O consumer group do Kafka e o bloqueio de botões não substituem essas garantias.
22. Persistir lote, recebíveis e outbox bloqueada na mesma transação. Liberar a mensagem somente após aceitar a solicitação de liquidação, fixar suas condições financeiras e persistir a idempotência. Publicar no tópico `credit-lot` apenas `batchUuid` e `idempotencyKey`, com chave de particionamento igual ao UUID do lote. Confirmar o consumo após a persistência do resultado ou do tratamento definitivo de falha, conforme `SPEC.md`.
23. Usar `BigDecimal` em toda operação monetária, incluindo potência fracionária. Não converter valores para `float`/`double`. Seguir escalas, arredondamento e snapshots definidos em `SPEC.md`. Enviar valores decimais como strings na API.
24. Logs devem ser estruturados, incluindo código, operação, UUID do lote e correlação quando aplicáveis. Preservar a mensagem e o stack trace definidos no item 15 dentro dos campos estruturados; não registrar JWT, credenciais ou conteúdo integral dos arquivos importados.

## Instruções para banco de dados

1. Utilizar exclusivamente PostgreSQL. Nomear tabelas e colunas em `snake_case`, minúsculas, sem acentos; o separador permitido é `_`.
2. Toda tabela possui `uuid UUID PRIMARY KEY` e `date_register TIMESTAMPTZ NOT NULL`. Não criar `id BIGINT` auxiliar. Tabelas mutáveis também possuem `date_updated TIMESTAMPTZ`; cadastros com exclusão lógica utilizam `deleted BOOLEAN NOT NULL DEFAULT FALSE`.
3. Liquidações e eventos de auditoria são imutáveis: somente inserção e leitura, sem `date_updated`, exclusão lógica, atualização ou exclusão física por usuários da aplicação. Estado operacional de lote, solicitação e outbox deve ficar em tabelas mutáveis separadas dos eventos históricos. Restringir privilégios de banco para preservar essa regra.
4. Referências a outras tabelas usam colunas UUID com `FOREIGN KEY`. Permitir e exigir `UNIQUE`, `NOT NULL` e `CHECK` quando necessários às invariantes de negócio. Exclusão lógica não libera a identidade de um título nem permite recriar uma liquidação.
5. Garantir unicidade de recebível por cedente, tipo e referência externa; de resultado de liquidação por lote; de item liquidado por recebível; e de chave de idempotência por operação. Implementar o controle de versão usado pelo optimistic locking nos registros concorridos.
6. Usar `NUMERIC(19,2)` para valores monetários e `NUMERIC(24,12)` para taxas; validar limites antes da persistência, incluindo valores convertidos e totais. Vencimentos são `DATE`; instantes são `TIMESTAMPTZ`, tratados em UTC. O calendário financeiro usa `America/Sao_Paulo`.
7. Alterações de schema devem usar migrations versionadas, com um único responsável por aplicá-las ao banco compartilhado. O projeto `spe-j-engine` mantém e aplica as migrations; o worker verifica compatibilidade do schema e não executa migrations concorrentes. Proibir atualização automática do schema pelo ORM.

## Instruções Frontend

1. Estrutura do projeto:

   ```text
   ui-r-credit
   └── src
       ├── app
       │   ├── App.tsx
       │   └── routes
       ├── common
       │   ├── components
       │   │   └── AppLoader.tsx
       │   ├── http
       │   └── styles
       ├── auth
       │   ├── components
       │   ├── pages
       │   └── services
       ├── i18n
       │   └── pt-BR.ts
       └── main.tsx
   ```

   A estrutura deve ser organizada por domínio. Cada domínio deve manter seus próprios componentes, páginas, serviços, configurações, mocks, armazenamento local e estilos. A pasta `common` deve conter somente recursos reutilizáveis entre dois ou mais domínios. A pasta `app` deve concentrar a composição da aplicação, inicialização, rotas e guards, sem concentrar regras de negócio. Novos domínios podem ser adicionados conforme o escopo funcional da aplicação evoluir.

   Usar React, Vite e Material UI com TypeScript e `strict: true`. Componentes usam `.tsx`; lógica, traduções e configurações da aplicação usam `.ts`. Tipar contratos da API, props e estados; validar dados externos em execução. Não usar `any` para contornar a tipagem. Valores monetários da API permanecem strings decimais.
2. Evitar consultas redundantes por ação. Simulação e acompanhamento assíncrono seguem as exceções controladas de `SPEC.md`.
3. Em operações CRUD, realizar uma requisição de alteração e uma consulta para atualizar apenas os dados afetados. O acompanhamento periódico de uma liquidação aceita é permitido conforme o contrato, sem recarregar a página.
4. Evitar múltiplas consultas em sequência para serviços de paginação. É sempre opção do usuário escolher avançar ou regredir nas páginas.
5. Sinalizar requisições pesadas conforme o item 14. Desabilitar imediatamente o botão de alteração, inclusive na liquidação, enquanto houver envio pendente. Uma falha de rede deve preservar a chave de idempotência para repetição segura.
6. Todos os textos exibidos ao usuário devem estar com concordância na língua portuguesa brasileira e com todos os acentos e pontuações.
7. Manter todo o frontend e a camada de UI/UX com padrão visual sofisticado: hierarquia clara, tipografia refinada, espaçamento consistente, responsividade, acessibilidade, microinterações discretas e animações suaves. Toda decisão visual deve priorizar acabamento, coerência com o design system, clareza e usabilidade, sem comprometer performance.
8. Centralizar todos os textos exibidos ao usuário no sistema de i18n em `/src/i18n`. Componentes e páginas não devem manter cópias locais de textos nem escolher idioma com condicionais para renderização; devem receber as traduções por `translations[locale]` ou por props derivadas dela.
9. O idioma suportado nesta entrega é `pt-BR`. Organizar chaves de tradução por domínio dentro do arquivo central, mantendo tipagem consistente; não criar seletor de idioma sem outro idioma suportado.
10. O conteúdo textual estático do frontend deve ficar em um único arquivo: `ui-r-credit/src/i18n/pt-BR.ts`. Não criar arquivos adicionais de textos por tela. Mensagens retornadas pelo backend devem seguir os contratos em português brasileiro.
11. Erros de API e alertas de operação nunca devem ser exibidos como mensagens inline na tela. Devem ser centralizados em um componente reutilizável de modal de aviso, com foco acessível, fechamento por teclado e ação clara; mensagens de validação específicas de campos podem permanecer associadas ao campo quando forem necessárias para correção imediata.
12. Validações previsíveis que evitem requests desnecessárias podem ser antecipadas no frontend, com mensagens contextuais para correção imediata. Essas validações nunca substituem as regras do backend, que permanece como autoridade final de integridade e segurança.
13. Estados de carregamento global devem reutilizar `ui-r-credit/src/common/components/AppLoader.tsx`, centralizando identidade visual e acessibilidade.
14. Carregamentos iniciais e operações explícitas de cadastro, alteração e confirmação usam o `AppLoader` em tela inteira sobre o conteúdo existente. Simulação durante a digitação, acompanhamento periódico de status e renovação silenciosa de sessão são exceções: não bloqueiam a tela. Nesses casos, permitir indicação discreta e acessível de atualização e preservar os dados existentes. Após o aceite assíncrono da liquidação, retirar o bloqueio global e apresentar o estado do lote; não manter o AppLoader até o worker terminar. Desabilitar novas solicitações enquanto o lote tiver uma operação em andamento.
15. Todo campo que represente dado padronizado deve aplicar máscara ou formatação apropriada ao domínio, incluindo valores monetários, números, datas, telefones, documentos, CEP e formatos equivalentes. A máscara deve ser reutilizável, acessível e compatível com digitação, colagem, edição e navegação por teclado; o valor enviado à API deve permanecer normalizado conforme o contrato, sem depender do texto formatado apresentado ao usuário.
16. Todo combobox, modal e componente que possua estados de abertura e fechamento deve utilizar transições graduais de entrada e saída, com opacidade, deslocamento, escala ou outra animação coerente com o design system. O componente deve permanecer montado durante a saída até o término da transição, evitando desaparecimentos abruptos; a implementação deve respeitar `prefers-reduced-motion`, reduzindo ou removendo as animações sem comprometer a acessibilidade e o controle por teclado.
17. Ao criar ou refatorar um modal, localizar primeiro um modal estável do mesmo domínio e reutilizar seu ciclo de abertura e fechamento. O fechamento deve usar um único handler idempotente, separar o estado controlado de abertura do estado local de renderização (`shouldRender`/`isClosing`), manter o modal montado durante a animação de saída, impedir reabertura por eventos atrasados ou propagação para a tela subjacente, e restaurar o foco ao elemento de origem. O backdrop deve fechar somente quando essa interação fizer parte do contrato e apenas ao clicar na própria área do backdrop; o conteúdo interno deve interromper a propagação. Validar cada alteração com pelo menos cinco ciclos consecutivos de abrir/fechar e com um clique imediato durante a saída, confirmando que não há piscar, reabertura ou fechamento duplicado.
18. Requisições ao backend devem atualizar somente os dados afetados, sem recarregar a página, alterar a rota para a mesma tela, desmontar e montar novamente componentes ou resetar o estado local. Após consultas, mutações ou refetches, preservar filtros, abas, paginação, posição de scroll, modais, foco, campos em edição e demais estados de interação. Aplicar o AppLoader somente nos casos definidos no item 14. É proibido usar `window.location.reload()`, remount por alteração artificial de `key` ou reset global de estado como mecanismo de atualização dos dados.
