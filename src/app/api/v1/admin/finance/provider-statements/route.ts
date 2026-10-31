import { NextRequest, NextResponse } from 'next/server';
import { parseShillings, readJson, requireRole, route } from '@/server/http';
import { importProviderStatement, listProviderStatements } from '@/server/finance/provider-statement';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/finance/provider-statements - the imported provider
 * statements with their classification counts. A read never re-classifies;
 * classification happens at import (and is recomputed live for a detail
 * view, so an instruction confirmed after the import still pairs).
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await listProviderStatements());
});

/**
 * POST /api/v1/admin/finance/provider-statements - import a provider
 * statement (transaction report) for reconciliation.
 *
 * ── What an import IS ──
 * An evidence artifact: the statement's rows land verbatim, are classified
 * against our own instructions/postings line by line, and are PRESERVED.
 * Nothing is applied to the books by an import - differences are surfaced,
 * and resolving them goes through the existing workflows (duplicate-payment
 * refund, provider-fee action, reversal workflow).
 *
 * ── The provider-neutral body ──
 * { provider?, periodStart?, periodEnd?, note?,
 *   lines: [{ lineRef?, providerRef, kind: collection|payout|refund|fee|reversal,
 *              amount, currency?, occurredAt, raw? }] }
 *
 * No provider API is called. The import is a reviewed, role-gated upload
 * until the business approves a live fetch.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);

  const rawLines = Array.isArray(body.lines) ? body.lines : null;
  if (!rawLines) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'lines must be an array of provider statement rows' } },
      { status: 422 },
    );
  }

  const toDate = (v: unknown): Date | null => {
    if (typeof v !== 'string' || !v.trim()) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const result = await importProviderStatement({
    provider: typeof body.provider === 'string' ? body.provider : undefined,
    importedByPartyId: session.partyId,
    periodStart: toDate(body.periodStart),
    periodEnd: toDate(body.periodEnd),
    note: typeof body.note === 'string' ? body.note : null,
    lines: rawLines.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        lineRef: typeof r.lineRef === 'string' && r.lineRef.trim() ? r.lineRef.trim() : null,
        providerRef: String(r.providerRef ?? ''),
        kind: String(r.kind ?? ''),
        amount: parseShillings(r.amount, 'amount'),
        currency: typeof r.currency === 'string' ? r.currency : null,
        occurredAt: toDate(r.occurredAt) ?? new Date(),
        raw: r.raw ?? undefined,
      };
    }),
  });

  return NextResponse.json(
    {
      statementId: result.statementId,
      counts: result.counts,
      missingCount: result.missing.length,
      missing: result.missing,
      providerReportedNet: result.providerReportedNet.toString(),
      internalNetForMatched: result.internalNetForMatched.toString(),
    },
    { status: 201 },
  );
});
