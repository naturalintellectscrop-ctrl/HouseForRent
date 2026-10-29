/**
 * Landlord onboarding KYC — identity, property ownership/authority, payout
 * details, accountability declarations, and the landlord onboarding terms.
 *
 * ── The honesty rules this module enforces ──
 * 1. THREE INDEPENDENT review states (identity / authority / payout). A
 *    single approved flag would erase distinctions the platform's rules are
 *    built on. Identity approval here is a MANUAL document review recorded
 *    on the application — it is NOT the NIN provider check, NOT account
 *    activation, NOT property verification, NOT listing publication, and no
 *    surface may claim otherwise.
 * 2. Uploading a title scan is not confirming legal title. A broker or
 *    associated person is never recorded as the property owner; their
 *    authority-to-market still goes through the EXISTING per-property
 *    mandate rule at publication.
 * 3. Payout verification verifies DETAILS only. Real money stays disabled
 *    until the NylonPay merchant KYC (standing blocker) closes — nothing
 *    here flips a payout switch.
 * 4. Terms acceptance is EXPLICIT: a ConsentRecord row naming the version,
 *    written server-side. The submission endpoint refuses without it.
 *    Historical acceptance rows are never rewritten — a new version means
 *    a new row (the table is append-only by trigger).
 * 5. Evidence is private. KYC uploads go through the shared media pipeline
 *    (magic-byte sniff, size cap, pixel-bomb guard, EXIF/GPS-stripped WebP
 *    renditions, transactional rows+bytes with compensation) but never
 *    create a ListingPhoto row, so the asset can never become publicly
 *    readable through a listing. resolveMediaAccess already restricts
 *    reads to the uploader and staff — decided server-side.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { ApiError } from './http';
import { processImage } from './image-pipeline';
import {
  assertDeclaredMimeMatches,
  assertMediaSize,
  persistStandaloneAsset,
  sniffImageType,
} from './media';
import { assertUploadableStorage, mediaStorage } from './media-storage';

// ── the landlord onboarding terms ────────────────────────────────────────────

/**
 * The current landlord onboarding terms version. A MATERIAL change to the
 * page's text means bumping this constant — the old ConsentRecord rows stay
 * untouched (append-only), and re-acceptance writes a NEW row naming the new
 * version. This is the minimal safe equivalent of a versioned terms register:
 * the platform can always say which version an account accepted, when, and
 * whether it is current.
 */
export const LANDLORD_TERMS_VERSION = 'landlord-onboarding-2026-10-29';

const TERMS_PURPOSE = 'landlord_terms';

export type LandlordTermsStatus = {
  currentVersion: string;
  accepted: { version: string; acceptedAt: string } | null;
  /** Every acceptance this party has on record (append-only history). */
  history: Array<{ version: string; acceptedAt: string }>;
  /** True when the party has accepted the CURRENT version. */
  current: boolean;
};

export async function getLandlordTermsStatus(partyId: string): Promise<LandlordTermsStatus> {
  const records = await db.consentRecord.findMany({
    where: { partyId, purpose: TERMS_PURPOSE },
    orderBy: { grantedAt: 'desc' },
  });
  const history = records.map((r) => ({
    version: r.policyVersion,
    acceptedAt: r.grantedAt.toISOString(),
  }));
  return {
    currentVersion: LANDLORD_TERMS_VERSION,
    accepted: history[0] ?? null,
    history,
    current: history.some((h) => h.version === LANDLORD_TERMS_VERSION),
  };
}

/**
 * Records an explicit acceptance of the named version. Idempotent: an
 * acceptance of the same version by the same party returns the existing
 * record unchanged (a second row would read as a second decision).
 * A DIFFERENT version than the current one is refused — the client can
 * only accept what it was shown.
 */
export async function acceptLandlordTerms(params: {
  partyId: string;
  version: string;
}): Promise<LandlordTermsStatus> {
  if (params.version !== LANDLORD_TERMS_VERSION) {
    throw new ApiError(
      400,
      'TERMS_VERSION_MISMATCH',
      'that terms version is not the one currently offered',
    );
  }
  const existing = await db.consentRecord.findFirst({
    where: { partyId: params.partyId, purpose: TERMS_PURPOSE, policyVersion: params.version },
    orderBy: { grantedAt: 'desc' },
  });
  if (!existing) {
    // Append-only by trigger: corrections are new rows, never edits.
    const record = await db.consentRecord.create({
      data: {
        partyId: params.partyId,
        purpose: TERMS_PURPOSE,
        policyVersion: params.version,
        grantedAt: new Date(),
      },
    });
    await db.auditEvent.create({
      data: {
        actorPartyId: params.partyId,
        eventType: 'landlord_terms_accepted',
        subjectRef: record.id,
        payload: { version: params.version, purpose: TERMS_PURPOSE },
        occurredAt: new Date(),
      },
    });
  }
  return getLandlordTermsStatus(params.partyId);
}

