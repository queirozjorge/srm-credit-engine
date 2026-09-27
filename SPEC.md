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
- `OPERADOR`: cadastros, simulação, consulta de lotes, liquidação e proposta cambial. `GESTOR`: consultas, cadastro/edição de cedentes e decisão cambial. A permissão de manter cedentes não autoriza o gestor a cadastrar lotes, executar simulações ou solicitar liquidações. Um usuário pode ter ambos os papéis, mantendo a proibição de autoaprovação. Matriz detalhada no anexo H.2, alinhada ao wireframe em 26/09/2026.
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

Os entregáveis de revisão, registro de uso de IA e decisões ficam em [REVIEW.md](REVIEW.md), [AI_USAGE.md](AI_USAGE.md) e [DECISIONS.md](DECISIONS.md). Os comandos executáveis estão em [README.md](README.md); diagramas ER/C4 serão adicionados quando produzidos. Esta especificação descreve contratos esperados, não funcionalidades de negócio já realizadas.

### G. Gateway e ambiente Compose local

Este contrato descreve o gateway do ambiente local. O Compose não torna as aplicações de negócio prontas para produção; autenticação no engine e operações financeiras continuam sujeitas aos contratos anteriores e ainda não estão implementadas.

- **Origem e HTTPS:** acessar `https://localhost:8443`. `http://localhost:8088` responde `308` para HTTPS e preserva caminho e query string. O certificado autoassinado de desenvolvimento cobre `localhost` e `127.0.0.1`; o Compose não altera a confiança do sistema operacional.
- **Prefixos:** `/api/` vai para `spe-j-engine:8080`, removendo apenas `/api` e enviando `X-Forwarded-Prefix: /api`. `/auth/` vai para `keycloak:8080`, mantendo o prefixo. O issuer público é `https://localhost:8443/auth/realms/srm-credit`. Swagger do engine fica em `/api/swagger-ui.html` e OpenAPI em `/api/v3/api-docs`.
- **Cabeçalhos e métodos:** encaminhar `Authorization` e `Idempotency-Key`; substituir cabeçalhos encaminhados pelo cliente por valores calculados no gateway e gerar um identificador de correlação. Preservar método, corpo e status do upstream. Desabilitar repetição automática de requisições e cache de upstream.
- **Limites locais:** API aceita 10 requisições por segundo por IP, com burst 20 e sem atraso; o excesso responde `429`. Nginx aceita corpos HTTP até 6 MiB para comportar multipart; arquivos de negócio continuam limitados a 5 MiB. O limite do gateway não substitui a validação funcional no backend.
- **Erros emitidos pelo gateway:** usar `application/json`, código estável e mensagem em português: `413 REQUISICAO_MUITO_GRANDE`, `429 LIMITE_DE_REQUISICOES_EXCEDIDO`, `502 SERVICO_INDISPONIVEL` e `504 TEMPO_LIMITE_EXCEDIDO`. `502` representa falha de conexão; `504`, timeout. Respostas de erro originadas pelo upstream mantêm seu status e corpo. O acesso público a `/actuator` e `/api/actuator` retorna `404 ROTA_INEXISTENTE`.
- **Timeouts e cache:** conexão ao upstream em 5 s; envio e leitura em 60 s. `/api/` e `/auth/` não são armazenados em cache. `index.html` exige revalidação e não pode ser armazenado; assets com hash podem ficar em cache por um ano com `immutable`, enquanto outros assets exigem revalidação.
- **Acesso e health:** somente Nginx publica portas no host, em `127.0.0.1:8088` e `127.0.0.1:8443`. PostgreSQL, Kafka, Keycloak e aplicações ficam na rede do Compose. Health do engine/workflow usa portas internas `8081`/`18082`, expondo somente readiness sem componentes ou detalhes; health do Keycloak fica na porta interna `9000`.
- **Logs do gateway:** formato JSON com instante, IP, método, URI sem query string, status, bytes, duração e correlação. Não registrar Authorization, cookies, corpos, query string ou códigos/tokens OIDC.

