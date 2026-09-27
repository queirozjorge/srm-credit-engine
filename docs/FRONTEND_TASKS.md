# Frontend — mapa de telas e backlog

**27/09/2026 · Frontend usa Keycloak/API reais; modo demonstrativo removido. Suite isolada cobre a UI, suite HTTP real requer ambiente local autenticado; consulte `ENGINE_TASKS.md` para o estado atual da entrega.**

Objetivo: implementar o [wireframe](index.html) em React/Material UI, preservando identidade visual e fluxos. O frontend mantém suas telas e cliente HTTP; a produção usa Keycloak e APIs do engine, enquanto mocks ficam isolados em testes. Contratos funcionais, payloads, status e permissões têm fonte única no [anexo H da SPEC](../SPEC.md#h-contratos-propostos-para-o-frontend-e-seus-mocks). Convenções de implementação e validação visual estão em [AGENTS.md](../AGENTS.md).

## Marcos e limites

- **Produção:** autenticação Keycloak e APIs reais; indisponibilidade do backend é apresentada como erro recuperável.
- **Testes:** MSW, handlers e fixtures só existem no harness automatizado e não são incluídos no build distribuído.
- As evidências anteriores deste arquivo são históricas; homologação de regras financeiras depende dos testes backend/PostgreSQL e de worker futuro.
- Reutilizar estrutura e tema existentes. Não copiar o JavaScript monolítico, cálculos financeiros, perfis ou textos de demonstração para os componentes de produção.
- Tipos/schemas executáveis, bibliotecas, serviços e testes serão introduzidos nas tasks seguintes. A task 01 não instala dependências nem implementa telas/APIs.

## Mapa das 12 telas

As rotas abaixo são de navegação planejada, diferentes dos endpoints HTTP. `callback` é estado transitório processado na raiz já permitida pelo realm, não uma nova URL OIDC. `OPERADOR` e `GESTOR` consultam todas as telas de consulta; mutações seguem a matriz H.2.

| Tela / ID no wireframe | Rota planejada / domínio | Entradas e ações | Estados e saída esperada |
|---|---|---|---|
| Dashboard — `dashboard` | `/dashboard` · `dashboard` | Período, moeda do gráfico; abrir novo lote, lotes, câmbio e extrato conforme papel. | Carregando, com dados, período vazio, consulta indisponível/dados anteriores desatualizados; contrato H.8. |
| Lotes — `batches` | `/lotes` · `batch` | Buscar UUID/cedente, filtrar situação, paginar, abrir detalhe; novo lote só operador. | Carregando, lista, vazio, falha em modal; retorno preserva consulta. H.4. |
| Novo lote — `new-batch` | `/lotes/novo` · `batch` | Operador escolhe manual/CSV/CNAB, preenche/revisa, confirma cadastro. | Rascunho, validação, prévia válida/inválida, envio bloqueado, conflito, resultado incerto de rede, cadastro `READY`; nunca liquida automaticamente. H.4. |
| Detalhe de lote — `batch-detail` | `/lotes/:batchUuid` · `batch`, `pricing`, `settlement` | Consultar itens; operador simula, confirma liquidação, acompanha ou tenta novamente após falha; abrir câmbio. | Não encontrado, `READY`, `PENDING`, `SETTLED`, `PARTIALLY_SETTLED`, `FAILED`; simulação desatualizada e bloqueio USD; condições aceitas distintas da simulação. H.4–H.7. |
| Cedentes — `registers` | `/cedentes` · `register` | Ambos os papéis pesquisam, paginam, consultam detalhe e abrem cadastro/edição. Seleção do detalhe em `?cedente=UUID`. | Lista/vazio, detalhe/não encontrado, formulário inválido, envio, duplicidade, conflito de versão; CNPJ imutável após cadastro. H.3. |
| Câmbio — `exchange` | `/cambio` · `exchange` | Referência, cotação e abas de histórico; operador propõe; gestor decide; lote de origem opcional em `?lote=UUID`. | Cotação válida/expirada/ausente, referência indisponível, proposta pendente/aprovada/rejeitada, autoaprovação bloqueada e conflito de decisão. H.7. |
| Extrato — `statement` | `/extrato` · `settlement` | Período, cedente, moeda, paginação, abrir lote. | Carregando, itens concluídos, vazio, período inválido, falha em modal; H.6. |
| Entrada — `sign-in` | `/entrar` · `auth` | Entrar pelo provedor; guardar destino interno permitido. | Não autenticado, redirecionando, falha de autenticação; nenhuma coleta de senha na UI. |
| Retorno — `callback` | `/` durante retorno OIDC · `auth` | Processar retorno e sessão; autenticação mock apenas no Marco 1. | Carregando, sucesso com navegação ao destino autorizado ou dashboard, falha em modal com retorno à entrada. |
| Sessão expirada — `session-expired` | `/sessao-expirada` · `auth` | Autenticar novamente; invalidar sessão e interromper polling. | Sessão inválida; destino interno preservado, dados/cache não compartilhados com outra identidade. |
| Acesso negado — `forbidden` | `/acesso-negado` · `auth` | Voltar a destino permitido; sair da sessão se não houver papel reconhecido. | `403`/guard de papel, sem liberar ações pelo body ou apenas esconder botões. |
| Página inexistente — `not-found` | `*` · `app` | Voltar ao dashboard autenticado ou à entrada. | Rota inexistente; não confundir com lista vazia ou lote inexistente. |

A raiz sem retorno OIDC encaminha conforme sessão para entrada/dashboard. Não criar telas de login com senha, auditoria editável, edição de lote cadastrado ou seletor de idioma.

### Subfluxos, componentes e estado de interação

- **Novo lote:** escolha de origem, preenchimento e revisão são etapas da mesma tela. Manual mantém itens editáveis antes do cadastro. Arquivo abre modal com prévia/erros por linha; confirmação é integral. Seleção de cedente usa busca paginada, sem carregar todos os cadastros.
- **Cedentes:** detalhe é uma subvisão; cadastro/edição são modais. Após mutação, atualizar somente a visão afetada. CNPJ bloqueado em edição; conflito mantém conteúdo para correção.
- **Liquidação:** confirmação inicial abrange todos os títulos; sucessos individuais permanecem visíveis mesmo durante processamento. Estado parcial mostra contagens, flag de falha e ação para consultar erro/auditoria em modal. Reprocessamento seleciona somente falhos, exige justificativa, confirmação e nova chave; bloqueado enquanto outra solicitação do lote estiver pendente. `202` encerra AppLoader e mantém acompanhamento discreto conforme H.6.
- **Câmbio:** propostas e cotações são abas; proposta e confirmações/justificativa de rejeição são modais. A referência é consulta independente do histórico. Aprovação não solicita liquidação nem refaz condições já aceitas.
- **Feedback:** erros de API/alertas operacionais no modal comum; validações locais junto aos campos. Falha de importação fica no modal reutilizável, com detalhes por linha. Estados vazios e indicadores de estado são conteúdo, não erros inline.
- **Carregamento:** iniciais e mutações explícitas usam AppLoader sobre conteúdo montado; simulação durante digitação, polling e renovação silenciosa são não bloqueantes. Botões de mutação desabilitam imediatamente.
- **Preservação:** filtros, página e abas na URL; formulários, modal, foco e scroll preservados durante refetch. Fechar modal somente por ação prevista/sucesso da operação, nunca por atualização incidental. Cada domínio mantém seu estado; não usar reload ou alteração artificial de `key`.
- **Responsividade:** menu recolhível no desktop/celular; tabelas com região própria e controles acessíveis. Conteúdo móvel pode rolar naturalmente; suportar zoom e movimento reduzido.

### Adaptações explícitas do protótipo

O wireframe define composição e fluxo; [SPEC](../SPEC.md) e [DATABASE](../DATABASE.md) definem integridade. Implementar as seguintes diferenças deliberadas:

1. UUID substitui identificadores sequenciais fictícios de lote/proposta/cotação. Lote com vários cedentes mostra contagem, não somente o primeiro.
2. Edição de cedente altera razão social, sem trocar documento; fixtures de sucesso usam documento válido.
3. Cotação proposta é taxa absoluta positiva. Incremento é auxílio local, sem exigir base prévia ou inventar bloqueio por base antiga; primeira cotação pode ser proposta manualmente. Histórico não exibe incremento que não foi persistido.
4. Gestor sem papel de operador consulta condições/resultados aceitos, mas não executa simulação; após decidir câmbio, retorna ao detalhe de consulta. Operador revisa e solicita separadamente.
5. Erros/alertas operacionais migram das mensagens inline demonstrativas para modal. Cálculos, leitura de arquivos e transições financeiras simuladas não comprovam implementação real.
6. Valores de datas e relógio vêm do servidor/fixtures controladas; não fixar as datas de setembro usadas no HTML. Paginação inicial de produção segue H.1.

## Backlog executável

Cada task entrega sua implementação e verificação proporcional. Os critérios abaixo complementam AGENTS.md; não substituem a validação integrada da task 15.

| Task | Entrega | Dependências | Critério de aceite | Estado |
|---|---|---|---|---|
| 01 — Contratos e backlog | Permissões, 12 telas, contratos H e organização das tasks. | Wireframe, SPEC e modelo de dados. | Entradas, respostas, erros, permissões e cenários definidos para preparar mocks. | Concluída documentalmente |
| 02 — Fundação técnica | React Router, TanStack Query, Zod, MSW, Vitest, Testing Library e Playwright; estrutura por domínio. | 01 | Tipagem, lint, teste básico e build; consultas sem refetch/retry genérico desnecessário. | Concluída |
| 03 — Tema e navegação | Tema MUI refinado, cabeçalho/menu, rotas e preservação de consulta. | 02 | Rotas diretas e voltar funcionam; layout desktop/móvel sem cortes. | Concluída |
| 04 — Componentes comuns | AppLoader, modal estável, tabelas/paginação, máscaras, i18n. | 03 | Teclado, foco, transições e cinco ciclos por modal; decimal normalizado sem perda. | Concluída |
| 05 — HTTP, mocks e sessão demonstrativa | Cliente HTTP, schemas dos contratos, erros, fixtures por domínio e guards/perfis. | 02, 04 | Cenários determinísticos; mocks não entram silenciosamente no modo real. | Concluída |
| 06 — Cedentes | Lista, busca, detalhe, cadastro e edição para ambos os papéis. | 05 | Documento imutável, conflito preserva edição; uma mutação e consulta afetada. | Concluída |
| 07 — Lotes | Lista paginada, filtros, detalhe e recebíveis. | 05 | Estados contratuais e recurso ausente; retorno preserva contexto. | Concluída |
| 08 — Cadastro manual | Fluxo guiado e revisão integral de recebíveis. | 06, 07 | 1–1.000 itens; duplicidades/validações; cadastro `READY` sem liquidação. | Concluída |
| 09 — CSV/CNAB | Upload, prévia, erros por linha e revisão de moedas CNAB. | 08 | 5 MiB; prévia não persiste; erro impede cadastro parcial; parser real externo. | Concluída |
| 10 — Simulação/liquidação | Simulação indicativa, confirmação, chave, snapshot, acompanhamento e nova tentativa. | 07, 08 | Resposta antiga ignorada, chave preservada, `409`, polling suspenso/retomado; evidência histórica do contrato integral. | Concluída no contrato anterior; adequação na task 16 |
| 11 — Câmbio | Cotação/referência, proposta, histórico e decisão por outro usuário. | 05, 10 | Autoaprovação/concorrência bloqueadas; referência indisponível não bloqueia proposta manual; retorno sem liquidar. | Concluída |
| 12 — Extrato/dashboard | Extrato paginado e dashboard agregado com gráfico acessível em SVG. | 07, 10, 11 | Filtros nos itens, datas de São Paulo, moedas separadas e estados vazio/indisponível. | Concluída |
| 13 — Keycloak | Login PKCE, retorno na raiz, renovação, logout e Bearer. | Marco 1 | Tokens em memória; sessão real, identidade/papéis e caches isolados. | Login autenticado em operador e gestor verificado; refresh/logout real pendente |
| 14 — APIs reais | Integração por domínio | APIs do engine e Keycloak | Contratos H.1–H.8, sessão real e ausência de fallback fictício. | Implementada; quatro jornadas reais aprovadas em desktop/celular |
| 15 — Homologação | Jornadas reais, visual/acessibilidade, CI e documentação. | 14 e conclusão do engine | Backend/DB/Kafka reais e evidências separadas dos testes isolados. | UI/API homologadas no escopo do engine; processamento financeiro aguarda worker |
| 16 — Liquidação por título | Resultado por título, estados parciais, reprocessamento explícito, auditoria e polling. | SPEC/DATABASE de 27/09/2026. | Sucessos preservados; falhas auditadas; retries e unicidade protegidos no banco; worker conclui futuramente. | UI real conectada; execução financeira aguarda workflow |

Tasks 06 e 07 são independentes após a fundação; a ordem restante preserva os fluxos que precisam ser verificados juntos. Esta indicação de dependências não implica execução automática de outras tasks.

## Matriz mínima de cenários para mocks e testes

Mocks reproduzem HTTP, payloads e transições de H; não dão evidência de transação PostgreSQL, validação JWT, cálculo BigDecimal ou parser CNAB real. Dados ilustrativos devem estar identificados como tal. Fixtures/reset por teste evitam dependência da ordem de execução.

| Área | Cenários obrigatórios |
|---|---|
| Transporte/sessão | Resposta válida/inválida ao schema; `204` sem JSON; `400/401/403/404/409/413/422/429/500/502/503/504`; atraso, conexão interrompida; troca de identidade e ausência de papel. |
| Consulta | Lista/vazio, página fora do total, alteração de filtros/tamanho, salto inválido, resposta fora de ordem e retorno do detalhe sem perder contexto. |
| Cedentes | Operador e gestor cadastram/editam; documento duplicado, versão antiga, inativo no histórico e indisponível para novos títulos. |
| Lote/importação | Lote misto de cedentes/moedas; 0, 1, 1.000 e 1.001 itens; arquivo no limite e acima; inválido por linha/estrutura; duplicidade entre entradas; prévia válida seguida de rejeição no cadastro definitivo. |
| Simulação | Debounce, resposta antiga, data vencida, prazo zero, cotação ausente/expirada, valores nos limites; resultados determinísticos dos golden cases, sem calcular juros no frontend. |
| Liquidação | Dez títulos com nove sucessos/uma falha; progresso com resultados já visíveis; todos falhos; parcial; replay da mesma intenção; chave com seleção/justificativa diferente; outro operador; reprocessamento de subconjunto; tentativa antiga; título já liquidado rejeitado; snapshots novos apenas em tentativa manual; histórico e flags coerentes. |
| Câmbio | Primeira cotação manual, referência indisponível, cotação exatamente em 24h e além, decisão por identidade distinta, ambos os papéis sem autoaprovação, rejeição justificada, conflito e proposta preservada após outra cotação ser aprovada. |
| Extrato/dashboard | Somente concluídos, fronteiras inclusiva/exclusiva, fuso do navegador diferente, filtro por item em lote misto, moeda sem movimento, período vazio e falha preservando dados anteriores identificados como desatualizados. |
| Interação | Teclado, foco restaurado, clique durante saída, cinco ciclos por modal, menu recolhido, zoom 200%, movimento reduzido; desktop 1366×768/1920×1080 e celular 320/390/430 px. |

## Evidências históricas das tasks 01–15

Os registros abaixo descrevem o código e testes executados antes da revisão de liquidação por título. Referências a confirmação integral, falha total, POST sem body em toda tentativa e ausência de estados parciais não são requisitos atuais. A task 16 substitui esses comportamentos conforme a SPEC; não declarar os testes antigos como validação da regra nova.

## Registro da task 01

- Permissão do gestor alinhada no anexo A e na matriz H.2.
- Contratos propostos concentrados na SPEC, preservando as respostas/idempotência dos anexos D/E.
- As 12 telas do HTML foram mapeadas; modais, etapas e subvisões não são contabilizados como novas telas.
- Documentação revisada quanto a links, referências de telas, dependências e consistência com o modelo de dados. Não foram executados testes funcionais nem implementação de UI/backend nesta task.

## Registro da task 02

- Dependências diretas fixadas no manifesto/lockfile; React, Vite, Material UI e versões anteriores preservados. React Router 7, TanStack Query 5 e Zod 4 adicionados; Vitest 4, jsdom, Testing Library, MSW 2 e Playwright configurados.
- BrowserRouter conectado na entrada; AppProviders compõe tema e QueryClient com instância estável. Rotas/telas de negócio permanecem na task 03. Dados de consulta ficam recentes por 30 segundos; foco/reconexão, polling global e retries genéricos estão desativados. Atualização explícita continua disponível.
- Testes junto às responsabilidades de aplicação/HTTP; setup compartilhado em `common/testing`, com MSW estrito e limpeza entre testes. Mocks de negócio, schemas Zod e cliente HTTP permanecem na task 05; nenhum mock intercepta a aplicação de produção.
- `npm run typecheck`, `npm run lint` e `npm test` passaram: quatro testes cobrem renderização, deduplicação/cache, falhas sem retry e eventos de foco/reconexão com refetch explícito.
- `npm run test:e2e` compilou o build e passou em Chromium desktop 1366×768 e móvel 390×844: dois testes, sem erro de console/página ou transbordamento horizontal. Manifesto/lockfile conferidos. Comandos e requisitos no README.

## Registro da task 03

- Tema MUI refinado, marca compartilhada, cabeçalho e menu recolhível. Desktop usa lateral que libera largura ao fechar; celular usa menu abaixo do cabeçalho e fecha após navegação. Collapse preserva saída animada, com suporte a movimento reduzido, conteúdo fechado inerte e Escape restaurando foco ao botão.
- Rotas correspondentes às 12 telas conectadas; título de documento e foco no título acompanham a navegação. As páginas de domínio são áreas reservadas, sem métricas, registros ou ações financeiras fictícias. Entrada, retorno, sessão expirada e acesso negado são apresentações iniciais; sessão/guards pertencem à task 05 e OIDC à 13. Temporariamente, raiz sem retorno de acesso abre dashboard sem simular autenticação; cabeçalho informa sessão não conectada.
- Menu e retorno do detalhe preservam a última query string das telas de consulta em memória. Histórico do navegador preserva endereços; scroll por rota é restaurado, sem reset em mudança apenas da query. Filtros/paginação/abas reais serão ligados a esses parâmetros nas respectivas tasks. Não há armazenamento de dados de negócio ou parâmetros OIDC nessa memória.
- Tipagem, lint, build e 15 testes Vitest passaram. Os 12 testes Playwright passaram em desktop/celular, cobrindo rotas diretas, voltar, consulta/scroll, cinco ciclos do menu, Escape, larguras 320/390/430/1366/1920, texto a 200% com viewport reduzida e movimento reduzido. Capturas desktop/móvel e texto ampliado foram inspecionadas visualmente.
- A validação encontrou e corrigiu interferência do scroll anchoring ao fechar menu móvel e largura residual ao trocar orientação do Collapse. Testes cobrem essas regressões; não foram adicionadas dependências.

## Registro da task 04

- AppFeedbackProvider coordena carregamentos simultâneos sem desmontar o conteúdo, com liberação idempotente; fila de avisos deduplica mensagens. AppDialog/WarningDialog compartilham fechamento único, saída gradual, restauração de foco e suporte a movimento reduzido.
- DataTable e paginação controlada oferecem rolagem interna, estado vazio, tamanho, avanço/regresso e salto validado, sem consultas automáticas. Campos/formatadores de dinheiro, taxa, CNPJ e data preservam valores normalizados; dinheiro nunca é convertido em number. Textos centralizados no i18n.
- Tipagem, lint, build e 22 testes Vitest passaram. Foram aprovados 12 testes Playwright de componentes e 12 de regressão da navegação, em desktop/celular. Componentes foram verificados em cinco ciclos de modal/combobox, incluindo foco, Escape, clique durante saída, carregamentos concorrentes, precisão e largura de 320 px.
- Guia de uso em [FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md). Fixture isolada de testes não entra nas rotas nem no build de produção. Não foram adicionadas dependências; transporte HTTP, schemas e regras de domínio permanecem nas próximas tasks.

## Registro da task 05

- Cliente HTTP tipado com validação Zod, cancelamento/timeout, JSON/FormData, status esperados, `204` sem parsing, chave de idempotência preservada e erros normalizados em modal. Não há retries ou refetches implícitos.
- Contratos executáveis por domínio; primitivas compartilhadas preservam decimais/versões como strings, datas UTC/civis e paginação. Uniões de solicitações impedem representar conclusão parcial como pendência ou sucesso.
- Sessão em memória, guards, matriz de permissões e comparação de identidade para decisão cambial. Saída/expiração/troca cancelam requisições e limpam caches; destino local é preservado na entrada.
- Demonstração ativada explicitamente em desenvolvimento, com seleção de perfis, identificação visual e inicialização bloqueante com recuperação. MSW/worker/identidades demonstrativas ausentes do build real. Login Keycloak e integração de APIs permanecem nas tasks 13/14.
- Fixtures por domínio e handlers iniciais de consulta, cadastro/edição de cedente e simulação fixa. Mocks dos fluxos financeiros serão ampliados junto às tasks correspondentes; escopo disponível documentado em [FRONTEND_HTTP.md](FRONTEND_HTTP.md). Nenhuma dependência nova.
- Validação: tipagem, lint, build e 55 testes unitários aprovados; 16 testes Playwright de demonstração/navegação e quatro de produção aprovados. Capturas de acesso inspecionadas em desktop/celular. Build sem worker/handlers/identidades demonstrativas, conferido também nos arquivos gerados.
- Regressão dos componentes: 12 testes Playwright aprovados; total de 32 testes de navegador nesta entrega.

## Registro da task 06

- Tela de cedentes substitui a área reservada: busca por nome/CNPJ, filtro de ativos, paginação explícita, estado vazio e detalhe selecionado por `?cedente=UUID`. Lista permanece montada ao abrir detalhe; filtros, página e rolagem são preservados no retorno.
- Operador e gestor cadastram/editam. Razão social é validada/normalizada; CNPJ possui máscara e validação local de dígitos, fica imutável após cadastro. Detalhe mostra estado, identificador e datas em São Paulo, incluindo cedentes inativos. Não há exclusão/reativação.
- Cada cadastro faz POST e uma consulta da página afetada; cada edição faz PATCH e uma consulta do detalhe, atualizando o cache local e marcando demais listas como desatualizadas sem refetch em cascata. O botão é bloqueado imediatamente. Sucesso mantém o formulário aberto para consulta e desabilita novo envio; falha no GET posterior permite repetir somente a consulta.
- Duplicidade e conflito preservam rascunho. Em conflito de versão, o usuário consulta o nome atual e compara antes de salvar novamente com a versão consultada. Erros e confirmação de sucesso usam o aviso central; validações previsíveis ficam nos campos.
- O teste de modais sobrepostos identificou perda de foco após erro de envio. O provedor comum passou a aguardar a saída do loader, restaurar foco e só então abrir o aviso. Cadastro e edição reutilizam o AppDialog; sem novas dependências ou patterns adicionais.
- A validação de CNPJ segue o [manual técnico da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf), incluindo o exemplo alfanumérico publicado. Isso não comprova existência cadastral; integridade e unicidade permanecem no backend.
- Verificação: tipagem, lint, build e 60 testes unitários aprovados; 42 testes Playwright aprovados (26 demonstração/navegação, 12 componentes e quatro produção). Capturas desktop/móvel inspecionadas; integração real permanece na task 14.

## Registro da task 07

- Lista de lotes com busca explícita por UUID ou nome de qualquer cedente, filtro pelos quatro estados contratuais, paginação e atualização manual. Lotes mistos mostram a quantidade de cedentes e mantêm todos os totais, mesmo quando a busca corresponde a apenas um deles.
- Detalhe com UUID completo, origem, responsável, data em São Paulo, total de face, estado e dados da solicitação quando presentes. Recebíveis possuem consulta/paginação própria, valores formatados sem conversão monetária para number, vencimento civil e moeda explícita. Falha da solicitação é consultada no modal central.
- Operador e gestor consultam os lotes; somente operador recebe acesso a Novo lote. Cadastro continua na task 08 e simulação/liquidação/acompanhamento na task 10. Não há polling nem mutações nesta entrega.
- Lista permanece montada ao navegar para o detalhe, preservando rascunho, filtros, página, scroll interno e foco no retorno. Consultas mantêm o conteúdo existente com AppLoader; erros usam aviso central. UUID inválido não gera request; 404 não dispara consulta dos recebíveis. Paginação de itens consulta somente a página escolhida.
- Reutilizados cliente HTTP, schemas, React Query, DataTable, paginação, formatadores e avisos existentes. Rotas aninhadas mantêm o contexto da lista, sem novas dependências ou patterns adicionais. Handlers demonstrativos aceitam cenários de teste e buscam cedentes entre todos os itens do lote.

Verificação da task 07: tipagem, lint, build e 68 testes unitários aprovados. Os 32 cenários de demonstração/navegação passaram, incluindo reexecuções direcionadas após correções; os quatro testes do build real também passaram. Capturas de lista e detalhe foram inspecionadas em desktop/celular, incluindo 320 px. O build mantém avisos não bloqueantes de comentários do Zod e bundle maior que 500 kB. `git diff --check` sem erros.

## Registro da task 08

- Cadastro manual em `/lotes/novo`, exclusivo do operador, com etapas de recebíveis, revisão e conclusão. Permite adicionar, editar e remover itens antes do envio; lista local paginada limita a renderização. Moedas BRL/USD e ambos os tipos contratuais; valor de face sempre BRL. Seleção de cedentes ativos com busca explícita e paginação no servidor, sem carregar todo o cadastro.
- Validação local de 1–1.000 itens, referência com trim e zeros preservados, identidade cedente/tipo/referência, valor positivo, data civil válida e não vencida no calendário de São Paulo. Total somado com BigInt em centavos, limitado a NUMERIC(19,2), sem converter dinheiro para number. Datas e validações são aferidas novamente ao confirmar.
- Revisão mostra todos os campos de cada título e total do lote, esclarecendo imutabilidade após cadastro e ausência de liquidação automática. POST envia apenas `{ items: ReceivableInput[] }`; um GET do detalhe atualiza o cache após 201, sem refetch em cascata. Identificador e acesso ao detalhe permanecem na conclusão; ação explícita inicia outro lote.
- Bloqueio imediato de envio, AppLoader sobre o conteúdo e avisos centrais. Conflitos preservam o rascunho. Falha após 201 permite somente repetir GET. Falha de rede/servidor ou resposta incompatível deixa resultado incerto, bloqueia novo envio e exige consulta dos lotes e confirmação explícita antes de retomar a revisão. Não utiliza Idempotency-Key de liquidação para cadastro.
- O rascunho permanece em memória ao alternar entre Novo lote, lista e detalhe na área de Lotes; não há armazenamento persistente de dados financeiros. Sair da área, encerrar sessão ou recarregar descarta essa memória. O fluxo de importação permanece na task 09.
- Mocks validam o lote integralmente antes de armazenar, verificam cedentes e duplicidades entre lotes e retornam READY sem solicitação ativa. Cadastro e lotes usam o mesmo estado demonstrativo de cedentes, permitindo selecionar recém-cadastrados. Sem novas dependências ou patterns adicionais; reutilizados schemas, componentes, cliente HTTP e cache.

Verificação da task 08: tipagem, lint, build e 79 testes unitários aprovados. Os 36 cenários de demonstração/navegação passaram, incluindo reexecução dos quatro testes de cadastro após corrigir o seletor do campo obrigatório de vencimento; quatro testes de produção também passaram. Capturas de revisão desktop e edição em 320 px inspecionadas. Cobertura inclui limite de itens/total, calendário, duplicidades, lote misto, autorização, envio duplo, resultado incerto com preservação do rascunho e falha de GET após 201. O build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.

## Registro da task 09

- Novo lote oferece modos manual, CSV e CNAB, mantendo o cadastro manual existente. Upload acessível, limite de 5 MiB antes do envio, prévia explícita e tabela de revisão paginada. Arquivo permanece apenas na memória da área de Lotes até conclusão, descarte, troca de formato ou saída.
- Arquivo original segue em multipart tanto na prévia quanto na confirmação. Não há parser de negócio no frontend. Prévia inválida preserva linhas válidas somente para revisão; problemas por linha/campo e indicação de truncamento aparecem em modal. Nenhuma importação parcial é oferecida.
- Moedas CSV são somente leitura. CNAB inicia em BRL e permite BRL/USD por item; escolhas seguem em parte JSON separada, sem modificar o arquivo. Respostas atrasadas não substituem o arquivo/formato atual. Erro no cadastro definitivo invalida a prévia; resultado incerto e GET após 201 reutilizam as proteções da task 08.
- Mocks reconhecem exemplos determinísticos, incluindo fixture CNAB sintética identificada como demonstração. Arquivos próprios dependem do parser externo, conforme escopo acordado. Prévia não persiste; cadastro demonstrativo revalida o lote e suas duplicidades antes de salvar todos os itens como READY, sem liquidação.
- Reutilizados DataTable, paginação, AppLoader, modal central e mecanismo de cadastro. Nenhuma dependência ou pattern adicional. O mecanismo de envio existente passou a aceitar JSON manual ou FormData, evitando duplicar tratamento de aceite e falhas.

Verificação da task 09: tipagem, lint e 88 testes unitários aprovados, incluindo reexecução isolada de um teste que excedeu o tempo durante execução concorrente. Passaram 44 testes de demonstração/navegação e quatro de produção, totalizando 48 cenários de navegador. Cobertura de limite de arquivo/itens, resposta tardia, prévia inválida/truncada, preservação de moedas ao revalidar o mesmo arquivo, multipart, arquivo original, duplicidade no cadastro definitivo e ausência de persistência na prévia. Capturas desktop/celular inspecionadas, incluindo 320 px. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle; exemplos demonstrativos não entram no build real. `git diff --check` sem erros.


## Registro da task 10

- Simulação indicativa no rascunho manual e no detalhe, ativada explicitamente. Edições válidas posteriores usam debounce de 400 ms, cancelamento e descarte de respostas antigas; erro mantém valores anteriores identificados como desatualizados.
- Confirmação integral reutiliza AppDialog. POST sem body, chave de idempotência e bloqueio imediato. Rede/5xx/resposta inválida preservam a chave em memória da sessão, inclusive durante navegação. Consulta do lote precede repetição segura; conflito 409 reconcilia a operação ativa. Após falha definitiva, nova confirmação produz nova chave e simulação atualizada.
- Condições aceitas, resultado, falha, itens e histórico paginado separados da simulação. GET a cada cinco segundos, sem sobreposição; pausa com aba oculta, saída ou sessão inválida, retoma ao voltar e termina em SETTLED/FAILED. Aceite retira o loader global. Atualização dos itens após conclusão ocorre em segundo plano.
- Permissões mantêm simulação/solicitação exclusivas ao operador; gestor consulta condições aceitas. Valores monetários continuam strings, sem motor financeiro no frontend.
- Mocks compartilham estado de lotes e solicitações, com idempotência e resultado integral determinístico. Cenário financeiro suportado: uma duplicata de R$ 1.000,00, BRL, vencimento em 26/09/2026. Outros valores retornam erro; não representam cálculo real. Histórico/chaves são descartados com recarga da demonstração. Atomicidade transacional e integração real permanecem responsabilidades do backend/task 14.

Reutilizados transporte, QueryClient, AppDialog, AppLoader e tabelas. Separação direta de simulação, solicitação e acompanhamento evita misturar valores indicativos com resultados aceitos; nenhuma abstração de motor ou nova dependência foi introduzida.

Verificação da task 10: tipagem, lint, build e 93 testes unitários aprovados; os cinco testes novos foram reexecutados após os ajustes finais. Passaram 48 cenários de demonstração/navegação (incluindo reexecução dos quatro cenários da liquidação após ajustes no histórico) e quatro de produção, totalizando 52. Cobertura inclui debounce/resposta antiga, erro com dados desatualizados, POST sem body, duplo envio, chave preservada, 409, nova tentativa após FAILED e polling sem sobreposição com pausa/retomada. Confirmação e histórico validados em cinco ciclos, clique durante saída, Escape, foco restaurado e movimento reduzido. Capturas desktop/celular inspecionadas; ausência de transbordamento verificada em 320 px. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle. Sem novas dependências; `git diff --check` sem erros.


## Registro da task 11

- Câmbio implementado em `/cambio`, com cotação cadastrada, validade avaliada pelo servidor, referência independente e abas de propostas/cotações paginadas. Filtros ficam na URL; mudança de aba não consulta novamente o provedor.
- Operador propõe taxa absoluta positiva e justificativa. Incremento opcional usa BigInt com escala de 12 casas sobre a base capturada ao abrir o editor, sem ponto flutuante; taxa absoluta e justificativa são os únicos campos enviados. Permite primeira cotação manual mesmo sem base ou referência.
- Gestor distinto decide; ambos os papéis não permitem decidir a própria proposta. Rejeição exige justificativa. PATCH envia estado, versão e razão opcional; após sucesso, somente GET /exchange atualiza a visão. Aprovação não liquida lotes nem altera condições aceitas.
- Modais seguem AppDialog e preservam campos durante requisições. Duplo envio bloqueado imediatamente. Resposta incerta bloqueia repetição e oferece consulta; POST aceito com falha no GET libera apenas nova consulta. Conflito de decisão exige GET da proposta antes de revisão explícita; proposta já decidida não permite outro PATCH.
- Link do lote preserva UUID em `?lote=UUID`. Retorno explícito do operador ativa nova simulação; gestor retorna apenas à consulta. Não há polling cambial nem comunicação entre sessões.
- Mocks por sessão demonstrativa persistem propostas, versões, decisões e cotações em memória, compartilhando a cotação com novas simulações/snapshots. Snapshot aceito permanece imutável; os cálculos seguem o cenário fixo da task 10. Backend real, concorrência transacional e provedor externo permanecem na task 14.

Reutilizados cliente HTTP, cache, componentes de formulário/tabela/modal e guardas existentes. Hooks separam consulta, mutação e validação; nenhuma biblioteca ou abstração adicional foi necessária.

Verificação da task 11: tipagem, lint, build e 103 testes unitários aprovados. Passaram 54 cenários de demonstração/navegação e quatro de produção, totalizando 58; os seis cenários de câmbio foram reexecutados após ajuste visual final. Cobertura inclui soma exata/overflow, fronteira inclusiva de 24 horas, ausência de cotação, referência indisponível, POST/PATCH estritos, duplo envio, resposta incerta, autoaprovação com ambos os papéis, rejeição justificada, conflito de versão e proposta preservada após outra aprovação. Modais verificados em cinco ciclos, Escape, clique durante saída, restauração de foco e movimento reduzido. Capturas desktop/celular inspecionadas; largura de 320 px verificada sem transbordamento. O build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.


## Registro da task 12

- Extrato em `/extrato` com filtros explícitos de período, cedente e moeda; paginação controlada pelo usuário e acesso ao lote. Filtros incidem sobre itens liquidados, inclusive em lotes mistos. Seletor inclui cedentes inativos. Nenhuma edição de resultados é oferecida.
- Datas civis na URL são convertidas para UTC pelo calendário de São Paulo, com início inclusivo e fim exclusivo. Padrão de sete dias inclui hoje; limpar limites consulta todo o histórico. Validações locais impedem requests inválidas. Alterar página ou atualizar preserva rascunhos dos filtros.
- Dashboard em `/dashboard` com uma consulta agregada por período, totais financeiros, série diária densa e gráfico SVG acessível. BRL/USD possuem apresentação separada; trocar moeda não consulta o servidor. Tabela de valores diários fornece alternativa textual exata. Gráfico e datas se adaptam ao celular.
- Lotes por estado, propostas pendentes e cotação são indicadores globais, claramente separados do período financeiro. Atalhos respeitam os papéis. Falhas preservam o último resultado identificado como desatualizado, com erro no modal central; não são convertidas em totais zero.
- Mocks compartilham itens concluídos com extrato e agregação; pendências e falhas não geram resultados. Soma monetária demonstrativa e escala do gráfico usam BigInt. Cenário financeiro permanece fixo; banco e APIs reais pertencem à task 14.

Reutilizados transporte, cache, tabelas, FinancialTotals, seletor de cedentes e avisos existentes. Calendário compartilhado atende extrato e dashboard. Sem novas dependências ou patterns adicionais; consultas e apresentação permanecem separadas por responsabilidade.

Verificação da task 12: tipagem, lint, build e 112 testes unitários aprovados. Passaram 58 cenários de demonstração/navegação e quatro de produção, totalizando 62; os dez cenários de navegação foram reexecutados após ajustar a espera pelo carregamento inicial do dashboard. Cobertura inclui fronteiras de datas e horário de verão, filtros por item, moedas separadas, série densa, precisão da escala, consulta única por período, resultado anterior após falha e liquidação concluída refletida no extrato/dashboard. Capturas desktop/celular inspecionadas; larguras de 320 a 1920 px e texto ampliado verificados. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.


## Registro da task 13

- Entrada real com botão para Keycloak, sem coletar senha na UI. Adaptador oficial `keycloak-js` 26.2.4 usa Authorization Code + PKCE S256, state e nonce. Configuração segue o realm existente, na mesma origem do gateway, com retorno de login/logout na raiz.
- Inicialização ocorre antes do roteador, uma vez por sessão, inclusive em StrictMode. Callback consome destino local com validade de dez minutos e remove parâmetros OIDC. Retorno inválido mantém entrada recuperável e apresenta aviso central em português.
- Access/refresh tokens somente em memória. Registro temporário de protocolo é responsabilidade do adaptador; sessionStorage da aplicação contém somente destino e instante. Identidade/papéis são validados em execução e derivados do token, sem perfis demonstrativos no modo real.
- Renovação antecipada e antes de chamadas HTTP, compartilhada entre requisições concorrentes. Não bloqueia tela nem invalida cache enquanto identidade/papéis permanecem iguais. Saída, expiração e mudança de permissões cancelam operações anteriores e limpam caches. Respostas atrasadas não restauram sessão; inicialização/renovação possuem limite de quinze segundos.
- Logout limpa acesso local e encaminha ao encerramento SSO. Acesso negado também oferece saída para permitir troca de conta. Não há repetição automática de operações financeiras em 401. Recarga exige novo clique de entrada e pode aproveitar SSO; logout em outra aba é percebido na próxima renovação.
- Reutilizados sessão, cliente HTTP, guards, loader e avisos existentes. O adaptador evita reimplementar o protocolo e mantém o provedor separado do contrato de sessão. Documentação de execução/testes atualizada. Validação de assinatura JWT e autorização no engine continuam na task 14.

Verificação: tipagem, lint, build e 120 testes unitários aprovados; oito testes de OIDC reexecutados após ajustes finais. Passaram 58 cenários demonstrativos, dez de produção/protocolo e quatro contra a entrada real do Keycloak, totalizando 72 testes de navegador. Testes contratuais usam o adaptador real com provedor simulado, validando PKCE, state, nonce, Bearer, renovação e falha de refresh. Entrada real confirma cliente, redirect URI e desafio PKCE aceitos pelo provedor, sem autenticar usuários. Capturas da entrada desktop/celular inspecionadas. Avisos existentes do Zod e tamanho do bundle permanecem não bloqueantes; `git diff --check` sem erros.

Na verificação inicial, os quatro cenários autenticados contra Keycloak real (operador/gestor em desktop/celular) aguardavam autorização para uso das credenciais locais. Após autorização explícita, os quatro cenários passaram; as senhas não foram exibidas nem registradas. Permanecem pendentes os testes reais de renovação e logout.


## Registro da task 14

> Atualização em 27/09/2026: o estado histórico abaixo descreve a inspeção anterior ao engine. As APIs H.1–H.8 foram implementadas neste ciclo; consulte [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md) e [ENGINE_TASKS.md](ENGINE_TASKS.md) para o estado e as verificações atuais.

A consulta ao OpenAPI local confirmou `paths: {}`; inspeção do código confirmou ausência de endpoints de negócio, persistência e consumer financeiro. A implementação dessas APIs é dependência externa definida no backlog. Nenhum mock foi apresentado como API real e nenhum contrato de serviço foi inventado. Matriz por domínio e retomada estão no [registro de integração](FRONTEND_INTEGRATION.md).

Foram corrigidas duas divergências preparatórias com a SPEC: acompanhamento consulta somente GET do lote, assumindo a operação ativa retornada e preservando controle de concorrência; extrato oferece páginas de 20/50/100 itens, com uma consulta explícita e retorno à página 1 ao mudar tamanho. Mocks acompanham a nova consulta do lote; nenhum backend foi alterado. Sem novas dependências ou patterns.

Verificação preparatória da task 14: tipagem, lint, build e 121 testes unitários aprovados. Oito cenários de navegador aprovados em desktop/celular, cobrindo consulta exclusiva do lote durante pendência, conclusão refletida no extrato/dashboard e seleção explícita de 100 itens. Captura do extrato inspecionada; largura de 320 px verificada. Permanecem os avisos não bloqueantes existentes do Zod e tamanho do bundle. `git diff --check` sem erros. Essas evidências usam mocks e não comprovam integração real.


## Registro da task 15

> Atualização em 27/09/2026: Playwright Chrome aprovou 58/58 cenários isolados, 10/10 regressões de produção e 4/4 cenários autenticados no gateway/Keycloak em desktop/celular. Refresh/logout reais e conclusão financeira permanecem pendentes; o consumer do worker está fora do escopo desta entrega.

Configurada CI GitHub Actions para qualidade e três suítes de navegador, com Node 22, instalação pelo lockfile, Chromium, permissões de leitura e artefatos separados. Sem publicação ou execução remota nesta etapa. Testes demonstrativos passam a iniciar na data das fixtures e avançam normalmente; calendário de produção permanece intacto. Testes unitários fixam somente a data por padrão, mantendo testes explícitos de timers.

Navegador configurado em português e fuso diferente de São Paulo. Reforçada a verificação de foco após atualizar e limpar filtros. A [documentação de homologação](FRONTEND_ACCEPTANCE.md) distingue evidências locais, mocks, OIDC contratual, entrada real e critérios bloqueados por backend/credenciais. Nenhuma dependência nova nem pattern adicional. Aceite integrado não foi declarado concluído.

A revisão visual encontrou perda de foco após trocar o tamanho da página. A falha foi reproduzida por teste de teclado e corrigida no provedor comum: preservar o controle de origem quando o foco passa por opções temporárias de menus/listas. Teste do extrato agora exige foco correto após atualizar, limpar filtros e alterar tamanho.

Verificação final da task 15: tipagem, lint, build e 121 testes unitários aprovados. Após a correção de foco, passaram 80 cenários Chromium: 58 demonstrativos, 12 de componentes e dez de produção/OIDC contratual, em desktop e celular. Fluxos incluem cinco ciclos de modais/combobox, teclado, retorno de foco, zoom 200%, movimento reduzido, larguras de 320 a 1920 px e consultas no fuso de São Paulo com navegador em Los Angeles. Capturas de extrato e modal inspecionadas. Workflow validado como YAML; CI remota não executada. `git diff --check` sem erros. Avisos conhecidos do Zod e tamanho do bundle permanecem; homologação integrada continua bloqueada pelas tasks 13/14.


## Registro da task 16.1 — Contratos e estados por título

- Schemas executáveis agora separam estados do lote, da solicitação, da tentativa e do título. Incluem contagens agregadas, `PARTIALLY_SETTLED`, resultados/totais realizados e falhas por título; refinamentos rejeitam contagens, flags, resultados, condições e transições incompatíveis.
- Contratos de lote e liquidação deixaram de depender circularmente um do outro. O estado de concorrência interno do título não é exposto no contrato HTTP; `progressVersion` continua no lote para acompanhamento agregado.
- Fixtures e handlers preservam tentativas/resultados por item, atualizam contagens e incluem o novo estado nas listas/dashboard. O cenário misto e progressivo foi acrescentado na task 16.2; reprocessamento explícito permanece para uma task posterior.
- A tela de solicitação mostra progresso e totais realizados e não descreve falha individual como rollback do lote. A ação legada de repetir o lote inteiro após falha foi bloqueada; a seleção explícita de falhos e justificativa será implementada em task posterior.
- Nenhuma dependência nova nem pattern adicional. Reutilizados Zod, schemas compartilhados, QueryClient e componentes atuais.

Verificação da task 16.1: tipagem, lint, build de produção e 126 testes unitários aprovados. Avisos existentes do Zod e do tamanho do bundle permanecem não bloqueantes; `git diff --check` sem erros. Mocks não comprovam API real nem processamento financeiro.


## Registro da task 16.2 — Cenário parcial nos mocks

- Mocks de simulação e liquidação aceitam até 1.000 títulos do cenário financeiro demonstrativo fixo, com valores ainda representados como strings e multiplicados por centavos com `BigInt`.
- O resultado parcial determinístico liquida nove de dez títulos após o primeiro ciclo de acompanhamento, mantém um título pendente e conclui esse título com falha no ciclo seguinte. O histórico da solicitação, a flag/erro do título, os totais realizados, o estado agregado do lote e `progressVersion` permanecem coerentes.
- Os nove sucessos aparecem no extrato e nos agregados do dashboard mesmo enquanto o décimo título aguarda. Solicitações novas sobre lote `FAILED` ou `PARTIALLY_SETTLED` exigem seleção explícita em vez de repetir o lote inteiro.
- Reutilizados os handlers MSW e schemas existentes; nenhuma dependência nova. O cenário valida a UI contra mocks, não confirma comportamento de API ou worker reais.

Verificação da task 16.2: tipagem, lint, build de produção e 127 testes unitários aprovados; `git diff --check` sem erros. Permanecem os avisos conhecidos do Zod e do tamanho do bundle.


## Registro da task 16.3 — Detalhe do lote com resumo, abas e auditoria

- O detalhe mantém resumo operacional, contagens e totais realizados fora das abas, para que permaneçam visíveis ao alternar entre títulos, solicitações e auditoria. A aba selecionada e a paginação da auditoria ficam na URL; a paginação dos títulos continua preservada.
- Títulos mostram o estado textual e a flag acessível de erro. “Consultar motivo da falha” abre modal com mensagem, etapa, horário e código, com acesso direto à aba de auditoria. O modal permanece montado durante a saída e usa o ciclo acessível comum de foco.
- A auditoria paginada é consultada somente quando a aba é selecionada e apresenta evento, responsável, título, horário e detalhes permitidos pelo contrato. Mocks agora fornecem eventos de cadastro, solicitação, aceite de tentativa, sucesso e falha para a demonstração.
- Os painéis permanecem montados durante a troca de abas, preservando seleção local, modal e estados de interação. Polling continua restrito ao lote e seus recebíveis; não há recarga, remount ou consulta da auditoria a cada ciclo.
- O erro abre e fecha em cinco ciclos consecutivos; um clique disparado durante a saída não reabre o modal.
- Reutilizados `AppDialog`, `DataTable`, `FinancialTotals`, schemas Zod e infraestrutura de query existente; nenhuma dependência ou pattern nova.

Verificação da task 16.3: tipagem, lint, build de produção e 129 testes unitários aprovados; `git diff --check` sem erros. O build mantém os avisos conhecidos de anotação do Zod e do tamanho do bundle. Os testes de navegador não rodaram porque o executável Chromium exigido pelo Playwright não está instalado neste ambiente.


## Registro das tasks 16.4–16.9 — Reprocessamento seletivo e integração frontend

- **16.4 — Serviço e intenção idempotente:** o contrato normaliza e ordena UUIDs, remove espaços externos da justificativa e rejeita duplicados. O controller cria uma chave por nova confirmação e preserva exatamente chave, seleção e justificativa após incerteza; oferece repetição explícita ou reconciliação e consulta a solicitação persistida em `422 NENHUM_TITULO_APTO`.
- **16.5 — Seleção e confirmação:** operadores selecionam apenas títulos `FAILED` já consultados, mantendo a seleção válida ao paginar e alternar abas. A página visível remove seleções cujo estado/tentativa mudou; a intenção de rede incerta permanece imutável. A confirmação apresenta referências e UUIDs, exige justificativa, mostra simulação indicativa das novas condições e não substitui a validação do backend. Gestores mantêm somente acesso de consulta.
- **16.6 — Polling:** enquanto pendente, consulta o lote a cada cinco segundos. Uma mudança de `progressVersion` atualiza somente a página de títulos visível, com no máximo uma consulta adicional por ciclo, preservando paginação e estados locais. O acompanhamento suspende em aba oculta, saída ou sessão inválida e não usa bloqueio global.
- **16.7 — Extrato e dashboard:** adicionados testes de tela para títulos já liquidados durante processamento parcial, totais BRL/USD separados, cinco contagens globais e ausência de nova consulta ao alternar moeda. Os serviços existentes já faziam a agregação requerida.
- **16.8 — Mocks:** handlers verificam fingerprint global por lote, modalidade, seleção ordenada e justificativa normalizada; rejeitam reutilização de chave com outra intenção, títulos não falhos e conflitos pendentes. Tentativas, vínculos, auditoria, sucessos anteriores, totais e `progressVersion` permanecem coerentes.
- **16.9 — Cache, documentação e verificação:** a atualização local do lote reconcilia deltas de solicitações, totais decimais e replay histórico sem duplicar resultados. Documentação de aceite separa claramente evidência de mocks de integração real.

Verificação final das tasks 16.4–16.9: 39 arquivos de teste e 151 testes unitários passaram; typecheck, lint, build e `git diff --check` passaram. O build mantém os avisos conhecidos do Zod e do tamanho do bundle. Os testes E2E não foram executados porque o Chromium do Playwright não está instalado neste ambiente. As verificações demonstrativas não validam API real, banco, Kafka, motor financeiro ou auditoria persistida.