async function assertLandlordTermsAccepted(partyId: string): Promise<void> {
  const status = await getLandlordTermsStatus(partyId);
  if (!status.current) {
    throw new ApiError(
      403,
      'TERMS_NOT_ACCEPTED',
      'the landlord onboarding terms must be read and accepted first',
    );
  }
}

// ── evidence upload (the shared media pipeline, private by construction) ────

export const KYC_EVIDENCE_KINDS = [
  'id_front',
  'id_back',
  'selfie',
  'ownership_evidence',
  'property_photo',
] as const;
export type KycEvidenceKind = (typeof KYC_EVIDENCE_KINDS)[number];

/** A KYC application cites at most four property photographs. */
export const MAX_KYC_PROPERTY_PHOTOS = 4;

export async function uploadKycEvidence(params: {
  partyId: string;
  kind: string;
  bytes: Uint8Array;
  declaredMime: string | null;
}): Promise<{
  mediaAssetId: string;
  url: string;
  thumbUrl: string;
  mimeType: string;
  byteSize: number;
}> {
  assertUploadableStorage();
  if (!(KYC_EVIDENCE_KINDS as readonly string[]).includes(params.kind)) {
    throw new ApiError(400, 'VALIDATION', `kind must be one of: ${KYC_EVIDENCE_KINDS.join(', ')}`);
  }
  assertMediaSize(params.bytes.length);
  const sniffed = sniffImageType(params.bytes);
  if (!sniffed) {
    throw new ApiError(415, 'MEDIA_TYPE_NOT_ACCEPTED', 'only JPEG, PNG and WebP photographs are accepted');
  }
  assertDeclaredMimeMatches(params.declaredMime, sniffed.mime);
  // Decode-and-derive BEFORE any storage write: corrupt or pixel-bomb
  // evidence is refused without side effects (same contract as listings).
  const processed = await processImage(params.bytes);

  const result = await persistStandaloneAsset({
    baseDir: `kyc/${params.partyId}`,
    actorPartyId: params.partyId,
    sniffed,
    bytes: params.bytes,
    processed,
    auditEventType: 'kyc_media_uploaded',
    auditPayload: {
      kind: params.kind,
      byteSize: params.bytes.length,
      mimeType: sniffed.mime,
    },
  });

  return {
    mediaAssetId: result.mediaAssetId,
    url: `/api/v1/media/${result.mediaAssetId}?variant=detail`,
    thumbUrl: `/api/v1/media/${result.mediaAssetId}?variant=thumb`,
    mimeType: result.mimeType,
    byteSize: result.byteSize,
  };
}

/**
 * Removes the caller's own evidence asset. Refused while ANY decided
 * (approved/rejected) application still cites it — decided evidence is part
 * of the record (the DB FKs enforce this too). While an application is
 * open, the citing slots are detached first so rows and bytes still move
 * together.
 */
export async function deleteKycEvidence(params: {
  partyId: string;
  mediaAssetId: string;
}): Promise<{ deleted: true }> {
  const asset = await db.mediaAsset.findUnique({
    where: { id: params.mediaAssetId },
    select: { id: true, uploadedByPartyId: true, storageRef: true },
  });
  // 404, not 403: existence of someone else's evidence is not disclosed.
  if (!asset || asset.uploadedByPartyId !== params.partyId) {
    throw new ApiError(404, 'MEDIA_NOT_FOUND', 'no such media');
  }

  const citing = await db.landlordKyc.findMany({
    where: {
      OR: [
        { idFrontMediaId: asset.id },
        { idBackMediaId: asset.id },
        { selfieMediaId: asset.id },
        { ownershipEvidenceMediaId: asset.id },
      ],
    },
    select: {
      id: true,
      identityState: true,
      authorityState: true,
      propertyPhotos: true,
      idFrontMediaId: true,
      idBackMediaId: true,
      selfieMediaId: true,
      ownershipEvidenceMediaId: true,
    },
  });
  const decided = citing.filter(
    (k) => k.identityState === 'approved' || k.identityState === 'rejected'
      || k.authorityState === 'approved' || k.authorityState === 'rejected',
  );
  if (decided.length > 0) {
    throw new ApiError(
      409,
      'KYC_EVIDENCE_DECIDED',
      'this document is part of a decided review and cannot be removed',
    );
  }

  // Detach (open applications only) + delete asset rows in one transaction;
  // bytes are compensated last — the same contract as listing media.
  const asPhotos = (photos: Prisma.JsonValue | null): string[] =>
    Array.isArray(photos) ? photos.filter((x): x is string => typeof x === 'string') : [];

  // Variant refs must be collected BEFORE the delete: the variant rows
  // CASCADE with the asset, so after the transaction they are gone.
  const variantRefs = (
    await db.mediaVariant.findMany({ where: { mediaAssetId: asset.id }, select: { storageRef: true } })
  ).map((v) => v.storageRef);

  const { provider } = mediaStorage();
  try {
    await db.$transaction(async (tx) => {
      for (const k of citing) {
        const data: Prisma.LandlordKycUpdateInput = {};
        if (k.idFrontMediaId === asset.id) data.idFrontMedia = { disconnect: true };
        if (k.idBackMediaId === asset.id) data.idBackMedia = { disconnect: true };
        if (k.selfieMediaId === asset.id) data.selfieMedia = { disconnect: true };
        if (k.ownershipEvidenceMediaId === asset.id) data.ownershipEvidenceMedia = { disconnect: true };
        if (asPhotos(k.propertyPhotos).includes(asset.id)) {
          data.propertyPhotos = asPhotos(k.propertyPhotos).filter((id) => id !== asset.id);
        }
        if (Object.keys(data).length > 0) {
          await tx.landlordKyc.update({ where: { id: k.id }, data });
        }
      }
      await tx.mediaAsset.delete({ where: { id: asset.id } });
      await tx.auditEvent.create({
        data: {
          actorPartyId: params.partyId,
          eventType: 'kyc_media_deleted',
          subjectRef: asset.id,
          payload: { detachedApplications: citing.length },
          occurredAt: new Date(),
        },
      });
    });
  } catch (err) {
    // The FK wall is the second gate: if a concurrent decision landed
    // between the check and the delete, the delete fails and the evidence
    // (and its rows) stay intact — the honest direction to fail.
    throw err;
  }
  await Promise.allSettled([asset.storageRef, ...variantRefs].map((ref) => provider.delete(ref)));
  return { deleted: true };
}

