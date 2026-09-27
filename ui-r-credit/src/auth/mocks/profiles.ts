import type { Identity } from '../services/session';
export const demoProfiles = {
  operator: { issuer: 'urn:srm:demo', subject: 'operador-demo', roles: ['OPERADOR'] },
  manager: { issuer: 'urn:srm:demo', subject: 'gestor-demo', roles: ['GESTOR'] },
  combined: { issuer: 'urn:srm:demo', subject: 'perfis-demo', roles: ['OPERADOR', 'GESTOR'] },
} satisfies Record<string, Identity>;
