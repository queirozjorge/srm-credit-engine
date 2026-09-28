# AI_USAGE — Colaboração com IA

**Registro iniciado em 25/09/2026.** As seções datadas abaixo preservam a cronologia do trabalho e descrevem o estado observado em cada etapa; não representam, por si só, o estado atual do repositório.

Este documento registra decisões e evidências de colaboração. Deve ser atualizado com fatos verificáveis durante a implementação, sem incluir o histórico integral das sessões ou apresentar resultados planejados como executados.

## 1. Uso realizado até agora

O assistente Codex foi utilizado para comparar o desafio com SPEC.md, AGENTS.md e README.md, identificar aderência ao nível Sênior e apontar riscos de escopo e convenções excessivamente rígidas. Em seguida, foi utilizado para registrar as decisões aprovadas pelo responsável pelo projeto e preparar a documentação complementar.

Na etapa seguinte, criou as estruturas modulares de `spe-j-engine` e `spe-j-workflow`, os builds Maven independentes, Maven Wrapper e configurações YAML. Após o esclarecimento de que os projetos deveriam iniciar localmente, adicionou somente as classes de inicialização Spring Boot e habilitou Swagger vazio em ambos. Nenhum endpoint ou regra de negócio foi implementado.

Depois criou a base `ui-r-credit`, com React, Vite, Material UI, TypeScript estrito, ESLint e dependências fixadas em lockfile. Reservou pastas por domínio e adicionou apenas inicialização, tema, textos centralizados em português brasileiro, apresentação de carregamento e tela inicial provisória. Não implementou autenticação, chamadas HTTP ou operações financeiras.

## 2. Orientações estratégicas

Síntese das instruções fornecidas nesta etapa:

- Avaliar as diretrizes e a documentação contra os critérios do desafio Sênior.
- Manter engine e worker separados para permitir escalar o processamento de cálculos e liquidações independentemente da API, documentando a justificativa e o uso de Kafka.
- Remover a obrigação de `builder(...)` e a proibição de injeção por construtor.
- Preservar a estrutura atual da SPEC e pré-criar os demais documentos exigidos.

As instruções de implementação estão em [AGENTS.md](AGENTS.md), os contratos em [SPEC.md](SPEC.md) e as decisões em [DECISIONS.md](DECISIONS.md).

## 3. Decisões mantidas sob responsabilidade humana

O responsável pelo projeto decidiu manter a separação entre engine e worker e o formato da SPEC após a análise da IA. Também aprovou a flexibilização das regras de instanciação e injeção.

As políticas financeiras e de segurança permaneceram sob decisão humana: fórmula, prazos, precisão e arredondamento; validade e aprovação cambial; liquidação independente por título, sucesso parcial e limites do reprocessamento; papéis, identidade autenticada, proibição de autoaprovação e dados permitidos em logs. Essas decisões definem exposição financeira, integridade dos registros e autoridade de cada usuário. A IA ajudou a comparar alternativas, apontar consequências e traduzir decisões em contratos e implementação; não foi tratada como fonte de política ou aprovadora. O responsável avaliou e aprovou a decisão final, mantendo a responsabilidade pelo domínio e pelos controles de segurança.

## 4. Erro concreto da IA e como foi detectado

Na revisão de infraestrutura, Codex afirmou inicialmente que `infra/kafka/create-topics.sh` ainda criava `credit-lot`. A leitura direta do script refutou a afirmação: ele já cria `credit-receivable` e `credit-receivable.dlq`. A referência desatualizada estava em `infra/scripts/infra-smoke-test.py`, que ainda esperava `credit-lot` e `credit-lot.dlq`.

O erro poderia levar a uma edição desnecessária do script correto e ocultar a divergência real: a verificação de infraestrutura rejeitaria o tópico atual ou validaria um nome legado, dando diagnóstico incorreto sobre o broker e o contrato do worker. A evidência detectora foi comparar diretamente os dois arquivos e localizar os nomes configurados em cada um. A expectativa do smoke test foi corrigida em `infra/scripts/infra-smoke-test.py` para `credit-receivable` e `credit-receivable.dlq`, mantendo o script de criação alinhado ao contrato vigente. A alteração está aplicada; sua verificação permanece pendente e não é alegada nesta seção.

