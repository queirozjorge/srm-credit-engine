# Integração com APIs reais — task 14

Situação em 26/09/2026: **bloqueada por ausência das APIs de negócio**. O backlog define sua implementação como dependência externa da task 14. As telas usam o cliente HTTP real em produção; mocks só existem no modo demonstrativo explícito. Isso não comprova integração funcional com o backend.

## Evidências

- Engine e workflow contêm classes de inicialização, configuração e testes de health; não há Resources de negócio, serviços, repositories, migrations ou consumer financeiro.
- Consulta de leitura ao [OpenAPI local](https://localhost:8443/api/v3/api-docs) retornou `openapi: "3.1.0"`, servidor `https://localhost:8443/api` e `paths: {}`. Nenhuma operação de negócio está publicada.
- O teste autenticado completo da task 13 também permanece pendente de autorização para usar credenciais demonstrativas. A solicitação da task 14 não foi tratada como autorização de acesso a essas credenciais.

## Dependências por domínio

Os contratos completos permanecem na SPEC; esta matriz registra disponibilidade e evidência necessária, sem duplicar schemas.

| Domínio | Contrato | Disponibilidade real | Validação a executar quando disponível |
|---|---|---|---|
| Cedentes | H.3 | Ausente | GET paginado/detalhe, POST 201, PATCH 204, documento duplicado e conflito de versão; uma consulta após alteração. |
| Lotes/importação | H.4 | Ausente | Busca/paginação, lote misto, cadastro JSON e multipart, arquivo original, prévia 422/limite 413, criação integral e GET posterior. |
| Simulação | H.5 | Ausente | Decimais em strings, limites, cálculo real, debounce/cancelamento e ausência de persistência. |
| Liquidação | H.6 e anexos D/E | Ausente | POST inicial sem body e reprocessamento com seleção/justificativa, chave/fingerprint preservados, 409, resultados por título, estado parcial, auditoria e polling conforme H.6. Depende também de worker, banco e Kafka. |
| Câmbio | H.7 | Ausente | Referência independente, proposta 201, decisão 204, gestor distinto, versão concorrente e cotação/snapshot. |
| Extrato/dashboard | H.6/H.8 | Ausente | Filtros SQL por item, páginas explícitas, calendário de São Paulo, agregação única, moedas separadas e somente resultados concluídos. |

Todos os domínios dependem de JWT validado/autorizado pelo engine, respostas de erro pt-BR, migrations e persistência conforme a SPEC. O frontend não substitui essas garantias. Não publicar um OpenAPI fictício como se fosse produzido pelo serviço.

## Correções preparatórias entregues

- Acompanhamento pendente passou a consultar somente `GET /api/batches/{batchUuid}` a cada cinco segundos. A resposta atualiza o lote e assume a solicitação ativa retornada, inclusive se outra operação tiver substituído a anterior. Detalhe histórico é consultado somente por ação do usuário.
- Preservados cancelamento, pausa com aba oculta, ausência de sobreposição, aviso deduplicado e término em estado terminal. Resposta antiga não sobrescreve solicitação já substituída no cache.
- Extrato passou a oferecer 20, 50 e 100 itens por página. Mudança de tamanho volta à primeira página e faz somente a consulta escolhida.
- Mocks foram ajustados para concluir a operação demonstrativa ao consultar o lote, mantendo o extrato/dashboard compartilhados. Não há alteração no motor financeiro nem implementação de backend em memória.

## Como retomar

Fornecer a branch ou ambiente com as APIs implementadas e seu OpenAPI. Confrontar paths, métodos, schemas, multipart, cabeçalhos e status com H.1–H.8 antes de executar mutações. Então validar por domínio, mantendo as mesmas telas e sem ativar mocks; concluir com fluxos autenticados e liquidação real por título com sucesso parcial e reprocessamento auditado. Registrar resultados e limitações no backlog. A implementação dos serviços ausentes exige uma frente própria de backend; não está incluída implicitamente nesta task de integração frontend.

Verificação preparatória da task 14: tipagem, lint, build e 121 testes unitários aprovados. Oito cenários de navegador aprovados em desktop/celular, cobrindo consulta exclusiva do lote durante pendência, conclusão refletida no extrato/dashboard e seleção explícita de 100 itens. Captura do extrato inspecionada; largura de 320 px verificada. Permanecem os avisos não bloqueantes existentes do Zod e tamanho do bundle. `git diff --check` sem erros. Essas evidências usam mocks e não comprovam integração real.

## Adequação do frontend concluída; integração real pendente — 27/09/2026

As tasks 16.1–16.9 atualizaram schemas, seleção e reprocessamento idempotente, polling por `progressVersion`, extrato/dashboard, testes e mocks conforme a nova SPEC. A validação desta etapa usa somente mocks; o status de disponibilidade real acima continua **Ausente**. Quando as APIs forem implementadas, ainda será necessário validar os resultados individuais durante lotes pendentes/parciais, seleção inválida ou já liquidada, snapshots, erros por tentativa, auditoria por outro operador e reentrega após commit. PostgreSQL deverá preservar unicidade por recebível e contadores sob concorrência; consumidor/relay deverão usar o contrato `credit-receivable`. Nenhum teste frontend demonstra essas garantias financeiras ou operacionais.
