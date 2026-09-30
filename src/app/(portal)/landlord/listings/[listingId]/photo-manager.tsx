/**
 * The photograph control on a landlord's listing.
 *
 * ── An honest disabled state, not a fake upload ──
 * In the reference product, a landlord could attach photographs and they
 * were labelled by provenance - the officer's own shots were the only ones
 * ever shown to tenants as verified photography. This port does not
 * implement lister-uploaded files (there is no upload route), so instead of
 * a control that pretends, this renders the truth: photography enters this
 * platform through field officers, on their verification visits.
 *
 * A control that looked like an upload and then quietly did nothing - or
 * worse, accepted files it never showed - would be the kind of lie this
 * product's whole proposition rests on not telling.
 */
export function PhotoManager() {
  return (
    <div className="card stack-sm">
      <h3 className="h3" style={{ margin: 0 }}>
        Photography
      </h3>
      <p className="muted">
        Photography is added by field officers during verification visits. When
        our officer comes to confirm the property, they take the photographs
        that appear on the listing.
      </p>
      <button type="button" className="btn btn-secondary" disabled>
        Add a photograph
      </button>
      <p className="hint">
        Not available here - the photographs on a listing are taken on the
        verification visit, so tenants know every picture was taken in the
        actual room.
      </p>
    </div>
  );
}
