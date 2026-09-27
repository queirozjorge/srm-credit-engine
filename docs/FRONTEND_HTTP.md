# HTTP, contratos e sessão demonstrativa

A task 05 prepara o transporte e a sessão para as telas das próximas tasks. Os contratos funcionais continuam no anexo H da SPEC. Os schemas executáveis ficam em `services/contracts.ts` de cada domínio; primitivas compartilhadas estão em `common/http/contracts.ts`.

## Executar

Na pasta `ui-r-credit`, executar `npm run dev:demo` para abrir a demonstração em `http://127.0.0.1:5174`. A tela de acesso permite escolher operador, gestor ou ambos. O cabeçalho identifica dados fictícios. O relógio das fixtures é fixo em 26/09/2026, sem depender do dia da execução. Recarregar a página reinicia sessão e fixtures; nada é salvo em localStorage/sessionStorage.

`npm run dev` permanece no modo real, sem mocks. `VITE_API_MODE=demo` também permite ativação explícita em desenvolvimento. O build de produção desativa a demonstração mesmo que essa variável esteja definida. O worker é servido apenas no desenvolvimento; `public` contém somente o arquivo gerado pelo MSW e não é copiado para `dist`.

O modo real exige sessão, mas o login Keycloak ainda pertence à task 13. Não existe acesso anônimo às telas de negócio nem fallback automático para perfil demonstrativo. O gate de inicialização aguarda o MSW com AppLoader; falha abre aviso e permite tentar novamente, sem prosseguir silenciosamente contra APIs reais.

## Consumir HTTP

`useApiClient()` liga o cliente à sessão e ao modal de avisos. `createApiClient()` é a versão sem React, com dependências explícitas para testes e outros consumidores. Não há interceptor global de fetch.

`request('/api/...', options)` recebe um schema Zod obrigatório e retorna `{ data, status, location }`. Por padrão aceita `200`; declarar `statuses: [201]`, `[202, 200]` ou `[204]` conforme a operação. Para `204`, usar `z.undefined()`. O cliente não interpreta JSON nesse status. Para falha de prévia, validar `ApiError.payload` com `invalidPreviewSchema` antes de apresentar os dados auxiliares.

- `query` serializa valores normalizados, omitindo `undefined` e string vazia. Nenhuma paginação ou consulta adicional é disparada pelo cliente.
- `body` aceita JSON ou FormData; no upload, o navegador define o boundary. Validar a entrada com o schema específico antes do envio.
- `signal` cancela a chamada; a troca de sessão também cancela chamadas antigas. Respostas antigas são descartadas antes de publicar dados.
- `timeoutMs` tem padrão de 15 segundos. Não há retry automático; uma mutação com falha de transporte informa resultado incerto. Nenhum erro é convertido em sucesso.
- `idempotencyKey` é enviada sem alteração no header. O domínio de liquidação será responsável por criar/preservar a chave por tentativa na task 10. O transporte não gera nem substitui chaves.
- `notify: false` permite ao domínio controlar avisos de polling, evitando repetição. O erro continua sendo lançado, e `401` continua expirando a sessão.
- Erros são `ApiError`, com status, código, mensagem segura, detalhes e contexto. `5xx`, HTML inesperado e falhas de rede usam mensagens locais; diagnósticos de servidor não são exibidos. Detalhes validados de campo podem ser associados aos campos.

O cliente aceita somente caminhos locais sob `/api/`, recusa redirects e usa `cache: 'no-store'`. Bearer é obtido da sessão em memória no instante da chamada. O header `X-Demo-Subject` existe apenas no modo demonstrativo: identifica uma fixture e não representa autenticação real.

Carregamento e atualização do cache continuam explícitos no domínio. Usar `beginLoading()`/liberação em `finally` para operações bloqueantes; atualizar somente dados afetados após sucesso. O transporte não remonta telas, limpa formulários ou muda filtros.

## Sessão e permissões

`SessionProvider` fornece identidade, papéis e token em memória. Sair, expirar ou trocar de identidade cancela consultas e limpa caches de consultas/mutações. A memória de navegação também é esvaziada. Um `401` encaminha a rota protegida para sessão expirada; `403` operacional abre aviso sem inventar expiração.

`RequireSession` protege as telas; cadastro de lote exige `batchWrite`. `can()` centraliza a matriz de H.2. `canDecide()` exige gestor e compara simultaneamente issuer/subject para impedir autoaprovação, inclusive para quem acumula papéis. Esses controles orientam a UI; a autorização real continua obrigatória no engine.

O destino local, incluindo filtros, é preservado ao pedir acesso. Destinos externos são descartados. Após login demonstrativo o guard verifica novamente as permissões; trocar para gestor não libera cadastro de lote.

## Mocks disponíveis nesta etapa

Fixtures e handlers ficam nos domínios; `app/mocks` apenas inicializa e compõe o MSW. `createDemoHandlers()` cria estado novo para cada teste. Não há seleção oculta de cenários por parâmetros de produção.