// ── submission ───────────────────────────────────────────────────────────────

export type KycSubmissionInput = {
  legalName: string;
  idDocumentType: 'national_id' | 'other_document';
  ageConfirmed: boolean;
  idFrontMediaId?: string | null;
  idBackMediaId?: string | null;
  selfieMediaId?: string | null;
  relationship: 'owner' | 'broker_agent' | 'other_associated';
  propertyId?: string | null;
  titleParticulars?: string | null;
  ownershipEvidenceMediaId?: string | null;
  propertyPhotoIds?: string[];
  authorityExplanation?: string | null;
  payoutRecipientName?: string | null;
  payoutMethod?: 'mobile_money' | null;
  payoutDestination?: string | null;
  declarations: {
    identityAccurate: boolean;
    relationshipHonest: boolean;
    authorityDisclosed: boolean;
    accuracyOngoing: boolean;
    agreeTerms: boolean;
  };
  termsVersion: string;
};

export class KycAlreadyOpenError extends Error {
  constructor() {
    super('an open application already exists — resubmit it instead of starting a new one');
    this.name = 'KycAlreadyOpenError';
  }
}

/** An application is OPEN while identity or authority still await a decision. */
export function kycIsOpen(k: { identityState: string; authorityState: string }): boolean {
  return (
    k.identityState === 'pending' || k.identityState === 'more_info'
    || k.authorityState === 'pending' || k.authorityState === 'more_info'
  );
}

const UG_MOBILE = /^(?:\+256|0)(?:7|3)(?:0|1|2|3|4|5|6|7|8|9)\d{7}$/;

function normalizeUgMobile(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  if (!UG_MOBILE.test(digits)) return null;
  return digits.startsWith('+') ? digits : `+256${digits.slice(1)}`;
}

/** Validates media ownership: every cited asset must exist AND be uploaded
 * by the applicant. A forged id in the payload must not attach someone
 * else's document to an application. */
async function assertOwnAssets(partyId: string, ids: Array<string | null | undefined>): Promise<void> {
  const present = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (present.length === 0) return;
  const rows = await db.mediaAsset.findMany({
    where: { id: { in: present } },
    select: { id: true, uploadedByPartyId: true },
  });
  const found = new Set(rows.filter((r) => r.uploadedByPartyId === partyId).map((r) => r.id));
  for (const id of present) {
    if (!found.has(id)) {
      throw new ApiError(404, 'MEDIA_NOT_FOUND', 'a cited document upload does not exist');
    }
  }
}

/**
 * The one validation every submission (create or resubmit) passes through.
 * Section rules are honest and small: what the review actually needs,
 * nothing more — extra documents are requested per-case by a reviewer,
 * never by default.
 */
