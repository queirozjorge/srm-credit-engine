# SPEC — SRM Credit Engine

**Decisões aprovadas em 25/09/2026 · Escopo Sênior · Status: estruturas frontend e backend executáveis, sem funcionalidades de negócio implementadas.**

Este documento concentra as decisões, contratos e critérios de aceite do [desafio](desafio-tecnico-srm-credit-engine-v2.md). [README.md](README.md) apresenta o projeto; [AGENTS.md](AGENTS.md) define as convenções de implementação. A liquidação registra a aquisição antecipada do recebível pelo fundo; transferências bancárias reais e controle de saldo de caixa ficam fora desta entrega. O anexo reúne os detalhes técnicos complementares.

## 1. Arquitetura, acesso e entrada

React + Vite + Material UI, com TypeScript estrito (`ui-r-credit`); API Java/Spring Boot (`spe-j-engine`) e worker (`spe-j-workflow`) em projetos Maven separados, com builds independentes. Cada microsserviço mantém suas próprias funcionalidades, modelos, contratos e regras, mesmo quando repetidos; não haverá biblioteca de aplicação compartilhada entre eles. PostgreSQL compartilhado, Kafka, Nginx e Keycloak, executados com Docker. Separar aplicação, negócio e persistência; usar Strategy para os tipos de recebível e adaptadores para as entradas. As implementações próprias de precificação devem atender aos mesmos casos de aferição.

O frontend autentica via Authorization Code + PKCE S256 e envia access token JWT Bearer. O Nginx preserva o cabeçalho; o engine valida assinatura via JWKS, `iss`, `aud`, `exp` e `nbf`, quando presente, antes de prosseguir. Qualquer operador autorizado pode liquidar qualquer lote. Auditar identidades e horários; aprovação cambial exige gestor diferente do solicitante. Não enviar JWT ao Kafka.

CSV, formulário e CNAB alimentam o mesmo motor de validação/cadastro. Cada lote admite **1–1.000 recebíveis**, diferentes cedentes e pagamentos em BRL/USD; valores de origem são sempre BRL. Tipos: duplicata mercantil e cheque pré-datado. A identidade de negócio é **cedente + tipo + referência externa**, única por título/parcela entre todas as entradas e lotes. Cedentes devem estar cadastrados. Validar todos os itens antes de gravar; erro ou duplicidade rejeita o lote inteiro.

CNAB: subconjunto de remessa de cobrança FEBRABAN 240, manual 11.0, headers/trailers e segmentos P/Q, apenas espécies cheque e duplicata mercantil. Outras variantes são rejeitadas. Na revisão da importação, escolher pagamento BRL/USD por item, com BRL padrão. Os campos financeiros do lote tornam-se imutáveis após seu cadastro; tentativas de liquidação não modificam os títulos.

## 2. Cálculo e precisão

| Decisão | Regra |
|---|---|
| Fórmula | `VP = valor_face / (1 + taxa_base + spread)^prazo` |
| Taxas mensais | Base configurável, padrão `0.01`; spread duplicata `0.015`, cheque `0.025` |
| Prazo | Dias corridos entre solicitação aceita e vencimento, divididos por 30; calendário `America/Sao_Paulo` |
| Vencimento | No próprio dia: prazo zero; data anterior: rejeitar |
| Cálculo | `BigDecimal`, 50 algarismos significativos inclusive na potência fracionária; sem `float`/`double` |
| Arredondamento | `HALF_EVEN`, duas casas apenas ao finalizar VP em BRL; não arredondar etapas para centavos |
| Pagamento USD | Dividir o VP em BRL **já arredondado** pela cotação em BRL por USD; arredondar novamente a duas casas |
| Deságio e totais | Deságio = valor de face − VP em BRL; somar valores individuais arredondados, separadamente por moeda |
| Banco/API | Dinheiro `NUMERIC(19,2)`, taxas `NUMERIC(24,12)`; decimais como strings na API |

