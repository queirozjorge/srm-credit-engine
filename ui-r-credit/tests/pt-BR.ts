import { translations as applicationTranslations, locale } from '../src/i18n/pt-BR';
export { locale };
const application = applicationTranslations[locale];
// Test-only fixture messages and profile labels never enter the application bundle.
export const translations = { [locale]: { ...application, demo: {
      startupError: 'Não foi possível iniciar a demonstração. Tente novamente.', retry: 'Tentar novamente',
      label: 'Demonstração · dados fictícios', description: 'Escolha um perfil para explorar a demonstração. Nenhuma operação financeira real será realizada.',
      operator: 'Entrar como operador', manager: 'Entrar como gestor', combined: 'Entrar com ambos os perfis',
      signOut: 'Sair', unavailable: 'O acesso real estará disponível após a integração com o provedor de identidade.',
      assignor: 'Cedente Exemplo Ltda.', reference: 'DEMO-001', justification: 'Proposta demonstrativa.',
      invalid: 'Revise os dados da solicitação.', missing: 'O recurso não foi encontrado.', denied: 'Você não tem permissão para esta operação.',
      session: 'Acesse um perfil da demonstração.', duplicate: 'Este documento já está cadastrado.', conflict: 'Os dados foram alterados. Atualize a consulta.',
      unsupported: 'Este cenário demonstrativo será disponibilizado com o fluxo correspondente.',
    }, batch: { ...application.batch, import: { ...application.batch.import,
      demoUnsupported: 'Arquivo não reconhecido nesta demonstração. Use um dos exemplos disponíveis.',
      demoInvalid: 'Revise os problemas do arquivo antes de importar.', demoField: 'A referência externa está ausente.',
    } } } };