O Compose é para desenvolvimento local: usa certificado autoassinado, credenciais de demonstração, um broker Kafka com fator de replicação 1 e HTTP entre serviços dentro da rede Docker. Produção exige configuração própria de hostname, certificados, gestão de segredos, disponibilidade, backups, observabilidade e controles de rede.

O README descreve comandos de execução e diagnóstico. [DECISIONS.md](DECISIONS.md) registra as escolhas do ambiente local, alternativas e custos. Esta especificação define contratos; não afirma que as funcionalidades de negócio estejam implementadas.

### H. Contratos propostos para o frontend e seus mocks

**Task 01 · 26/09/2026 · Contratos definidos para implementação, ainda sem endpoints de negócio implementados.** Este anexo é a fonte dos contratos para os futuros tipos TypeScript, schemas de validação, mocks HTTP e OpenAPI do engine. Não representa uma API disponível. As regras financeiras e de idempotência dos anexos anteriores permanecem válidas; alterações futuras devem atualizar mocks, consumidores e documentação em conjunto. O [mapa de telas e backlog](docs/FRONTEND_TASKS.md) acompanha a execução, sem substituir estes contratos.

#### H.1. Convenções de transporte

- Rotas abaixo são relativas a `/api` no navegador; o gateway remove esse prefixo. APIs não usam as rotas de navegação do frontend.
- JSON usa `camelCase`. UUIDs, documentos, referências externas, valores monetários, taxas e versões são strings. Contagens, páginas, índices, linhas e dias são inteiros JSON. `version` representa o `BIGINT` do banco sem perda de precisão no JavaScript.
- Dinheiro tem duas casas, sem agrupamento, por exemplo `"1000.00"`; taxas/câmbio têm até 12 casas e ponto decimal. Aplicar limites numéricos da seção 2, sem converter dinheiro ou taxas para `number`. Resultados financeiros vêm do backend; o frontend formata e apresenta.
- Datas civis usam `YYYY-MM-DD`; instantes usam ISO 8601 UTC com `Z`. Identidades retornadas usam `{ issuer, subject }`, derivados de `iss` e `sub`; nomes pessoais não são requisito do modelo. Identidades, permissões, snapshots e resultados não são aceitos do cliente.
- Paginação: `page` começa em 1; `size` padrão 20, entre 1 e 100. Envelope `Page<T> = { items: T[], page: number, size: number, totalItems: number, totalPages: number }`. Coleção vazia tem `items: []`, `totalItems: 0`, `totalPages: 0`; página positiva além do total também retorna `200` vazia, preservando os totais reais. Página/tamanho inválido retorna `400`.
- Interface oferece tamanhos 5, 10, 20 e 50 em Lotes/Cedentes, inicialmente 20; Extrato oferece 20, 50 e 100. O tamanho 5 inicial do protótipo é apenas demonstrativo. Filtros/tamanho novos voltam à página 1; não percorrer páginas automaticamente nem carregar a base inteira para filtrar no navegador.
- `q` é busca textual com espaços externos removidos; vazio equivale a ausente. Filtros ausentes significam todos, nunca enviar o texto traduzido “Todas”. Ordenação fixa: cadastro e UUID decrescentes; exceções de extrato, itens e cotação estão descritas adiante. Buscas e filtros de coleções são executados no banco.
- Campos obrigatórios não aceitam `null`. Nulabilidade aparece explicitamente nos contratos abaixo. Campos opcionais podem ser omitidos; em `PATCH`, omissão preserva o valor e `null` não apaga campos obrigatórios. Rejeitar campos de entrada não previstos com `400`, inclusive dados financeiros enviados na solicitação de liquidação.
- `201` devolve identificação do recurso e `Location` pública sob `/api`; `204` não possui body. Mutações não têm retry automático genérico. Após sucesso, uma consulta atualiza a visão afetada; outras consultas em cache são marcadas como desatualizadas, sem disparar refetches em cascata.

