import { expect, test } from 'vitest';
import { validCnpj, normalizeSearch, listParameters } from './validation';
test('valida CNPJ numérico e exemplo alfanumérico oficial sem perder zeros', () => {
  for (const value of ['11222333000181', '11444777000161', '12ABC34501DE35', '00000000000191']) expect(validCnpj(value)).toBe(true);
  for (const value of ['00000000000000', '11222333000182', '12ABC34501DE36', '123', '1122233300018A']) expect(validCnpj(value)).toBe(false);
});
test('normaliza documento pesquisado e limita paginação da interface', () => {
  expect(normalizeSearch(' 11.222.333/0001-81 ')).toBe('11222333000181');
  expect(normalizeSearch(' Empresa A ')).toBe('Empresa A');
  expect(listParameters(new URLSearchParams('page=-1&size=999'))).toMatchObject({ page: 1, size: 20 });
  expect(listParameters(new URLSearchParams('page=3&size=5&activeOnly=true'))).toMatchObject({ page: 3, size: 5, activeOnly: true });
});
