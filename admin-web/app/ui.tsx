/**
 * Presentation helpers shared across the console. All server-rendered — no
 * `use client` here, so none of this reaches the browser as JavaScript.
 */

const STATUS_TONE: Record<string, string> = {
  requested: 'pill',
  scheduled: 'pill pill-warn',
  conducted: 'pill pill-ok',
  no_show: 'pill pill-danger',
  cancelled: 'pill',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={STATUS_TONE[status] ?? 'pill'}>
      {status.replace('_', ' ')}
    </span>
  );
}

/**
 * Dates are rendered in Kampala time explicitly rather than the server's
 * locale. A field officer reading "14:00" needs it to mean 14:00 where they
 * are standing.
 */
export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ShortId({ value }: { value: string }) {
  return <span className="mono">{value.slice(0, 8)}</span>;
}

/**
 * Renders a backend rejection with its code.
 *
 * The code is shown on purpose: `FIELD_REPORT_REQUIRED` and
 * `NOT_ASSIGNED_FOO` mean very different things to whoever an officer calls
 * for help, and paraphrasing them into "something went wrong" destroys the
 * only diagnostic they have from a stairwell with one bar of signal.
 */
export function ApiAlert({
  message,
  code,
}: {
  message: string;
  code?: string | null;
}) {
  return (
    <p className="alert alert-error" role="alert">
      {message}
      {code && (
        <>
          {' '}
          <code>{code}</code>
        </>
      )}
    </p>
  );
}
