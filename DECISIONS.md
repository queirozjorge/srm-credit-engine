# DECISIONS — SRM Credit Engine

**25/09/2026 · Escopo Sênior · Decisões aprovadas para implementação.**

Este documento registra escolhas, alternativas e custos. Os contratos funcionais e operacionais permanecem em [SPEC.md](SPEC.md); as convenções de implementação estão em [AGENTS.md](AGENTS.md). Somente a estrutura de inicialização e documentação dos backends foi criada; as funcionalidades ainda não foram implementadas; as expectativas de carga abaixo precisam ser verificadas por medição.

## 1. Separar o processamento de liquidações da API

### Contexto e decisão

Manter `spe-j-engine` e `spe-j-workflow` como aplicações Maven independentes. A premissa é que o processamento dos lotes concentre a maior carga de cálculo e gravação: o worker calcula os valores definitivos a partir do snapshot aceito e executa a liquidação atômica de todos os recebíveis do lote.

O engine atende às requisições HTTP, autentica e autoriza usuários, mantém os cadastros, realiza simulações, valida o aceite, fixa as condições financeiras e publica os comandos pela outbox. O worker consome esses comandos, realiza os cálculos da liquidação e persiste resultados, auditoria de sucesso e conclusão do lote na mesma transação.

A separação permite aumentar a capacidade dos workers conforme a demanda de liquidação, sem replicar a API na mesma proporção, e isola os recursos de execução do processamento em relação ao atendimento HTTP. O engine continua calculando as simulações; o worker concentra o cálculo definitivo e a execução das liquidações.

### Papel do Kafka e garantias de integridade

Kafka desacopla o aceite HTTP do processamento, mantém os comandos disponíveis conforme sua configuração de durabilidade e retenção e distribui lotes entre os workers de um mesmo consumer group. O UUID do lote é a chave de particionamento, preservando o processamento ordenado por partição conforme o contrato da SPEC. A fila permite absorver picos enquanto os workers processam a demanda.

A integridade e a unicidade do efeito financeiro dependem do conjunto de mecanismos:

- **Outbox transacional:** associa a publicação à solicitação aceita e permite recuperar falhas de envio.
- **Kafka:** transporta os comandos e permite reentregas; a aplicação assume entrega pelo menos uma vez.
- **Idempotência persistida:** reconhece uma solicitação já aceita e impede sua reexecução financeira.
- **PostgreSQL:** transação única por lote, optimistic locking e restrições de unicidade impedem resultados duplicados e liquidações parciais.

Kafka e o consumer group, isoladamente, não garantem liquidação única. Uma falha após o commit e antes da confirmação do consumo pode repetir a mensagem; o worker deve reconhecer o resultado existente. A recuperação detalhada está no anexo D da SPEC.

### Alternativa considerada

Uma única aplicação modular poderia atender à API e às liquidações com menor custo operacional. Essa alternativa seria suficiente para demonstrar os requisitos mínimos do desafio. A separação foi mantida para permitir escalabilidade independente do processamento e tornar explícitos o isolamento da execução, a fila e a recuperação de falhas assíncronas.

### Custos e limites aceitos

- Dois builds e processos de implantação, além da operação do Kafka, outbox, retries e DLQ.
- Maior esforço de configuração, observabilidade, testes de integração e diagnóstico do fluxo assíncrono.
- PostgreSQL compartilhado: permanece o acoplamento ao schema e à capacidade do banco; separar processos não elimina disputa por conexões, CPU ou I/O no banco.
- Escala do consumo limitada pelo número de partições, pelos recursos do banco e pelo tamanho dos lotes. O paralelismo é entre lotes; a atomicidade de cada lote permanece obrigatória.
- Motores próprios no engine e no worker exigem golden cases, casos de borda e compatibilidade de versões para prevenir divergências. Não haverá biblioteca de aplicação compartilhada.

O desafio penaliza complexidade sem justificativa. Esta escolha assume conscientemente custo adicional e não representa evidência de ganho de desempenho já medido. Antes de afirmar benefício, verificar latência HTTP sob carga de liquidação, tempo de processamento, espera em fila e saturação do banco ao variar a quantidade de workers, respeitando os critérios da SPEC.

## 2. Escopo mantido e simplificações

- **CNAB mantido:** somente o subconjunto definido na SPEC. Seu custo adicional envolve parser, validação de posições, sequências e contagens, arquivos de teste e revisão da importação. Outros bancos, variantes e comandos permanecem fora do escopo.
- **Aprovação cambial mantida:** decisão por gestor diferente do solicitante, com histórico auditável. Acrescenta fluxo de interface, autorização, estados e testes de concorrência; não publica liquidações automaticamente.
- **Provedor cambial mockado:** demonstra timeout, retry e indisponibilidade sem depender de serviço externo real.
- **Liquidação como registro da aquisição:** transferências bancárias reais e controle de saldo de caixa ficam fora desta entrega.
- **Moedas, tipos e idioma:** BRL/USD, duplicata mercantil/cheque pré-datado e interface em português brasileiro, conforme a SPEC.

Essas escolhas preservam o escopo funcional aprovado. Novos cortes ou alterações devem registrar motivo e impacto antes da implementação.

## 3. Convenções de construção e injeção

Removida a obrigação de disponibilizar `builder(...)` em toda classe instanciada manualmente. Construtores, fábricas estáticas e builders podem ser usados conforme a complexidade real da criação e as invariantes necessárias.

Removida a proibição de injeção por construtor. Injeção por construtor e por campos são permitidas; a injeção em campos mantém as anotações explícitas definidas no AGENTS.md. Essas flexibilizações evitam impor mecanismos sem benefício concreto.

## 4. Evidências pendentes

Após implementar, associar estas decisões aos testes, medições, diagramas ER/C4 e PRs correspondentes. Permanecem pendentes a demonstração de concorrência e recuperação, a medição da carga efetiva do worker e a validação do ambiente reproduzível. As verificações da estrutura inicial estão registradas em AI_USAGE.md e não demonstram as garantias funcionais previstas.

## 5. Estrutura inicial executável

O projeto de processamento utiliza o nome `spe-j-workflow`, conforme a solicitação de criação da estrutura. Seu papel de worker permanece inalterado. Nesta etapa, os únicos arquivos Java são as classes de inicialização Spring Boot; as pastas dos domínios permanecem vazias.

Ambos os projetos disponibilizam Swagger sem operações para permitir sua execução e inspeção local. O HTTP do workflow serve apenas à documentação, sem Resources de negócio. Banco, autenticação e consumers serão implementados nas etapas seguintes; o consumo Kafka permanece desativado. Não foram introduzidos patterns ou abstrações de negócio nesta estrutura.
