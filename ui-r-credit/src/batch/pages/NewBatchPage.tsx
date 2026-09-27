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
import { ManualBatchPreviewDialog } from '../components/ManualBatchPreviewDialog';
import { AppDialog } from '../../common/components/AppDialog';
import { totalFace, validateManual, type DraftItem } from '../services/manualBatch';
import { useCreateBatch } from '../services/useCreateBatch';
export function NewBatchPage({ active }: { active: boolean }) {
  const text = translations[locale].batch; const copy = text.manual; const { showWarning } = useAppFeedback();
  const [mode, setMode] = useState<'FORM' | 'CSV' | 'CNAB'>('FORM'); const [importLocked, setImportLocked] = useState(false);
  const [items, setItems] = useState<DraftItem[]>([]); const [editor, setEditor] = useState<{ item: DraftItem | null } | null>({ item: null });
  const [candidate, setCandidate] = useState<ReceivableInput | null>(null);
  const candidateHasValues = candidate && Boolean(candidate.assignorUuid || candidate.externalReference.trim() || candidate.faceValueBrl || candidate.dueDate);
  const previewItems = editor && candidate && candidateHasValues
    ? [...items.filter(item => item.localId !== editor.item?.localId).map(inputOf), inputOf(candidate)]
    : items.map(inputOf);
  const simulationInput = validateManual(previewItems) ? null : { items: previewItems };
  const [review, setReview] = useState(false); const [consulted, setConsulted] = useState(false); const [checked, setChecked] = useState(false);
  const [preview, setPreview] = useState<'receivables' | 'simulation' | null>(null); const [previewOpen, setPreviewOpen] = useState(false);
  const [focusAfterPreview, setFocusAfterPreview] = useState(false);
  const creation = useCreateBatch(); const readOnly = creation.pending || Boolean(creation.created) || creation.uncertain;
  const section = useRef<HTMLDivElement>(null); const [focusSection, setFocusSection] = useState(0);
  useEffect(() => { if (focusSection) section.current?.focus({ preventScroll: true }); }, [focusSection]);
  function save(item: DraftItem): boolean {
    const editing = Boolean(editor?.item);
    const next = editing ? items.map(row => row.localId === item.localId ? item : row) : [...items, item];
    const invalid = validateManual(next);
    if (invalid) { showWarning({ message: copy.errors[invalid] }); return false; }
    setItems(next);
    if (editing) { setEditor(null); setFocusSection(value => value + 1); }
    return true;
  }
  function startReview() {
    const invalid = validateManual(items);
    if (invalid) { showWarning({ message: copy.errors[invalid] }); return; }
    setReview(true);
  }
  function showPreview(type: 'receivables' | 'simulation') {
    if (preview) return;
    setPreview(type); setPreviewOpen(true);
  }
  function editFromPreview(item: DraftItem) {
    setCandidate(inputOf(item)); setEditor({ item }); setFocusAfterPreview(true); setPreviewOpen(false);
  }
  function finishPreview() {
    setPreview(null);
    if (focusAfterPreview) { setFocusAfterPreview(false); setFocusSection(value => value + 1); }
  }
  const reviewAction = <Button variant="contained" disabled={!items.length || readOnly} onClick={startReview}>{copy.review}</Button>;
  return <Stack spacing={{ xs: 2.5, md: 1.5 }} sx={{ display: active ? 'flex' : 'none', minWidth: 0,
    minHeight: { xs: 'auto', md: 0 }, flex: 1, overflow: { xs: 'visible', md: mode === 'FORM' ? 'hidden' : 'auto' } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" useFlexGap flexWrap="wrap" gap={2} sx={{ flexShrink: 0 }}>
      <Box><Typography variant="overline" color="text.secondary">{text.create.eyebrow}</Typography>
        <Typography component={active ? 'h1' : 'div'} variant="h1" tabIndex={-1}>{text.create.title}</Typography>
        <Typography color="text.secondary">{text.create.description}</Typography></Box>
      <Button component={NavigationLink} to="/lotes" disabled={creation.pending} onClick={() => setConsulted(true)}>{text.back}</Button>
    </Stack>
    <Tabs value={mode} aria-label={text.import.mode} variant="scrollable" scrollButtons="auto" sx={{ flexShrink: 0 }}
      onChange={(_, value: 'FORM' | 'CSV' | 'CNAB') => setMode(value)}>
      {(['FORM', 'CSV', 'CNAB'] as const).map(value => <Tab key={value} value={value} label={text.sources[value]} disabled={creation.pending || creation.uncertain || Boolean(creation.created) || importLocked} />)}
    </Tabs>
    <Box sx={{ display: mode === 'FORM' ? 'grid' : 'none', minWidth: 0, minHeight: { xs: 'auto', md: 0 },
      flex: { md: '1 1 0' }, overflow: { xs: 'visible', md: 'hidden' }, gap: { xs: 2.5, md: 1.5 },
      gridTemplateAreas: { xs: '"stepper" "form"', md: '"stepper" "form"' },
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: { xs: 'auto auto', md: 'auto minmax(0, 1fr)' } }}>
    <Stepper sx={{ gridArea: 'stepper', minWidth: 0 }} activeStep={creation.created ? 2 : review ? 1 : 0} alternativeLabel>
      {[copy.enter, copy.review, copy.done].map(label => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
    </Stepper>
    <Paper variant="outlined" sx={{ gridArea: 'form', p: { xs: 2, md: 2 }, minWidth: 0, minHeight: { md: 0 },
      display: 'flex', flexDirection: 'column', overflowY: { xs: 'visible', md: 'auto' } }}>
      <Stack spacing={2} sx={{ minHeight: 0, flex: 1 }}>
        <Typography ref={section} tabIndex={-1} component="h2" variant="h2">{creation.created ? copy.done : copy.enter}</Typography>
        <Typography variant="body2" color="text.secondary">{copy.entryHint}</Typography>
        <Typography variant="subtitle2">{copy.summary(items.length, formatDecimal(totalFace(items), moneyFormat), new Set(items.map(item => item.assignorUuid)).size)}</Typography>
        {!creation.created && <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          <Button variant="outlined" onClick={() => showPreview('receivables')}>{copy.viewReceivables}</Button>
          <Button variant="outlined" onClick={() => showPreview('simulation')}>{copy.viewSimulation}</Button>
        </Stack>}
        {editor && <Box>
          <ReceivableEditor initial={editor.item} others={items.filter(item => item.localId !== editor.item?.localId)}
            enabled={active && mode === 'FORM' && !readOnly} onDraftChange={setCandidate} onSave={save}
            reviewAction={reviewAction} />
        </Box>}
        {!editor && <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} sx={{ visibility: review ? 'hidden' : 'visible' }}>
          <Button variant="outlined" disabled={readOnly || items.length >= 1000}
            onClick={() => { setCandidate(null); setEditor({ item: null }); setFocusSection(value => value + 1); }}>{copy.addItem}</Button>
          {reviewAction}
        </Stack>}
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
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
    </Paper>
    </Box>
    <AppDialog open={review && !creation.created && !creation.uncertain} title={copy.review} maxWidth="lg"
      onClose={() => setReview(false)} closeDisabled={creation.pending} closeLabel={copy.backToItems} closeVariant="text"
      actions={<Button variant="contained" disabled={!review || creation.pending || readOnly}
        onClick={() => { setConsulted(false); setChecked(false); void creation.submit(items); }}>{copy.confirm}</Button>}>
      <Stack spacing={2} sx={{ py: 1 }}>
        <Typography variant="body2" color="text.secondary">{copy.reviewHint}</Typography>
        <Typography variant="subtitle2">{copy.summary(items.length, formatDecimal(totalFace(items), moneyFormat), new Set(items.map(item => item.assignorUuid)).size)}</Typography>
        <DraftReceivables compact items={items} editable={false} onEdit={() => undefined} onRemove={() => undefined} />
      </Stack>
    </AppDialog>
    {preview && <ManualBatchPreviewDialog type={preview}
      title={preview === 'receivables' ? copy.viewReceivables : copy.viewSimulation}
      open={previewOpen} onClose={() => setPreviewOpen(false)} onExited={finishPreview}
      items={items} editable={!review && !readOnly && !editor} onEdit={editFromPreview}
      onRemove={id => setItems(current => current.filter(item => item.localId !== id))}
      simulationInput={simulationInput} simulationUnavailableText={copy.simulationUnavailable} />}
    <ImportBatchFlow format={mode === 'FORM' ? null : mode} onLocked={setImportLocked} />
  </Stack>;
}
