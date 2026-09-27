import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { AssignorAutocomplete } from '../../register/components/AssignorAutocomplete';
import { DecimalField } from '../../common/components/DecimalField';
import { DateField } from '../../common/components/DateField';
import { locale, translations } from '../../i18n/pt-BR';
import { financialToday, inputOf, itemErrors, type DraftItem } from '../services/manualBatch';
import type { ReceivableInput } from '../services/receivableContracts';
const empty: ReceivableInput = { assignorUuid: '', externalReference: '', type: 'DUPLICATA_MERCANTIL', faceValueBrl: '', dueDate: '', paymentCurrency: 'BRL' };
export function ReceivableEditor({ initial, others, enabled, onSave, onDraftChange, reviewAction }: {
  initial: DraftItem | null; others: DraftItem[]; enabled: boolean; onSave: (item: DraftItem) => boolean; onDraftChange?: (value: ReceivableInput) => void; reviewAction?: ReactNode;
}) {
  const text = translations[locale].batch; const copy = text.manual;
  const [draft, setDraft] = useState<ReceivableInput>(initial ? inputOf(initial) : empty);
  const [assignorName, setAssignorName] = useState(initial?.assignorName ?? '');
  const [attempted, setAttempted] = useState(false);
  const [invalidFocus, setInvalidFocus] = useState(0);
  const form = useRef<HTMLDivElement>(null); const errors = itemErrors(draft, others);
  useEffect(() => { if (invalidFocus) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(); }, [invalidFocus]);
  function update<K extends keyof ReceivableInput>(field: K, value: ReceivableInput[K]) { const next = { ...draft, [field]: value }; setDraft(next); onDraftChange?.(next); }
  function save() {
    if (!enabled) return;
    setAttempted(true);
    if (errors.size) { setInvalidFocus(value => value + 1); return; }
    const saved = onSave({ ...inputOf(draft), assignorName, localId: initial?.localId ?? crypto.randomUUID() });
    if (saved && !initial) {
      setDraft(empty);
      setAssignorName('');
      setAttempted(false);
      onDraftChange?.(empty);
    }
  }
  return <Stack ref={form} spacing={2}>
    <Typography component="h2" variant="h2">{initial ? copy.editItem : copy.addItem}</Typography>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
      <AssignorAutocomplete value={draft.assignorUuid} label={copy.assignor} placeholder={copy.chooseAssignor}
        activeOnly required disabled={!enabled} error={attempted && errors.has('assignorUuid')}
        helperText={attempted && errors.has('assignorUuid') ? copy.fields.assignorUuid : undefined}
        onChange={(uuid, assignor) => { update('assignorUuid', uuid); setAssignorName(assignor?.name ?? ''); }} />
      <TextField label={text.reference} value={draft.externalReference} required disabled={!enabled}
        onChange={event => update('externalReference', event.target.value)} error={attempted && errors.has('externalReference')}
        helperText={attempted && errors.has('externalReference') ? copy.fields.externalReference : copy.referenceHint} />
      <TextField select label={text.type} value={draft.type} disabled={!enabled} onChange={event => {
        if (event.target.value === 'DUPLICATA_MERCANTIL' || event.target.value === 'CHEQUE_PRE_DATADO') update('type', event.target.value);
      }}>{Object.entries(text.types).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
      <DecimalField label={text.faceValue} value={draft.faceValueBrl} required disabled={!enabled} onValueChange={value => update('faceValueBrl', value)}
        error={attempted && errors.has('faceValueBrl')} helperText={attempted && errors.has('faceValueBrl') ? copy.fields.faceValueBrl : undefined} />
      <DateField label={text.dueDate} value={draft.dueDate} min={financialToday()} required disabled={!enabled} onValueChange={value => update('dueDate', value)}
        error={attempted && errors.has('dueDate')} helperText={attempted && errors.has('dueDate') ? copy.fields.dueDate : undefined} />
      <TextField select label={text.currency} value={draft.paymentCurrency} disabled={!enabled} onChange={event => {
        if (event.target.value === 'BRL' || event.target.value === 'USD') update('paymentCurrency', event.target.value);
      }}>{Object.entries(text.currencies).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
    </Box>
    <Stack direction="row" gap={1} useFlexGap flexWrap="wrap">
      <Button variant="contained" disabled={!enabled} onClick={save}>{initial ? copy.saveItem : copy.addItem}</Button>
      {reviewAction}
    </Stack>
  </Stack>;
}
