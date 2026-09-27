import { useEffect, useRef, useState } from 'react';
import { Box, Button, Collapse, MenuItem, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import { AssignorPicker } from '../../register/components/AssignorPicker';
import { DecimalField } from '../../common/components/DecimalField';
import { DateField } from '../../common/components/DateField';
import { locale, translations } from '../../i18n/pt-BR';
import { financialToday, inputOf, itemErrors, type DraftItem } from '../services/manualBatch';
import type { ReceivableInput } from '../services/receivableContracts';
const empty: ReceivableInput = { assignorUuid: '', externalReference: '', type: 'DUPLICATA_MERCANTIL', faceValueBrl: '', dueDate: '', paymentCurrency: 'BRL' };
export function ReceivableEditor({ initial, others, enabled, onSave, onCancel, onDraftChange }: {
  initial: DraftItem | null; others: DraftItem[]; enabled: boolean; onSave: (item: DraftItem) => void; onCancel: () => void; onDraftChange?: (value: ReceivableInput) => void;
}) {
  const text = translations[locale].batch; const copy = text.manual; const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [draft, setDraft] = useState<ReceivableInput>(initial ? inputOf(initial) : empty);
  const [assignorName, setAssignorName] = useState(initial?.assignorName ?? '');
  const [picking, setPicking] = useState(!initial); const [attempted, setAttempted] = useState(false);
  const [invalidFocus, setInvalidFocus] = useState(0);
  const form = useRef<HTMLDivElement>(null); const errors = itemErrors(draft, others);
  useEffect(() => { if (invalidFocus) form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus(); }, [invalidFocus]);
  function update<K extends keyof ReceivableInput>(field: K, value: ReceivableInput[K]) { const next = { ...draft, [field]: value }; setDraft(next); onDraftChange?.(next); }
  function save() {
    if (!enabled) return;
    setAttempted(true);
    if (errors.size) { if (errors.has('assignorUuid')) setPicking(true); setInvalidFocus(value => value + 1); return; }
    onSave({ ...inputOf(draft), assignorName, localId: initial?.localId ?? crypto.randomUUID() });
  }
  return <Stack ref={form} spacing={2}>
    <Typography component="h2" variant="h2">{initial ? copy.editItem : copy.addItem}</Typography>
    <TextField label={copy.assignor} value={assignorName} required slotProps={{ input: { readOnly: true } }}
      error={attempted && errors.has('assignorUuid')} helperText={attempted && errors.has('assignorUuid') ? copy.fields.assignorUuid : undefined} />
    <Button sx={{ alignSelf: 'flex-start' }} disabled={!enabled} aria-expanded={picking} onClick={() => setPicking(!picking)}>{copy.chooseAssignor}</Button>
    <Collapse in={picking} timeout={reduced ? 0 : 180}>
      <AssignorPicker enabled={enabled && picking} selected={draft.assignorUuid} onSelect={row => {
        update('assignorUuid', row.uuid); setAssignorName(row.name); setPicking(false);
      }} />
    </Collapse>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
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
      <Button disabled={!enabled} onClick={onCancel}>{copy.cancelItem}</Button>
    </Stack>
  </Stack>;
}
