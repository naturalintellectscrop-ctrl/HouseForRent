/**
 * Seeds ONE deal at `commission_earned` for the F-007 browser verification,
 * entirely through the real HTTP API.
 *
 * Nothing here writes to the database directly. A fixture built with Prisma
 * would prove the schema accepts these rows, not that the product produces
 * them — and the whole point of F-001/F-002 was that the two had diverged.
 *
 * `commission_earned` is the state chosen deliberately: it is the one where
 * `settle` becomes available, which is the money action the browser pass
 * exists to check the confirmation gating on.
 *
 * Usage (API must already be running):
 *   API_BASE=http://localhost:3000 node seed-e2e-deal.mjs
 *
 * Prints shell exports for the Playwright run. The admin password comes from
 * E2E_PASSWORD, defaulting to the same value the console e2e suite uses.
 */
const API = process.env.API_BASE ?? 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD ?? 'correct-horse-battery';

const stamp = Date.now().toString().slice(-8);
let n = 0;
const phone = (tag) => `+2569${stamp}${++n}${tag}`.slice(0, 19);

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `${method} ${path} -> ${res.status} ${JSON.stringify(parsed)}`,
    );
  }
  return parsed;
}

async function actor(role, { verify = false } = {}) {
  const primaryPhone = phone(role.slice(0, 2));
  const displayName = `E2E ${role}`;
  const path =
    role === 'tenant' || role === 'lister' ? '/v1/auth/register' : null;

  if (path) {
    await call(path, {
      method: 'POST',
      body: { displayName, primaryPhone, password: PASSWORD, role },
    });
  } else {
    // Staff are provisioned by an existing admin. The first one has to come
    // from the console-admin seed script; reuse it here.
    const bootstrapPhone = process.env.E2E_ADMIN_PHONE;
    const bootstrapPassword = process.env.E2E_ADMIN_PASSWORD;
    if (!bootstrapPhone || !bootstrapPassword) {
      throw new Error(
        'E2E_ADMIN_PHONE and E2E_ADMIN_PASSWORD must be set — staff accounts ' +
          'are admin-provisioned, so an existing admin is required to create ' +
          'the FOO and admin used here (F-005 is why there is no UI for it).',
      );
    }
    const boot = await call('/v1/auth/login', {
      method: 'POST',
      body: { primaryPhone: bootstrapPhone, password: bootstrapPassword },
    });
    await call('/v1/auth/staff', {
      method: 'POST',
      token: boot.accessToken,
      body: { displayName, primaryPhone, password: PASSWORD, role },
    });
  }

  const session = await call('/v1/auth/login', {
    method: 'POST',
    body: { primaryPhone, password: PASSWORD },
  });
  const me = await call('/v1/auth/me', { token: session.accessToken });

  if (verify) {
    console.error(
      `  ! ${role} ${primaryPhone} needs identity verification — the API has ` +
        'no self-serve route for it, so this seed relies on the tenant ' +
        'already being verifiable. See the note at the end.',
    );
  }

  return {
    primaryPhone,
    token: session.accessToken,
    partyId: me.partyId ?? me.party?.id,
  };
}

const log = (...a) => console.error(...a);

log('Seeding an F-007 deal through the real API…');

const tenant = await actor('tenant');
const lister = await actor('lister');
const foo = await actor('foo');
const admin = await actor('admin');

await call('/v1/admin/commission-rates', {
  method: 'POST',
  token: admin.token,
  body: { rateBpOfMonth: 10000 },
});

log('  parties created');

const property = await call('/v1/properties', {
  method: 'POST',
  token: lister.token,
  body: {
    propertyType: 'apartment',
    bedrooms: 2,
    bathrooms: 1,
    furnished: 'furnished',
    neighbourhoodId: process.env.E2E_NEIGHBOURHOOD_ID,
    landmarkText: 'by the mango tree',
  },
});

const listing = await call('/v1/listings', {
  method: 'POST',
  token: lister.token,
  body: {
    propertyId: property.id,
    monthlyRent: '1000000',
    requiredMonthsUpfront: 3,
    depositAmount: '1000000',
  },
});

await call(`/v1/listings/${listing.id}/agreement/accept`, {
  method: 'POST',
  token: lister.token,
  body: {},
});
await call(`/v1/listings/${listing.id}/verify`, {
  method: 'POST',
  token: foo.token,
  body: {},
});
await call(`/v1/listings/${listing.id}/confirm-availability`, {
  method: 'POST',
  token: foo.token,
  body: { status: 'available' },
});
await call(`/v1/listings/${listing.id}/publish`, {
  method: 'POST',
  token: lister.token,
  body: {},
});

log('  listing live');

const viewing = await call('/v1/viewings', {
  method: 'POST',
  token: tenant.token,
  body: {
    listingId: listing.id,
    scheduledFor: new Date(Date.now() + 86_400_000).toISOString(),
  },
});
await call(`/v1/viewings/${viewing.id}/assign`, {
  method: 'POST',
  token: admin.token,
  body: { fooPartyId: foo.partyId },
});
await call(`/v1/viewings/${viewing.id}/field-report`, {
  method: 'POST',
  token: foo.token,
  body: { conditionRating: 'good', matchesListing: true, isAvailable: true },
});
const conducted = await call(`/v1/viewings/${viewing.id}/conduct`, {
  method: 'POST',
  token: foo.token,
  body: {},
});

log('  viewing conducted, introduction recorded');

const deal = await call('/v1/deals', {
  method: 'POST',
  token: foo.token,
  body: { introductionRecordId: conducted.introduction.id },
});

const detail = await call(`/v1/deals/${deal.id}`, { token: admin.token });
const agreementId = process.env.E2E_AGREEMENT_ID;

await call(`/v1/deals/${deal.id}/match-tenant`, {
  method: 'POST',
  token: foo.token,
  body: {},
});
await call(`/v1/deals/${deal.id}/sign-agreement`, {
  method: 'POST',
  token: lister.token,
  body: { agreementId },
});
// No amount: the server derives it (F-012).
await call(`/v1/deals/${deal.id}/fund-escrow`, {
  method: 'POST',
  token: tenant.token,
  body: {},
});
await call(`/v1/deals/${deal.id}/confirm-move-in`, {
  method: 'POST',
  token: tenant.token,
  body: {},
});
await call(`/v1/deals/${deal.id}/earn-commission`, {
  method: 'POST',
  token: admin.token,
  body: {},
});

log('  deal carried to commission_earned');

const final = await call(`/v1/deals/${deal.id}`, { token: admin.token });
log(`  held in escrow: ${final.financial.heldInEscrow}`);
log(`  actions available: ${final.availableActions.map((a) => a.action).join(', ')}`);

console.log(`export E2E_ADMIN_OPS_PHONE="${admin.primaryPhone}"`);
console.log(`export E2E_PASSWORD="${PASSWORD}"`);
console.log(`export E2E_DEAL_ID="${deal.id}"`);
console.log(`export E2E_DEAL_HELD="${final.financial.heldInEscrow}"`);
