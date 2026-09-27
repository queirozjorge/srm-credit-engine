export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function formatCivilDate(value: string): string {
  if (!isCivilDate(value)) throw new Error('Data civil inválida.');
  return value.split('-').reverse().join('/');
}

export function formatInstant(value: string): string {
  const date = new Date(value);
  if (!value.endsWith('Z') || !Number.isFinite(date.getTime())) throw new Error('Instante UTC inválido.');
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
  }).format(date);
}
