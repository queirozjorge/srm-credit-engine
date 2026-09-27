import { useEffect, useRef, useState } from 'react';
import { Button, Checkbox, FormControlLabel, Paper, Stack, Typography } from '@mui/material';
import { NavigationLink } from '../../app/routes/NavigationLink';
import { formatDecimal, moneyFormat } from '../../common/format/decimal';
import { locale, translations } from '../../i18n/pt-BR';
import { useCreateBatch } from '../services/useCreateBatch';
import { useImportPreview } from '../services/useImportPreview';
import { importBody, type ImportFormat } from '../services/importBatch';
import { ImportReview } from './ImportReview';
export function ImportBatchFlow({ format, onLocked }: { format: ImportFormat | null; onLocked: (locked: boolean) => void }) {
  const text = translations[locale].batch; const copy = text.import;
  const flow = useImportPreview(format); const creation = useCreateBatch(); const input = useRef<HTMLInputElement>(null);
  const [consulted, setConsulted] = useState(false); const [checked, setChecked] = useState(false);
  const locked = flow.pending || creation.pending || creation.uncertain || Boolean(creation.created);
  useEffect(() => { onLocked(locked); }, [locked, onLocked]);
  useEffect(() => { if (input.current) input.current.value = ''; }, [format]);
  function clear() { flow.clear(); if (input.current) input.current.value = ''; }
  function confirm() {
    if (!format || !flow.valid || !flow.file || locked) return;
    setConsulted(false); setChecked(false);
    void creation.submit(importBody(flow.file, format, flow.currencies), {
      onAccepted: () => { flow.releaseFile(); if (input.current) input.current.value = ''; }, onRejected: flow.invalidate,
    });
  }
  return <Stack spacing={2.5} sx={{ display: format ? 'flex' : 'none', minWidth: 0 }}>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}><Stack spacing={2}>
      <Typography component="h2" variant="h2">{creation.created ? text.manual.done : copy.title}</Typography>
      <Typography color="text.secondary">{copy.instructions}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{format === 'CSV' ? copy.csv : copy.cnab}</Typography>
      {!creation.created && <>
        {format && <Stack spacing={0.5} alignItems="flex-start">
          <Button component="a" href={`/examples/recebiveis.${format === 'CSV' ? 'csv' : 'cnab'}`} download>{copy.downloadSample(format)}</Button>
          <Typography variant="caption" color="text.secondary">{copy.sampleRequirements}</Typography>
        </Stack>}
        <Button component="label" variant="outlined" disabled={locked} sx={{ alignSelf: 'flex-start' }}>
          {copy.choose}<input ref={input} type="file" aria-label={copy.choose} disabled={locked} accept={format === 'CSV' ? '.csv,text/csv' : '.rem,.cnab,.txt,text/plain'}
            style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}
            onChange={event => { flow.select(event.target.files?.[0] ?? null); event.target.value = ''; }} />
        </Button>
        {flow.file && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{copy.selected(flow.file.name, flow.file.size)}</Typography>}
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
          <Button variant="contained" disabled={!flow.file || locked} onClick={() => { void flow.requestPreview(); }}>{copy.preview}</Button>
          <Button disabled={locked || (!flow.file && !flow.preview)} onClick={clear}>{copy.cancel}</Button>
          {flow.issues.length > 0 && <Button onClick={flow.showIssues}>{copy.issues(flow.issues.length, flow.truncated)}</Button>}
        </Stack>
      </>}
      {flow.valid && flow.preview && <Typography variant="subtitle2">{copy.summary(flow.preview.itemCount, formatDecimal(flow.preview.faceValueBrl, moneyFormat))}</Typography>}
    </Stack></Paper>
    {flow.preview && <>
      <Typography variant="body2" color="text.secondary">{text.manual.reviewHint}</Typography>
      <ImportReview preview={flow.preview} currencies={flow.currencies} editable={flow.valid && !locked && !creation.created} onCurrency={flow.changeCurrency} />
    </>}
    <Stack direction="row" useFlexGap flexWrap="wrap" gap={1}>
      {!creation.created && <Button variant="contained" disabled={!flow.valid || locked} onClick={confirm}>{copy.confirm}</Button>}
      {creation.created && <>
        <Typography sx={{ width: '100%', overflowWrap: 'anywhere' }}>{text.manual.createdId(creation.created)}</Typography>
        {!creation.verified && <Button disabled={creation.pending} onClick={() => { void creation.refresh(); }}>{text.manual.refreshCreated}</Button>}
        <Button component={NavigationLink} to={`/lotes/${creation.created}`} variant="contained" disabled={creation.pending}>{text.view}</Button>
        <Button disabled={creation.pending} onClick={() => { creation.reset(); clear(); }}>{text.manual.another}</Button>
      </>}
      {creation.uncertain && <Stack spacing={1}>
        <Button component={NavigationLink} to="/lotes" onClick={() => { setConsulted(true); setChecked(false); }}>{text.manual.consult}</Button>
        <FormControlLabel label={text.manual.checked} control={<Checkbox checked={checked} disabled={!consulted} onChange={(_, value) => setChecked(value)} />} />
        <Button disabled={!consulted || !checked} onClick={() => { creation.resume(); flow.invalidate(); setConsulted(false); setChecked(false); }}>{text.manual.resume}</Button>
      </Stack>}
    </Stack>
  </Stack>;
}