## 5. Verificações da implementação — registros históricos

Os resultados a seguir pertencem às etapas e datas registradas. Não são uma execução atual nem uma declaração de que todos os critérios do desafio estejam comprovados hoje.

Verificações executadas nesta etapa:

- `./mvnw verify` concluído com sucesso nos dois projetos, usando JDK 21.0.10 e caches temporários de dependências. Os JARs executáveis foram gerados; ainda não há casos de teste implementados.
- Inicialização dos dois JARs em localhost, engine na porta 8080 e workflow na 18081, sem PostgreSQL ou Kafka em execução como requisito.
- Swagger UI, CSS, JavaScript e configuração OpenAPI responderam HTTP 200 em ambos.
- `/v3/api-docs` retornou `paths: {}` em ambos, confirmando ausência de operações documentadas. `/batches` retornou HTTP 404.

Golden cases, concorrência, rollback e recuperação estão previstos na SPEC, mas ainda não foram executados. Essas verificações da estrutura inicial não representam cobertura funcional.

Verificações do frontend:

- `npm run typecheck`, `npm run lint` e `npm run build` concluídos com sucesso em Node.js 20.20.2.
- `package.json` e `package-lock.json` conferidos quanto à consistência das dependências e requisitos de Node.
- Tela inicial inspecionada no navegador em 1440 × 900 e 375 × 812. No tamanho móvel, a largura do conteúdo permaneceu em 375 px, sem transbordamento horizontal.
- Título da página e idioma `pt-BR` conferidos; nenhum erro ou aviso capturado no console durante essa inspeção.
- Servidor Vite iniciado em localhost:5174, sem dependência dos backends. Não foram adicionados testes automatizados de funcionalidades ainda inexistentes.

## 6. Task 01 do frontend — 26/09/2026

O responsável aprovou desenvolvimento com mocks antes da integração real, preservação da identidade do wireframe em Material UI e cadastro/edição de cedentes também pelo gestor. Codex alinhou a matriz de permissões, documentou contratos no anexo H da SPEC e registrou as 12 telas, dependências das 15 tasks e cenários em um backlog histórico de frontend (o arquivo `docs/FRONTEND_TASKS.md` não está presente nesta fotografia do repositório).

A revisão cruzou o HTML/JavaScript do protótipo, SPEC e DATABASE: UUIDs substituem códigos demonstrativos, documento do cedente permanece imutável e a proposta cambial persiste taxa absoluta. Os contratos novos estão identificados como ainda não implementados. A task não adicionou tipos executáveis, dependências, testes funcionais ou endpoints; essas entregas permanecem nas próximas tasks.

Validação documental: links locais/âncoras, cobertura dos 12 IDs de tela, identificação/estado das 15 tasks e formatação das tabelas Markdown. A preservação dos anexos D/E foi conferida contra a revisão Git anterior. `git diff --check` sem erros. Essas verificações não comprovam comportamento da aplicação.

## 7. Task 02 do frontend — 26/09/2026

Codex instalou as dependências aprovadas no backlog, conectou BrowserRouter e os provedores de tema/consultas e configurou Vitest, Testing Library, MSW para testes e Playwright. Versões existentes de React/Vite/MUI foram preservadas; versões novas foram fixadas no lockfile, mantendo compatibilidade com Node 20.20.2 utilizado na validação. Zod está disponível; schemas e mocks de negócio ainda não foram implementados.

Verificações: tipagem e lint passaram; quatro testes Vitest passaram; o Playwright construiu o frontend e passou dois testes de abertura da aplicação em Chromium desktop e móvel, sem erros de console/página ou overflow horizontal. Manifesto e lockfile conferidos. O sandbox bloqueou inicialmente o preview local; execução autorizada com permissão ampliada concluiu a verificação. Navegadores de teste foram baixados em `/private/tmp/srm-credit-playwright`, sem adicionar binários ao repositório.

