import { expect, test } from 'vitest';
import { addDays, financialDate, financialDayStart, lastSevenDays } from './financialCalendar';
test('datas usam São Paulo, atravessam mês e não seguem o fuso do navegador', () => {
  expect(financialDate(new Date('2026-09-27T02:59:59Z'))).toBe('2026-09-26');
  expect(financialDayStart('2026-09-26')).toBe('2026-09-26T03:00:00.000Z');
  expect(lastSevenDays(new Date('2026-10-01T02:00:00Z'))).toEqual({ from: '2026-09-24', to: '2026-10-01' });
  expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
});
test('início do dia respeita transições históricas de horário de verão', () => {
  expect(financialDayStart('2018-11-04')).toBe('2018-11-04T03:00:00.000Z');
  expect(financialDayStart('2018-11-05')).toBe('2018-11-05T02:00:00.000Z');
  expect(financialDayStart('2019-02-17')).toBe('2019-02-17T03:00:00.000Z');
});
