import { useRef, useState } from 'react';
import { Button, Chip, Stack, TextField, Typography } from '@mui/material';
import { AppDialog } from '../../common/components/AppDialog';
import { DecimalField } from '../../common/components/DecimalField';
import { useSession } from '../../auth/services/sessionContext';
import { actorDisplayName, canDecide } from '../../auth/services/session';
import { formatDecimal, rateFormat } from '../../common/format/decimal';
import { formatInstant } from '../../common/format/dates';
import { createProposalSchema, type ExchangeProposal } from '../services/contracts';
import { addRate } from '../services/validation';
import { useExchangeMutation } from '../services/useExchangeMutation';
import { locale, translations } from '../../i18n/pt-BR';
interface Props { open: boolean; initial: ExchangeProposal | null; base: string | null; onClose: () => void; onExited: () => void; refresh: () => Promise<unknown> }
export function ProposalDialog({ open, initial, base, onClose, onExited, refresh }: Props) {
  const text = translations[locale].exchange; const { identity } = useSession(); const mutation = useExchangeMutation(initial, refresh);
  const [baseRate] = useState(base); const [value, setValue] = useState(''); const [increment, setIncrement] = useState('');
  const [justification, setJustification] = useState(''); const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false); const [incrementError, setIncrementError] = useState(false); const [reasonError, setReasonError] = useState(false);
  const rateInput = useRef<HTMLInputElement>(null); const justificationInput = useRef<HTMLInputElement>(null); const reasonInput = useRef<HTMLInputElement>(null);
  const row = mutation.latest; const locked = !open || mutation.pending || mutation.committed || mutation.blocked;
  const rateInvalid = !createProposalSchema.shape.proposedRate.safeParse(value).success;
  const justificationInvalid = !createProposalSchema.shape.justification.safeParse(justification).success;
  function propose() {
    if (locked) return; setAttempted(true);
    if (rateInvalid || justificationInvalid) { (rateInvalid ? rateInput : justificationInput).current?.focus(); return; }
    void mutation.submit({ proposedRate: value, justification });
  }
  function decide(status: 'APPROVED' | 'REJECTED') {
    if (locked || !row) return;
    const invalid = reason.trim().length > 500 || (status === 'REJECTED' && !reason.trim()); setReasonError(invalid);
    if (invalid) { reasonInput.current?.focus(); return; }
    void mutation.submit({ status, version: row.version, ...(reason.trim() ? { decisionReason: reason.trim() } : {}) });
  }
  const allowed = row && row.status === 'PENDING' && canDecide(identity, row.requestedBy);
  return <AppDialog open={open} title={row ? text.detail : text.propose} onClose={onClose} onExited={onExited} closeDisabled={mutation.pending} closeLabel={text.cancel} closeVariant="text"
    actions={<>
      {(mutation.blocked || mutation.committed) && <Button disabled={mutation.pending} onClick={() => { void mutation.reconcile(); }}>{text.reconcile}</Button>}
      {!row && <Button variant="contained" disabled={locked} onClick={propose}>{text.save}</Button>}
      {allowed && <><Button disabled={locked} onClick={() => decide('REJECTED')}>{text.reject}</Button><Button variant="contained" disabled={locked} onClick={() => decide('APPROVED')}>{text.approve}</Button></>}
    </>}>
    <Stack spacing={2} sx={{ py: 1, overflowWrap: 'anywhere' }}>
      {row ? <>
        <Chip label={mutation.committed ? text.decisionSent : text.statuses[row.status]} sx={{ alignSelf: 'flex-start' }} variant="outlined" />
        <Typography variant="h2" component="p">{text.rate}: {formatDecimal(row.proposedRate, rateFormat)}</Typography>
        <Typography>{text.author}: {actorDisplayName(row.requestedBy, identity, translations[locale].common.unknownUser)}</Typography>
        <Typography>{text.registered}: {formatInstant(row.registeredAt)}</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap' }}>{row.justification}</Typography>
        {row.decision && <><Typography>{text.decidedBy}: {actorDisplayName(row.decision.decidedBy, identity, translations[locale].common.unknownUser)}</Typography><Typography>{text.decidedAt}: {formatInstant(row.decision.decidedAt)}</Typography>
          {row.decision.reason && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{row.decision.reason}</Typography>}</>}
        {row.status === 'PENDING' && !canDecide(identity, row.requestedBy) && <Typography>{text.own}</Typography>}
        {allowed && <TextField label={text.reason} value={reason} inputRef={reasonInput} onChange={event => setReason(event.target.value)} disabled={locked} multiline minRows={2}
          error={reasonError} helperText={reasonError ? text.justificationInvalid : text.optionalReason} slotProps={{ htmlInput: { maxLength: 500 } }} />}
      </> : <>
        <DecimalField kind="rate" label={text.rate} value={value} onValueChange={setValue} inputRef={rateInput} required disabled={locked}
          error={attempted && rateInvalid} helperText={attempted && rateInvalid ? text.rateInvalid : text.manualHint} />
        {baseRate && <><Typography variant="body2">{text.base(formatDecimal(baseRate, rateFormat))}</Typography>
          <DecimalField kind="rate" label={text.increment} value={increment} onValueChange={setIncrement} disabled={locked}
            error={incrementError} helperText={incrementError ? text.incrementInvalid : undefined} />
          <Button disabled={locked} sx={{ alignSelf: 'flex-start' }} onClick={() => { const result = addRate(baseRate, increment); setIncrementError(!result); if (result) setValue(result); }}>{text.applyIncrement}</Button></>}
        <TextField label={text.justification} value={justification} onChange={event => setJustification(event.target.value)} inputRef={justificationInput} required disabled={locked} multiline minRows={3}
          error={attempted && justificationInvalid} helperText={attempted && justificationInvalid ? text.justificationInvalid : undefined} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </>}
      <Typography variant="body2" color="text.secondary">{text.consequence}</Typography>
    </Stack>
  </AppDialog>;
}