Erros do engine seguem `ApiError = { code: string, message: string, details?: FieldIssue[], context?: { batchUuid?: string, requestUuid?: string, statusUrl?: string } }`, com `FieldIssue = { code: string, message: string, field?: string, itemIndex?: number, line?: number }`. `itemIndex` começa em 0; `line` é a linha física do arquivo, começando em 1. Caminhos de campo usam notação como `items[0].faceValueBrl`. Mensagens são pt-BR, sem stack trace. Erros do gateway podem conter somente `code` e `message`, conforme G.

| HTTP | Códigos iniciais / tratamento |
|---|---|
| `400` | `REQUISICAO_INVALIDA`, `PAGINACAO_INVALIDA`: formato, campo ou enum inválido. |
| `401` / `403` | `SESSAO_INVALIDA` / `ACESSO_NEGADO`; `AUTOAPROVACAO_PROIBIDA` na decisão pela própria identidade. |
| `404` | `RECURSO_NAO_ENCONTRADO`, `ROTA_INEXISTENTE`; não usar para consultas vazias. |
| `409` | `DOCUMENTO_DUPLICADO`, `RECEBIVEL_DUPLICADO`, `VERSAO_DESATUALIZADA`, `PROPOSTA_JA_DECIDIDA`, `LOTE_EM_PROCESSAMENTO`, `CHAVE_IDEMPOTENCIA_REUTILIZADA`. Conflito de lote pendente inclui referência à operação ativa em `context`. |
| `413` | `ARQUIVO_MUITO_GRANDE`; gateway pode emitir o código próprio definido em G. |
| `422` | `DADOS_INVALIDOS`, `ARQUIVO_INVALIDO`, `COTACAO_AUSENTE`, `COTACAO_EXPIRADA`, `VENCIMENTO_INVALIDO`, `LIMITE_NUMERICO_EXCEDIDO`; detalhes quando houver campo/linha identificável. |
| `503` | `REFERENCIA_CAMBIAL_INDISPONIVEL`, quando o provedor não responder após a política do anexo C. |
| `500` | `ERRO_INTERNO`: mensagem segura e causa registrada no servidor. Falha nunca é convertida em sucesso. |

Os códigos de gateway `429`, `502` e `504` permanecem conforme G. Erros operacionais abrem o modal reutilizável; erros específicos de campo podem ser associados ao campo. Falhas no polling não repetem o mesmo modal. A resposta de prévia inválida estende `ApiError` com campos de revisão descritos em H.4, mantendo o formato de `details`; não é uma resposta de sucesso.

#### H.2. Matriz de permissões

Todas as operações de negócio exigem JWT válido e pelo menos um papel reconhecido. Consultas não filtram pelo criador. Os dois papéis acumulam permissões, mas não removem a proibição de autoaprovação.

| Operação | OPERADOR | GESTOR |
|---|---|---|
| Dashboard, cedentes, lotes, recebíveis, solicitações e extrato | Sim | Sim |
| Consultar câmbio, referência, propostas e cotações | Sim | Sim |
| Cadastrar e editar cedente | Sim | Sim |
| Prévia/importação, cadastro de lote e simulação | Sim | Não |
| Solicitar liquidação e nova tentativa manual | Sim | Não |
| Propor cotação | Sim | Não |
| Aprovar/rejeitar proposta de outra identidade | Não | Sim |

Não há telas/endpoints de edição de lote cadastrado, liquidação ou auditoria. Exclusão/reativação de cedentes não integra estas telas; o suporte previsto no modelo de dados não cria implicitamente uma operação pública.

#### H.3. Cedentes — domínio frontend `register`

`Assignor = { uuid, name, documentNumber, deleted: boolean, version, registeredAt, updatedAt: string | null }`. Campos sem tipo explícito nesta notação são strings. Nome obrigatório após trim, até 150 caracteres; documento CNPJ normalizado sem máscara, preservando zeros, validado no engine. Usar fixtures sintéticas válidas nos testes de sucesso, não os documentos inválidos do wireframe.