Disponíveis: consultas paginadas de cedentes/lotes/recebíveis, cotação e propostas, referência, dashboard agregado de dois períodos e extrato/histórico alimentados pelas conclusões demonstrativas; cadastro e edição de cedente com conflito de documento/versão; simulação fixa de prazo zero para o lote da fixture. Solicitações pendentes possuem fixture própria para testar schemas, sem serem vinculadas artificialmente ao lote READY.

Mocks não executam motor financeiro, parsing CNAB, liquidação ou persistência real. Cadastro manual e importação de lote possuem cenários das tasks 08–09. Importação reconhece apenas exemplos determinísticos fornecidos na tela, inclusive o exemplo CNAB sintético; não implementa nem comprova parsing bancário real. A task 10 acrescenta simulação de rascunho no cenário fixo, idempotência e transições demonstrativas de liquidação; a task 11 acrescenta propostas, decisões e histórico cambial em memória. Rotas ausentes retornam `404`; entradas de simulação fora do cenário fixo retornam falha, nunca resultados financeiros inventados.

Nos testes, `scenario()` oferece falha de rede, resposta inválida, atraso, vazio e status HTTP explícitos. Os handlers permitem sobrescrita por teste e reset; sucesso parcial não é simulado como sucesso integral.

## Verificar

- `npm run typecheck`, `npm run lint`, `npm test`: contratos, transporte, permissões, guards, conflitos, expiração e isolamento.
- `npm run test:e2e`: build real, acesso obrigatório e ausência de ativação de worker/perfis.
- `npm run test:e2e:demo`: servidor demonstrativo na porta 5177, sessão, guards, falha/retentativa de inicialização e regressão de navegação desktop/móvel.
- `npm run test:e2e:components`: fixture de componentes na porta 5176.

Instalar Chromium conforme o README; não executar suítes Playwright simultaneamente, pois compartilham a pasta de relatórios.

## Importação (task 09)

`useImportPreview` envia o arquivo original e o formato para `POST /api/batches/preview`, com FormData e boundary gerado pelo navegador. Arquivo vazio ou acima de 5 MiB é rejeitado localmente antes da leitura/envio. Respostas são aferidas por Zod e por contagem, índices, origem e total; no máximo 1.000 itens. Troca de arquivo/formato cancela consulta anterior e invalida prévia/moedas.

`422 ARQUIVO_INVALIDO` preserva somente linhas válidas para revisão e os detalhes por linha/campo; não libera cadastro. Detalhes e truncamento são apresentados no aviso central. CSV mantém moedas do arquivo; CNAB permite sobrescritas por itemIndex em parte JSON `paymentCurrencies`, sem alterar o arquivo original. Confirmação usa o mesmo endpoint de cadastro com multipart, sem transformar prévia em JSON de cadastro manual.

`useCreateBatch` compartilha bloqueio, aceite, consulta posterior e resultado incerto entre manual e arquivo. `201` libera a referência ao arquivo e faz somente GET do detalhe; falha desse GET não permite novo POST. Rejeição definitiva invalida a prévia e exige nova validação. Rede/servidor/resposta incompatível conserva arquivo e exige consulta dos lotes antes de retomar revisão. Nenhuma idempotência de liquidação é aplicada ao cadastro.


## Simulação e liquidação (task 10)

`useSimulation` valida entrada e resposta, aplica debounce de 400 ms após ativação explícita e cancela pedidos substituídos. Dados antigos permanecem visíveis como desatualizados. O POST usa exclusivamente batchUuid ou items, sem condições financeiras fornecidas pelo cliente.

`useSettlement` envia POST sem body, com Idempotency-Key e respostas 200/202. Atualiza apenas caches do lote/solicitação/listas existentes. Estado incerto preserva chave no QueryClient da sessão; consulta de reconciliação precede repetição. 409 consulta o lote para assumir a operação ativa. Não há repetição automática de mutações. Logout/recarga descartam a memória; o lote deve ser consultado novamente.

`useSettlementPolling` consulta o lote pendente em `/batches/{batchUuid}` a cada cinco segundos, depois do término da consulta anterior. Suspende em aba oculta, desmontagem e sessão inválida; retoma ao voltar e encerra nos estados definitivos. Aviso de erro é deduplicado por solicitação/código. Consulta de itens após conclusão é discreta; consultas explícitas de itens/histórico usam AppLoader e paginação controlada pelo usuário.

Demonstração suporta somente o cenário de prazo zero documentado no backlog. Resultado integral é uma fixture, não prova de liquidação real ou de atomicidade no banco.


## Câmbio (task 11)

`useExchange` consulta `/exchange` com histórico/filtro/página controlados pela URL. `/exchange/reference` é independente, consultado uma vez por entrada e depois apenas por ação explícita; erro não descarta cotação/histórico nem impede proposta manual. Não há polling ou repetição automática de consultas.

