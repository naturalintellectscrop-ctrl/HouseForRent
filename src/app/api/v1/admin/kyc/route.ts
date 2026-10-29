import { NextResponse } from 'next/server';
import { requireRole, route } from '@/server/http';
import { adminKycQueue } from '@/server/kyc';

/**
 * GET /api/v1/admin/kyc — the landlord-onboarding review queue: every
 * application, newest first, with the reviewer-facing risk flags. Evidence
 * ids travel, never URLs — the review page builds authorized media links
 * server-side, and the media route re-authorizes every request anyway.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  const queue = await adminKycQueue();
  return NextResponse.json({
    total: queue.length,
    rows: queue.map(({ row, flags }) => ({
      id: row.id,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      applicant: row.party,
      legalName: row.legalName,
      idDocumentType: row.idDocumentType,
      relationship: row.relationship,
      identityState: row.identityState,
      authorityState: row.authorityState,
      payoutState: row.payoutState,
      flags,
    })),
  });
});
