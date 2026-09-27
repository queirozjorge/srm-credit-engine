// O gateway mantém Keycloak e UI na mesma origem. Nenhum segredo pertence ao cliente público.
export function oidcConfig(origin = window.location.origin) {
  return { url: `${origin}/auth`, realm: 'srm-credit', clientId: 'ui-r-credit' };
}
