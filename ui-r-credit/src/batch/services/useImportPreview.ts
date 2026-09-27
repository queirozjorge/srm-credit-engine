import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../common/http/client';
import { useApiClient } from '../../common/http/useApiClient';
import { useAppFeedback } from '../../common/components/feedbackContext';
import { locale, translations } from '../../i18n/pt-BR';
import { previewSchema, invalidPreviewSchema } from './contracts';
import { importBody, maxImportBytes, validPreview, type ImportFormat, type ImportPreview, type ImportIssue } from './importBatch';
export function useImportPreview(format: ImportFormat | null) {
  const api = useApiClient(); const { beginLoading, showWarning } = useAppFeedback(); const text = translations[locale].batch.import;
  const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]); const [truncated, setTruncated] = useState(false);
  const [valid, setValid] = useState(false); const [pending, setPending] = useState(false);
  const [currencies, setCurrencies] = useState<Record<number, 'BRL' | 'USD'>>({});
  const generation = useRef(0); const controller = useRef<AbortController | null>(null); const lock = useRef(false);
  const cancel = useCallback(() => { generation.current++; controller.current?.abort(); controller.current = null; lock.current = false; }, []);
  function resetState() {
    setPending(false); setFile(null); setPreview(null); setIssues([]); setTruncated(false); setValid(false); setCurrencies({});
  }
  function clear() { cancel(); resetState(); }
  const [previousFormat, setPreviousFormat] = useState(format);
  if (previousFormat !== format) { setPreviousFormat(format); resetState(); }
  useEffect(() => () => cancel(), [format, cancel]);
  function select(next: File | null) {
    clear();
    if (!next) return;
    if (!next.size || next.size > maxImportBytes) { showWarning({ message: next.size ? text.tooLarge : text.emptyFile }); return; }
    setFile(next);
  }
  async function requestPreview() {
    if (!file || !format || lock.current) return;
    lock.current = true; const current = ++generation.current; const abort = new AbortController(); controller.current = abort;
    setPending(true); setValid(false); const end = beginLoading();
    try {
      const { data } = await api.request('/api/batches/preview', { method: 'POST', body: importBody(file, format), schema: previewSchema, signal: abort.signal, notify: false });
      if (current !== generation.current) return;
      if (!validPreview(data, format)) throw new ApiError(200, 'INVALID_RESPONSE', translations[locale].http.invalidResponse);
      setPreview(data); setIssues([]); setTruncated(false);
      setCurrencies(current => Object.fromEntries(Object.entries(current).filter(([index]) => data.items.some(item => item.itemIndex === Number(index)))));
      setValid(true);
    } catch (error) {
      if (current !== generation.current || abort.signal.aborted) return;
      const invalid = error instanceof ApiError && error.status === 422 ? invalidPreviewSchema.safeParse(error.payload) : null;
      if (invalid?.success && invalid.data.preview.source === format) {
        setPreview({ ...invalid.data.preview, itemCount: invalid.data.preview.items.length, faceValueBrl: '0.00' });
        setIssues(invalid.data.details); setTruncated(invalid.data.detailsTruncated ?? false);
        showWarning({ message: invalid.data.message, details: [text.partialBlocked] });
      } else showWarning({ message: error instanceof Error ? error.message : translations[locale].http.invalidResponse });
    } finally {
      end(); if (current === generation.current) { lock.current = false; setPending(false); }
    }
  }
  function showIssues() {
    showWarning({ title: text.issuesTitle, message: text.partialBlocked,
      details: [...issues.map(issue => text.issue(issue.line, issue.field, issue.message)), ...(truncated ? [text.truncated] : [])] });
  }
  return { file, preview, issues, truncated, valid, pending, currencies, select, clear, requestPreview, showIssues,
    releaseFile: () => { setFile(null); setValid(false); }, invalidate: () => setValid(false), changeCurrency: (index: number, currency: 'BRL' | 'USD') => setCurrencies(current => ({ ...current, [index]: currency })) };
}
