import { useId, useRef, useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';
import { z } from 'zod';
import { AppDialog } from '../../common/components/AppDialog';
import { CnpjField } from '../../common/components/CnpjField';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { useApiClient } from '../../common/http/useApiClient';
import { ApiError } from '../../common/http/client';
import { created } from '../../common/http/contracts';
import { locale, translations } from '../../i18n/pt-BR';
import { createAssignorSchema, editAssignorSchema, type Assignor } from '../services/contracts';
import { validCnpj } from '../services/validation';

interface Props {
  open: boolean; initial: Assignor | null; onClose: () => void; onExited: () => void;
  refreshList: () => Promise<unknown>; refreshDetail: (uuid: string) => Promise<Assignor>;
}
export function AssignorEditor({ open, initial, onClose, onExited, refreshList, refreshDetail }: Props) {
  const text = translations[locale].register; const formId = useId();
  const api = useApiClient(); const { beginLoading, showWarning } = useAppFeedback();
  const [name, setName] = useState(initial?.name ?? '');
  const [documentNumber, setDocumentNumber] = useState(initial?.documentNumber ?? '');
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false); const locked = useRef(false);
  const [committed, setCommitted] = useState(false); const [refreshed, setRefreshed] = useState(false);
  const [conflict, setConflict] = useState(false); const [latest, setLatest] = useState<Assignor | null>(null);
  const nameInput = useRef<HTMLInputElement>(null); const documentInput = useRef<HTMLInputElement>(null);
  const nameInvalid = name.trim().length === 0 || name.trim().length > 150;
  const documentInvalid = !initial && !validCnpj(documentNumber);
  async function refresh() {
    if (initial) await refreshDetail(initial.uuid); else await refreshList();
    setRefreshed(true); showWarning({ title: text.savedTitle, message: text.saved });
  }
  async function submit() {
    if (!open || locked.current || committed || (conflict && !latest)) return;
    setAttempted(true);
    if (nameInvalid || documentInvalid) { (nameInvalid ? nameInput : documentInput).current?.focus(); return; }
    locked.current = true; setPending(true); const end = beginLoading();
    try {
      if (initial) {
        const body = editAssignorSchema.parse({ name, version: latest?.version ?? initial.version });
        await api.request(`/api/assignors/${initial.uuid}`, { method: 'PATCH', body, statuses: [204], schema: z.undefined() });
      } else {
        const body = createAssignorSchema.parse({ name, documentNumber });
        await api.request('/api/assignors', { method: 'POST', body, statuses: [201], schema: created });
      }
      setCommitted(true); await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSAO_DESATUALIZADA') { setConflict(true); setLatest(null); }
      // O cliente HTTP já apresenta erros em modal. Manter o rascunho e a versão.
    } finally { end(); locked.current = false; setPending(false); }
  }
  async function reviewOrRefresh() {
    if (locked.current) return;
    locked.current = true; setPending(true); const end = beginLoading();
    try {
      if (committed) await refresh();
      else if (initial) setLatest(await refreshDetail(initial.uuid));
    } catch { /* Aviso centralizado pelo cliente; rascunho preservado. */ }
    finally { end(); locked.current = false; setPending(false); }
  }
  return <AppDialog open={open} closeDisabled={pending} closeVariant="text" title={initial ? text.edit : text.create} onClose={onClose} onExited={onExited} closeLabel={text.cancel}
    actions={<>
      {((conflict && !latest) || (committed && !refreshed)) && <Button disabled={pending} onClick={() => { void reviewOrRefresh(); }}>
        {committed ? text.refreshSaved : text.review}</Button>}
      <Button type="submit" form={formId} variant="contained" disabled={!open || pending || committed || (conflict && !latest)}>
        {latest ? text.saveReviewed : text.save}</Button>
    </>}>
    <Stack component="form" id={formId} noValidate spacing={3} sx={{ py: 2 }} onSubmit={event => { event.preventDefault(); void submit(); }}>
      {latest && <TextField label={text.currentName} value={latest.name} slotProps={{ input: { readOnly: true } }} helperText={text.reviewHint} />}
      <TextField id={`${formId}-name`} label={text.name} value={name} inputRef={nameInput} required disabled={pending || committed}
        onChange={event => setName(event.target.value)} error={attempted && nameInvalid} helperText={attempted && nameInvalid ? text.nameInvalid : undefined}
        slotProps={{ htmlInput: { maxLength: 150 } }} />
      <CnpjField label={text.document} value={documentNumber} onValueChange={setDocumentNumber} inputRef={documentInput} required
        disabled={pending || committed || Boolean(initial)} error={attempted && documentInvalid}
        helperText={initial ? text.immutable : attempted && documentInvalid ? text.documentInvalid : undefined} />
    </Stack>
  </AppDialog>;
}