Os testes de consultas verificam deduplicação/cache, ausência de retries de consulta/mutação e de refetch por foco/reconexão, mantendo refetch explícito. MSW está restrito à infraestrutura de testes, sem Service Worker na aplicação. Não houve implementação de autenticação, regras financeiras ou telas de negócio nesta task.

## 8. Task 03 do frontend — 26/09/2026

Codex implementou tema, cabeçalho, menu responsivo, rotas e memória de navegação, com textos centralizados e áreas reservadas para as próximas tasks. A tela inicial anterior foi substituída pelo shell; nenhuma identidade ou operação financeira foi simulada. Sessão e guards ainda não existem; entrada/retorno são apresentações iniciais.

Verificações: tipagem, lint, build e 15 testes Vitest aprovados; 12 testes Playwright aprovados em Chromium desktop/móvel. Cobertura inclui endereços diretos, histórico, query strings/scroll, cinco ciclos de menu, Escape/foco, larguras de 320 a 1920 px, movimento reduzido e texto ampliado a 200% com viewport reduzida. Capturas foram inspecionadas visualmente. A verificação não equivale a auditoria completa de acessibilidade nem a testes financeiros.

Os testes detectaram deslocamento de scroll durante fechamento do menu móvel; o shell passou a desativar scroll anchoring. A inspeção visual também encontrou largura residual do Collapse após mudança desktop/móvel; a largura móvel explícita e um teste de regressão corrigiram o problema. Nenhuma dependência nova foi instalada nesta task.

## 9. Task 04 do frontend — 26/09/2026

Codex implementou os componentes comuns de carregamento, avisos, modal, tabela/paginação e campos/formatadores, reutilizando MUI e a composição de provedores existente. Não foram introduzidos patterns adicionais ou dependências: componentes controlados e funções puras resolvem a reutilização sem novas camadas. Dinheiro permanece em strings; validação financeira e de documentos definitiva continua no domínio/servidor.

Verificações: tipagem, lint, build e 22 testes Vitest passaram; 12 testes Playwright de componentes e 12 de navegação passaram em desktop/celular. Cobertura inclui cinco ciclos de modal/combobox, Escape/foco, clique durante saída, movimento reduzido, operações simultâneas, liberação idempotente, preservação de edição, precisão decimal, salto de página e rolagem interna em 320 px. Fixture e capturas são recursos de teste; não simulam integração com APIs ou garantias financeiras.

## 10. Task 05 do frontend — 26/09/2026

Codex implementou cliente HTTP e schemas Zod por domínio, sessão demonstrativa em memória, guards/permissões e mocks MSW ativados explicitamente em desenvolvimento. O cliente recebe dependências de sessão/notificação; funções e componentes existentes foram reutilizados, sem nova dependência ou camadas de patterns artificiais. O modo real não recebe perfis fictícios; o build exclui worker e handlers.

A demonstração inclui consultas, cadastro/edição de cedentes e simulação fixa. Fluxos financeiros completos seriam ampliados nas tasks correspondentes; mocks não comprovam validação JWT, transações PostgreSQL, parsing CNAB ou cálculo financeiro real. Os limites e comandos foram registrados no guia histórico `docs/FRONTEND_HTTP.md`, que não está presente nesta fotografia do repositório.

Tipagem, lint, build e 55 testes unitários aprovados. Playwright aprovou 16 testes de demonstração/navegação e quatro do build real, em desktop/celular. Cobertura inclui permissões, ausência de papel, autoaprovação, HTTP de erro, timeout/cancelamento, 204, upload, idempotency header, expiração com aviso, cache entre identidades, conflitos e inicialização dos mocks com falha/retentativa. Capturas do acesso demonstrativo foram inspecionadas. Foram corrigidas sincronizações dos testes com a conclusão do bootstrap e com a troca de breakpoint.

Build concluído com avisos de comentários de dependência Zod e bundle principal de 560,50 kB (176,60 kB gzip); não há falha de compilação. A divisão de código poderá ser avaliada conforme as telas funcionais forem adicionadas.