function validateSubmission(input: KycSubmissionInput): void {
  // Enum membership is re-checked here (not only at the route): the PATCH
  // path merges client fields directly, and a bogus value must be a 400,
  // never a Prisma enum-cast 500.
  if (input.idDocumentType !== 'national_id' && input.idDocumentType !== 'other_document') {
    throw new ApiError(400, 'VALIDATION', 'idDocumentType must be national_id or other_document');
  }
  if (!['owner', 'broker_agent', 'other_associated'].includes(input.relationship)) {
    throw new ApiError(400, 'VALIDATION', 'relationship must be owner, broker_agent or other_associated');
  }
  if (input.payoutMethod != null && input.payoutMethod !== 'mobile_money') {
    throw new ApiError(400, 'VALIDATION', 'payoutMethod must be mobile_money');
  }
  if (input.legalName.trim().length < 3) {
    throw new ApiError(400, 'VALIDATION', 'legalName must be your full legal name');
  }
  if (!input.ageConfirmed) {
    throw new ApiError(400, 'VALIDATION', 'the age-eligibility declaration must be confirmed');
  }
  const d = input.declarations;
  const allTrue =
    d.identityAccurate === true && d.relationshipHonest === true
    && d.authorityDisclosed === true && d.accuracyOngoing === true
    && d.agreeTerms === true;
  if (!allTrue) {
    throw new ApiError(400, 'VALIDATION', 'every accountability declaration must be accepted');
  }
  if (input.idDocumentType === 'national_id') {
    // The standard citizen path: both ID sides + a selfie.
    if (!input.idFrontMediaId || !input.idBackMediaId || !input.selfieMediaId) {
      throw new ApiError(
        400,
        'VALIDATION',
        'the national ID path needs the ID front, the ID back and a self-photograph',
      );
    }
  } else {
    // The documented exception: a selfie at minimum; document scans may
    // follow. The application is flagged for owner review — never auto-
    // rejected by an invented eligibility rule.
    if (!input.selfieMediaId) {
      throw new ApiError(400, 'VALIDATION', 'a self-photograph is required');
    }
  }
  if (input.titleParticulars !== null && input.titleParticulars !== undefined
    && input.titleParticulars.trim().length > 0 && input.titleParticulars.trim().length < 10) {
    throw new ApiError(400, 'VALIDATION', 'titleParticulars should describe the property or title');
  }
  if (input.relationship === 'owner') {
    if (!input.titleParticulars) {
      throw new ApiError(400, 'VALIDATION', 'describe the property title particulars');
    }
    if (!input.ownershipEvidenceMediaId) {
      throw new ApiError(400, 'VALIDATION', 'attach the certificate of title or ownership evidence');
    }
  } else if (!input.authorityExplanation || input.authorityExplanation.trim().length < 20) {
    throw new ApiError(
      400,
      'VALIDATION',
      'explain your authority or association with the property (a sentence or two)',
    );
  }
  const photos = (input.propertyPhotoIds ?? []).filter((x) => typeof x === 'string' && x.length > 0);
  if (photos.length > MAX_KYC_PROPERTY_PHOTOS) {
    throw new ApiError(400, 'VALIDATION', `at most ${MAX_KYC_PROPERTY_PHOTOS} property photographs`);
  }
  const payoutProvided =
    (input.payoutRecipientName ?? '').trim().length > 0
    || input.payoutMethod != null
    || (input.payoutDestination ?? '').trim().length > 0;
  if (payoutProvided) {
    if (!input.payoutRecipientName || input.payoutRecipientName.trim().length < 3) {
      throw new ApiError(400, 'VALIDATION', 'payoutRecipientName is required with payout details');
    }
    if (input.payoutMethod !== 'mobile_money') {
      // The provider integration supports mobile money only — inventing a
      // bank-transfer option would promise a rail that does not exist.
      throw new ApiError(400, 'VALIDATION', 'payoutMethod must be mobile_money');
    }
    const normalized = input.payoutDestination ? normalizeUgMobile(input.payoutDestination) : null;
    if (!normalized) {
      throw new ApiError(400, 'VALIDATION', 'payoutDestination must be a Ugandan mobile-money number');
    }
    input.payoutDestination = normalized;
  }
}

async function assertCitedProperty(input: KycSubmissionInput): Promise<void> {
  if (!input.propertyId) return;
  const property = await db.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true },
  });
  if (!property) throw new ApiError(404, 'PROPERTY_NOT_FOUND', 'the cited property does not exist');
}

/** The latest application for a party (any state). */
export async function latestKycForParty(partyId: string) {
  return db.landlordKyc.findFirst({
    where: { partyId },
    orderBy: { submittedAt: 'desc' },
  });
}

/** Submit a NEW application. Refuses while an open application exists. */
export async function submitLandlordKyc(params: {
  partyId: string;
  input: KycSubmissionInput;
}) {
  await assertLandlordTermsAccepted(params.partyId);
  if (params.input.termsVersion !== LANDLORD_TERMS_VERSION) {
    throw new ApiError(
      400,
      'TERMS_VERSION_MISMATCH',
      'the application must cite the terms version that is currently in force',
    );
  }
  const existing = await latestKycForParty(params.partyId);
  if (existing && kycIsOpen(existing)) throw new KycAlreadyOpenError();

  validateSubmission(params.input);
  await assertCitedProperty(params.input);
  await assertOwnAssets(params.partyId, [
    params.input.idFrontMediaId,
    params.input.idBackMediaId,
    params.input.selfieMediaId,
    params.input.ownershipEvidenceMediaId,
    ...(params.input.propertyPhotoIds ?? []),
  ]);

  const { propertyPhotoIds, ...rest } = params.input;
  const created = await db.landlordKyc.create({
    data: {
      partyId: params.partyId,
      legalName: rest.legalName.trim(),
      idDocumentType: rest.idDocumentType,
      ageConfirmed: rest.ageConfirmed,
      idFrontMediaId: rest.idFrontMediaId ?? null,
      idBackMediaId: rest.idBackMediaId ?? null,
      selfieMediaId: rest.selfieMediaId ?? null,
      relationship: rest.relationship,
      propertyId: rest.propertyId ?? null,
      titleParticulars: rest.titleParticulars?.trim() ?? null,
      ownershipEvidenceMediaId: rest.ownershipEvidenceMediaId ?? null,
      propertyPhotos: (propertyPhotoIds ?? []).filter((x) => typeof x === 'string' && x.length > 0),
      authorityExplanation: rest.authorityExplanation?.trim() ?? null,
      payoutRecipientName: rest.payoutRecipientName?.trim() ?? null,
      payoutMethod: rest.payoutMethod ?? null,
      payoutDestination: rest.payoutDestination ?? null,
      declarations: rest.declarations,
      termsVersion: rest.termsVersion,
    },
  });
  await db.auditEvent.create({
    data: {
      actorPartyId: params.partyId,
      eventType: 'landlord_kyc_submitted',
      subjectRef: created.id,
      payload: {
        relationship: rest.relationship,
        idDocumentType: rest.idDocumentType,
        payoutProvided: Boolean(rest.payoutMethod),
        termsVersion: rest.termsVersion,
      },
      occurredAt: new Date(),
    },
  });
  return created;
}