| Operação | Entrada | Resposta |
|---|---|---|
| `GET /assignors` | `q?` por nome/documento, `activeOnly?` booleano (padrão `false`), `page`, `size`. Seleção para novos títulos usa `activeOnly=true`. | `200 Page<Assignor>` |
| `GET /assignors/{uuid}` | UUID. Inclui cedente inativo para consulta histórica. | `200 Assignor` ou `404` |
| `POST /assignors` | `{ name, documentNumber }` | `201 { uuid }`, `Location: /api/assignors/{uuid}` |
| `PATCH /assignors/{uuid}` | `{ name?: string, version: string }`; exigir ao menos `name`. | `204`; versão concorrente usa `409 VERSAO_DESATUALIZADA`. |

Documento é imutável na edição. Uma edição atualiza apenas o nome, com versão esperada; não oferecer a troca de identidade que o protótipo permite. Cadastro/edição registram o usuário autenticado conforme as regras de auditoria existentes.

#### H.4. Cadastro, prévia e consulta de lotes — domínio frontend `batch`

`ReceivableInput = { assignorUuid, externalReference, type, faceValueBrl, dueDate, paymentCurrency }`, com `type` em `DUPLICATA_MERCANTIL | CHEQUE_PRE_DATADO` e `paymentCurrency` em `BRL | USD`. Não aceitar taxas, resultados, identidade do usuário ou UUID de novo recebível. Usar as normalizações e limites dos anexos B e C.

`BatchSummary = { uuid, source, status, itemCount: number, assignorCount: number, soleAssignor: { uuid, name } | null, faceValueBrl, registeredAt }`. `source` é `FORM | CSV | CNAB`; estados conforme D. `soleAssignor` só existe quando há exatamente um cedente; para vários, mostrar a contagem, sem atribuir o lote ao primeiro cedente. Exibir UUID como identificador, com quebra de linha/cópia quando necessário; códigos `LT-181` são exclusivos do protótipo.

`BatchDetail` acrescenta a `BatchSummary` os campos `createdBy: Actor`, `activeRequest: SettlementRequest | null`, onde `Actor = { issuer: string, subject: string }`. Não carregar todos os títulos em cada consulta periódica. `Receivable` contém `uuid`, os campos de `ReceivableInput` e `assignorName`.

| Operação | Entrada | Resposta |
|---|---|---|
| `GET /batches` | `q?` por UUID ou nome de qualquer cedente do lote, `status?`, `page`, `size`. Filtro por cedente seleciona lotes, sem reduzir seus totais. | `200 Page<BatchSummary>` |
| `GET /batches/{batchUuid}` | UUID. | `200 BatchDetail`; preserva estado/operação ativa exigidos em E. |
| `GET /batches/{batchUuid}/receivables` | `page`, `size`; ordem fixa por UUID crescente. | `200 Page<Receivable>` |
| `POST /batches/preview` | `multipart/form-data`: `file` e `format` (`CSV` ou `CNAB`). | `200 ImportPreview` válida; `422` inválida, `413` acima do limite. |
| `POST /batches` — manual | `application/json`: `{ items: ReceivableInput[] }`. Origem `FORM` definida pelo servidor. | `201 { uuid, status: "READY" }`, `Location: /api/batches/{uuid}` |
| `POST /batches` — arquivo | `multipart/form-data`: arquivo original `file`, `format`, e parte JSON `paymentCurrencies?: { itemIndex: number, paymentCurrency: "BRL" \| "USD" }[]` somente para CNAB. | Mesmo `201`; servidor relê/valida o arquivo, aplica escolhas CNAB e cadastra atomicamente. |

`ImportPreview = { source: "CSV" | "CNAB", itemCount: number, faceValueBrl: string, items: ImportPreviewItem[] }`; cada `ImportPreviewItem` contém `itemIndex`, `line`, `assignorName` e os campos normalizados de `ReceivableInput`. Em CNAB, `line` identifica o segmento P e o índice conta pares P/Q na ordem do arquivo. Moeda padrão BRL, podendo mudar na revisão; CSV mantém a moeda expressa no arquivo. Índices repetidos/fora do intervalo e moedas inválidas são rejeitados.

