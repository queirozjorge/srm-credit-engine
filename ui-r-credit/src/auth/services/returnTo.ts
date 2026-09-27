export function safeReturnTo(value: unknown) {
  return typeof value === 'string' && /^\/[a-z0-9]/i.test(value) && !/[\\#]/.test(value) &&
    !/^\/(entrar|sessao-expirada|acesso-negado)(?:[/?]|$)/.test(value) ? value : '/dashboard';
}
