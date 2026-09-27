import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import { AppProviders } from '../../src/app/AppProviders';
import { AppDialog } from '../../src/common/components/AppDialog';
import { useAppFeedback } from '../../src/common/components/feedbackContext';
import { DecimalField } from '../../src/common/components/DecimalField';
import { CnpjField } from '../../src/common/components/CnpjField';
import { DateField } from '../../src/common/components/DateField';
import { DataTable } from '../../src/common/components/DataTable';
import { locale, translations } from '../../src/i18n/pt-BR';

export function Fixture() {
  const text = translations[locale].common.preview;
  const feedback = useAppFeedback();
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState(0);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [document, setDocument] = useState('');
  const [date, setDate] = useState('');
  const [pagination, setPagination] = useState({ page: 1, size: 20 });
  const rows = Array.from({ length: 75 }, (_, index) => ({ uuid: String(index), name: text.row(index + 1) }));
  return <Stack component="main" tabIndex={-1} spacing={3} sx={{ p: 2, minWidth: 0 }}>
    <Typography component="h1" variant="h1">{text.title}</Typography>
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      <Button onClick={() => setOpen(true)}>{text.open}</Button>
      <Button onClick={() => { feedback.showWarning({ message: text.message }); feedback.showWarning({ message: text.message }); }}>{text.notice}</Button>
      <Button onClick={() => {
        const first = feedback.beginLoading(); const second = feedback.beginLoading();
        window.setTimeout(() => { first(); first(); }, 300);
        window.setTimeout(second, 900);
      }}>{text.load}</Button>
    </Stack>
    <TextField label={text.name} value={name} onChange={(event) => setName(event.target.value)} />
    <Box aria-label={text.closeCount}>{closed}</Box>
    <AppDialog open={open} title={text.dialog} onClose={() => { setOpen(false); setClosed((count) => count + 1); }}>
      <Stack spacing={3} sx={{ py: 2 }}>
        <DecimalField label={text.amount} value={amount} onValueChange={setAmount} />
        <DecimalField kind="rate" label={text.rate} value={rate} onValueChange={setRate} />
        <CnpjField label={text.document} value={document} onValueChange={setDocument} />
        <DateField label={text.date} value={date} onValueChange={setDate} />
      </Stack>
    </AppDialog>
    <DataTable label={text.table} columns={[{ id: 'name', label: text.reference, render: (row) => row.name }]}
      rows={rows.slice((pagination.page - 1) * pagination.size, pagination.page * pagination.size)}
      getRowKey={(row) => row.uuid} pagination={{ ...pagination, totalItems: rows.length, onChange: setPagination }} />
  </Stack>;
}

createRoot(document.getElementById('root')!).render(<AppProviders><Fixture /></AppProviders>);
