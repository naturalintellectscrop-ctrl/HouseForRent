/**
 * Provider statement import + classification - the PROVIDER side of
 * reconciliation (FINANCIAL_ARCHITECTURE.md §9).
 *
 * What this is and deliberately is not:
 *  - It is an ADAPTER BOUNDARY for importing a provider statement or
 *    transaction report (rows the provider says happened), classifying each
 *    row against our own instruction/ledger records, and PRESERVING both the
 *    import and the verdicts. The format is provider-neutral JSON; Nylon Pay
 *    (or any successor) maps onto it without schema churn.
 *  - It is NOT a live provider API integration. No provider payout/statement
 *    API has been selected and approved, so nothing here fetches, pulls, or
 *    pretends. Statements arrive through the admin import endpoint, which is
 *    role-gated and records WHO imported WHAT.
 *  - It never mutates the books. Classification only ever WRITES verdicts on
 *    the imported lines themselves; a real correction goes through the
 *    existing adjustment/reversal services.
 *
 * Match semantics (the five verdicts, frozen on the line at import):
 *   matched    - pairs with an internal instruction of the same class and amount
 *   mismatch   - pairs, but the amount (or the instruction's outcome) disagrees
 *   duplicate  - a second provider line under a reference already matched in
 *                this statement - the shape a double collection takes
 *   unexpected - no internal instruction with this provider reference at all
 *   unmatched  - no internal object of the expected class; ops review
 *
 * Two balances are always reported SEPARATELY and NEVER reconciled into one:
 *   providerReportedNet - what this statement says the provider balance did;
 *   internalNet         - what our books say for the matched instructions.
 * Labelling the internal figure "provider reconciliation" is exactly the
 * lie this module exists to make impossible.
 */
import { Prisma } from '@prisma/client';
import type { ProviderLineKind, ProviderLineMatchState } from '@prisma/client';
import { db } from '@/lib/db';
import { ApiError } from '../http';
import { derivedPspState } from '../ledger';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const LINE_KINDS: readonly ProviderLineKind[] = ['collection', 'payout', 'refund', 'fee', 'reversal'];
const MAX_LINES = 5000;

export interface ProviderStatementLineInput {
  lineRef?: string | null;
  providerRef: string;
  kind: string;
  amount: bigint;
  currency?: string | null;
  occurredAt: Date;
  raw?: unknown;
}

export interface ProviderStatementImportInput {
  provider?: string;
  importedByPartyId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  note?: string | null;
  lines: ProviderStatementLineInput[];
}

/** The classification outcome for one statement, persisted on its lines. */
export interface StatementClassification {
  counts: Record<string, number>;
  /** Succeeded internal instructions of these classes absent from the statement. */
  missing: Array<{ instructionId: string; providerRef: string | null; kind: string; amount: string }>;
  /** Σcollections − Σpayouts − Σrefunds − Σfees − Σreversals, per the statement. */
  providerReportedNet: bigint;
  /** Our books' net for the instructions that MATCHED, never a claim about the provider. */
  internalNetForMatched: bigint;
}

/**
 * Import + classify one statement atomically. Re-importing a row identity
 * (statementId + lineRef) is refused by a unique index - the same statement
 * file cannot silently double-count; a corrected import is a NEW statement
 * that supersedes nothing and overwrites nothing.
 */
