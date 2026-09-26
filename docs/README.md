# Wireframes — SRM Credit Engine

Protótipo navegável para revisar hierarquia, conteúdo e fluxos antes do desenvolvimento do frontend.

## Abrir

Abra [`index.html`](index.html) em um navegador. Não requer instalação, servidor ou conta de design.

Use **Controles de demonstração** para alternar as telas de acesso e os perfis ilustrativos. Os controles ficam fora da interface representada. O protótipo ocupa a tela disponível; o botão **Menu** mostra ou recolhe a navegação lateral em desktop e celular. Os botões de demonstração mostram o carregamento global e um modal de aviso; o modal fecha pelo botão ou pela tecla Escape, mantém foco acessível e não fecha pelo fundo.

Em telas estreitas, o menu aparece abaixo do cabeçalho e pode ser recolhido após escolher uma tela. No detalhe de lote com cotação USD expirada, siga para Câmbio; após aprovação, o protótipo retorna à simulação do lote sem solicitar a liquidação. A Dashboard também abre Novo lote, Lotes, Câmbio (perfil gestor) e Extrato.

## Estrutura

```text
docs/
├── index.html
├── README.md
└── wireframes/
    ├── prototype.js
    └── styles.css
```

O HTML contém a moldura da aplicação, Dashboard, Lotes, detalhe de lote, Cedentes, Câmbio, Extrato e as telas de entrada, retorno demonstrativo, sessão expirada, acesso negado e página inexistente. A Dashboard alterna entre últimos 7 dias e mês atual, exibe pagamentos por moeda e permite revisar estados com dados, período sem liquidações e consulta indisponível; o gráfico ocupa o espaço restante junto ao card de câmbio e não há tabela de liquidações recentes. Lotes permite pesquisar por identificador ou cedente, filtrar por situação e paginar. O cadastro manual permanece no fluxo guiado; CSV e CNAB abrem um modal para revisar a prévia e os erros. O detalhe apresenta títulos, simulação indicativa, confirmação de solicitação, acompanhamento assíncrono, conclusão, falha total e nova tentativa. A simulação ilustrativa usa centavos inteiros, prazo em dias/30, taxa por tipo, cotação cambial vigente e arredondamento HALF_EVEN. Cedentes inclui pesquisa, paginação, consulta e modais de cadastro e edição, disponíveis também ao perfil gestor. Câmbio consulta uma referência global demonstrativa ao entrar na tela; o operador abre um modal para persistir a proposta, e o gestor decide na tabela de histórico, sem tela separada de acompanhamento. A decisão exige um gestor diferente do solicitante; rejeições pedem justificativa. A aprovação publica uma nova cotação na demonstração; snapshots já aceitos permanecem fixos. Extrato consulta apenas itens de liquidações concluídas, com período inclusivo/exclusivo no calendário de São Paulo, cedente e moeda aplicados ao item, tabela paginada em 20 itens por padrão (até 100) e link ao lote. Dashboard, Lotes, Cedentes, Câmbio e Extrato ocupam a área disponível em desktop; quando o volume exigir, a rolagem permanece na tabela. Em telas estreitas, o conteúdo pode rolar verticalmente e as tabelas preservam sua própria região de rolagem. Os modais usam transições, fechamento por Escape, foco restaurado e suporte a movimento reduzido. `styles.css` reúne as regras responsivas e os padrões reutilizáveis; `prototype.js` controla a navegação por hash, filtros, formulários e estados demonstrativos.

As tabelas paginadas de Lotes, Cedentes e Extrato permitem selecionar a quantidade de itens por página, avançar e retroceder, ver a página atual e informar diretamente a página desejada. O controle de salto respeita os limites atualizados após filtros e tamanho de página; alterar o tamanho ou os filtros retorna à primeira página.

As telas planejadas estão representadas. O conteúdo, cálculos, perfis, cotações e estados de liquidação são demonstrativos: não há autenticação, leitura real de arquivos, chamadas ao backend ou operações financeiras. O cadastro fictício informa os limites de 1 a 1.000 recebíveis e arquivo de até 5 MiB.

## Cenários demonstrativos

- Como operador, abra **Novo lote**, inclua recebíveis e percorra a revisão até cadastrar; o cadastro não inicia a liquidação. Ao escolher CSV ou CNAB, a prévia abre em modal.
- Em **Cedentes**, teste o cadastro e a edição nos modais com os perfis operador e gestor.
- No detalhe do lote, escolha cotação expirada nos controles, confira o bloqueio de itens USD e siga para Câmbio. Como operador, abra **Propor ajuste** e registre a justificativa. Como gestor, analise a proposta na tabela e aprove ou rejeite com justificativa. A aprovação retorna à simulação; a liquidação continua sendo uma ação separada do operador.
- Para conferir a proibição de autoaprovação, envie uma proposta como Ana no perfil Operador e troque para **Operador e gestor**; a proposta da mesma identidade não pode ser aprovada.
- No Extrato, consulte os 29 itens demonstrativos, avance para a segunda página e combine período, cedente e moeda. Os filtros de cedente e moeda operam sobre os itens liquidados.
- Em Lotes, Cedentes e Extrato, altere itens por página, avance e retroceda, e use o campo **Ir para página**; confirme que valores abaixo de 1 ou acima do total não são aceitos.

## Checklist de validação

Verificação estática concluída: 12 rotas, IDs e referências ARIA sem destinos ausentes, caminhos locais existentes, navegação com alvos válidos, CSS responsivo, rolagem interna das tabelas e regra `prefers-reduced-motion`. Os principais pares de cores de texto conferidos ficaram acima de 4,5:1. A sintaxe do JavaScript também passou.

Ainda requer conferência visual e interação no navegador:

- [ ] Desktop em 1366 × 768 e 1920 × 1080; celular em 320, 390 e 430 px. Confirmar o preenchimento da janela e a área do gráfico até o card de câmbio.
- [ ] Recolher e reabrir o menu lateral no desktop e no celular; conferir a rolagem interna das tabelas sem corte de controles.
- [ ] Cadastrar cedente com perfil gestor; abrir a importação CSV/CNAB; propor ajuste cambial a partir da referência global.
- [ ] Navegar por teclado, conferir zoom de 200% e movimento reduzido.
- [ ] Abrir e fechar cada modal cinco vezes; testar Escape, clique durante a saída e restauração de foco.
- [ ] Conferir preservação de filtros, paginação e posição da tabela ao navegar e retornar.

O browser disponível nesta sessão bloqueou a abertura de arquivos `file://` e permite somente URLs HTTP/HTTPS. A política também proíbe contornar esse bloqueio por outro navegador ou por um servidor local; por isso, a validação visual acima permanece pendente. O protótipo pode ser aberto diretamente por você no navegador usando o caminho local desta pasta.

## Validação

- A checklist acima é o roteiro de revisão final do protótipo.