Prévia inválida retorna `422 { code: "ARQUIVO_INVALIDO", message, details: FieldIssue[], preview: { source, items: ImportPreviewItem[] } }`. `preview.items` contém somente linhas integralmente válidas para ajudar a revisão, nunca autoriza importar parcialmente. Arquivo estruturalmente ilegível usa coleção vazia. Limitar detalhes a 1.000 ocorrências, adicionando `detailsTruncated: true` se houver mais. Prévia válida e inválida não persistem lote, recebíveis ou outbox. Arquivo acima de 5 MiB falha antes do parsing; acima de 1.000 itens não gera prévia ilimitada.

No cadastro definitivo, repetir todas as validações, inclusive duplicidades e vencimentos; arquivo original continua apenas na memória do fluxo até conclusão/cancelamento. O cliente não envia `source` para transformar JSON arbitrário em importação auditada. Um erro impede o lote inteiro. Não há retry automático de cadastro após timeout: informar resultado incerto e permitir consultar Lotes antes de repetir, sem aplicar indevidamente o contrato de idempotência da liquidação.

#### H.5. Simulação — domínio frontend `pricing`

| Operação | Entrada | Resposta |
|---|---|---|
| `POST /simulations` | União exclusiva `{ batchUuid }` ou `{ items: ReceivableInput[] }`; rascunho limitado a 1–1.000 itens. Sem datas de cálculo, taxas ou câmbio fornecidos pelo cliente. | `200 Simulation`; inválida/bloqueada retorna `422 ApiError`. Nenhuma persistência financeira. |

`Simulation = { calculatedAt, calculationDate, indicative: true, calculationVersion, baseRate, exchangeRate: ExchangeQuote | null, totals: FinancialTotals, items: SimulationItem[] }`.

`FinancialTotals = { faceValueBrl, presentValueBrl, discountBrl, paymentBrl, paymentUsd }`, todos strings monetárias, incluindo `"0.00"` quando não houver pagamentos em uma moeda. `SimulationItem = { itemIndex: number, receivableUuid?: string, days: number, spread, termMonths, presentValueBrl, discountBrl, paymentCurrency, paymentValue }`. `termMonths` é decimal textual de prazo, não uma taxa limitada a 12 casas; o backend aplica a precisão definida na seção 2. Para lote cadastrado, itens seguem UUID crescente e incluem `receivableUuid`; para rascunho, seguem a ordem recebida.

Debounce de 400 ms em edição válida; cancelar/ignorar respostas antigas e manter os dados anteriores identificados como desatualizados enquanto a consulta atual não conclui. Não mostrar dados anteriores como uma simulação válida após erro. O gestor consulta resultados aceitos, mas não dispara esta operação. Mocks usam resultados determinísticos por cenário; não portar o motor demonstrativo do HTML para produção.

#### H.6. Solicitações, resultado e extrato — domínio frontend `settlement`

| Operação | Entrada | Resposta |
|---|---|---|
| `POST /batches/{batchUuid}/settlements` | `Idempotency-Key` obrigatório; sem body financeiro, conforme E. | `202 SettlementRequest` no aceite/pendência ou `200 SettlementRequest` para resultado existente, conforme D. `Location` aponta para `statusUrl`. |
| `GET /batches/{batchUuid}/settlements` | `page`, `size`. | `200 Page<SettlementRequest>`; histórico preservado após novas tentativas. |
| `GET /settlement-requests/{requestUuid}` | UUID. | `200 SettlementRequest` ou `404`. |
| `GET /settlement-requests/{requestUuid}/items` | `page`, `size`; UUID do recebível crescente. | `200 Page<SettlementRequestItem>` com condições fixadas e resultados quando concluído. |
| `GET /settlements/items` | `start?`, `end?` em UTC, `assignorUuid?`, `paymentCurrency?`, `page`, `size`. | `200 Page<StatementItem>` somente de liquidações concluídas. |