Taxas são frações decimais; validar valor de face positivo, moeda/tipo suportados e limites numéricos, inclusive de totais e conversões. Persistir dias e convenção de prazo para reprodução. Fixar data, taxas, referência cambial e versão da regra na solicitação aceita. Repetições automáticas utilizam esse snapshot, mesmo após mudança de data ou de cotação.

## 3. Câmbio e aprovação

Para USD, usar a cotação cadastrada mais recente cuja vigência tenha começado, com idade **menor ou igual a 24 horas**. Ausência ou expiração bloqueia o lote inteiro antes de liberar a outbox; lotes exclusivamente em BRL dispensam câmbio.

O operador propõe ajuste positivo com justificativa. Outro usuário com papel de gestor aprova ou rejeita; registrar ambos, valores e horários. A aprovação cria nova cotação no cadastro geral, vigente naquele instante, preservando o histórico. O operador revisa a simulação e solicita novamente a liquidação; aprovação não enfileira automaticamente. Cotações novas não alteram snapshots aceitos ou liquidações. O provedor mockado fornece referência, com timeout/retry limitado, sem substituir a aprovação manual exigida.

## 4. Outbox, idempotência e atomicidade

1. **Cadastro:** gravar lote, recebíveis e outbox **bloqueada** na mesma transação. Nenhuma publicação nessa etapa.
2. **Solicitação:** frontend informa somente UUID do lote e `Idempotency-Key`. Engine valida autorização, estado e condições, fixa o snapshot, registra a chave e libera a outbox na mesma transação. Responder `202` após commit.
3. **Publicação:** relay por polling publica em `credit-lot` somente `{batchUuid, idempotencyKey}`, com UUID do lote como chave Kafka. Workers compartilham um consumer group; tratar entrega como pelo menos uma vez.
4. **Liquidação:** conferir a solicitação ativa e gravar todos os itens financeiros, auditoria de sucesso e conclusão do lote em **uma transação PostgreSQL**. Erro em qualquer item provoca rollback de tudo. Confirmar o consumo após persistência do resultado ou do tratamento definitivo da falha.

O consumer group não garante sozinho efeito único no banco. Usar idempotência persistida, optimistic locking, resultado único por lote e liquidação única por recebível. Mesma chave/operação e mesmo lote retorna a operação existente; chave reutilizada para outro lote gera `409`. Chaves diferentes concorrendo pelo mesmo lote permitem apenas um aceite; demais recebem conflito. Lote concluído retorna o resultado existente.

Falhas transitórias permitem três repetições adicionais, após 1, 5 e 15 segundos. Falha definitiva fica registrada e encaminhada para tratamento, sem liquidação parcial. Nova tentativa manual exige lote definitivamente falho, nova confirmação e nova chave, recalculando prazo e câmbio. Mensagens de tentativas antigas não executam a nova solicitação. Detalhes de recuperação e estados estão no anexo D.

## 5. Persistência, API e interface

PostgreSQL com UUID nativo como única chave primária, FKs UUID, nomes `snake_case`, datas `DATE` e instantes `TIMESTAMPTZ` tratados em UTC. Cadastros mutáveis usam `date_register`, `date_updated` e, quando aplicável, `deleted BOOLEAN`. Liquidações e eventos de auditoria são somente inserção/leitura, sem atualização ou exclusão. Unicidade financeira permanece válida após exclusão lógica de cadastros. Migrations versionadas pertencem ao engine.

API REST/OpenAPI: `201` criação, `202` aceite assíncrono, `404` recurso inexistente, `409` conflito e `200` com coleção vazia para consultas sem resultado; alterações parciais usam `PATCH`. Extrato paginado filtra período da liquidação, cedente e moeda, com filtros executados no banco. Erros e textos em português brasileiro.

Simulação e atualização periódica de status não bloqueiam a tela. Operações explícitas usam AppLoader e desabilitam imediatamente o botão; após `202`, liberar a tela e acompanhar o lote. Preservar chave em falhas de rede, filtros, foco e edição. Backend é a autoridade de integridade. Manter acessibilidade, máscaras, validação por campo, alertas em modal e textos estáticos centralizados em `pt-BR.ts`.

## 6. Aceite e perguntas para um projeto real

