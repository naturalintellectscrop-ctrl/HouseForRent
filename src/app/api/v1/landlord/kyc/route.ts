import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route, readJson, ApiError, requireString } from '@/server/http';
import { KycAlreadyOpenError, kycStatusForParty, submitLandlordKyc, type KycSubmissionInput } from '@/server/kyc';

/**
 * GET /api/v1/landlord/kyc — the caller's onboarding-verification status:
 * the landlord terms (version + acceptance record) and their latest
 * application with each section's independent review state.
 *
 * POST /api/v1/landlord/kyc — submit a NEW application. Requires the
 * landlord onboarding terms to have been accepted (server-side check —
 * the checkbox never decides it). Every field is validated in the service;
 * the client's form is a convenience, never the rule.
 */
export const GET = route(async () => {
  const session = await requireRole(['lister', 'admin']);
  return NextResponse.json(await kycStatusForParty(session.partyId));
});

function optString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function optId(v: unknown): string | null {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v.trim()) ? v.trim() : null;
}

function readSubmissionInput(body: Record<string, unknown>): KycSubmissionInput {
  const declarations = (body.declarations ?? {}) as Record<string, unknown>;

  const idDocumentType = requireString(body, 'idDocumentType');
  if (idDocumentType !== 'national_id' && idDocumentType !== 'other_document') {
    throw new ApiError(400, 'VALIDATION', 'idDocumentType must be national_id or other_document');
  }
  const relationship = requireString(body, 'relationship');
  if (!['owner', 'broker_agent', 'other_associated'].includes(relationship)) {
    throw new ApiError(400, 'VALIDATION', 'relationship must be owner, broker_agent or other_associated');
  }
  const payoutMethod = optString(body.payoutMethod);
  if (payoutMethod && payoutMethod !== 'mobile_money') {
    // The provider integration supports mobile money only — the honest
    // method set, not the aspirational one.
    throw new ApiError(400, 'VALIDATION', 'payoutMethod must be mobile_money');
  }
  return {
    legalName: requireString(body, 'legalName'),
    idDocumentType,
    ageConfirmed: body.ageConfirmed === true,
    idFrontMediaId: optId(body.idFrontMediaId),
    idBackMediaId: optId(body.idBackMediaId),
    selfieMediaId: optId(body.selfieMediaId),
    relationship: relationship as KycSubmissionInput['relationship'],
    propertyId: optId(body.propertyId),
    titleParticulars: optString(body.titleParticulars),
    ownershipEvidenceMediaId: optId(body.ownershipEvidenceMediaId),
    propertyPhotoIds: Array.isArray(body.propertyPhotoIds)
      ? body.propertyPhotoIds.filter((x): x is string => typeof x === 'string')
      : [],
    authorityExplanation: optString(body.authorityExplanation),
    payoutRecipientName: optString(body.payoutRecipientName),
    payoutMethod: payoutMethod as KycSubmissionInput['payoutMethod'],
    payoutDestination: optString(body.payoutDestination),
    declarations: {
      identityAccurate: declarations.identityAccurate === true,
      relationshipHonest: declarations.relationshipHonest === true,
      authorityDisclosed: declarations.authorityDisclosed === true,
      accuracyOngoing: declarations.accuracyOngoing === true,
      agreeTerms: declarations.agreeTerms === true,
    },
    termsVersion: requireString(body, 'termsVersion'),
  };
}

export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);
  const input = readSubmissionInput(body);
  try {
    const created = await submitLandlordKyc({ partyId: session.partyId, input });
    return NextResponse.json(
      {
        id: created.id,
        identityState: created.identityState,
        authorityState: created.authorityState,
        payoutState: created.payoutState,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof KycAlreadyOpenError) {
      return NextResponse.json(
        { error: { code: 'KYC_ALREADY_OPEN', message: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }
});