`SettlementRequest = { uuid, batchUuid, status, statusUrl, acceptedAt, requestedBy: Actor, snapshot: AcceptedSnapshot, completedAt: string | null, result: SettlementResult | null, failure: { code, message } | null }`. `status` é `PENDING | SETTLED | FAILED`; `statusUrl` é caminho relativo `/api/settlement-requests/{uuid}`. Em `PENDING`, os três campos finais são nulos; `SETTLED` exige conclusão/resultado e falha nula; `FAILED` exige conclusão/falha e resultado nulo. Falha exposta é segura, sem diagnóstico técnico interno.

`AcceptedSnapshot = { calculationDate, calculationVersion, dayCountConvention: "ACTUAL_30", baseRate, exchangeRate: ExchangeQuote | null }`. `SettlementRequestItem = { receivable: Receivable, terms: { days: number, termMonths, spread }, result: { presentValueBrl, discountBrl, paymentCurrency, paymentValue } | null }`. Resultados só aparecem quando toda a liquidação está confirmada; simulação anterior nunca preenche resultado de solicitação pendente/falha. `SettlementResult = { uuid, settledAt, totals: FinancialTotals }`.

`StatementItem = { uuid, batchUuid, requestUuid, settledAt, receivableUuid, assignorUuid, assignorName, externalReference, paymentCurrency, faceValueBrl, presentValueBrl, paymentValue }`. Ordem decrescente por instante da liquidação, UUID da liquidação e UUID do item. `start` inclui o instante e `end` o exclui; se ambos informados, exigir `start < end`. Datas escolhidas na UI viram início do respectivo dia em `America/Sao_Paulo`, convertido para UTC; não usar o fuso do navegador. Sem limites, consulta paginada de todo o histórico. Estado inicial da UI: últimos sete dias incluindo hoje, com fim exclusivo no início de amanhã.

Manter a tabela de idempotência do anexo D integralmente: mesma chave nunca reexecuta; nova tentativa manual só após `FAILED`, com nova confirmação/chave e novas condições. Chave pertence à operação, não ao operador. O frontend gera uma chave por tentativa e preserva sua associação ao lote em falhas de rede; chave de repetição não é substituída por conflito ou timeout.

O acompanhamento usa apenas `GET /batches/{batchUuid}` a cada 5 s para acompanhar também uma operação ativa iniciada por outro operador; consultar detalhe histórico somente sob ação do usuário. Suspender nas condições de E e retomar quando a tela estiver visível e autenticada, sem consultas sobrepostas. Não há estados financeiros intermediários inventados como “parcialmente liquidado”.

#### H.7. Câmbio — domínio frontend `exchange`

`ExchangeQuote = { uuid, proposalUuid, rate, effectiveFrom, validUntil }`, sempre BRL por USD; `validUntil` corresponde a `effectiveFrom + 24h`, com limite inclusivo. A validade para uma nova solicitação é reavaliada pelo servidor; sua expiração não invalida snapshots aceitos.

`ExchangeProposal = { uuid, proposedRate, justification, status, requestedBy: Actor, registeredAt, version, decision: { status: "APPROVED" | "REJECTED", decidedBy: Actor, decidedAt, reason: string | null, quote: ExchangeQuote | null } | null }`. Proposta pendente tem `decision: null`; aprovada inclui cotação; rejeitada inclui justificativa e cotação nula.