`useExchangeMutation` normaliza e valida os bodies de POST/PATCH. Identidade vem da sessão; nenhum solicitante/decisor é enviado no body. Sucesso faz somente uma nova consulta da visão atual, preservando aba, filtros, página e editor. GET posterior com erro não libera nova mutação. Rede/resposta incerta preserva campos e bloqueia repetição; conflito exige consulta individual antes de nova decisão explícita. Mensagens operacionais usam o modal central.

Incremento é auxílio local com soma decimal exata; API recebe taxa absoluta. A cotação corrente é selecionada pelo servidor, incluindo a fronteira de 24 horas; não há relógio local substituindo sua decisão. Aprovação cria cotação geral e não modifica snapshots aceitos. Retorno ao lote pelo operador solicita somente nova simulação.


## Extrato e dashboard (task 12)

`useStatement` consulta `/settlements/items` com paginação explícita e filtros por item. A URL da tela guarda datas civis `from`/`to`; a API recebe `start` inclusivo e `end` exclusivo em UTC, calculados pelo calendário `America/Sao_Paulo`, independentemente do fuso do navegador. O padrão abrange hoje e os seis dias anteriores; limites vazios consultam todo o histórico. Período, UUID e moeda inválidos impedem a consulta. O seletor paginado inclui cedentes inativos, necessários ao histórico.

`useDashboard` faz uma consulta agregada a `/dashboard` por período escolhido (`LAST_7_DAYS` ou `CURRENT_MONTH`). Não deriva totais das páginas do extrato. A troca de moeda altera apenas a apresentação do gráfico e da tabela diária; não consulta novamente. Dias sem movimento são validados na série densa. Contagens de lotes, propostas pendentes e cotação são globais, sem filtro pelo período financeiro.

Ambas as telas preservam o último resultado em falhas e o identificam como desatualizado; erros usam o modal central. Atualizações explícitas usam AppLoader sobre o conteúdo existente, mantendo rascunhos, filtros e paginação. Não há polling nem retry automático. Valores monetários permanecem strings; BigInt calcula somente proporções exatas para a geometria SVG, convertendo para number apenas coordenadas limitadas.

A demonstração compartilha um registro de itens concluídos entre liquidação, extrato e dashboard. Aceite pendente ou falha não adiciona itens. Agregação e filtragem em memória pertencem exclusivamente aos mocks; a integração real deverá usar os endpoints agregados/paginados do backend. O cenário financeiro fixo da task 10 permanece a limitação da demonstração.


## Autenticação real (task 13)

`OidcBootstrap` inicializa uma vez por sessão antes do BrowserRouter. `keycloak-js` 26.2.4 conduz Authorization Code, PKCE S256, state e nonce. O adaptador oficial foi escolhido para evitar uma implementação própria do protocolo; um adaptador tipado pequeno integra sua renovação e limpeza ao contrato de sessão existente. Referência: [documentação oficial do Keycloak](https://www.keycloak.org/securing-apps/javascript-adapter).

Configuração em `auth/config/oidc.ts`: Keycloak na mesma origem, `/auth`, realm `srm-credit`, cliente público `ui-r-credit`, retorno `/`. Sem client secret, tokens em storage ou modo implícito. O adaptador mantém temporariamente state/nonce/verificador PKCE para atravessar o redirecionamento; isso não inclui access/refresh tokens. O frontend guarda apenas destino local e instante em sessionStorage, consome esse registro no callback e remove parâmetros OIDC da URL antes de montar o roteador. Retorno inválido usa aviso central e entrada recuperável, sem repetir troca de código.

Identidade vem de `iss`/`sub` e papéis conhecidos de `realm_access`. Claims recebidas são validadas em execução quanto a formato, emissor, cliente, audiência e validade. Essa validação orienta a UI; não substitui verificação criptográfica e autorização obrigatórias no engine.

`session.prepare` renova antes da chamada HTTP, compartilhando uma única promessa entre chamadas concorrentes. Um timer também antecipa a expiração em trinta segundos. Renovação é silenciosa, sem loader global ou invalidação do cache quando identidade/papéis permanecem iguais. Mudança de identidade/papel, logout e expiração cancelam operações e limpam caches. Resposta atrasada após saída não restaura sessão. Inicialização/renovação têm limite de quinze segundos; 401 não repete automaticamente operações financeiras.

Logout captura o endereço de encerramento SSO antes de apagar os tokens locais. Não há iframe de monitoramento nem login automático em loop; logout em outra aba é percebido na próxima renovação. Recarga exige novo clique na entrada e pode reutilizar SSO. Erros operacionais são genéricos em português, sem expor respostas do provedor, códigos ou tokens.


## Disponibilidade das APIs (task 14)

O OpenAPI local retornou `paths: {}` em 26/09/2026. Integração funcional permanece bloqueada pelas APIs ausentes. Evidências, correções preparatórias e critérios para retomada estão no [registro de integração](FRONTEND_INTEGRATION.md).
