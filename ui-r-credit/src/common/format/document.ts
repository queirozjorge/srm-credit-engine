// A máscara preserva letras e zeros. Validação da identidade/dígitos pertence ao domínio.
export function normalizeCnpj(value: string): string | null {
  if (!/^[a-zA-Z0-9./\-\s]*$/.test(value)) return null;
  const normalized = value.replace(/[./\-\s]/g, '').toUpperCase();
  return normalized.length <= 14 ? normalized : null;
}

export function formatCnpj(value: string): string {
  return value.replace(/^(\w{2})(\w{3})(\w{3})(\w{4})(\w{2})$/, '$1.$2.$3/$4-$5');
}
