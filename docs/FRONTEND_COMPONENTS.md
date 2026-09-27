# Componentes comuns do frontend

Implementados na task 04 em `ui-r-credit/src/common`. Textos estáticos e labels vêm de `src/i18n/pt-BR.ts`. Esses componentes não contêm regras financeiras. Sessão, schemas e transporte são descritos no [guia HTTP](FRONTEND_HTTP.md).

## Carregamento e avisos

`AppProviders` já inclui `AppFeedbackProvider`. `useAppFeedback()` oferece:

- `beginLoading()`: devolve uma função de liberação idempotente. Chamar antes de uma operação explícita e liberar em `finally`. Operações simultâneas mantêm o AppLoader até a última liberação. O conteúdo permanece montado e inerte durante o bloqueio, preservando edição e estado local. O domínio também deve bloquear imediatamente seu botão de envio.
- `showWarning({ message, title?, details?, dedupeKey? })`: enfileira avisos e suprime duplicatas enquanto estiverem na fila. A mensagem pode vir do backend validado; textos locais vêm do i18n. Nunca renderizar HTML retornado pela API.

O AppLoader usa transição, foco contido e restauração de foco. Usar carregamento global somente nos casos previstos no AGENTS.md; polling, simulação durante digitação e renovação silenciosa não devem chamar `beginLoading()`. O aceite assíncrono encerra o bloqueio da solicitação.

## Modais

`AppDialog` recebe `open`, `title`, `onClose`, conteúdo e ações opcionais. Manter o componente na árvore, alternando `open`; não usar `{open && <AppDialog ... />}`, pois isso interromperia a saída. `onClose` deve atualizar o estado controlado para `false`. `onExited` é o ponto para limpeza que dependa do fim da animação.

O ciclo local separa abertura, fechamento e desmontagem, aceita um único pedido de fechamento, ignora tentativa de reabertura durante a saída e restaura o foco à origem. Escape e botão fecham; backdrop não fecha por padrão, podendo ser habilitado explicitamente com `closeOnBackdrop`. Usar `describedBy` para vincular uma descrição concisa. Ações de negócio continuam sob responsabilidade do domínio.

`WarningDialog` reutiliza esse ciclo, com descrição acessível, detalhes opcionais e ação “Entendi”. Movimento reduzido elimina a duração das transições.

## Campos e formatos

- `DecimalField`: `value` e `onValueChange` usam strings normalizadas, por exemplo `1234.50`. Dinheiro aceita até 17 dígitos inteiros e 2 decimais; `kind="rate"` aceita até 12 inteiros e 12 decimais. `currency` controla apenas o símbolo; `allowNegative` é opt-in. Não calcula nem arredonda valores.
- Durante edição, preservar o texto digitado e o cursor; formatar no desfoque. Colagem aceita agrupamento brasileiro e vírgula decimal. Entrada inválida mantém o rascunho visível, mostra erro de campo e emite string vazia, impedindo reutilização silenciosa do valor anterior. O domínio deve validar obrigatoriedade/limites antes do envio.
- `CnpjField`: preserva zeros, normaliza letras para maiúsculas e aplica pontuação quando há 14 caracteres. Aceita entrada parcial para edição; dígitos verificadores e regras do cadastro serão validados no domínio/servidor.
- `DateField`: controle nativo de data, valor ISO `YYYY-MM-DD`, com `min`/`max` opcionais. A apresentação acompanha o navegador. `formatCivilDate` apresenta datas em `DD/MM/YYYY`, sem conversão de fuso; `formatInstant` apresenta instantes UTC em `America/Sao_Paulo`.
- `FormattedField` concentra edição/validação de formato; reutilizar quando outro domínio necessitar de um campo padronizado. Validar dados externos antes de fornecê-los aos formatadores.

## Tabelas e paginação

`DataTable<T>` recebe somente as linhas da página atual, colunas tipadas, chave estável e paginação controlada. Possui região própria de rolagem acessível por teclado, cabeçalho fixo, estado vazio e paginação fora da região rolável. `maxHeight` pode ser ajustado ao espaço disponível da tela.

`TablePaginationControls` usa páginas começando em 1 e emite `{ page, size }` apenas por ação do usuário. Mudança de tamanho solicita página 1; salto inválido mostra validação de campo. Não dispara consultas, não percorre páginas e não corrige automaticamente uma página que ficou além do total. O usuário pode regressar ou saltar para outra página. Tamanhos padrão: 5/10/20/50; Extrato deve fornecer `pageSizes={[20, 50, 100]}`. Filtros, requisições e preservação do estado pertencem ao domínio.

## Verificação isolada

`npm run test:e2e:components` usa uma fixture Vite em `e2e/fixtures/components.html`, porta 5176, com registros exclusivamente de teste. Ela não integra as rotas nem o build de produção. O navegador deve ter sido instalado conforme o README. A suíte testa teclado/foco, cinco ciclos dos modais e combobox, clique durante saída, movimento reduzido, carregamentos simultâneos, edição decimal e rolagem/paginação em desktop e celular.

Na integração de cedentes (task 06), a fila de avisos passou a aguardar o fim da saída do AppLoader. A origem do foco é capturada antes de desabilitar o botão de envio e restaurada antes de abrir o aviso. Isso preserva o foco também quando aviso e formulário são modais sobrepostos. `AppDialog` aceita `closeDisabled` durante envios e `closeVariant` para destacar a ação principal do formulário.