A regressão dos componentes também passou: 12 testes Playwright, totalizando 32 testes de navegador nesta entrega. `git diff --check` sem erros.

## 11. Task 06 do frontend — 26/09/2026

Codex implementou a tela de cedentes com lista, pesquisa por nome/CNPJ, filtro de ativos, paginação, detalhe e formulários de cadastro/edição para operador e gestor. A seleção do detalhe usa query string; lista e estado de navegação permanecem preservados. CNPJ recebe máscara, validação local e bloqueio de edição após cadastro.

A validação de dígitos utiliza o manual técnico da Receita Federal, referenciado no backlog, incluindo exemplo numérico e alfanumérico. Ela não comprova existência cadastral; o servidor continua responsável por integridade e unicidade. O handler demonstrativo também valida os dados de entrada e mantém conflito por documento/versão.

Cada envio aceito executa uma mutação e uma consulta dos dados afetados. Falha na consulta posterior não libera um novo envio da mutação; o usuário pode repetir somente a atualização. Conflitos mantêm o rascunho e permitem consultar/comparar a versão atual antes de salvar novamente. Sucesso e erro usam o modal central; formulários permanecem abertos para conferência.

Testes revelaram perda de foco ao sobrepor um aviso ao loader e ao formulário. O provedor comum passou a capturar o foco antes do bloqueio e aguardar a saída do loader antes de apresentar o aviso. A correção foi verificada em cinco ciclos dos formulários de cadastro e edição, incluindo Escape e clique durante a saída. O modal comum também permite bloquear fechamento durante envio e destacar visualmente o botão de salvar.

Verificações: tipagem, lint, build e 60 testes unitários passaram. Playwright aprovou 26 testes de demonstração/navegação, 12 de componentes e quatro do build real, totalizando 42. Cobertura inclui requisições por envio, duplicidade, conflito de versão, consulta de inativo, 404, falha de refetch após gravação, paginação/scroll, teclado/foco, modais e responsividade. Capturas de lista, lista paginada e detalhe foram inspecionadas em desktop/celular. Não foram adicionadas dependências. A integração com o backend real permanece na task 14.

O build mantém avisos do Zod e de tamanho do bundle, sem falha de compilação. `git diff --check` sem erros.

## 12. Task 07 do frontend — 26/09/2026

Codex implementou lista e consulta de lotes em React/Material UI: pesquisa explícita, filtro de estado, paginação, detalhe e recebíveis com paginação independente. Lotes mistos mantêm os totais completos quando filtrados por um cedente. A lista permanece montada nas rotas filhas para preservar campos, paginação e rolagem ao retornar. Erros usam o modal central; valores monetários continuam strings.

Foram reutilizados os componentes, transporte, validação e cache existentes, sem novas dependências. A verificação em navegador identificou o início redundante de uma consulta cancelada pelo ciclo de montagem do StrictMode; as consultas do domínio agora aguardam esse ciclo e verificam cancelamento antes de abrir a conexão. As próximas tasks continuam responsáveis por cadastro, importação e liquidação; a integração real permanece na task 14.

Verificação da task 07: tipagem, lint, build e 68 testes unitários aprovados. Os 32 cenários de demonstração/navegação passaram, incluindo reexecuções direcionadas após correções; os quatro testes do build real também passaram. Capturas de lista e detalhe foram inspecionadas em desktop/celular, incluindo 320 px. O build mantém avisos não bloqueantes de comentários do Zod e bundle maior que 500 kB. `git diff --check` sem erros.

## 13. Task 08 do frontend — 26/09/2026

Codex implementou cadastro manual de lotes com seleção paginada de cedentes ativos, edição de recebíveis, revisão completa e confirmação. As validações locais verificam limites, identidade composta, vencimento em São Paulo e valores/totais precisos em centavos com BigInt. Backend permanece autoridade final.