| Operação | Entrada | Resposta |
|---|---|---|
| `GET /exchange` | `history=proposals\|quotes` (padrão `proposals`), `status?` somente para propostas, `page`, `size`. | `200 ExchangeView` com cotação atual e uma página do histórico escolhido. |
| `GET /exchange/reference` | Sem entrada financeira. Uma chamada ao entrar na tela; atualização posterior explícita. | `200 { rate, observedAt }` ou `503`; provedor mockado segue timeout/retry de C. |
| `POST /exchange/proposals` | `{ proposedRate, justification }`; taxa positiva até 12 casas; justificativa após trim entre 1 e 500 caracteres. | `201 { uuid }`, `Location: /api/exchange/proposals/{uuid}`. |
| `GET /exchange/proposals/{uuid}` | UUID. | `200 ExchangeProposal` ou `404`. |
| `PATCH /exchange/proposals/{uuid}` | `{ status: "APPROVED" \| "REJECTED", version, decisionReason?: string }`; razão obrigatória na rejeição, 1–500 caracteres após trim. | `204`; proibir autoaprovação com `403`; decisão concorrente/versão desatualizada com `409`. |

`ExchangeView = { evaluatedAt, current: ExchangeQuote | null, currentStatus: "VALID" | "EXPIRED" | "ABSENT", history: { kind: "proposals", page: Page<ExchangeProposal> } | { kind: "quotes", page: Page<ExchangeQuote> } }`. Cotações ordenadas por vigência/UUID decrescentes; propostas por cadastro/UUID decrescentes. Ausência de cotação é estado de negócio (`200`, `current: null`), não falha do provedor. `GET /exchange/reference` é independente: falha não elimina histórico/cotação válidos. Após proposta ou decisão, uma consulta `GET /exchange` atualiza a visão afetada, sem consultar novamente o provedor.

O incremento positivo do wireframe é um auxílio de edição: com cotação existente, somar incremento decimal positivo à base exibida para preencher `proposedRate`. Sem base, ou por preenchimento manual, permitir informar diretamente cotação positiva. API persiste e aprova a taxa absoluta; não criar campos de incremento/base nem exigir uma cotação prévia para cadastrar a primeira. Mudança de cotação durante análise não altera a proposta persistida nem cria veto por base antiga, ausente da seção 3. Histórico apresenta a taxa proposta, sem inventar um incremento não persistido.

Aprovação não dispara liquidação. Se houver lote de origem, manter seu UUID no estado de navegação; voltar ao detalhe e atualizar a simulação somente se o usuário tiver `OPERADOR`. Gestor sem esse papel retorna ao detalhe de consulta. Quando solicitante e decisor estiverem em sessões distintas, o operador retorna explicitamente ao lote e atualiza a simulação; não criar polling cambial ou comunicação entre sessões nesta entrega.

#### H.8. Dashboard — domínio frontend `dashboard`

`GET /dashboard?period=LAST_7_DAYS|CURRENT_MONTH` (padrão `LAST_7_DAYS`) retorna `200 Dashboard`. Períodos definidos pelo relógio do servidor no calendário de São Paulo: sete dias incluindo hoje, ou primeiro dia do mês até hoje, ambos com fim exclusivo no início de amanhã.

`Dashboard = { generatedAt, period: { kind, start, end, timeZone: "America/Sao_Paulo" }, totals: FinancialTotals, dailyPayments: { date, paymentBrl, paymentUsd }[], batchCounts: { READY: number, PENDING: number, SETTLED: number, FAILED: number }, pendingExchangeProposals: number, exchange: { current: ExchangeQuote | null, status: "VALID" | "EXPIRED" | "ABSENT" } }`.

Totais e gráfico consideram apenas itens concluídos dentro do período, incluindo dias sem movimento com `"0.00"`. A série inclui ambas as moedas; alternar moeda do gráfico não faz outra requisição. Situação atual dos lotes, propostas pendentes e câmbio são globais no instante da consulta, sem filtro do período; a UI deve indicar essa diferença. Não somar BRL com USD. Nenhuma tabela de liquidações recentes.

Uma consulta agregada atende a tela, sem buscar páginas de extrato/lotes ou fazer uma consulta por indicador. Período vazio retorna valores zerados e série preenchida; indisponibilidade retorna erro HTTP, nunca números fictícios. Preservar último resultado identificado como desatualizado, apresentar erro em modal e permitir nova tentativa explícita.
