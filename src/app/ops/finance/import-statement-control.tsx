'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

interface ImportResult {
  statementId: string;
  counts: Record<string, number>;
  missingCount: number;
  providerReportedNet: string;
  internalNetForMatched: string;
}

/**
 * Imports a provider statement (transaction report) through the real
 * endpoint. The rows are pasted/imported as JSON in the provider-neutral
 * format the import route documents; the server classifies every line and
 * PRESERVES the verdicts - nothing is applied to the books here, and the
 * result shown is the classification, never a "reconciled ✓".
 */
export function ImportStatementControl() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('nylonpay');
  const [note, setNote] = useState('');
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      let lines: unknown;
      try {
        lines = JSON.parse(text);
      } catch {
        throw new ClientApiError(400, 'VALIDATION', 'the statement rows are not valid JSON');
      }
      const res = await postJson<ImportResult>('/admin/finance/provider-statements', {
        provider,
        note: note || undefined,
        lines,
      });
      setResult(res);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) setError({ message: err.message, code: err.code });
      else setError({ message: 'The import failed. Try again in a moment.' });
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        Import a provider statement
      </button>
    );
  }

  return (
    <div className="stack" style={{ maxWidth: '44rem' }}>
      <div className="card p-4 stack-sm">
        <div className="row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <label className="stack-sm" style={{ minWidth: '10rem' }}>
            Provider token
            <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} />
          </label>
          <label className="stack-sm" style={{ flex: 1, minWidth: '14rem' }}>
            Note (period, source file, who supplied it)
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <label className="stack-sm">
          Statement rows (JSON array - {`[{ lineRef, providerRef, kind, amount, occurredAt }]`}, kind one of
          collection / payout / refund / fee / reversal)
          <textarea
            className="input"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`[\n  { "lineRef": "row-1", "providerRef": "…uuid…", "kind": "collection", "amount": "3200000", "occurredAt": "2026-10-31T09:00:00Z" }\n]`}
            spellCheck={false}
          />
        </label>
        <div className="row" style={{ gap: '0.75rem' }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !text.trim()}>
            {pending ? 'Importing…' : 'Import and classify'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </button>
        </div>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
        {result ? (
          <p className="notice notice-ok" role="status">
            Imported as {result.statementId.slice(0, 8)} - {result.counts.matched ?? 0} matched,{' '}
            {result.counts.mismatch ?? 0} mismatched, {result.counts.duplicate ?? 0} duplicate,{' '}
            {result.counts.unexpected ?? 0} unexpected, {result.counts.unmatched ?? 0} unmatched,{' '}
            {result.missingCount} internal instructions missing from the statement. Nothing was applied to
            the books.
          </p>
        ) : null}
      </div>
    </div>
  );
}
