import Link from 'next/link';
import type { ActivityRow } from '@/server/activity';
import { Status, when } from '@/app/ui';

/**
 * The "Recent activity" list shared by the tenant overview and the landlord
 * portfolio. Rows arrive fully written from the server (sentence, label,
 * tone, destination); this component only lays them out. No dates are
 * rounded into "2h ago" bubbles - the honest local time is already the
 * friendliest form there is.
 */
export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="muted" style={{ fontSize: '0.9375rem' }}>
        Nothing yet. Once you request a viewing or open a letting, each step
        is logged here.
      </p>
    );
  }

  return (
    <ol className="activity-feed">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={row.href} className="activity-row">
            <span className="activity-when num" aria-hidden="true">
              {when(row.at)}
            </span>
            <span className="stack-sm" style={{ flex: 1, minWidth: '16rem' }}>
              <span className="card-title">{row.title}</span>
              <span className="muted" style={{ fontSize: '0.9375rem' }}>
                {row.line}
              </span>
            </span>
            <Status tone={row.tone}>{row.statusLabel}</Status>
          </Link>
        </li>
      ))}
    </ol>
  );
}