export async function importProviderStatement(params: ProviderStatementImportInput) {
  const provider = (params.provider ?? 'nylonpay').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(provider)) {
    throw new ApiError(422, 'VALIDATION', 'provider must be a short token (letters, digits, dash, underscore)');
  }
  const lines = params.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new ApiError(422, 'VALIDATION', 'a statement needs at least one line');
  }
  if (lines.length > MAX_LINES) {
    throw new ApiError(422, 'VALIDATION', `a statement import is capped at ${MAX_LINES} lines; split the file`);
  }
  for (const [i, line] of lines.entries()) {
    if (!line.providerRef || typeof line.providerRef !== 'string') {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: providerRef (the transaction reference) is required`);
    }
    if (!(LINE_KINDS as readonly string[]).includes(line.kind)) {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: kind must be one of ${LINE_KINDS.join(' | ')}`);
    }
    if (line.amount <= 0n) {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: amount must be a positive integer of shillings`);
    }
    if (line.currency && line.currency !== 'UGX') {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: only UGX statements are supported`);
    }
    if (!(line.occurredAt instanceof Date) || Number.isNaN(line.occurredAt.getTime())) {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: occurredAt must be a valid date`);
    }
    // Bound the verbatim payload - a pasted raw blob is not a data store.
    const raw = line.raw as Prisma.InputJsonValue | undefined;
    if (raw !== undefined && JSON.stringify(raw).length > 4000) {
      throw new ApiError(422, 'VALIDATION', `line ${i + 1}: raw payload exceeds 4KB - import the reference fields, attach the file elsewhere`);
    }
  }

  // A statement may not carry the same row identity twice - a duplicated
  // line would double-count the provider side. (Re-importing the same file
  // as a NEW statement is allowed and visible; within one import it is a
  // data error.)
  const seenLineRefs = new Set<string>();
  for (const line of lines) {
    if (line.lineRef) {
      if (seenLineRefs.has(line.lineRef)) {
        throw new ApiError(422, 'VALIDATION', `lineRef "${line.lineRef}" appears twice in this import - deduplicate the statement rows first`);
      }
      seenLineRefs.add(line.lineRef);
    }
  }

  const result = await db.$transaction(async (tx) => {
    const statement = await tx.providerStatement.create({
      data: {
        provider,
        importedByPartyId: params.importedByPartyId,
        periodStart: params.periodStart ?? null,
        periodEnd: params.periodEnd ?? null,
        note: params.note ?? null,
        lineCount: lines.length,
      },
    });

    const created: Awaited<ReturnType<typeof tx.providerStatementLine.create>>[] = [];
    for (const [index, line] of lines.entries()) {
      created.push(
        await tx.providerStatementLine.create({
          data: {
            statementId: statement.id,
            lineSeq: index,
            lineRef: line.lineRef?.trim() || null,
            providerRef: line.providerRef.trim(),
            kind: line.kind as ProviderLineKind,
            amount: line.amount,
            currency: line.currency ?? 'UGX',
            occurredAt: line.occurredAt,
            raw: (line.raw as Prisma.InputJsonValue) ?? undefined,
          },
        }),
      );
    }

    const classification = await classifyStatement({ statementId: statement.id, tx });

    await tx.auditEvent.create({
      data: {
        actorPartyId: params.importedByPartyId,
        eventType: 'provider_statement_imported',
        subjectRef: statement.id,
        payload: {
          provider,
          lineCount: lines.length,
          counts: classification.counts,
          missingCount: classification.missing.length,
          providerReportedNet: classification.providerReportedNet.toString(),
          internalNetForMatched: classification.internalNetForMatched.toString(),
          note: 'Imported provider statement - classified, preserved, and never applied to the books.',
        },
        occurredAt: new Date(),
      },
    });

    return { statementId: statement.id, ...classification };
  });

  return result;
}

/**
 * Classifies the lines of one statement and computes the two balances.
 * Runs inside the import transaction; also re-runnable for a stored
 * statement (the admin detail view recomputes the "missing" side live, so
 * an instruction confirmed after the import still gets its pairing).
 */
export async function classifyStatement(params: { statementId: string; tx?: Tx }): Promise<StatementClassification> {
  const client = params.tx ?? db;
  const lines = await client.providerStatementLine.findMany({
    where: { statementId: params.statementId },
    // Import order - which row FIRST matched a reference and which row is
    // the duplicate must be deterministic, never UUID-order lucky.
    orderBy: [{ lineSeq: 'asc' }, { occurredAt: 'asc' }],
  });

  const counts: Record<string, number> = { matched: 0, mismatch: 0, duplicate: 0, unexpected: 0, unmatched: 0 };
  const matchedRefs = new Set<string>();
  let providerReportedNet = 0n;
  let internalNetForMatched = 0n;

  for (const line of lines) {
    providerReportedNet +=
      line.kind === 'collection'
        ? line.amount
        : -line.amount; // payout / refund / fee / reversal all reduce the provider balance

    const verdict = await classifyLine(client, line, matchedRefs);
    counts[verdict.state] += 1;
    if (verdict.matchedInstructionId) {
      matchedRefs.add(line.providerRef);
      internalNetForMatched += verdict.internalAmount ?? 0n;
    }
    if (verdict.state !== line.matchState || verdict.note !== line.matchNote || verdict.matchedInstructionId !== line.matchedInstructionId) {
      await client.providerStatementLine.update({
        where: { id: line.id },
        data: {
          matchState: verdict.state,
          matchedInstructionId: verdict.matchedInstructionId ?? null,
          matchNote: verdict.note,
        },
      });
    }
  }

  // The MISSING side: succeeded instructions of the classes a statement can
  // name that the statement never mentioned. Only meaningful against a
  // statement period; without one, missing is reported only for the matched
  // kinds' whole history (an explicit, stated limitation).
  const statement = await client.providerStatement.findUniqueOrThrow({ where: { id: params.statementId } });
  const importableKinds = new Set(lines.map((l) => l.kind));
  const internalKinds: ProviderLineKind[] = [];
  if (importableKinds.has('collection')) internalKinds.push('collection');
  if (importableKinds.has('payout')) internalKinds.push('payout');
  if (importableKinds.has('refund')) internalKinds.push('refund');

  const missing: StatementClassification['missing'] = [];
  if (internalKinds.length > 0) {
    const kindColumn = { collection: 'collect', payout: 'release', refund: 'refund' } as const;
    const instructions = await client.pspInstruction.findMany({
      where: { kind: { in: internalKinds.map((k) => kindColumn[k]) } },
      include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
    });
    for (const instruction of instructions) {
      if (derivedPspState(instruction) !== 'succeeded') continue;
      if (matchedRefs.has(instruction.providerRef ?? '')) continue;
      if (statement.periodStart && instruction.createdAt < statement.periodStart) continue;
      if (statement.periodEnd && instruction.createdAt > statement.periodEnd) continue;
      missing.push({
        instructionId: instruction.id,
        providerRef: instruction.providerRef,
        kind: instruction.kind,
        amount: instruction.amount.toString(),
      });
    }
  }

  return { counts, missing, providerReportedNet, internalNetForMatched };
}

async function classifyLine(
  client: Tx | typeof db,
  line: { kind: string; providerRef: string; amount: bigint; lineRef: string | null },
  matchedRefs: Set<string>,
): Promise<{ state: ProviderLineMatchState; matchedInstructionId?: string; note?: string; internalAmount?: bigint }> {
  // A reference already matched once in THIS statement: a second line under
  // it is the duplicate-collection shape (or a provider-side double payout).
  if (matchedRefs.has(line.providerRef)) {
    return {
      state: 'duplicate',
      note: `A line for this reference was already matched in this statement - the provider-side excess. If the tenant was collected twice, resolve it through the duplicate-payment refund.`,
    };
  }

  if (line.kind === 'collection' || line.kind === 'payout' || line.kind === 'refund') {
    const pspKind = line.kind === 'collection' ? 'collect' : line.kind === 'payout' ? 'release' : 'refund';
    const instruction = await client.pspInstruction.findFirst({
      where: { providerRef: line.providerRef, kind: pspKind },
      include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
    });
    if (!instruction) {
      return {
        state: 'unexpected',
        note: `No internal ${pspKind} instruction with this provider reference - the provider reports money this system never issued. Investigate before any booking.`,
      };
    }
    if (derivedPspState(instruction) !== 'succeeded') {
      return {
        state: 'mismatch',
        matchedInstructionId: instruction.id,
        internalAmount: instruction.amount,
        note: `Instruction exists but is NOT provider-confirmed (current state: ${derivedPspState(instruction)}) while the provider reports it completed.`,
      };
    }
    if (instruction.amount !== line.amount) {
      return {
        state: 'mismatch',
        matchedInstructionId: instruction.id,
        internalAmount: instruction.amount,
        note: `Reference matches but amounts disagree: provider ${line.amount} vs instruction ${instruction.amount}.`,
      };
    }
    return { state: 'matched', matchedInstructionId: instruction.id, internalAmount: instruction.amount };
  }

  if (line.kind === 'fee') {
    // Fees are booked from VERIFIED provider data under `psp_fee:{sourceRef}`;
    // the source token is what the admin fee action recorded.
    const booked = await client.ledgerEntry.findFirst({
      where: { OR: [{ reference: `psp_fee:${line.providerRef}` }, { reference: `psp_fee:${line.lineRef}` }] },
      select: { amount: true, reference: true },
    });
    if (booked) {
      if (booked.amount === line.amount) {
        return { state: 'matched', note: `Pairs with booked fee ${booked.reference}.` };
      }
      return {
        state: 'mismatch',
        note: `Fee was booked (${booked.amount}) but the statement reports ${line.amount}.`,
      };
    }
    return {
      state: 'unmatched',
      note: 'No booked provider fee under this reference - record it through the provider-fee action only if the statement line is verified.',
    };
  }

  // reversal: the provider clawed a transaction back. The internal record is
  // a FinancialAdjustment (kind provider_reversal) whose evidenceRef names it.
  const adjustment = await client.financialAdjustment.findFirst({
    where: { kind: 'provider_reversal', OR: [{ evidenceRef: line.providerRef }, { evidenceRef: line.lineRef ?? '' }] },
  });
  if (adjustment) {
    return {
      state: adjustment.amount === line.amount ? 'matched' : 'mismatch',
      note:
        adjustment.amount === line.amount
          ? 'Pairs with a recorded provider-reversal adjustment.'
          : `Reversal was recorded (${adjustment.amount}) but the statement reports ${line.amount}.`,
    };
  }
  return {
    state: 'unmatched',
    note: 'A provider reversal this system has no recorded adjustment for - resolve through the reversal workflow, never by editing books.',
  };
}

/** Statement list for the admin console (newest first). */
export async function listProviderStatements(limit = 20) {
  const statements = await db.providerStatement.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { lines: { select: { matchState: true } } },
  });
  return statements.map((s) => {
    const counts: Record<string, number> = { matched: 0, mismatch: 0, duplicate: 0, unexpected: 0, unmatched: 0 };
    for (const line of s.lines) counts[line.matchState] += 1;
    return {
      id: s.id,
      provider: s.provider,
      source: s.source,
      periodStart: s.periodStart?.toISOString() ?? null,
      periodEnd: s.periodEnd?.toISOString() ?? null,
      note: s.note,
      lineCount: s.lineCount,
      createdAt: s.createdAt.toISOString(),
      importedByPartyId: s.importedByPartyId,
      counts,
      hasExceptions: counts.matched < s.lineCount,
    };
  });
}

/** One statement's full detail: lines + the live missing side + balances. */
export async function providerStatementDetail(statementId: string) {
  const statement = await db.providerStatement.findUnique({ where: { id: statementId } });
  if (!statement) throw new ApiError(404, 'STATEMENT_NOT_FOUND', 'provider statement not found');
  const classification = await classifyStatement({ statementId });
  const lines = await db.providerStatementLine.findMany({
    where: { statementId },
    orderBy: [{ lineSeq: 'asc' }, { occurredAt: 'asc' }],
  });
  return {
    statement: {
      id: statement.id,
      provider: statement.provider,
      source: statement.source,
      periodStart: statement.periodStart?.toISOString() ?? null,
      periodEnd: statement.periodEnd?.toISOString() ?? null,
      note: statement.note,
      lineCount: statement.lineCount,
      createdAt: statement.createdAt.toISOString(),
      importedByPartyId: statement.importedByPartyId,
    },
    counts: classification.counts,
    missing: classification.missing,
    providerReportedNet: classification.providerReportedNet.toString(),
    internalNetForMatched: classification.internalNetForMatched.toString(),
    lines: lines.map((l) => ({
      id: l.id,
      lineRef: l.lineRef,
      providerRef: l.providerRef,
      kind: l.kind,
      amount: l.amount.toString(),
      currency: l.currency,
      occurredAt: l.occurredAt.toISOString(),
      matchState: l.matchState,
      matchNote: l.matchNote,
    })),
  };
}
