# AI_USAGE — Colaboração com IA

**25/09/2026 · Documentação e estruturas iniciais do frontend e dos backends; funcionalidades pendentes.**

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

O responsável pelo projeto decidiu manter a separação entre engine e worker e o formato atual da SPEC após a análise da IA. Também aprovou a flexibilização das regras de instanciação e injeção. Essas escolhas determinam escopo, custo e convenções da entrega; a IA forneceu análise e redação, enquanto a decisão final permaneceu com o responsável.

## 4. Erro concreto da IA e como foi detectado

**Pendente.** Este registro ainda não contém um erro concreto da IA documentado com evidência suficiente. A seção deve ser preenchida com um caso real ocorrido no trabalho, conforme exige o desafio.

Registrar a proposta incorreta, o impacto possível, a evidência que a refutou, a correção aplicada e a verificação posterior. Não atribuir à IA uma afirmação do usuário nem apresentar uma divergência de preferência arquitetural como erro técnico.

## 5. Verificações da implementação

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