Envio faz um POST e um GET do detalhe, sem liquidação automática. Resultado incerto bloqueia repetição até consulta dos lotes e retomada explícita; erro após 201 libera somente GET. Rascunho permanece em memória ao navegar dentro da área de Lotes, sem armazenamento persistente. Foram reutilizados componentes, schemas, HTTP, cache e padrões existentes, sem novas dependências. Os mocks agora aceitam cadastro integral e compartilham o estado de cedentes no contexto demonstrativo.

Verificação da task 08: tipagem, lint, build e 79 testes unitários aprovados. Os 36 cenários de demonstração/navegação passaram, incluindo reexecução dos quatro testes de cadastro após corrigir o seletor do campo obrigatório de vencimento; quatro testes de produção também passaram. Capturas de revisão desktop e edição em 320 px inspecionadas. Cobertura inclui limite de itens/total, calendário, duplicidades, lote misto, autorização, envio duplo, resultado incerto com preservação do rascunho e falha de GET após 201. O build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.

## 14. Task 09 do frontend — 26/09/2026

Codex implementou interface CSV/CNAB com upload, prévia, revisão de moedas CNAB, problemas por linha e bloqueio de cadastro parcial. O arquivo original segue ao serviço nas duas etapas; o frontend não implementa parser bancário. Mocks utilizam exemplos determinísticos e uma fixture CNAB sintética, identificados na tela como demonstração.

A entrega reutiliza componentes, cliente HTTP, schemas e proteções do cadastro manual. Troca de arquivo/formato invalida prévia/moedas e cancela respostas antigas. Aceite libera o arquivo e consulta apenas o detalhe; falha posterior libera somente GET. Rejeição definitiva exige nova prévia e resultado incerto preserva arquivo para consulta antes de repetição explícita.

A validação visual encontrou transbordamento causado pelo cabeçalho CSV sem espaços; a quebra de texto foi corrigida. O modal de problemas foi verificado em cinco ciclos, com Escape, clique durante saída e restauração de foco. Sem novas dependências; o parser real permanece responsabilidade externa e a integração de negócio permanece na task 14.

Verificação da task 09: tipagem, lint e 88 testes unitários aprovados, incluindo reexecução isolada de um teste que excedeu o tempo durante execução concorrente. Passaram 44 testes de demonstração/navegação e quatro de produção, totalizando 48 cenários de navegador. Cobertura de limite de arquivo/itens, resposta tardia, prévia inválida/truncada, preservação de moedas ao revalidar o mesmo arquivo, multipart, arquivo original, duplicidade no cadastro definitivo e ausência de persistência na prévia. Capturas desktop/celular inspecionadas, incluindo 320 px. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle; exemplos demonstrativos não entram no build real. `git diff --check` sem erros.


## 15. Task 10 do frontend — 26/09/2026

Codex implementou simulação indicativa, confirmação integral, chave de idempotência, reconciliação, acompanhamento, condições aceitas e histórico. Foram reutilizados componentes e serviços existentes, sem novas dependências ou motor financeiro no cliente. Hooks separados mantêm responsabilidades coesas; FinancialTotals passou a atender simulação e liquidação.

Mocks agora compartilham estado de lotes e solicitações e respeitam repetição de chave. O cenário financeiro continua fixo e explicitamente limitado; a implementação não comprova liquidação real nem atomicidade transacional. Chaves ficam em memória por sessão e sobrevivem à navegação, mas não à recarga. Integração com o backend permanece na task 14.

Verificação da task 10: tipagem, lint, build e 93 testes unitários aprovados; os cinco testes novos foram reexecutados após os ajustes finais. Passaram 48 cenários de demonstração/navegação (incluindo reexecução dos quatro cenários da liquidação após ajustes no histórico) e quatro de produção, totalizando 52. Cobertura inclui debounce/resposta antiga, erro com dados desatualizados, POST sem body, duplo envio, chave preservada, 409, nova tentativa após FAILED e polling sem sobreposição com pausa/retomada. Confirmação e histórico validados em cinco ciclos, clique durante saída, Escape, foco restaurado e movimento reduzido. Capturas desktop/celular inspecionadas; ausência de transbordamento verificada em 320 px. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle. Sem novas dependências; `git diff --check` sem erros.