| Área | Critério verificável na implementação |
|---|---|
| Precisão | C1 **R$ 92.859,94**, C2 **R$ 23.337,77**, C3 **US$ 17.094,67**, com as premissas fixas do desafio; testar frações de mês e arredondamento |
| Integridade | Concorrência entre operadores, chaves iguais/diferentes, reentrega Kafka e falha após commit produzem um único resultado; falha de um item deixa zero liquidações do lote |
| Entrada | Formulário/CSV/CNAB equivalentes produzem os mesmos dados; rejeitar arquivo inválido, duplicidade, lote vazio ou acima de 1.000 itens |
| Segurança | Negar JWT inválido, acesso sem papel e autoaprovação; cotação vencida impede USD; auditoria registra condições e responsáveis sem tokens |
| Usabilidade | Fluxo completo por teclado, sem perder estado; simulação ignora respostas antigas; botão bloqueado durante envio e estado assíncrono visível |
| Desempenho | Metas em ambiente de referência: P95 de simulação ≤ 500 ms, aceite ≤ 1 s e processamento de 1.000 itens ≤ 10 s; medir, não presumir atendimento |
| Operação Sênior | Testes unitários/integrados, conflito de optimistic locking demonstrado, CI com testes/linter, Docker Compose, logs estruturados, métricas de liquidações e latência, resiliência do mock e diagramas ER/C4 níveis 1 e 2 |

**Perguntas ao negócio em produção:** dias/30 e vencimento no dia atendem aos contratos reais? Quais limites de valor, retenção e regras de aprovação são obrigatórios? Quais bancos/leiautes adicionais e formatos de referência identificam parcelas? Há controle de caixa, impostos, tarifas ou transferência bancária? Qual volume e SLA reais? As premissas acima fecham esta entrega; essas perguntas não impedem sua implementação.

## Anexo — Contratos e detalhes operacionais

### A. Identidade e responsabilidades

- Frontend OIDC público, sem client secret no navegador; access token em memória. Nginx não deve cachear respostas financeiras autenticadas.
- `OPERADOR`: cadastros, simulação, consulta de lotes, liquidação e proposta cambial. `GESTOR`: consulta e decisão cambial. Um usuário pode ter ambos os papéis, mantendo a proibição de autoaprovação.
- A identidade auditada deriva de `iss` + `sub` validados, nunca do body. Não registrar JWT, senhas ou arquivos integrais em logs.
- Aceitar apenas algoritmos de assinatura permitidos. Chave JWKS conhecida em cache pode ser utilizada conforme sua validade; não conseguir obter uma chave desconhecida impede autenticação.
- Worker e relay usam credenciais técnicas. O worker exige solicitação autorizada e ativa no banco; a mensagem sozinha não autoriza liquidação. A expiração posterior do token do operador não cancela o aceite já persistido.
- Engine implementa simulação e validação do aceite; worker implementa cálculo e liquidação pelo snapshot. Cada um mantém motor e testes próprios. Alterações preservam compatibilidade de mensagens, schema e regras. O worker verifica o schema antes de consumir; não realiza chamadas externas dentro da transação financeira.

### B. Formatos de entrada

O contrato normalizado contém cedente cadastrado, referência externa, tipo, valor de face, vencimento e moeda de pagamento. Não criar cedentes implicitamente. Prévia/revisão não persiste lote; cadastro definitivo valida novamente. O motor comum aos adaptadores de entrada pertence ao engine, sem biblioteca compartilhada com o worker.

| Entrada | Contrato |
|---|---|
| Formulário | JSON com UUID do cedente, tipos `DUPLICATA_MERCANTIL`/`CHEQUE_PRE_DATADO`, moedas `BRL`/`USD`, datas `YYYY-MM-DD` e dinheiro como string decimal sem máscara. |
| CSV | UTF-8, separador `;`, cabeçalho `cedente_documento;referencia_externa;tipo;valor_face;vencimento;moeda_pagamento`; aspas duplas para escape. Dinheiro com ponto e duas casas, sem agrupamento; datas `YYYY-MM-DD`. Resolver documento para cedente existente e informar erros por linha/campo. |
| Arquivos | Até 5 MiB; aplicar limites antes de carregar volumes ilimitados em memória. |

