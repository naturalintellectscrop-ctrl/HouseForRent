/**
 * FR-5.5 - professional media captured during the field visit.
 *
 * ── SANDBOX ADAPTATION: photography upload is not implemented in this port ──
 * The reference posted the file's METADATA to `/v1/viewings/:id/media` so the
 * compression ladder and its ceilings were genuinely exercised; the real
 * object store stayed procurement-gated behind `MediaStorageProvider`. This
 * port has no media ingest route and no store, so there is no capture
 * control to offer - pretending otherwise with a disabled button or a fake
 * progress bar would sell a capability the system does not have.
 *
 * In this port photography rides with the field verification fixtures: the
 * demo listing imagery is labelled `development_fixture` and was never
 * presented as an officer's photograph. The structured field report remains
 * the evidence of the visit. Re-introducing capture later is a transport
 * change at the API edge, not a redesign of this page.
 *
 * This stays a server component on purpose: there is nothing to interact
 * with, so nothing ships to the browser.
 */
export function MediaCapture({ viewingId: _viewingId }: { viewingId: string }) {
  return (
    <div className="card">
      <p className="alert alert-note">
        Photography is not part of this port. The three-rung compression
        ladder and the media store it feeds are procurement-gated (SSOT §8),
        so no capture control is offered here - and none is faked. The
        structured field report above is the evidence this visit leaves;
        listing imagery comes from field verification fixtures.
      </p>
    </div>
  );
}
