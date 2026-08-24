import { redirect } from 'next/navigation';
import { api, ApiError, type AuditEvent } from '@/lib/api';
import { AdminOnly, Empty, when } from '@/app/ui';

/**
 * NFR-2 — the audit trail for one subject.
 *
 * Lookup by subject reference (a deal id, a listing id, a config key)
 * rather than a browsable firehose. The log records money, verification,
 * consent and configuration events across every party on the platform;
 * paging through all of it is not an operational need, and making it easy
 * turns an accountability record into a surveillance tool.
 *
 * Payloads are rendered as-is because they contain no personal data by
 * construction — `AuditService` rejects any payload carrying a NIN, phone
 * number, password or token before it can be written.
 */
export default async function AuditPage(props: {
  searchParams: Promise<{ subjectRef?: string }>;
}) {
  const { subjectRef } = await props.searchParams;

  let events: AuditEvent[] | null = null;
  if (subjectRef) {
    try {
      events = await api<AuditEvent[]>(
        `/v1/admin/audit/${encodeURIComponent(subjectRef)}`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) redirect('/login');
        if (err.status === 403) return <AdminOnly what="The audit log" />;
      }
      throw err;
    }
  }

  return (
    <>
      <h1>Audit trail</h1>
      <p className="lede">
        Money, verification, consent and configuration events for one
        subject. Rows are append-only and immutable — the database rejects
        any attempt to edit or remove one.
      </p>

      <form method="get" className="card">
        <div className="field">
          <label htmlFor="subjectRef">Subject reference</label>
          <input
            id="subjectRef"
            name="subjectRef"
            type="text"
            defaultValue={subjectRef ?? ''}
            placeholder="A deal ID, listing ID, or config key"
            spellCheck={false}
            required
          />
          <p className="hint">
            Lookup is by subject, not browsable in bulk — an accountability
            record should not double as a way to page through everyone.
          </p>
        </div>
        <button type="submit" className="btn-secondary">
          Show trail
        </button>
      </form>

      {events === null ? null : events.length === 0 ? (
        <Empty title="No events recorded for that subject.">
          Check the reference is complete and correct: a subject that does not
          exist and one that exists but has never been touched are
          indistinguishable from here, and the more common of the two is a
          mistyped ID.
        </Empty>
      ) : (
        events.map((event) => (
          <div key={event.id} className="card">
            <div className="card-head">
              <span className="card-title">
                {event.eventType.replace(/_/g, ' ')}
              </span>
              <span className="muted">{when(event.occurredAt)}</span>
            </div>
            <dl className="dl">
              <dt>Actor</dt>
              <dd className="mono">{event.actorPartyId}</dd>
              {event.payload && (
                <>
                  <dt>Detail</dt>
                  <dd className="mono">
                    {Object.entries(event.payload).map(([key, value]) => (
                      <div key={key}>
                        {key}: {JSON.stringify(value)}
                      </div>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </div>
        ))
      )}
    </>
  );
}