CNAB segue a seção 3.2.2 do [manual FEBRABAN 240, versão 11.0](https://cmsarquivos.febraban.org.br/Arquivos/documentos/PDF/Layout%20padrao%20CNAB240%20V%2011_0%20-%202026_09_11.pdf): serviço `01`, lote versão `060`, remessa de entrada com pares P/Q. Espécies `01` (cheque) e `02` (duplicata mercantil). Ler cedente no header de lote; referência no número do documento, valor nominal e vencimento no segmento P. Validar 240 posições, sequência e contagens. O código de moeda do título representa BRL. Rejeitar retornos, versões/segmentos incompatíveis e comandos de baixa, pagamento ou alteração. Encargos, abatimentos e descontos adicionais fora do perfil também são rejeitados, sem modificar silenciosamente o valor de face.

A referência identifica uma parcela: preservar zeros à esquerda e normalizar somente espaços externos. O cedente deve fornecer a mesma referência entre formatos. Identificadores diferentes para o mesmo título real não são dedutíveis automaticamente sem uma fonte externa. O limite de itens é configurável; o vencimento é validado no cadastro e novamente no aceite da liquidação.

### C. Snapshot e ajustes cambiais

Persistir instante do aceite, data do cálculo, dias, convenção de prazo, taxa base, spreads, política/versão do cálculo e identificação, valor e vigência da cotação. Não substituir esses dados por configurações atuais. Versão de regra não suportada gera erro explícito. `Math.pow` e conversões intermediárias para `double` não atendem ao cálculo decimal.

Selecionar a maior vigência não futura e impedir empate de vigência para o mesmo par cambial por constraint. Propostas usam estados `PENDING`, `APPROVED` ou `REJECTED`; decisão única protegida contra concorrência. Aprovação grava cotação e auditoria na mesma transação; rejeição exige justificativa.

No provedor mockado, timeout de 2 segundos por chamada e até duas repetições adicionais, após 500 ms e 1 segundo, somente para falhas transitórias. Consultar fora da transação financeira. Indisponibilidade deve ser informada e não impede uma proposta preenchida manualmente nem o uso de cotação válida já cadastrada. O mock não publica cotação automaticamente.

### D. Estados, publicação e recuperação

| Estado do lote | Significado |
|---|---|
| `READY` | Cadastro concluído; outbox bloqueada. |
| `PENDING` | Solicitação aceita: aguardando publicação, na fila ou em processamento. |
| `SETTLED` | Todos os efeitos financeiros confirmados. |
| `FAILED` | Falha definitiva registrada, sem liquidações do lote. |

A outbox inicial `BLOCKED` ainda não tem chave de solicitação nem comando publicável. No aceite, vincular a solicitação ativa, registrar o snapshot e preparar/liberar a outbox como `READY`; o payload fica imutável. UUIDs são gerados no backend.

O relay reivindica registros publicáveis com controle de concorrência e prazo de recuperação. Só marca `SENT` após confirmação do broker. Reivindicações abandonadas expiram; falhas mantêm a mensagem recuperável. Falhar entre publicação e marcação pode repetir a entrega, sem repetir a liquidação. Não descartar comandos após esgotar tentativas de envio.

Processar ordenadamente por partição. A proteção PostgreSQL permanece necessária em rebalances, instâncias antigas e reentregas após commit, conforme as [garantias do Kafka](https://kafka.apache.org/41/design/design/). A chave de idempotência tem escopo global por operação, não por operador; preservar a associação ao lote durante todo o ciclo de vida financeiro.

| Requisição | Resposta |
|---|---|
| Mesma chave/lote pendente | `202`, operação existente, sem novo comando. |
| Mesma chave/lote concluído ou falho | `200`, estado/resultado existente, sem reexecução. |
| Mesma chave para outro lote | `409`. |
| Outra chave/lote pendente | `409`, com referência à operação ativa. |
| Outra chave/lote concluído | `200`, resultado existente. |
| Nova chave/lote definitivamente falho | Novo aceite conforme a seção 4, com nova solicitação e outbox. |

Após conflito otimista ou de unicidade, reler o estado: conclusão por outro worker é resultado existente, não falha. Conferir a solicitação ativa dentro do controle de versão da transação. Mensagem antiga é ignorada com diagnóstico e não pode modificar a nova tentativa.

Persistir a contagem de repetições por solicitação para que reinícios não renovem seu orçamento. Após rollback e falha definitiva, uma transação separada, condicionada à solicitação ainda ativa e não concluída, registra `FAILED`, diagnóstico/auditoria e outbox para `credit-lot.dlq`. Só então reconhecer o comando original. A DLQ usa os mesmos dois identificadores; detalhes do erro ficam no banco.

Se o banco não permitir nem persistir a falha, não reconhecer o comando nem anunciar falha definitiva. Pausar/recuperar o consumo e sinalizar indisponibilidade. Condições aceitas permanecem válidas nas repetições automáticas, inclusive se a cotação envelhecer ou o vencimento passar durante a espera.

### E. Contratos HTTP e acompanhamento

OpenAPI deve cobrir prévia/importação, criação de lotes, simulação, cedentes, consultas, extrato e propostas/decisões cambiais.

- `POST /batches/{batchUuid}/settlements`: cabeçalho `Idempotency-Key`, sem body financeiro; devolver lote, identificação da solicitação, estado e localização de consulta.
- `GET /batches/{batchUuid}`: estado e operação ativa. A consulta individual da solicitação preserva seu histórico após novas tentativas.
- Além dos códigos da seção 5, usar `400` para formato inválido, `401` para autenticação inválida, `403` para permissão insuficiente, `413` para arquivo acima do limite, `422` para regra/dado inválido e `204` para sucesso sem conteúdo. Erros incluem código estável, mensagem e detalhes aplicáveis, sem stack trace.
- Extrato: início inclusivo/fim exclusivo, convertidos do calendário local para UTC; somente liquidações concluídas. Filtrar cedente/moeda nos itens, não apenas no cabeçalho do lote. SQL otimizado, 20 itens por página, máximo de 100 e ordenação por instante/UUID.
- Simulação: debounce de 400 ms, cancelando ou ignorando respostas antigas. Valores são indicativos; condições finais são fixadas no aceite e apresentadas no acompanhamento.
- Status: consultar a cada 5 segundos enquanto pendente, sem sobreposição; interromper em estado terminal, saída da tela, aba oculta ou sessão inválida. Não repetir o mesmo modal de erro em cada consulta.

### F. Verificação e entregáveis

Para os golden cases, 90 e 60 dias correspondem a 3 e 2 meses. Cada projeto testa seu motor com as entradas/saídas do desafio, sem depender da data corrente, e cobre frações de mês, prazo zero, overflow e arredondamento. Testes integrados usam PostgreSQL/Kafka compatíveis com o ambiente para demonstrar rollback, concorrência, reentrega e recuperação; incluir aprovação cambial concorrente e fronteira exata de 24 horas.

As metas da seção 6 usam ambiente de referência Docker com 4 vCPU e 8 GiB disponíveis, banco pré-carregado, aplicações aquecidas e um lote em processamento por vez. Carga HTTP: 5 solicitações/s por 5 minutos, após 1 minuto de aquecimento. Tempo do lote conta do início do processamento ao commit; medir espera em fila separadamente. Registrar ambiente, massa e resultados antes de afirmar atendimento.

Além da contagem de liquidações e latência, observar idade da outbox, falhas e mensagens na DLQ. Logs estruturados preservam causa/stack trace e correlação. Validar navegação por teclado, estado preservado e modais conforme AGENTS.md.

Na implementação, entregar também `REVIEW.md`, `AI_USAGE.md` e `DECISIONS.md`, documentando neste último o custo adicional de CNAB/aprovação cambial. Diagramas ER/C4 e comandos reais de execução serão adicionados quando produzidos; esta especificação não representa código ou testes já executados.
