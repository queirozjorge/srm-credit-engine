import { isCivilDate } from './dates';
export const financialTimeZone = 'America/Sao_Paulo';
const calendar = new Intl.DateTimeFormat('en-CA', { timeZone: financialTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
export function financialDate(instant: number | Date = Date.now()): string {
  const parts = calendar.formatToParts(instant); const part = (type: string) => parts.find(row => row.type === type)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
}
export function addDays(day: string, days: number) {
  if (!isCivilDate(day)) throw new Error('Data civil inválida.');
  const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
// Primeiro instante do dia no fuso financeiro, inclusive em transições históricas de horário de verão.
export function financialDayStart(day: string): string {
  if (!isCivilDate(day) || day.startsWith('0000')) throw new Error('Data civil inválida.');
  const utc = Date.parse(`${day}T00:00:00Z`); let low = utc - 36 * 3600000; let high = utc + 36 * 3600000;
  while (low < high) { const middle = Math.floor((low + high) / 2); if (financialDate(middle) < day) low = middle + 1; else high = middle; }
  return new Date(low).toISOString();
}
export function lastSevenDays(now: number | Date = Date.now()) {
  const today = financialDate(now); return { from: addDays(today, -6), to: addDays(today, 1) };
}
