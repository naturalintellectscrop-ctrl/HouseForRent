'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ClientApiError, postFile, postJson } from '@/lib/client';
import { ApiAlert } from '@/app/ui';
import { MediaImage } from '@/app/media-image';

/**
 * The verification application form — identity, ownership/authority, payout
 * details and the accountability declarations, in one submission the
 * server validates end to end. In `resubmit` mode it PATCHes the open
 * application (only sections a reviewer sent back actually change state).
 *
 * Documents upload through the real media pipeline and render back through
 * the authorized media route — the uploader's own session is what makes the
 * preview visible, the same authorization the reviewer's session uses.
 */

interface UploadedDoc {
  mediaAssetId: string;
  thumbUrl: string;
}

export function KycApplication({
  mode,
  applicationId,
  termsVersion,
  properties,
}: {
  mode: 'create' | 'resubmit';
  applicationId?: string;
  termsVersion: string;
  properties: Array<{ id: string; label: string; neighbourhood: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);

  // ── uploads ──
  const [idFront, setIdFront] = useState<UploadedDoc | null>(null);
  const [idBack, setIdBack] = useState<UploadedDoc | null>(null);
  const [selfie, setSelfie] = useState<UploadedDoc | null>(null);
  const [ownershipEvidence, setOwnershipEvidence] = useState<UploadedDoc | null>(null);
  const [propertyPhotos, setPropertyPhotos] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);

  async function uploadDoc(kind: string, file: File): Promise<UploadedDoc | null> {
    setUploading(kind);
    setError(null);
    try {
      const res = await postFile<{ mediaAssetId: string; thumbUrl: string }>(
        '/landlord/kyc/media',
        file,
        { kind },
      );
      return { mediaAssetId: res.mediaAssetId, thumbUrl: res.thumbUrl };
    } catch (err) {
      setError({
        message: err instanceof ClientApiError ? err.message : 'upload failed - try again',
        code: err instanceof ClientApiError ? err.code : null,
      });
      return null;
    } finally {
      setUploading(null);
    }
  }

  async function removeDoc(doc: UploadedDoc, from: (list: UploadedDoc[]) => void) {
    setError(null);
    try {
      await postJson('/landlord/kyc/media', { mediaAssetId: doc.mediaAssetId }, 'DELETE');
      from([]);
    } catch (err) {
      setError({
        message: err instanceof ClientApiError ? err.message : 'removal failed',
        code: err instanceof ClientApiError ? err.code : null,
      });
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);

    const relationship = String(data.get('relationship') ?? 'owner');
    const payload: Record<string, unknown> = {
      legalName: String(data.get('legalName') ?? '').trim(),
      idDocumentType: String(data.get('idDocumentType') ?? 'national_id'),
      ageConfirmed: data.get('ageConfirmed') === 'on',
      idFrontMediaId: idFront?.mediaAssetId ?? null,
      idBackMediaId: idBack?.mediaAssetId ?? null,
      selfieMediaId: selfie?.mediaAssetId ?? null,
      relationship,
      titleParticulars: String(data.get('titleParticulars') ?? '').trim() || null,
      ownershipEvidenceMediaId: ownershipEvidence?.mediaAssetId ?? null,
      propertyPhotoIds: propertyPhotos.map((p) => p.mediaAssetId),
      authorityExplanation: String(data.get('authorityExplanation') ?? '').trim() || null,
      propertyId: String(data.get('propertyId') ?? '') || null,
      payoutRecipientName: String(data.get('payoutRecipientName') ?? '').trim() || null,
      payoutMethod: String(data.get('payoutRecipientName') ?? '').trim() ? 'mobile_money' : null,
      payoutDestination: String(data.get('payoutDestination') ?? '').trim() || null,
      declarations: {
        identityAccurate: data.get('dec_identityAccurate') === 'on',
        relationshipHonest: data.get('dec_relationshipHonest') === 'on',
        authorityDisclosed: data.get('dec_authorityDisclosed') === 'on',
        accuracyOngoing: data.get('dec_accuracyOngoing') === 'on',
        agreeTerms: data.get('dec_agreeTerms') === 'on',
      },
    };
    if (mode === 'create') payload.termsVersion = termsVersion;

    setPending(true);
    try {
      if (mode === 'create') {
        await postJson('/landlord/kyc', payload);
      } else {
        await postJson(`/landlord/kyc/${applicationId}`, payload, 'PATCH');
      }
      router.refresh();
    } catch (err) {
      setError({
        message: err instanceof ClientApiError ? err.message : 'submission failed - try again',
        code: err instanceof ClientApiError ? err.code : null,
      });
    } finally {
      setPending(false);
    }
  }

  function UploadSlot({
    kind,
    label,
    hint,
    doc,
    onUploaded,
    onRemoved,
    accept = 'image/jpeg,image/png,image/webp',
  }: {
    kind: string;
    label: string;
    hint?: string;
    doc: UploadedDoc | null;
    onUploaded: (d: UploadedDoc) => void;
    onRemoved: () => void;
    accept?: string;
  }) {
    return (
      <div className="field">
        <label>{label}</label>
        {doc ? (
          <div className="row" style={{ gap: '0.9rem', alignItems: 'center' }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <MediaImage src={doc.thumbUrl} alt={label} eager />
            </div>
            <div className="stack-sm" style={{ gap: '0.35rem' }}>
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                Stored in private storage. Only you and the review team can
                see it — never tenants, never the public.
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => removeDoc(doc, onRemoved)}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="stack-sm" style={{ gap: '0.35rem' }}>
            <input
              type="file"
              accept={accept}
              disabled={uploading !== null}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const uploaded = await uploadDoc(kind, file);
                if (uploaded) onUploaded(uploaded);
                e.target.value = '';
              }}
            />
            {hint ? (
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                {hint}
              </span>
            ) : null}
            {uploading === kind ? (
              <span className="faint" style={{ fontSize: '0.8125rem' }}>
                Uploading and processing…
              </span>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="card stack-sm">
        <div className="card-head">
          <span className="card-title">Identity</span>
          <span className="muted">who you are</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="legalName">Full legal name</label>
            <input
              id="legalName"
              name="legalName"
              required
              minLength={3}
              placeholder="As written on your ID"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="idDocumentType">Identity document</label>
            <select id="idDocumentType" name="idDocumentType" defaultValue="national_id">
              <option value="national_id">Ugandan National ID (front + back)</option>
              <option value="other_document">
                Other document (passport, permit…) — held for a manual review
              </option>
            </select>
            <span className="faint" style={{ fontSize: '0.8125rem' }}>
              The National ID is the standard path. If you cannot hold one,
              choose the second option — your application is reviewed by a
              person, not refused by a rule.
            </span>
          </div>
        </div>
        <UploadSlot
          kind="id_front"
          label="National ID — front"
          hint="A clear photo of the front of your ID. JPEG, PNG or WebP, up to 4 MB."
          doc={idFront}
          onUploaded={setIdFront}
          onRemoved={() => setIdFront(null)}
        />
        <UploadSlot
          kind="id_back"
          label="National ID — back"
          doc={idBack}
          onUploaded={setIdBack}
          onRemoved={() => setIdBack(null)}
        />
        <UploadSlot
          kind="selfie"
          label="Self-photograph"
          hint="A recent photo of your face, taken now. This is matched against your ID by the reviewer."
          doc={selfie}
          onUploaded={setSelfie}
          onRemoved={() => setSelfie(null)}
        />
        <div className="field">
          <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontWeight: 'normal' }}>
            <input type="checkbox" name="ageConfirmed" required style={{ marginTop: '0.25rem' }} />
            <span>
              I confirm I am at least 18 years old and eligible to hold the
              identity document I am submitting.
            </span>
          </label>
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-head">
          <span className="card-title">Property &amp; your authority</span>
          <span className="muted">what you are listing, and why you may</span>
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="relationship">Your relationship with the property</label>
            <select id="relationship" name="relationship" defaultValue="owner">
              <option value="owner">I own it</option>
              <option value="broker_agent">I am a broker or agent for it</option>
              <option value="other_associated">I am associated with it in another way</option>
            </select>
            <span className="faint" style={{ fontSize: '0.8125rem' }}>
              Say it plainly — a broker or associated person is never recorded
              as the owner, and a listing marketed for someone else still
              needs the owner&rsquo;s verified mandate before it goes live.
            </span>
          </div>
          <div className="field">
            <label htmlFor="propertyId">Link a property you have registered (optional)</label>
            <select id="propertyId" name="propertyId" defaultValue="">
              <option value="">— none yet —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} · {p.neighbourhood}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="titleParticulars">Property / title particulars</label>
          <textarea
            id="titleParticulars"
            name="titleParticulars"
            rows={3}
            placeholder="Describe the property and its title — plot number, block, what the certificate says, or how the property is known."
          />
        </div>
        <UploadSlot
          kind="ownership_evidence"
          label="Certificate of title / ownership evidence"
          hint="A scan or photo of the title certificate, sale agreement, or equivalent. Required when you own the property; optional otherwise."
          doc={ownershipEvidence}
          onUploaded={setOwnershipEvidence}
          onRemoved={() => setOwnershipEvidence(null)}
        />
        <UploadSlot
          kind="property_photo"
          label="Property photographs (up to 4, optional)"
          hint="Photos of the property itself, for context during the review."
          doc={propertyPhotos[0] ?? null}
          onUploaded={(d) => setPropertyPhotos((prev) => [...prev, d].slice(0, 4))}
          onRemoved={() => setPropertyPhotos((prev) => prev.slice(1))}
        />
        {propertyPhotos.length > 1 ? (
          <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            {propertyPhotos.slice(1).map((p) => (
              <div
                key={p.mediaAssetId}
                style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}
              >
                <MediaImage src={p.thumbUrl} alt="Property photograph" eager />
              </div>
            ))}
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="authorityExplanation">Your authority or association</label>
          <textarea
            id="authorityExplanation"
            name="authorityExplanation"
            rows={3}
            placeholder="If you are a broker, agent, or otherwise associated with the property: who owns it, and what authority do you have to advertise it?"
          />
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-head">
          <span className="card-title">Payout details</span>
          <span className="muted">optional for now</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Mobile money is the payout method the platform&rsquo;s payment
          provider supports today. Review confirms the details only — payouts
          stay switched off until the provider arrangements are complete. We
          never need your PIN, password, or any one-time codes.
        </p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="payoutRecipientName">Recipient full name</label>
            <input
              id="payoutRecipientName"
              name="payoutRecipientName"
              placeholder="The name registered on the mobile-money account"
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="payoutDestination">Mobile-money number</label>
            <input
              id="payoutDestination"
              name="payoutDestination"
              inputMode="tel"
              placeholder="+256 7…"
              autoComplete="tel"
            />
          </div>
        </div>
      </div>

      <div className="card stack-sm">
        <div className="card-head">
          <span className="card-title">Declarations</span>
        </div>
        <div className="stack-sm" style={{ gap: '0.7rem' }}>
          {[
            ['identityAccurate', 'The identity information I have submitted is accurate.'],
            ['relationshipHonest', 'I have disclosed my relationship with the property honestly.'],
            [
              'authorityDisclosed',
              'I have authority to advertise this property, or I have accurately disclosed that my authority is subject to review.',
            ],
            [
              'accuracyOngoing',
              'I will keep the listing details, pricing, photographs and availability accurate.',
            ],
            ['agreeTerms', 'I agree to the applicable platform terms and the privacy notice.'],
          ].map(([name, text]) => (
            <label
              key={name}
              style={{
                display: 'flex',
                gap: '0.6rem',
                alignItems: 'flex-start',
                fontWeight: 'normal',
              }}
            >
              <input type="checkbox" name={`dec_${name}`} required style={{ marginTop: '0.25rem' }} />
              <span>{text}</span>
            </label>
          ))}
        </div>
      </div>

      {error ? <ApiAlert message={error.message} /> : null}

      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={pending || uploading !== null}>
          {pending
            ? mode === 'create'
              ? 'Submitting…'
              : 'Resubmitting…'
            : mode === 'create'
              ? 'Submit application'
              : 'Resubmit application'}
        </button>
      </div>
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        Submitting records the declarations and your documents for review by
        our team. Nothing is auto-approved, and approval of one section never
        approves another.
      </p>
    </form>
  );
}
