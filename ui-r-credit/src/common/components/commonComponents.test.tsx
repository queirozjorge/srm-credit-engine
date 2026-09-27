import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DecimalField } from './DecimalField';
import { TablePaginationControls } from './TablePaginationControls';
import { locale, translations } from '../../../tests/pt-BR';

const text = translations[locale].common;

test('edição e colagem preservam valor normalizado e invalidam excesso de escala', async () => {
  const user = userEvent.setup();
  const change = vi.fn();
  function Field() {
    const [value, setValue] = useState('');
    return <DecimalField label={text.preview.amount} value={value} onValueChange={(next) => { setValue(next); change(next); }} />;
  }
  render(<Field />);
  const field = screen.getByRole('textbox', { name: text.preview.amount });
  await user.click(field);
  await user.paste('R$ 99.999.999.999.999.999,99');
  expect(change).toHaveBeenLastCalledWith('99999999999999999.99');
  await user.tab();
  expect(field).toHaveValue('99.999.999.999.999.999,99');
  await user.click(field);
  await user.clear(field);
  await user.type(field, '1,001');
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(change).toHaveBeenLastCalledWith('');
  await user.keyboard('{Backspace}');
  expect(change).toHaveBeenLastCalledWith('1.00');
});

test('salto de página valida limites atuais e alteração de tamanho retorna à primeira', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(<TablePaginationControls page={2} size={20} totalItems={80} onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: text.pagination.jump });
  await user.type(field, '4');
  rerender(<TablePaginationControls page={2} size={20} totalItems={40} onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: text.pagination.go }));
  expect(onChange).not.toHaveBeenCalled();
  expect(field).toHaveAttribute('aria-invalid', 'true');
  await user.clear(field);
  await user.type(field, '1');
  await user.keyboard('{Enter}');
  expect(onChange).toHaveBeenLastCalledWith({ page: 1, size: 20 });
  const size = screen.getByRole('combobox');
  fireEvent.mouseDown(size);
  await user.click(screen.getByRole('option', { name: '50' }));
  expect(onChange).toHaveBeenLastCalledWith({ page: 1, size: 50 });
});
