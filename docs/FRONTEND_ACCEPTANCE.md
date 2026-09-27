# Situação da integração — 27/09/2026

**Estado desta retomada:** APIs H.1–H.8 estão implementadas no engine e há integração do frontend sem MSW. Passaram 157 testes Vitest, typecheck, lint e build; Playwright Chrome aprovou 58 cenários isolados, 10 de regressão de produção e 4 cenários autenticados em desktop/celular contra Keycloak, gateway e APIs reais. A integração validou cadastro, prévia CSV, simulação, aceite idempotente, consultas/auditoria e decisão cambial por outro gestor. O workflow foi implementado e a carga real de 18.000 títulos passou em ondas de concorrência 1/2/5/10; evidências e limites estão em [WORKFLOW_LOAD_REPORT.md](WORKFLOW_LOAD_REPORT.md). Login real foi exercitado; refresh/logout reais ainda não foram verificados. Os registros anteriores abaixo são históricos quando divergirem deste estado.

Modo demonstrativo removido da aplicação. Fixtures/MSW/perfis mantidos exclusivamente na infraestrutura de testes. A suíte `test:e2e:integration` utiliza gateway, Keycloak e APIs reais, sem interceptação de negócio; sua execução exige infraestrutura e credenciais de teste. `test:bundle` verifica a ausência de runtime demonstrativo no artefato distribuído.

Correções desta etapa: aceite inicial sem simulação obrigatória, reconciliação de `422 NENHUM_TITULO_APTO`, taxa base negativa contratual, retorno cambial para a aba de simulação e polling da página visível de tentativas. Exemplos CSV/CNAB distribuídos são arquivos reais processados pelo backend.

Validações desta etapa: 157 testes unitários em 42 arquivos; typecheck, lint, build e inspeção automática do bundle aprovados. Suíte isolada no Chrome instalado: 58 cenários desktop/celular aprovados. Capturas da importação CSV desktop e detalhe de lote em 320 px foram inspecionadas. O modal de falha histórica foi acrescentado depois da execução completa do navegador e validado em teste de componente com cinco ciclos de abertura/fechamento. A suíte integrada ainda não foi contabilizada como aprovada.

A entrega do engine termina no aceite e publicação. O workflow conclui o processamento financeiro por título, com retries persistidos e DLQ; o relatório de carga comprova a execução nominal e reconciliação, enquanto falhas terminais e reprocessamento de dados financeiros reais continuam cenários específicos a executar.

---

# Homologação do frontend — task 15

**Revisão contratual de 27/09/2026:** a SPEC agora exige liquidação por título, sucesso parcial, erro individual e reprocessamento auditado. A adequação frontend das tasks 16.1–16.9 foi implementada e verificada com contratos, mocks e testes de UI, conforme [FRONTEND_TASKS.md](FRONTEND_TASKS.md). Isso não substitui a integração com APIs, banco, Kafka ou worker reais.

**Homologação parcial.** A integração autenticada com Keycloak e as APIs foi exercitada nas jornadas indicadas acima. Permanecem fora das evidências refresh/logout com usuários reais e reprocessamento depois de falha terminal efetivamente processada. A conclusão financeira nominal está comprovada no relatório do workflow.

Na verificação da task 16.9, passaram 151 testes unitários em 39 arquivos, typecheck, lint, build e `git diff --check`. O Playwright não pôde ser executado localmente porque o binário Chromium exigido não está instalado; a CI remota também não foi executada. Assim, os cinco ciclos de abertura/fechamento foram verificados pelos testes de componentes, e não por navegador nesta rodada.

## Camadas de evidência

