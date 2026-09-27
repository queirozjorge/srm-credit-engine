// Receita Federal: manual-dv-cnpj.pdf (ASCII - 48, módulo 11).
// Validação local de formato/DV; existência e unicidade continuam no servidor.
export function validCnpj(document: string) {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(document) || /^(\d)\1{13}$/.test(document)) return false;
  function digit(base: string) {
    const sum = [...base].reverse().reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * (2 + index % 8), 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  }
  const first = digit(document.slice(0, 12));
  return document.endsWith(first + digit(document.slice(0, 12) + first));
}
export function normalizeSearch(value: string) {
  const trimmed = value.trim();
  return /^[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}$/i.test(trimmed)
    ? trimmed.replace(/[./-]/g, '').toUpperCase() : trimmed;
}
export function listParameters(params: URLSearchParams) {
  const pageText = params.get('page') ?? '1'; const pageNumber = Number(pageText);
  return { q: normalizeSearch(params.get('q') ?? ''), activeOnly: params.get('activeOnly') === 'true',
    page: /^\d+$/.test(pageText) && Number.isSafeInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1,
    size: [5, 10, 20, 50].includes(Number(params.get('size'))) ? Number(params.get('size')) : 20 };
}