/**
 * Resubmission: the applicant updates the sections a reviewer sent back
 * (more_info) — or any section still pending — on their OPEN application.
 * A touched section returns to `pending`; sections already decided keep
 * their state. Deciding evidence is never silently dropped: a section the
 * applicant leaves untouched stays exactly as the reviewer saw it.
 */
export async function resubmitLandlordKyc(params: {
  partyId: string;
  submissionId: string;
  input: Partial<KycSubmissionInput>;
}) {
  await assertLandlordTermsAccepted(params.partyId);
  const existing = await db.landlordKyc.findUnique({ where: { id: params.submissionId } });
  if (!existing || existing.partyId !== params.partyId) {
    throw new ApiError(404, 'KYC_NOT_FOUND', 'no such application');
  }
  if (!kycIsOpen(existing)) {
    throw new ApiError(
      409,
      'KYC_NOT_OPEN',
      'this application has been decided — start a new application instead',
    );
  }

  const merged: KycSubmissionInput = {
    legalName: params.input.legalName ?? existing.legalName,
    idDocumentType: params.input.idDocumentType ?? existing.idDocumentType,
    ageConfirmed: params.input.ageConfirmed ?? existing.ageConfirmed,
    idFrontMediaId: params.input.idFrontMediaId !== undefined
      ? params.input.idFrontMediaId
      : existing.idFrontMediaId,
    idBackMediaId: params.input.idBackMediaId !== undefined
      ? params.input.idBackMediaId
      : existing.idBackMediaId,
    selfieMediaId: params.input.selfieMediaId !== undefined
      ? params.input.selfieMediaId
      : existing.selfieMediaId,
    relationship: params.input.relationship ?? existing.relationship,
    propertyId: params.input.propertyId !== undefined ? params.input.propertyId : existing.propertyId,
    titleParticulars: params.input.titleParticulars !== undefined
      ? params.input.titleParticulars
      : existing.titleParticulars,
    ownershipEvidenceMediaId: params.input.ownershipEvidenceMediaId !== undefined
      ? params.input.ownershipEvidenceMediaId
      : existing.ownershipEvidenceMediaId,
    propertyPhotoIds: params.input.propertyPhotoIds !== undefined
      ? params.input.propertyPhotoIds
      : asStringArray(existing.propertyPhotos),
    authorityExplanation: params.input.authorityExplanation !== undefined
      ? params.input.authorityExplanation
      : existing.authorityExplanation,
    payoutRecipientName: params.input.payoutRecipientName !== undefined
      ? params.input.payoutRecipientName
      : existing.payoutRecipientName,
    payoutMethod: params.input.payoutMethod !== undefined ? params.input.payoutMethod : existing.payoutMethod,
    payoutDestination: params.input.payoutDestination !== undefined
      ? params.input.payoutDestination
      : existing.payoutDestination,
    declarations: params.input.declarations ?? asDeclarations(existing.declarations),
    termsVersion: params.input.termsVersion ?? existing.termsVersion,
  };
  validateSubmission(merged);
  await assertCitedProperty(merged);
  await assertOwnAssets(params.partyId, [
    merged.idFrontMediaId,
    merged.idBackMediaId,
    merged.selfieMediaId,
    merged.ownershipEvidenceMediaId,
    ...(merged.propertyPhotoIds ?? []),
  ]);

  // Which sections get touched (and therefore return to pending)? A section
  // the reviewer sent back (more_info) or that is still pending, AND whose
  // inputs the applicant actually changed this round.
  const touched = {
    identity:
      (existing.identityState === 'pending' || existing.identityState === 'more_info') &&
      (params.input.legalName !== undefined
        || params.input.idDocumentType !== undefined
        || params.input.idFrontMediaId !== undefined
        || params.input.idBackMediaId !== undefined
        || params.input.selfieMediaId !== undefined),
    authority:
      (existing.authorityState === 'pending' || existing.authorityState === 'more_info') &&
      (params.input.relationship !== undefined
        || params.input.propertyId !== undefined
        || params.input.titleParticulars !== undefined
        || params.input.ownershipEvidenceMediaId !== undefined
        || params.input.propertyPhotoIds !== undefined
        || params.input.authorityExplanation !== undefined),
    payout:
      existing.payoutState === 'pending' || existing.payoutState === 'more_info'
        ? (params.input.payoutRecipientName !== undefined
          || params.input.payoutMethod !== undefined
          || params.input.payoutDestination !== undefined)
        : false,
  };

  const updated = await db.landlordKyc.update({
    where: { id: existing.id },
    data: {
      legalName: merged.legalName.trim(),
      idDocumentType: merged.idDocumentType,
      ageConfirmed: merged.ageConfirmed,
      idFrontMediaId: merged.idFrontMediaId ?? null,
      idBackMediaId: merged.idBackMediaId ?? null,
      selfieMediaId: merged.selfieMediaId ?? null,
      relationship: merged.relationship,
      propertyId: merged.propertyId ?? null,
      titleParticulars: merged.titleParticulars?.trim() ?? null,
      ownershipEvidenceMediaId: merged.ownershipEvidenceMediaId ?? null,
      propertyPhotos: (merged.propertyPhotoIds ?? []).filter((x) => typeof x === 'string' && x.length > 0),
      authorityExplanation: merged.authorityExplanation?.trim() ?? null,
      payoutRecipientName: merged.payoutRecipientName?.trim() ?? null,
      payoutMethod: merged.payoutMethod ?? null,
      payoutDestination: merged.payoutDestination ?? null,
      declarations: merged.declarations,
      termsVersion: merged.termsVersion,
      ...(touched.identity ? { identityState: 'pending' as const, identityReviewNote: null } : {}),
      ...(touched.authority ? { authorityState: 'pending' as const, authorityReviewNote: null } : {}),
      ...(touched.payout ? { payoutState: 'pending' as const, payoutReviewNote: null } : {}),
    },
  });
  await db.auditEvent.create({
    data: {
      actorPartyId: params.partyId,
      eventType: 'landlord_kyc_resubmitted',
      subjectRef: existing.id,
      payload: {
        sectionsTouched: Object.entries(touched).filter(([, v]) => v).map(([k]) => k),
      },
      occurredAt: new Date(),
    },
  });
  return updated;
}