## 16. Task 11 do frontend — 26/09/2026

Codex implementou cotação, referência independente, propostas, decisões e histórico de câmbio. Reutilizou componentes, transporte, cache e permissões existentes. Incremento opcional é somado com BigInt; valores permanecem strings e o body contém a cotação absoluta. Sem novas dependências.

Criação e decisão atualizam somente a visão cambial, sem repetir consulta do provedor. Autoaprovação é bloqueada por identidade, inclusive para ambos os papéis. Rejeição exige justificativa; versão concorrente exige consulta antes de nova tentativa explícita. Resposta incerta preserva campos e impede repetição automática. Retorno ao lote refaz simulação apenas para operador e não solicita liquidação.

Mocks compartilham cotações com novas simulações e snapshots, mantendo condições aceitas intactas. Persistência real, autenticação do backend, integridade transacional e provedor real permanecem fora desta entrega, na task 14.

Verificação da task 11: tipagem, lint, build e 103 testes unitários aprovados. Passaram 54 cenários de demonstração/navegação e quatro de produção, totalizando 58; os seis cenários de câmbio foram reexecutados após ajuste visual final. Cobertura inclui soma exata/overflow, fronteira inclusiva de 24 horas, ausência de cotação, referência indisponível, POST/PATCH estritos, duplo envio, resposta incerta, autoaprovação com ambos os papéis, rejeição justificada, conflito de versão e proposta preservada após outra aprovação. Modais verificados em cinco ciclos, Escape, clique durante saída, restauração de foco e movimento reduzido. Capturas desktop/celular inspecionadas; largura de 320 px verificada sem transbordamento. O build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.


## 17. Task 12 do frontend — 26/09/2026

Codex implementou extrato paginado e dashboard agregado com Material UI, reutilizando componentes, cache, transporte e permissões. Filtros do extrato operam por item, com datas no calendário de São Paulo e limites inclusivo/exclusivo. O dashboard consulta o agregado por período; alternar BRL/USD não gera requisição. Gráfico SVG responsivo possui descrição acessível e tabela diária alternativa, sem nova biblioteca.

Falhas preservam resultados anteriores identificados como desatualizados. Valores monetários permanecem strings; BigInt permite somas demonstrativas e proporções gráficas sem perda monetária. Indicadores globais são separados dos totais do período. Mocks compartilham somente itens de liquidações concluídas; não comprovam persistência, agregação SQL ou atomicidade reais. Integração permanece na task 14.

Verificação da task 12: tipagem, lint, build e 112 testes unitários aprovados. Passaram 58 cenários de demonstração/navegação e quatro de produção, totalizando 62; os dez cenários de navegação foram reexecutados após ajustar a espera pelo carregamento inicial do dashboard. Cobertura inclui fronteiras de datas e horário de verão, filtros por item, moedas separadas, série densa, precisão da escala, consulta única por período, resultado anterior após falha e liquidação concluída refletida no extrato/dashboard. Capturas desktop/celular inspecionadas; larguras de 320 a 1920 px e texto ampliado verificados. Build mantém avisos não bloqueantes do Zod e de tamanho do bundle. `git diff --check` sem erros.


## 18. Task 13 do frontend — 26/09/2026

Codex implementou integração Keycloak com o adaptador oficial `keycloak-js` 26.2.4, PKCE S256, state/nonce, callback na raiz, Bearer, renovação e logout. Reutilizou sessão, guards, transporte e componentes existentes. Renovação mantém cache/estado quando identidade e papéis não mudam; invalidação cancela requisições e remove dados da sessão anterior. Tokens ficam em memória, sem armazenamento persistente pela aplicação. A escolha do adaptador evita implementar OAuth/OIDC manualmente; documentação oficial referenciada no guia HTTP.

