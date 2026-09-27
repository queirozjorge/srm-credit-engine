# Homologação do frontend — task 15

**Homologação integrada pendente.** A entrega desta etapa cobre regressão do frontend, configuração de CI e documentação. Os impedimentos das tasks 13 e 14 continuam válidos: sessão autenticada real aguarda autorização de credenciais; APIs de negócio não estão implementadas. Não há evidência de liquidação financeira real.

## Camadas de evidência

| Camada | O que verifica | O que não comprova |
|---|---|---|
| Tipagem, lint e testes unitários | Contratos, validações, máscaras, sessão, cache, idempotência no cliente, cancelamento e polling. | Segurança, transações ou cálculo do backend. |
| Navegador demonstrativo | Jornadas de cedentes, cadastro manual/importação, simulação, confirmação, acompanhamento, câmbio, extrato e dashboard; permissões de UI. | Parsing real de arquivos, banco, Kafka ou atomicidade financeira. |
| Componentes no navegador | Teclado, foco, máscaras, cinco ciclos de modais/combobox, clique durante saída, aviso deduplicado, loader concorrente, paginação e movimento reduzido. | Auditoria completa com leitores de tela ou todas as combinações de navegador/dispositivo. |
| Build de produção e OIDC contratual | Entrada sem mocks, desafio PKCE, state/nonce inválidos, Bearer, renovação e expiração usando adaptador real com respostas simuladas. | Sessão completa contra Keycloak real ou validação JWT no engine. |
| Entrada Keycloak real (task 13) | Cliente público, URI de retorno e PKCE aceitos; callback inválido tratado, sem credenciais. | Login, refresh e logout reais de operador/gestor. |

## CI configurada

[Workflow](../.github/workflows/frontend.yml) para push, pull request e execução manual. Usa Node 22, `npm ci`, permissões de leitura e cancelamento de execução substituída. Jobs separados:

- Qualidade: tipagem, lint, testes unitários e build.
- Navegador: matriz com produção/contratos, demonstração e componentes; Chromium desktop/celular, dois workers, sem retries para ocultar falhas.
- Relatórios e capturas preservados em artefatos distintos por sete dias, inclusive após falha. Somente dados sintéticos nessas suítes.

Workflow validado sintaticamente e comandos executados localmente. **Não houve push, dispatch ou execução remota no GitHub nesta etapa.** Não afirmar que a CI passou antes da primeira execução no repositório.

Referências de configuração: [Playwright CI](https://playwright.dev/docs/ci), [setup-node](https://github.com/actions/setup-node/tree/v4) e [upload-artifact](https://github.com/actions/upload-artifact/tree/v4).

## Reprodutibilidade

Testes unitários iniciam o calendário na data das fixtures, sem bloquear timers reais; casos que verificam timers controlam seus próprios avanços. Testes de demonstração usam relógio que avança normalmente a partir de `demoTime`, antes da primeira navegação. Nenhum relógio de produção foi alterado.

Navegadores de regressão usam `pt-BR` e fuso `America/Los_Angeles`, diferente do calendário financeiro `America/Sao_Paulo`. Essa diferença verifica que datas civis do extrato não dependem do fuso do navegador. Suítes reais de OIDC mantêm relógio próprio e não dependem do calendário demonstrativo.

## Executar localmente

Na pasta `ui-r-credit`:

```sh
npm ci
npm run test:e2e:install
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e -- --workers=2
npm run test:e2e:demo -- --workers=2
npm run test:e2e:components -- --workers=2
```

Executar suítes de navegador sequencialmente: portas e diretórios de relatório são compartilhados. Inspecionar ou copiar as capturas antes da próxima suíte. Os testes reais opcionais de Keycloak estão descritos no README e não integram a CI sem credenciais.

## Critérios pendentes para aceite integrado

1. Executar login/refresh/logout reais de operador e gestor com credenciais autorizadas; conferir papéis e isolamento entre identidades.
2. Disponibilizar e validar OpenAPI, JWT/autorização no engine e endpoints da [matriz de integração](FRONTEND_INTEGRATION.md).
3. Executar jornadas nas mesmas telas sem MSW: cedente, cadastro/importação, simulação real, aprovação cambial por outro gestor, aceite e conclusão integral.
4. Verificar no backend golden cases, BigDecimal/arredondamento, snapshots, idempotência, concorrência, falha total, outbox/Kafka e ausência de resultados parciais.
5. Aferir extrato/dashboard contra resultados persistidos e repetir os cenários relevantes de rede, sessão, teclado e responsividade no ambiente integrado.

O build possui avisos conhecidos sobre anotações do Zod e chunk principal acima de 500 kB; não impedem execução. A revisão visual e os testes de teclado não representam certificação WCAG. Chromium foi o navegador validado nesta etapa; WebKit/Firefox não foram executados.


## Ajuste encontrado na revisão

A captura do extrato revelou foco deslocado ao trocar o tamanho da página. Um teste de teclado reproduziu a falha em desktop e celular. O provedor comum de feedback passou a lembrar o controle anterior à lista temporária, restaurando foco no combobox após o loader. As opções da lista não são tratadas como destinos permanentes. Foram mantidos os ciclos existentes de modal, restauração de foco e avisos sobrepostos.

Verificação final da task 15: tipagem, lint, build e 121 testes unitários aprovados. Após a correção de foco, passaram 80 cenários Chromium: 58 demonstrativos, 12 de componentes e dez de produção/OIDC contratual, em desktop e celular. Fluxos incluem cinco ciclos de modais/combobox, teclado, retorno de foco, zoom 200%, movimento reduzido, larguras de 320 a 1920 px e consultas no fuso de São Paulo com navegador em Los Angeles. Capturas de extrato e modal inspecionadas. Workflow validado como YAML; CI remota não executada. `git diff --check` sem erros. Avisos conhecidos do Zod e tamanho do bundle permanecem; homologação integrada continua bloqueada pelas tasks 13/14.