function asStringArray(v: Prisma.JsonValue | null): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asDeclarations(v: Prisma.JsonValue | null): KycSubmissionInput['declarations'] {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    identityAccurate: o.identityAccurate === true,
    relationshipHonest: o.relationshipHonest === true,
    authorityDisclosed: o.authorityDisclosed === true,
    accuracyOngoing: o.accuracyOngoing === true,
    agreeTerms: o.agreeTerms === true,
  };
}

// ── review (admin) ───────────────────────────────────────────────────────────

export type KycSection = 'identity' | 'authority' | 'payout';
export type KycDecision = 'approve' | 'request_info' | 'reject';

export class KycSectionDecidedError extends Error {
  constructor(readonly section: KycSection, readonly state: string) {
    super(`the ${section} review is already ${state}`);
    this.name = 'KycSectionDecidedError';
  }
}

const SECTION_COLUMN = {
  identity: { state: 'identityState', note: 'identityReviewNote' },
  authority: { state: 'authorityState', note: 'authorityReviewNote' },
  payout: { state: 'payoutState', note: 'payoutReviewNote' },
} as const;

/**
 * Records one reviewer decision on one section. Idempotent where it must
 * be: the SAME decision that is already current is a 409 (no duplicate
 * audit row, no ambiguous double-approval); a DIFFERENT decision on a
 * decided section is the documented suspend/revoke path — it is recorded
 * as a new audit row, and the previous decision remains in the trail.
 *
 * Side effects, deliberately few and honest:
 * - authority approve + non-owner relationship + a linked property with a
 *   PENDING mandate → that mandate is verified in the same transaction
 *   (one fact, one vocabulary: the mandate table stays the single
 *   per-property authority record).
 * - nothing else. Not the party status, not field verification, not
 *   publication, not payout activation.
 */