Verificação: tipagem, lint, build e 120 testes unitários aprovados; oito testes OIDC reexecutados após ajustes finais. Passaram 72 cenários de navegador: 58 demonstrativos, dez de produção/protocolo e quatro de abertura real do login/callback inválido. Testes contratuais usam um provedor simulado sem credenciais; os testes de entrada real confirmam aceitação do cliente/redirect URI/PKCE no Keycloak local. Capturas desktop/celular inspecionadas. Avisos não bloqueantes de Zod/bundle existentes preservados; `git diff --check` sem erros.

A revisão automática rejeitou leitura de senhas demonstrativas do ambiente do container, exigindo autorização explícita. A autorização foi solicitada; credenciais não foram lidas, exibidas ou gravadas. Permanecem pendentes os quatro cenários autenticados de operador/gestor contra Keycloak real. Suíte opcional está pronta, sem trace/vídeo; não foi alegada homologação da sessão real nem segurança do backend, cuja implementação permanece na task 14.


## 19. Task 14 do frontend — 26/09/2026

Codex verificou as fontes do engine/worker e consultou o OpenAPI local, que retornou `paths: {}`. A integração real foi registrada como bloqueada pelas APIs de negócio ausentes, dependência externa do backlog. Solicitou referência de outra branch/ambiente, sem interpretar o pedido como autorização para acessar credenciais pendentes da task 13 ou implementar todo o backend.

Entregou correções preparatórias com base em H.1/H.6: polling exclusivo de GET do lote, atualização da solicitação ativa com proteção contra resposta antiga e paginação de extrato 20/50/100. Mocks foram ajustados para permitir validar o mesmo fluxo. Nenhuma dependência nova, API fictícia de produção, alteração de schema ou backend em memória. A matriz por domínio e os critérios de retomada foram registrados no guia histórico `docs/FRONTEND_INTEGRATION.md`, ausente nesta fotografia do repositório.

Verificação preparatória da task 14: tipagem, lint, build e 121 testes unitários aprovados. Oito cenários de navegador aprovados em desktop/celular, cobrindo consulta exclusiva do lote durante pendência, conclusão refletida no extrato/dashboard e seleção explícita de 100 itens. Captura do extrato inspecionada; largura de 320 px verificada. Permanecem os avisos não bloqueantes existentes do Zod e tamanho do bundle. `git diff --check` sem erros. Essas evidências usam mocks e não comprovam integração real.


## 20. Task 15 do frontend — 26/09/2026

Codex configurou CI GitHub Actions com qualidade e matriz de três suítes de navegador, instalação pelo lockfile, Node 22, permissões de leitura e relatórios separados. Não publicou alterações nem disparou CI remota. Calendário dos testes demonstrativos passou a ser controlado pela data das fixtures, mantendo avanço normal do relógio e sem alterar o runtime de produção. Testes usam pt-BR e fuso diferente do calendário financeiro.

A revisão visual identificou perda de foco após seleção do tamanho de página. Um teste reproduziu a falha em desktop/celular; o provedor de feedback passou a preservar o controle que abriu a lista temporária e restaurá-lo após o carregamento. Regressão reforçada para atualização, limpeza de filtros e paginação. Nenhuma dependência ou pattern adicional. Evidências e limites foram registrados no guia histórico `docs/FRONTEND_ACCEPTANCE.md`, ausente nesta fotografia do repositório; homologação real não foi declarada concluída.

Verificação final da task 15: tipagem, lint, build e 121 testes unitários aprovados. Após a correção de foco, passaram 80 cenários Chromium: 58 demonstrativos, 12 de componentes e dez de produção/OIDC contratual, em desktop e celular. Fluxos incluem cinco ciclos de modais/combobox, teclado, retorno de foco, zoom 200%, movimento reduzido, larguras de 320 a 1920 px e consultas no fuso de São Paulo com navegador em Los Angeles. Capturas de extrato e modal inspecionadas. Workflow validado como YAML; CI remota não executada. `git diff --check` sem erros. Avisos conhecidos do Zod e tamanho do bundle permanecem; homologação integrada continua bloqueada pelas tasks 13/14.

## Revisão documental: liquidação por título — 27/09/2026

