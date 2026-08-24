/**
 * Drives the entire product journey through HTTP, as a real client would.
 *
 * ── Why this exists ──
 * F-011 recorded that the full-journey spec reached past the API to obtain
 * states no client could obtain. A test that does that proves the services
 * work; it proves nothing about whether the PRODUCT works, and it is exactly
 * how F-001, F-002, F-007, F-014, F-015 and F-017 all stayed invisible while
 * every suite was green.
 *
 * So this script has ONE rule: it holds no database connection. Every step
 * below is an HTTP call with a bearer token, in the order a real person
 * would make it. If a step cannot be done here, it cannot be done by a user,
 * and the journey is broken however many unit tests pass.
 *
 * The single exception is staff provisioning, which needs an existing admin
 * — an inherent bootstrap, not a bypass. It reuses the seeded admin.
 *
 * Usage:
 *   API=http://localhost:3000 DEMO_PASSWORD=... node scripts/journey-http.mjs
 */

const API = process.env.API ?? 'http://localhost:3000';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

if (!DEMO_PASSWORD) {
  console.error('DEMO_PASSWORD must be set (the seeded accounts use it).');
  process.exit(1);
}

const stamp = Date.now();
let failures = 0;
let steps = 0;

function ok(label, detail = '') {
  steps++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail) {
  steps++;
  failures++;
  console.log(`  ✗ ${label} — ${detail}`);
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

/** Asserts a call succeeded, and returns its body. */
async function must(label, method, path, opts = {}) {
  const res = await call(method, path, opts);
  const expected = opts.expect ?? [200, 201, 204];
  if (!expected.includes(res.status)) {
    fail(
      label,
      `${res.status} ${JSON.stringify(res.body?.error ?? res.body).slice(0, 220)}`,
    );
    throw new Error(`${label} failed`);
  }
  ok(label, opts.note?.(res.body) ?? '');
  return res.body;
}

/** Asserts a call was REFUSED with a specific status. */
async function mustRefuse(label, status, method, path, opts = {}) {
  const res = await call(method, path, opts);
  if (res.status !== status) {
    fail(label, `expected ${status}, got ${res.status}`);
    return null;
  }
  ok(label, `${status} ${res.body?.error?.code ?? ''}`);
  return res.body;
}

async function login(primaryPhone, password) {
  const res = await call('POST', '/v1/auth/login', {
    body: { primaryPhone, password },
  });
  if (res.status !== 200) {
    throw new Error(
      `login failed for ${primaryPhone}: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.accessToken;
}

async function main() {
  console.log(`\nHouse For Rent — full journey over HTTP against ${API}\n`);

  /* ── 0. Public surface, no account ──────────────────────────────── */
  console.log('PUBLIC DISCOVERY (no account)');
  const feed = await must('GET /v1/listings', 'GET', '/v1/listings?limit=5', {
    note: (b) => `${b.totalCount} live`,
  });
  if (feed.results.length === 0) {
    fail('public feed has listings', 'the corridor is empty — seed first');
    throw new Error('nothing to journey through');
  }
  const publicListing = feed.results[0];
  await must(
    'GET /v1/listings/:id',
    'GET',
    `/v1/listings/${publicListing.listingId}`,
    { note: (b) => `upfront ${b.expectedUpfront}` },
  );
  await must('GET /v1/neighbourhoods', 'GET', '/v1/neighbourhoods', {
    note: (b) => `${b.neighbourhoods.length} in service`,
  });
  await must('GET /v1/commission-rate', 'GET', '/v1/commission-rate', {
    note: (b) => `${b.rateBpOfMonth}bp`,
  });
  if (publicListing.photos[0]) {
    const img = await fetch(
      `${API}${publicListing.photos[0].url}`,
    );
    img.ok
      ? ok('GET /v1/media/:id', `${img.headers.get('content-type')}`)
      : fail('GET /v1/media/:id', `${img.status}`);
  }

  /* ── 1. Staff ───────────────────────────────────────────────────── */
  console.log('\nSTAFF');
  const adminToken = await login('+256700100030', DEMO_PASSWORD);
  ok('admin signs in');
  const fooToken = await login('+256700100020', DEMO_PASSWORD);
  const foo = await must('GET /v1/auth/me (officer)', 'GET', '/v1/auth/me', {
    token: fooToken,
    note: (b) => b.role,
  });

  /* ── 2. Landlord: register → property → listing → agreement ─────── */
  console.log('\nLANDLORD (registers and lists a property, all over HTTP)');
  const landlordPhone = `+2567009${String(stamp).slice(-6)}`;
  await must('POST /v1/auth/register (lister)', 'POST', '/v1/auth/register', {
    body: {
      displayName: 'Journey Landlord',
      primaryPhone: landlordPhone,
      password: 'journey-pass-2026',
      role: 'lister',
    },
    expect: [200, 201],
  });
  const listerToken = await login(landlordPhone, 'journey-pass-2026');
  ok('landlord signs in');

  // F-015: the neighbourhood picker a landlord needs. Before the taxonomy
  // routes existed, this id could only come from the database.
  const hoods = await must(
    'GET /v1/neighbourhoods (picker)',
    'GET',
    '/v1/neighbourhoods',
    { token: listerToken },
  );
  const hood = hoods.neighbourhoods.find((n) => n.inServiceArea);

  const property = await must('POST /v1/properties', 'POST', '/v1/properties', {
    token: listerToken,
    body: {
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      furnished: 'semi_furnished',
      neighbourhoodId: hood.id,
      landmarkText: `Journey test property ${stamp}`,
    },
    expect: [200, 201],
    note: (b) => b.id.slice(0, 8),
  });

  const listing = await must('POST /v1/listings', 'POST', '/v1/listings', {
    token: listerToken,
    body: {
      propertyId: property.id,
      monthlyRent: '1200000',
      requiredMonthsUpfront: 2,
      depositAmount: '1200000',
      descriptionText: 'Created by the HTTP journey script.',
    },
    expect: [200, 201],
    note: (b) => b.id.slice(0, 8),
  });

  // A photograph, uploaded the way the landlord portal uploads one.
  const onePixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await must(
    'POST /v1/listings/:id/photos',
    'POST',
    `/v1/listings/${listing.id}/photos`,
    {
      token: listerToken,
      body: {
        mimeType: 'image/png',
        dataBase64: onePixel.toString('base64'),
        caption: 'Journey upload',
      },
      expect: [200, 201],
      note: (b) => `source=${b.source}`,
    },
  );

  await must(
    'GET /v1/listings/mine',
    'GET',
    '/v1/listings/mine',
    {
      token: listerToken,
      note: (b) => `blockedBy=[${b[0]?.blockedBy?.join(',') ?? ''}]`,
    },
  );

  // F-014 / FR-9.1: the terms, then acceptance.
  const terms = await must(
    'GET /v1/listings/:id/agreement',
    'GET',
    `/v1/listings/${listing.id}/agreement`,
    { token: listerToken, note: (b) => `commission ${b.commissionAmount}` },
  );
  await must(
    'POST /v1/listings/:id/agreement/accept',
    'POST',
    `/v1/listings/${listing.id}/agreement/accept`,
    {
      token: listerToken,
      body: {
        expectedRateVersionId: terms.rateVersionId ?? undefined,
        clauseVersion: terms.clause?.version ?? undefined,
      },
      expect: [200, 201],
    },
  );

  // Publishing must still be refused: no field verification yet.
  await mustRefuse(
    'publish refused before verification',
    422,
    'POST',
    `/v1/listings/${listing.id}/publish`,
    { token: listerToken },
  );

  /* ── 3. Field verification ──────────────────────────────────────── */
  console.log('\nFIELD OPERATIONS');
  await must(
    'POST /v1/listings/:id/verify (officer)',
    'POST',
    `/v1/listings/${listing.id}/verify`,
    { token: fooToken, expect: [200, 201] },
  );
  await must(
    'POST /v1/listings/:id/confirm-availability',
    'POST',
    `/v1/listings/${listing.id}/confirm-availability`,
    { token: fooToken, body: { status: 'available' }, expect: [200, 201] },
  );
  await must(
    'POST /v1/listings/:id/publish',
    'POST',
    `/v1/listings/${listing.id}/publish`,
    { token: listerToken, expect: [200, 201], note: (b) => b.publicationState },
  );

  const nowPublic = await must(
    'the new listing is in the public feed',
    'GET',
    `/v1/listings/${listing.id}`,
    { note: (b) => `${b.photos.length} photo(s)` },
  );

  /* ── 4. Tenant: register → verify identity → view ───────────────── */
  console.log('\nTENANT (registers and verifies identity over HTTP — F-017)');
  const tenantPhone = `+2567008${String(stamp).slice(-6)}`;
  await must('POST /v1/auth/register (tenant)', 'POST', '/v1/auth/register', {
    body: {
      displayName: 'Journey Tenant',
      primaryPhone: tenantPhone,
      password: 'journey-pass-2026',
      role: 'tenant',
    },
    expect: [200, 201],
  });
  const tenantToken = await login(tenantPhone, 'journey-pass-2026');
  ok('tenant signs in');

  const before = await must('GET /v1/identity/me', 'GET', '/v1/identity/me', {
    token: tenantToken,
    note: (b) => `verified=${b.identityVerified}`,
  });
  if (before.identityVerified) {
    fail('a new tenant starts unverified', 'already verified');
  }

  // The viewing must be refused while unverified — the rule that made this
  // whole controller necessary.
  await mustRefuse(
    'viewing refused while unverified',
    422,
    'POST',
    '/v1/viewings',
    {
      token: tenantToken,
      body: {
        listingId: listing.id,
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
      },
    },
  );

  await must('POST /v1/identity/consent', 'POST', '/v1/identity/consent', {
    token: tenantToken,
    body: { policyVersion: 'v1' },
    expect: [200, 201],
  });
  await must('POST /v1/identity/verify', 'POST', '/v1/identity/verify', {
    token: tenantToken,
    body: {
      nin: 'CM12345678ABCD',
      phone: tenantPhone,
      selfieRef: 'journey-selfie',
      idPhotoRef: 'journey-id',
    },
    expect: [200, 201],
    note: (b) => `verified=${b.identityVerified}`,
  });

  /* ── 5. Viewing → dispatch → report → introduction ──────────────── */
  console.log('\nVIEWING');
  const viewing = await must('POST /v1/viewings', 'POST', '/v1/viewings', {
    token: tenantToken,
    body: {
      listingId: listing.id,
      scheduledFor: new Date(Date.now() + 86400000).toISOString(),
    },
    expect: [200, 201],
    note: (b) => b.status,
  });

  await must('GET /v1/viewings/mine', 'GET', '/v1/viewings/mine', {
    token: tenantToken,
    note: (b) => `${b.length} viewing(s)`,
  });

  await must(
    'GET /v1/viewings/dispatch-queue',
    'GET',
    '/v1/viewings/dispatch-queue',
    { token: adminToken, note: (b) => `${b.total} waiting` },
  );
  await must(
    'POST /v1/viewings/:id/assign',
    'POST',
    `/v1/viewings/${viewing.id}/assign`,
    {
      token: adminToken,
      body: { fooPartyId: foo.partyId },
      expect: [200, 201],
      note: (b) => b.status,
    },
  );
  await must(
    'POST /v1/viewings/:id/field-report',
    'POST',
    `/v1/viewings/${viewing.id}/field-report`,
    {
      token: fooToken,
      body: {
        conditionRating: 'good',
        matchesListing: true,
        isAvailable: true,
        timingNote: 'Filed by the HTTP journey script.',
      },
      expect: [200, 201],
    },
  );
  const conducted = await must(
    'POST /v1/viewings/:id/conduct',
    'POST',
    `/v1/viewings/${viewing.id}/conduct`,
    { token: fooToken, body: {}, expect: [200, 201] },
  );

  const introductionId =
    conducted.introduction?.id ?? conducted.introductionRecord?.id;
  if (!introductionId) {
    fail('conduct returns the introduction record', JSON.stringify(conducted).slice(0, 200));
    throw new Error('no introduction record');
  }
  ok('introduction record minted', introductionId.slice(0, 8));

  /* ── 6. Deal → agreement → escrow → move-in → settle ────────────── */
  console.log('\nDEAL AND MONEY');
  const deal = await must('POST /v1/deals', 'POST', '/v1/deals', {
    token: fooToken,
    body: { introductionRecordId: introductionId },
    expect: [200, 201],
    note: (b) => b.status,
  });

  /** Reads the deal and returns the actions the SERVER says are available. */
  const actionsFor = async (token) => {
    const detail = await call('GET', `/v1/deals/${deal.id}`, { token });
    if (detail.status !== 200) return [];
    return detail.body.availableActions.map((a) => a.action);
  };

  const tenantActions = await actionsFor(tenantToken);
  ok('tenant sees the deal', `actions: [${tenantActions.join(', ')}]`);

  for (const step of [
    ['match-tenant', adminToken],
    ['sign-agreement', adminToken],
    ['__amount_probe__', adminToken],
    ['fund-escrow', adminToken],
    ['confirm-move-in', adminToken],
    ['earn-commission', adminToken],
    ['settle', adminToken],
    ['close', adminToken],
  ]) {
    const [action, token] = step;

    /**
     * ── F-012, probed at the only moment it means anything ──
     * Funding is attempted with a WRONG amount while the deal is otherwise
     * ready to fund. Earlier in the sequence the request is refused as an
     * illegal transition, which says nothing about whether the amount was
     * examined — so a 409 there would have looked like a pass for the wrong
     * reason. Here a rejection can only be about the figure.
     */
    if (action === '__amount_probe__') {
      const wrong = await call('POST', `/v1/deals/${deal.id}/fund-escrow`, {
        token,
        body: { amount: '1' },
      });
      if (wrong.status === 422 || wrong.status === 400) {
        ok(
          'fund-escrow refuses a caller-supplied amount',
          `${wrong.status} ${wrong.body?.error?.code ?? ''}`,
        );
      } else {
        fail(
          'fund-escrow refuses a caller-supplied amount',
          `got ${wrong.status} — a caller may be able to choose what they pay`,
        );
      }
      continue;
    }

    const available = await actionsFor(token);
    if (!available.includes(action)) {
      fail(
        `${action} is offered by the server`,
        `availableActions = [${available.join(', ')}]`,
      );
      continue;
    }
    const res = await call('POST', `/v1/deals/${deal.id}/${action}`, {
      token,
      body: {},
    });
    if ([200, 201].includes(res.status)) {
      ok(`POST /v1/deals/:id/${action}`, res.body?.status ?? '');
    } else {
      fail(
        `POST /v1/deals/:id/${action}`,
        `${res.status} ${JSON.stringify(res.body?.error ?? res.body).slice(0, 200)}`,
      );
    }
  }

  const final = await call('GET', `/v1/deals/${deal.id}`, { token: adminToken });
  const fin = final.body?.financial;
  if (fin) {
    ok(
      'ledger position',
      `escrow=${fin.heldInEscrow} released=${fin.releasedToLandlord} commission=${fin.commissionRecognised} discharged=${fin.escrowDischarged}`,
    );
    if (fin.heldInEscrow !== '0') {
      fail('escrow fully discharged at close', `still holding ${fin.heldInEscrow}`);
    }
  }

  /* ── 7. Authorisation ───────────────────────────────────────────── */
  console.log('\nAUTHORISATION (the browser is not the boundary)');
  await mustRefuse('unauthenticated deal read', 401, 'GET', `/v1/deals/${deal.id}`);
  /**
   * A genuinely unrelated account. The earlier draft used `listerToken`,
   * which is this deal's OWN LANDLORD — a party, legitimately entitled to
   * read it. An isolation test that a party passes is not testing isolation.
   */
  const strangerPhone = `+2567007${String(stamp).slice(-6)}`;
  await must('register an unrelated tenant', 'POST', '/v1/auth/register', {
    body: {
      displayName: 'Unrelated Party',
      primaryPhone: strangerPhone,
      password: 'journey-pass-2026',
      role: 'tenant',
    },
    expect: [200, 201],
  });
  const strangerToken = await login(strangerPhone, 'journey-pass-2026');

  await mustRefuse(
    'a stranger cannot read this deal',
    404,
    'GET',
    `/v1/deals/${deal.id}`,
    { token: strangerToken },
  );
  await mustRefuse(
    'a stranger cannot act on this deal',
    404,
    'POST',
    `/v1/deals/${deal.id}/confirm-move-in`,
    { token: strangerToken, body: {} },
  );
  await mustRefuse(
    'a tenant cannot verify a listing',
    403,
    'POST',
    `/v1/listings/${listing.id}/verify`,
    { token: tenantToken },
  );
  await mustRefuse(
    'a tenant cannot dispatch a viewing',
    403,
    'POST',
    `/v1/viewings/${viewing.id}/assign`,
    { token: tenantToken, body: { fooPartyId: foo.partyId } },
  );
  await mustRefuse(
    'a lister cannot create a neighbourhood',
    403,
    'POST',
    '/v1/neighbourhoods',
    { token: listerToken, body: { name: `Forged-${stamp}`, inServiceArea: true } },
  );

  // ── F-016: role is not ownership ──
  // The seeded landlord's live listing, withdrawn by a DIFFERENT lister who
  // holds the same role. Before the ownership assertions, this succeeded.
  await mustRefuse(
    'a lister cannot withdraw another landlord’s listing',
    403,
    'POST',
    `/v1/listings/${publicListing.listingId}/withdraw`,
    { token: listerToken },
  );
  await mustRefuse(
    'a lister cannot list against another owner’s property',
    403,
    'POST',
    '/v1/listings',
    {
      token: listerToken,
      body: {
        propertyId: publicListing.propertyId,
        monthlyRent: '1',
        requiredMonthsUpfront: 1,
        depositAmount: '0',
      },
    },
  );
  await mustRefuse(
    'a lister cannot upload photos to a stranger’s listing',
    403,
    'POST',
    `/v1/listings/${publicListing.listingId}/photos`,
    {
      token: listerToken,
      body: {
        mimeType: 'image/png',
        dataBase64: onePixel.toString('base64'),
      },
    },
  );
  await mustRefuse(
    'a forged role cannot reach an admin route',
    403,
    'GET',
    '/v1/admin/reconciliation',
    { token: tenantToken },
  );

  /* ── done ───────────────────────────────────────────────────────── */
  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${steps - failures}/${steps} steps, ${failures} failure(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\nAborted: ${err.message}\n`);
  process.exit(1);
});