export async function decideKycSection(params: {
  submissionId: string;
  adminPartyId: string;
  section: KycSection;
  decision: KycDecision;
  reason: string;
}) {
  if (!params.reason || params.reason.trim().length < 4) {
    throw new ApiError(400, 'VALIDATION', 'a review reason is required');
  }
  const submission = await db.landlordKyc.findUnique({
    where: { id: params.submissionId },
    include: { party: { select: { id: true, displayName: true, primaryPhone: true } } },
  });
  if (!submission) throw new ApiError(404, 'KYC_NOT_FOUND', 'no such application');

  const col = SECTION_COLUMN[params.section];
  const currentState = submission[col.state];
  const nextState =
    params.decision === 'approve' ? 'approved' : params.decision === 'request_info' ? 'more_info' : 'rejected';

  if (currentState === nextState) {
    throw new KycSectionDecidedError(params.section, currentState);
  }

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.landlordKyc.update({
      where: { id: submission.id },
      data: {
        [col.state]: nextState,
        [col.note]: params.reason.trim(),
        lastReviewedByPartyId: params.adminPartyId,
        lastReviewedAt: new Date(),
      },
    });
    // Mandate integration (see docstring): the smallest honest bridge —
    // the KYC decision verifies an EXISTING pending mandate for the linked
    // property; it never creates ownership.
    let mandateVerified = false;
    if (params.section === 'authority' && nextState === 'approved'
      && submission.relationship !== 'owner' && submission.propertyId) {
      const mandate = await tx.propertyMandate.findUnique({
        where: { listerPartyId_propertyId: { listerPartyId: submission.partyId, propertyId: submission.propertyId } },
        select: { id: true, state: true },
      });
      if (mandate && mandate.state === 'pending') {
        await tx.propertyMandate.update({
          where: { id: mandate.id },
          data: { state: 'verified', verifiedByPartyId: params.adminPartyId, verifiedAt: new Date() },
        });
        await tx.auditEvent.create({
          data: {
            actorPartyId: params.adminPartyId,
            eventType: 'mandate_decided',
            subjectRef: mandate.id,
            payload: { decision: 'verified', via: 'landlord_kyc', submissionId: submission.id },
            occurredAt: new Date(),
          },
        });
        mandateVerified = true;
      }
    }
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        eventType: 'landlord_kyc_decision',
        subjectRef: submission.id,
        payload: {
          section: params.section,
          decision: params.decision,
          from: currentState,
          to: nextState,
          reason: params.reason.trim(),
          applicantPartyId: submission.partyId,
          ...(mandateVerified ? { mandateVerified: true } : {}),
        },
        occurredAt: new Date(),
      },
    });
    return row;
  });
  return updated;
}

// ── reads (server pages + admin queue) ──────────────────────────────────────

const submissionInclude = {
  party: { select: { id: true, displayName: true, primaryPhone: true, status: true, createdAt: true } },
  property: { select: { id: true, landmarkText: true, neighbourhood: { select: { name: true } } } },
  idFrontMedia: { select: { id: true } },
  idBackMedia: { select: { id: true } },
  selfieMedia: { select: { id: true } },
  ownershipEvidenceMedia: { select: { id: true } },
} satisfies Prisma.LandlordKycInclude;

export type KycSubmissionRow = Prisma.LandlordKycGetPayload<{ include: typeof submissionInclude }>;

/** The queue: every application, newest first, with reviewer-facing flags. */
export async function adminKycQueue(): Promise<Array<{
  row: KycSubmissionRow;
  flags: string[];
}>> {
  const rows = await db.landlordKyc.findMany({
    orderBy: { submittedAt: 'desc' },
    take: 100,
    include: submissionInclude,
  });
  return rows.map((row) => {
    const flags: string[] = [];
    if (row.idDocumentType === 'other_document') flags.push('owner-review: non-standard document path');
    if (row.relationship !== 'owner') flags.push(`declared ${row.relationship.replace('_', ' ')}`);
    if (!row.ageConfirmed) flags.push('age declaration missing');
    if (row.payoutMethod) flags.push('payout details submitted');
    return { row, flags };
  });
}

/** The review screen's data: the application, its evidence, its trail.
 * ONE shape shared by the API route, the in-process resolver and the page —
 * evidence ids travel (never URLs), and dates are ISO strings. */
