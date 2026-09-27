import { SimulationPanel } from '../../pricing/components/SimulationPanel';
import type { ReceivableInput } from '../services/receivableContracts';
import { inputOf } from '../services/manualBatch';
import { ImportBatchFlow } from '../components/ImportBatchFlow';
import { useEffect, useRef, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, Paper, Stack, Tab, Tabs, Step, StepLabel, Stepper, Typography } from '@mui/material';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { locale, translations } from '../../i18n/pt-BR';
import { ReceivableEditor } from '../components/ReceivableEditor';
import { DraftReceivables } from '../components/DraftReceivables';
import { totalFace, validateManual, type DraftItem } from '../services/manualBatch';
import { useCreateBatch } from '../services/useCreateBatch';
export function NewBatchPage({ active }: { active: boolean }) {
  const text = translations[locale].batch; const copy = text.manual; const { showWarning } = useAppFeedback();
  const [mode, setMode] = useState<'FORM' | 'CSV' | 'CNAB'>('FORM'); const [importLocked, setImportLocked] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]); const [editor, setEditor] = useState<{ item: DraftItem | null } | null>({ item: null });
  const [candidate, setCandidate] = useState<ReceivableInput | null>(null);
  const previewItems = editor ? (candidate ? [...items.filter(item => item.localId !== editor.item?.localId).map(inputOf), inputOf(candidate)] : []) : items.map(inputOf);
  const [review, setReview] = useState(false); const [consulted, setConsulted] = useState(false); const [checked, setChecked] = useState(false);
  const creation = useCreateBatch(); const readOnly = creation.pending || Boolean(creation.created) || creation.uncertain;
  const section = useRef<HTMLDivElement>(null); const [focusSection, setFocusSection] = useState(0);
  useEffect(() => { if (focusSection) section.current?.focus({ preventScroll: false }); }, [focusSection]);
  function save(item: DraftItem) {
    const next = editor?.item ? items.map(row => row.localId === item.localId ? item : row) : [...items, item];
    const invalid = validateManual(next);
    if (invalid) { showWarning({ message: copy.errors[invalid] }); return; }
    setItems(next); setEditor(null); setFocusSection(value => value + 1);
  }
  function startReview() {
    const invalid = validateManual(items);
    if (invalid) { showWarning({ message: copy.errors[invalid] }); return; }
    setReview(true); setFocusSection(value => value + 1);
  }
  return <Stack spacing={2.5} sx={{ display: active ? 'flex' : 'none', minWidth: 0, flex: 1 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" useFlexGap flexWrap="wrap" gap={2}>
      <Box><Typography variant="overline" color="text.secondary">{text.create.eyebrow}</Typography>
        <Typography component={active ? 'h1' : 'div'} variant="h1" tabIndex={-1}>{text.create.title}</Typography>
        <Typography color="text.secondary">{text.create.description}</Typography></Box>
      <Button component={NavigationLink} to="/lotes" disabled={creation.pending} onClick={() => setConsulted(true)}>{text.back}</Button>
    </Stack>
    <Tabs value={mode} aria-label={text.import.mode} variant="scrollable" scrollButtons="auto" onChange={(_, value: 'FORM' | 'CSV' | 'CNAB') => setMode(value)}>
      {(['FORM', 'CSV', 'CNAB'] as const).map(value => <Tab key={value} value={value} label={text.sources[value]} disabled={creation.pending || creation.uncertain || Boolean(creation.created) || importLocked} />)}
    </Tabs>
    <Stack spacing={2.5} sx={{ display: mode === 'FORM' ? 'flex' : 'none', minWidth: 0 }}>
    <Stepper activeStep={creation.created ? 2 : review ? 1 : 0} alternativeLabel>
      {[copy.enter, copy.review, copy.done].map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
    </Stepper>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
      <Stack spacing={2}>
        <Typography ref={section} tabIndex={-1} component="h2" variant="h2">{creation.created ? copy.done : review ? copy.review : copy.enter}</Typography>
        <Typography variant="body2" color="text.secondary">{review ? copy.reviewHint : copy.entryHint}</Typography>
        <Typography variant="subtitle2">{copy.summary(items.length, formatDecimal(totalFace(items), moneyFormat), new Set(items.map(item => item.assignorUuid)).size)}</Typography>
        {editor && !review && <ReceivableEditor initial={editor.item} others={items.filter(item => item.localId !== editor.item?.localId)}
          enabled={active && mode === 'FORM' && !readOnly} onDraftChange={setCandidate} onSave={save} onCancel={() => setEditor(null)} />}
        {!editor && !review && <Button variant="outlined" sx={{ alignSelf: 'flex-start' }} disabled={readOnly || items.length >= 1000}
          onClick={() => { setCandidate(null); setEditor({ item: null }); setFocusSection(value => value + 1); }}>{copy.addItem}</Button>}
      </Stack>
    </Paper>
    <DraftReceivables items={items} editable={!review && !readOnly && !editor} onEdit={item => { setCandidate(inputOf(item)); setEditor({ item }); setFocusSection(value => value + 1); }}
      onRemove={id => setItems(current => current.filter(item => item.localId !== id))} />
    <SimulationPanel input={validateManual(previewItems) ? null : { items: previewItems }} enabled={active && mode === 'FORM' && !readOnly} />
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      {!review && <Button variant="contained" disabled={Boolean(editor) || !items.length || readOnly} onClick={startReview}>{copy.review}</Button>}
      {review && !creation.created && !creation.uncertain && <>
        <Button disabled={creation.pending} onClick={() => { setReview(false); setFocusSection(value => value + 1); }}>{copy.backToItems}</Button>
        <Button variant="contained" disabled={creation.pending} onClick={() => { setConsulted(false); setChecked(false); void creation.submit(items); }}>{copy.confirm}</Button>
      </>}
      {creation.created && <>
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere', width: '100%' }}>{copy.createdId(creation.created)}</Typography>
        {!creation.verified && <Button disabled={creation.pending} onClick={() => { void creation.refresh(); }}>{copy.refreshCreated}</Button>}
        <Button component={NavigationLink} to={`/lotes/${creation.created}`} variant="contained" disabled={creation.pending}>{text.view}</Button>
        <Button disabled={creation.pending} onClick={() => { creation.reset(); setItems([]); setCandidate(null); setEditor({ item: null }); setReview(false); setConsulted(false); setChecked(false); }}>{copy.another}</Button>
      </>}
      {creation.uncertain && <Stack spacing={1}>
        <Button component={NavigationLink} to="/lotes" onClick={() => { setConsulted(true); setChecked(false); }}>{copy.consult}</Button>
        <FormControlLabel label={copy.checked} control={<Checkbox checked={checked} disabled={!consulted} onChange={(_, value) => setChecked(value)} />} />
        <Button disabled={!consulted || !checked} onClick={() => { creation.resume(); setReview(false); setConsulted(false); setChecked(false); }}>{copy.resume}</Button>
      </Stack>}
    </Stack>
    </Stack>
    <ImportBatchFlow format={mode === 'FORM' ? null : mode} onLocked={setImportLocked} />
  </Stack>;
}
