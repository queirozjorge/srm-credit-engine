# HTTP, autenticação e testes do frontend

O frontend utiliza exclusivamente as APIs reais e Keycloak. Os contratos funcionais permanecem no [anexo H da SPEC](../SPEC.md#h-contratos-propostos-para-o-frontend-e-seus-mocks); schemas Zod por domínio validam respostas em execução. Não há modo demonstrativo, seleção de perfis, header de identidade fictícia ou fallback de negócio na aplicação.

## Execução

Acesse a aplicação pelo gateway `https://localhost:8443`, com o build atualizado e infraestrutura Compose disponível. `npm run dev` oferece o servidor Vite; sozinho, não fornece Keycloak nem APIs. Login utiliza Authorization Code com PKCE S256, realm `srm-credit`, cliente público `ui-r-credit` e `/auth` na mesma origem. Tokens permanecem em memória.

O build contém a aplicação, seu módulo OIDC e exemplos reais de importação. CSV/CNAB disponíveis para download exigem cedente previamente cadastrado conforme a instrução exibida na tela. Arquivos sempre passam pela prévia e pelo cadastro reais; o navegador não interpreta CNAB nem calcula resultados financeiros.

## Transporte e sessão

`useApiClient()` integra o cliente HTTP à sessão e ao modal central de avisos. `createApiClient()` mantém dependências explícitas para testes. O cliente aceita somente caminhos locais sob `/api/`, recusa redirects e utiliza `cache: 'no-store'`.

- Respostas exigem schema Zod e status esperados. `204` não tenta interpretar JSON; erro HTTP nunca vira sucesso.
- JSON utiliza valores normalizados; FormData mantém o boundary gerado pelo navegador.
- Bearer vem da sessão no instante da chamada. Identidade e papéis nunca são enviados no body para definir autoria ou autorização.
- Timeout padrão: 15 segundos. Não há retry automático de mutações ou consultas.
- Cancelamento e troca de sessão descartam respostas antigas. Saída/expiração limpam consultas e memória de navegação.
- `ApiError` carrega mensagem segura, detalhes e contexto. Falhas operacionais usam modal; somente validações específicas permanecem nos campos.

Guards e permissões orientam a interface; o engine permanece responsável pela autorização. O retorno após login preserva caminho local, filtros e paginação; destinos externos são recusados.

## Atualização e operações

Uma mutação atualiza somente dados afetados. Carregamentos iniciais e confirmações usam AppLoader sobre o conteúdo atual; simulação, polling e renovação silenciosa preservam interação sem bloqueio global.

Simulação usa debounce de 400 ms, ignora respostas antigas e identifica valores desatualizados. Sua indisponibilidade não impede solicitar liquidação: a confirmação informa validação individual e continuidade somente dos títulos aptos. Taxa base configurada pode ser negativa; câmbio e spreads conservam seus contratos sem sinal negativo.

Aceite e reprocessamento preservam a chave de idempotência e a intenção exata após falha de rede. Reprocessamento exige seleção explícita de falhos e justificativa. `422 NENHUM_TITULO_APTO` consulta o histórico persistido/detalhe afetado; não repete automaticamente uma solicitação inicial.

Polling consulta o lote pendente a cada cinco segundos. Mudança de `progressVersion` permite no máximo uma consulta adicional à página de títulos ou tentativas atualmente aberta. Aba oculta, saída e sessão inválida suspendem consultas; auditoria permanece sob ação explícita. Sem workflow, títulos aceitos continuam pendentes; nenhum temporizador local produz liquidação.

Câmbio utiliza referência independente do histórico; falha no provedor não impede proposta manual. Decisão de outro gestor não dispara liquidação. Retorno do operador abre a aba de solicitações para atualizar a simulação. Extrato/dashboard utilizam APIs agregadas/paginadas e calendário de São Paulo.

## Testes isolados e integração

Fixtures, handlers MSW e perfis de teste ficam em `ui-r-credit/tests`, organizados por domínio. Testes unitários permanecem junto das funcionalidades. `tests/harness` e `vite.isolated.config.ts` compõem exclusivamente a suíte de navegador isolada; o worker fica em `tests/public`, fora do diretório público distribuído.

| Comando em `ui-r-credit` | Verifica |
|---|---|
| `npm run typecheck` e `npm run lint` | Tipos estritos e convenções. |
| `npm test` | Contratos, hooks, validações, cache, sessão e interações com handlers isolados. |
| `npm run build && npm run test:bundle` | Build sem MSW, fixtures, perfis ou caminhos demonstrativos. |
| `npm run test:e2e` | Build real e contrato OIDC isolado. |
| `npm run test:e2e:isolated` | Jornadas de interface com fixtures, desktop/celular e ciclos de modal. |
| `npm run test:e2e:components` | Componentes, máscaras, teclado e transições. |
| `npm run test:e2e:oidc` | Login, refresh e logout reais pelo gateway. |
| `npm run test:e2e:integration` | APIs reais, cadastro, prévia CSV, simulação, aceite/replay, auditoria, relatórios e decisão cambial em sessões distintas. |

Suítes reais exigem Compose saudável e variáveis `KEYCLOAK_OPERATOR_PASSWORD`/`KEYCLOAK_MANAGER_PASSWORD`. Integração cria registros de homologação; utilize banco local de desenvolvimento/testes. Não usa interceptações de negócio nem writes diretos no banco. Trace, vídeo e screenshots automáticos ficam desativados nas suítes com credenciais.

Instale Chromium com `npm run test:e2e:install` ou use o Chrome instalado com `PLAYWRIGHT_CHANNEL=chrome`. Execute suítes de navegador sequencialmente, pois compartilham relatórios. Evidência de testes isolados não comprova persistência, precisão financeira, Kafka ou liquidação pelo workflow.