| Camada | O que verifica | O que não comprova |
|---|---|---|
| Tipagem, lint e testes unitários | Contratos, validações, máscaras, sessão, cache, idempotência no cliente, cancelamento e polling. | Segurança, transações ou cálculo do backend. |
| Navegador demonstrativo | Jornadas de cedentes, cadastro manual/importação, simulação, confirmação, acompanhamento, câmbio, extrato e dashboard; permissões de UI. | Parsing real de arquivos, banco, Kafka ou atomicidade financeira. |
| Componentes no navegador | Teclado, foco, máscaras, cinco ciclos de modais/combobox, clique durante saída, aviso deduplicado, loader concorrente, paginação e movimento reduzido. | Auditoria completa com leitores de tela ou todas as combinações de navegador/dispositivo. |
| Build de produção e OIDC contratual | Entrada sem mocks, desafio PKCE, state/nonce inválidos, Bearer, renovação e expiração usando adaptador real com respostas simuladas. | Sessão completa contra Keycloak real ou validação JWT no engine. |
| Keycloak e APIs reais | Login de operador/gestor, Bearer/JWT, cadastro, importação CSV, simulação, aceite idempotente, auditoria, extrato/dashboard e decisão cambial por outro gestor. | Refresh/logout reais; cálculo final/consumo pelo worker. |

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
npm run test:e2e:isolated -- --workers=2
npm run test:e2e:components -- --workers=2
```

Executar suítes de navegador sequencialmente: portas e diretórios de relatório são compartilhados. Inspecionar ou copiar as capturas antes da próxima suíte. Os testes reais opcionais de Keycloak estão descritos no README e não integram a CI sem credenciais.

## Critérios pendentes para aceite financeiro completo

1. Validar refresh e logout reais, além do login já verificado, com operador e gestor.
2. Validar no worker os golden cases, snapshots, retries, falha isolada por título, reprocessamento terminal, auditoria e concorrência ponta a ponta; a carga nominal está em [WORKFLOW_LOAD_REPORT.md](WORKFLOW_LOAD_REPORT.md).
3. Conferir extrato/dashboard com liquidações reais concluídas e repetir rede, sessão, teclado e responsividade após a conclusão do worker.

O build possui avisos conhecidos sobre anotações do Zod e chunk principal acima de 500 kB; não impedem execução. A revisão visual e os testes de teclado não representam certificação WCAG. Chromium foi o navegador validado nesta etapa; WebKit/Firefox não foram executados.


## Ajuste encontrado na revisão

A captura do extrato revelou foco deslocado ao trocar o tamanho da página. Um teste de teclado reproduziu a falha em desktop e celular. O provedor comum de feedback passou a lembrar o controle anterior à lista temporária, restaurando foco no combobox após o loader. As opções da lista não são tratadas como destinos permanentes. Foram mantidos os ciclos existentes de modal, restauração de foco e avisos sobrepostos.

Verificação final da task 15: tipagem, lint, build e 121 testes unitários aprovados. Após a correção de foco, passaram 80 cenários Chromium: 58 demonstrativos, 12 de componentes e dez de produção/OIDC contratual, em desktop e celular. Fluxos incluem cinco ciclos de modais/combobox, teclado, retorno de foco, zoom 200%, movimento reduzido, larguras de 320 a 1920 px e consultas no fuso de São Paulo com navegador em Los Angeles. Capturas de extrato e modal inspecionadas. Workflow validado como YAML; CI remota não executada. `git diff --check` sem erros. Avisos conhecidos do Zod e tamanho do bundle permanecem; homologação integrada continua bloqueada pelas tasks 13/14.

## Critérios adicionais da revisão de 27/09/2026 — ainda não executados

- Dez títulos: nove sucessos confirmados e um erro; resultado parcial explícito, nove registros no extrato e totais correspondentes no dashboard.
- Detalhe com progresso por título, erro acessível em modal e histórico de tentativas sem sobrescrever falhas antigas.
- Outro operador reprocessa somente o falho, com justificativa e nova chave; título já liquidado não pode ser selecionado/aceito. Reprocessamento de subconjunto pode deixar o lote parcial.
- Falha de rede preserva chave, seleção e justificativa; polling atualiza somente a página visível após mudança de versão e mantém foco, filtros, seleção e scroll.
- Novo snapshot em tentativa manual; mesmo snapshot em retries automáticos. BRL continua quando USD do mesmo lote falha no aceite.
- Modais novos/refatorados passam por cinco ciclos, clique durante saída, teclado, foco restaurado e movimento reduzido. Testes de banco/Kafka comprovam unicidade, falha isolada, agregados concorrentes, mensagem antiga e auditoria completa.

Execução depende da task 16 e dos serviços financeiros; esta revisão documental não constitui homologação.
