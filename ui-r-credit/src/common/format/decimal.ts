export interface DecimalFormat { scale: number; integerDigits: number; fixed?: boolean; allowNegative?: boolean }
export const moneyFormat: DecimalFormat = { scale: 2, integerDigits: 17, fixed: true };
export const rateFormat: DecimalFormat = { scale: 12, integerDigits: 12 };

// Somente transformação de strings; nunca arredonda nem converte dinheiro para number.
export function normalizeDecimal(value: string, format: DecimalFormat): string | null {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match || (match[1] && !format.allowNegative)) return null;
  const integer = (match[2] ?? '').replace(/^0+(?=\d)/, '');
  const fraction = match[3] ?? '';
  if (integer.length > format.integerDigits || fraction.length > format.scale) return null;
  const decimals = format.fixed ? fraction.padEnd(format.scale, '0') : fraction.replace(/0+$/, '');
  const negative = match[1] && /[1-9]/.test(integer + decimals) ? '-' : '';
  return `${negative}${integer}${decimals ? `.${decimals}` : ''}`;
}

export function parseDecimalInput(value: string, format: DecimalFormat): string | null {
  const input = value.trim().replace(/^(?:R\$|US\$)\s*/, '');
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d*)?$/.test(input)) return null;
  return normalizeDecimal(input.replaceAll('.', '').replace(',', '.'), format);
}

export function formatDecimal(value: string, format: DecimalFormat): string {
  if (!value) return '';
  const normalized = normalizeDecimal(value, format);
  if (normalized === null) throw new Error('Valor decimal fora do formato esperado.');
  const [integer = '', fraction] = normalized.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction ? `,${fraction}` : '');
}