O responsável substituiu a regra de liquidação atômica por lote por processamento independente: preservar sucessos, registrar erro no título e permitir reprocessamento pelo operador com auditoria completa. Também solicitou reavaliar tabelas/colunas. A documentação passou a definir comandos por título, estados parciais, seleção/justificativa de reprocessamento, snapshots por tentativa e unicidade por recebível.

DATABASE.md foi revisto com estado atual separado do histórico de tentativas, flags derivadas, diagnóstico individual, vínculos anteriores, projeções concorrentes, outbox/auditoria por título e resultado financeiro individual. SPEC, AGENTS, decisões e documentos de frontend foram alinhados; evidências antigas foram identificadas como históricas e foi registrada a task 16 de adequação.

Escopo somente documental: não houve implementação de APIs, migrations, alterações de código ou criação de tópicos Kafka. A verificação desta revisão é de consistência textual e contratos; não comprova comportamento financeiro em execução.

Verificação documental: links locais, estrutura das tabelas Markdown, presença de `uuid`/`date_register` nas 12 tabelas e termos centrais dos contratos conferidos; `git diff --check` sem erros. Testes de execução não foram rodados, pois não houve alteração de código.

## Estado do código observado — 27/09/2026

Após os registros históricos acima, o repositório avançou além das estruturas provisórias. A UI contém fluxos de cadastro/importação, simulação, aceite, acompanhamento, resultados por título, auditoria, reprocessamento seletivo, câmbio, extrato e dashboard; usa contratos Zod, cliente HTTP autenticado e textos centralizados. Os arquivos de runtime chamam `/api`; fixtures e handlers MSW estão no harness de testes. A autenticação implementada usa Keycloak com PKCE.

Há fontes de testes de navegador para integração real e concorrência (`ui-r-credit/e2e/engine-integration.spec.ts` e `ui-r-credit/e2e/settlement-race.spec.ts`), além de cenários isolados com mocks. A existência desses cenários não prova que foram executados ou aprovados nesta fotografia do repositório. Também não se deve interpretar a antiga anotação de integração bloqueada da Task 14 como estado atual. A leitura do código registrada aqui é uma fotografia prévia.

### Estado da carga — matrix codex4/codex5

`codex4` registrou 34 lotes medidos (34.000 títulos) nas concorrências 1, 2, 5 e na primeira onda de 10; a execução foi interrompida durante screenshots. Consulta somente leitura confirmou 35 lotes persistidos, incluindo o aquecimento, com 35.000 títulos, liquidações e mensagens da outbox `SENT`, sem falhas ou DLQ. `codex5` passou no Playwright com duas ondas de concorrência 10: 20 lotes/20.000 títulos, todos liquidados, sem erros HTTP; P95 aceite-terminal de 51,227 s e UI de 53,997 s. A soma observada foi 54 lotes medidos/54.000 títulos e um aquecimento/1.000 títulos; os diagnósticos individuais de `codex4` não foram preservados, portanto os percentis não foram combinados. A `codex1` usou imagem Nginx desatualizada e falhou antes do aceite. A `codex2` liquidou 1.000 títulos em cerca de 9,2 s, mas a harness procurou o terminal na página errada e não registrou métricas. A `codex3` validou a navegação corrigida com duas liquidações pequenas. O relatório de carga documenta o perfil e os limites: ambiente local diferente da referência da SPEC, duas rodadas apenas para `codex5`, e sem conclusão de SLA.

Após a carga, revisão do consumer identificou risco de uma mensagem Kafka inválida bloquear repetidamente sua partição. O workflow passou a decodificar bytes em UTF-8 estrito e registrar mensagens malformadas ou sem correlação em quarentena append-only, por tópico/partição/offset, guardando hashes e tamanhos, sem payload bruto. O offset só é confirmado após o commit; falha de persistência mantém retry. A migration V6, verificação de compatibilidade e testes focados foram adicionados. Esta etapa executou somente a carga e verificações estáticas/documentais: os novos testes Java e builds não foram executados, e V6 ainda não foi aplicada ao banco compartilhado. A carga não exercitou o caminho de quarentena.