export async function adminKycDetail(submissionId: string): Promise<{
  row: {
    id: string;
    submittedAt: string;
    updatedAt: string;
    party: { id: string; displayName: string; primaryPhone: string; status: string; createdAt: string };
    legalName: string;
    idDocumentType: string;
    ageConfirmed: boolean;
    relationship: string;
    property: { id: string; landmarkText: string; neighbourhood: string | null } | null;
    titleParticulars: string | null;
    authorityExplanation: string | null;
    propertyPhotos: string[];
    evidence: {
      idFrontMediaId: string | null;
      idBackMediaId: string | null;
      selfieMediaId: string | null;
      ownershipEvidenceMediaId: string | null;
    };
    payout: {
      recipientName: string | null;
      method: string | null;
      destination: string | null;
      state: string;
      reviewNote: string | null;
    };
    declarations: Record<string, boolean>;
    termsVersion: string;
    identityState: string;
    identityReviewNote: string | null;
    authorityState: string;
    authorityReviewNote: string | null;
    payoutState: string;
    payoutReviewNote: string | null;
    lastReviewedAt: string | null;
    lastReviewedByPartyId: string | null;
  };
  audit: Array<{
    id: string;
    eventType: string;
    actorName: string;
    payload: Prisma.JsonValue | null;
    occurredAt: string;
  }>;
}> {
  const row = await db.landlordKyc.findUnique({
    where: { id: submissionId },
    include: submissionInclude,
  });
  if (!row) throw new ApiError(404, 'KYC_NOT_FOUND', 'no such application');
  const audit = await db.auditEvent.findMany({
    where: { subjectRef: submissionId },
    orderBy: { occurredAt: 'desc' },
    take: 50,
    include: { actorParty: { select: { displayName: true } } },
  });
  return {
    row: {
      id: row.id,
      submittedAt: row.submittedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      party: {
        id: row.party.id,
        displayName: row.party.displayName,
        primaryPhone: row.party.primaryPhone,
        status: row.party.status,
        createdAt: row.party.createdAt.toISOString(),
      },
      legalName: row.legalName,
      idDocumentType: row.idDocumentType,
      ageConfirmed: row.ageConfirmed,
      relationship: row.relationship,
      property: row.property
        ? {
            id: row.property.id,
            landmarkText: row.property.landmarkText,
            neighbourhood: row.property.neighbourhood?.name ?? null,
          }
        : null,
      titleParticulars: row.titleParticulars,
      authorityExplanation: row.authorityExplanation,
      propertyPhotos: asStringArray(row.propertyPhotos),
      evidence: {
        idFrontMediaId: row.idFrontMedia?.id ?? null,
        idBackMediaId: row.idBackMedia?.id ?? null,
        selfieMediaId: row.selfieMedia?.id ?? null,
        ownershipEvidenceMediaId: row.ownershipEvidenceMedia?.id ?? null,
      },
      payout: {
        recipientName: row.payoutRecipientName,
        method: row.payoutMethod,
        destination: row.payoutDestination,
        state: row.payoutState,
        reviewNote: row.payoutReviewNote,
      },
      declarations: asDeclarations(row.declarations),
      termsVersion: row.termsVersion,
      identityState: row.identityState,
      identityReviewNote: row.identityReviewNote,
      authorityState: row.authorityState,
      authorityReviewNote: row.authorityReviewNote,
      payoutState: row.payoutState,
      payoutReviewNote: row.payoutReviewNote,
      lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
      lastReviewedByPartyId: row.lastReviewedByPartyId,
    },
    audit: audit.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      actorName: a.actorParty.displayName,
      payload: a.payload,
      occurredAt: a.occurredAt.toISOString(),
    })),
  };
}

/**
 * The caller's property options for the optional "link a property" field on
 * the ownership/authority section. A convenience for the reviewer — the
 * property system of record is unchanged by citing one.
 */
export async function listOwnPropertyOptions(partyId: string): Promise<Array<{
  id: string;
  label: string;
  neighbourhood: string;
}>> {
  const rows = await db.property.findMany({
    where: { ownerPartyId: partyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      landmarkText: true,
      neighbourhood: { select: { name: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    label: p.landmarkText,
    neighbourhood: p.neighbourhood.name,
  }));
}

/** True for Prisma's "table/column does not exist" errors — the shape the
 * app degrades on when code deploys before the owner applies the additive
 * migration (the same transitional pattern as the email-column round). */
function isMissingStoreError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2021' || code === 'P2022';
}

/** The applicant's own view of their latest application. */
export async function kycStatusForParty(partyId: string) {
  const terms = await getLandlordTermsStatus(partyId);
  let latest: Awaited<ReturnType<typeof latestKycForParty>> = null;
  let history: Array<{
    id: string;
    submittedAt: Date;
    identityState: string;
    authorityState: string;
    payoutState: string;
  }> = [];
  try {
    latest = await latestKycForParty(partyId);
    history = await db.landlordKyc.findMany({
      where: { partyId },
      orderBy: { submittedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        submittedAt: true,
        identityState: true,
        authorityState: true,
        payoutState: true,
      },
    });
  } catch (err) {
    if (!isMissingStoreError(err)) throw err;
    // Migration not applied yet: the terms half still works, the
    // application half honestly reports it is not rolled out here.
    return {
      storeReady: false,
      terms,
      application: null,
      history: [],
    };
  }
  return {
    storeReady: true,
    terms,
    application: latest
      ? {
          id: latest.id,
          submittedAt: latest.submittedAt.toISOString(),
          updatedAt: latest.updatedAt.toISOString(),
          legalName: latest.legalName,
          idDocumentType: latest.idDocumentType,
          relationship: latest.relationship,
          identityState: latest.identityState,
          identityReviewNote: latest.identityReviewNote,
          authorityState: latest.authorityState,
          authorityReviewNote: latest.authorityReviewNote,
          payoutState: latest.payoutState,
          payoutReviewNote: latest.payoutReviewNote,
          payoutProvided: Boolean(latest.payoutMethod),
          isOpen: kycIsOpen(latest),
          // Evidence ids ONLY (never URLs an anonymous page could render):
          // the review screen builds authorized media URLs server-side.
          hasIdFront: Boolean(latest.idFrontMediaId),
          hasIdBack: Boolean(latest.idBackMediaId),
          hasSelfie: Boolean(latest.selfieMediaId),
          hasOwnershipEvidence: Boolean(latest.ownershipEvidenceMediaId),
          propertyPhotoCount: asStringArray(latest.propertyPhotos).length,
        }
      : null,
    history: history.map((h) => ({ ...h, submittedAt: h.submittedAt.toISOString() })),
  };
}
