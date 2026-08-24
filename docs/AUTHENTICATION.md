# Authentication & Authorisation

How identity, sessions and permissions work in House For Rent — and what
every future module has to do to integrate with them.

This is the contract. If a module invents its own answer to any question
below, the two will disagree, and the one that is wrong will be the module.

---

## 1. The shape of an identity

Identity is split across three tables, deliberately.

```
party                    the human or organisation. Product-agnostic.
 └── user_account        their login, and their ROLE
      ├── user_credential  the password hash, alone in its own table
      ├── session          one row per signed-in device
      └── password_reset_token
```

**`party` is not a user.** It is an actor that may or may not have a login:
a landlord created by ops during property verification is a `party` with no
`user_account` at all, and a deal can reference them before they ever sign
in. That is why `deal.landlord_party_id` points at `party` and not at an
account.

**A party can hold more than one role over time.** `auth_role` lives on
`user_account`, not on `party`, because one human genuinely can be both a
tenant and a landlord (SSOT Decision 8). Nothing should treat "is a
landlord" as a property of a person.

**Identity is keyed to a PHONE NUMBER.** `party.primary_phone` is unique;
there is no email column anywhere. This is not an oversight to be corrected
later — verification runs against a Ugandan NIN and MSISDN, and the escrow
rails are mobile money. An email address proves nothing this platform needs
proven.

**Credentials live in their own table.** Reading an account happens on
every authorised request; loading a bcrypt hash alongside it would put the
most sensitive column in the hottest read path. `user_credential` also
means a future credential type (OTP-only, WebAuthn) is a new table rather
than a migration of `user_account`.

---

## 2. Roles

There are **four**, and they are the complete set (`Data_Model.md` §2.2):

| Role | Who | Can be self-registered? |
|---|---|---|
| `tenant` | Someone looking for a home | Yes |
| `lister` | Anyone offering property — owner, broker, or management company | Yes |
| `foo` | Field Operations Officer | **No** — admin provisions |
| `admin` | Natural Intellects staff | **No** — admin provisions |

### Broker is NOT a role

This trips people up. A broker is a **lister tier**, on
`lister_profile.tier`:

```
property_owner | broker_agent | property_mgmt_company
```

The distinction exists because it drives one specific rule: a
`broker_agent` or `property_mgmt_company` cannot publish a listing without
a **verified per-property mandate** (Decision 8, FR-3.2), while a
`property_owner` needs none. That check is
`MandateService.canPublish()`, and it reads the tier.

Promoting broker to a role would put the same fact in two places and break
that gate the first time they disagreed.

### Why `foo` and `admin` cannot be self-registered

Those roles verify properties, decide mandates, resolve disputes and change
configuration. If signup could mint one, every downstream control becomes
decorative. `POST /v1/auth/register` accepts only `tenant | lister` — in
the DTO, and again in the service — and staff come from
`POST /v1/auth/staff`, which is admin-only.

### There is no Super Admin

Deliberately. A second tier of admin only means something if some
operations are closed to ordinary admins, and no such operation exists:
admin is already the ceiling, and the things that genuinely cannot be done
by anyone — editing a ledger entry, editing a rate version, releasing
escrow before move-in — are closed **structurally**, not by role. Adding a
role that unlocks nothing would suggest those doors can be opened.

---

## 3. Account states

`party.status` gates access. Every state is classified in
`apps/api/src/auth/account-status.ts`, and that file is the only place that
decides:

| State | Sign in? | Meaning |
|---|:--:|---|
| `pending_verification` | **Yes** | Registered, not yet identity-verified |
| `active` | Yes | Normal |
| `suspended` | No | Temporarily blocked by ops; reversible |
| `disabled` | No | Blocked, not expected to return |
| `archived` | No | Retained for audit/retention only (DPA 2019) |
| `closed` | No | Original SSOT value, retained for existing rows |

**`pending_verification` can sign in, on purpose.** Identity verification
happens *inside* the app; blocking sign-in until verified would make
verification unreachable. What an unverified party cannot do is request a
viewing (FR-5.1) or publish a listing (FR-3.1) — those gates live in the
domain services, not at the door.

Three properties worth knowing before you touch this:

- **The policy is keyed on the full enum**, so adding a state without
  deciding whether it may sign in is a compile error.
- **Status is checked AFTER the password.** Checking first would let anyone
  probe which numbers are suspended without knowing a password. A blocked
  account with a wrong password still gets `401`, not `403`.
- **It is enforced at three points**: login, refresh, and `resolveCaller`.
  A party suspended mid-session loses access on their very next request,
  because role and status are re-read every time.

---

## 4. Sessions

### Tokens

| | Access token | Refresh token |
|---|---|---|
| Form | JWT | 48 random bytes, base64url |
| Lifetime | 15 minutes | 30 days |
| Carries | `sub` (account id) — **nothing else** | nothing; it is an opaque handle |
| Stored | not stored | SHA-256 hash in `session` |

**The access token carries only `sub`.** Role and party are re-read from
the database on every request. This is what makes a suspension or a role
change take effect immediately rather than lingering for up to 15 minutes,
and it is why there is a `GET /v1/auth/me` — a client cannot decode its own
role from a claim that deliberately is not there.

**Refresh tokens ROTATE.** Each is usable exactly once; using it revokes it
and issues a new pair, in one transaction. A stolen token therefore works
at most once, and its use invalidates the legitimate holder's session —
which surfaces the compromise instead of letting it persist silently.

> **If you write a client, collapse concurrent refreshes into one call.**
> Several requests 401-ing at the same moment and each refreshing means the
> first rotates the token and the rest present a spent one — which the
> server treats as compromise. The Expo client that demonstrated the
> collapsing pattern has been removed, and **no client currently implements
> it**: `apps/web` attaches the access token server-side per request and
> surfaces a 401 as a redirect to sign-in rather than refreshing in the
> background. That is correct for a server-rendered client — there are no
> concurrent in-flight requests from one page to collide — but it means the
> pattern will have to be rebuilt if anything here ever refreshes from the
> browser.

**Hashes, not tokens, are stored.** SHA-256 rather than bcrypt because
these are high-entropy random values with nothing to brute-force. A
database disclosure must not yield usable sessions.

### Devices

One `session` row per sign-in, so a user has as many as they have devices.

- `GET /v1/auth/sessions` — the caller's live sessions. Never returns the
  hash, even to its owner.
- `POST /v1/auth/logout-all` — revokes all of them, and reports **how
  many**. That count is the signal: "3 devices signed out" when you own one
  phone is what tells you something is wrong.

Both are scoped from the session. Neither accepts an account id, so neither
can be pointed at somebody else.

### Password reset

`POST /v1/auth/password-reset/request` → `/confirm`.

Tokens are hashed, single-use, and expire in 30 minutes. **Requesting one
always reports success** — an unknown number gets the same answer as a
known one, or the endpoint becomes a free membership oracle.

**Resetting revokes every session.** A reset is usually a response to
compromise; leaving sessions alive would change the password while the
attacker stayed signed in, which is the one outcome the user believed they
had prevented. `POST /v1/auth/password` (change password, requires the
current one) does the same.

> **V1 caveat:** no SMS provider is contracted (SSOT §8), so the reset
> endpoint returns the token in its response under `devToken`, suppressed
> in production. **This must be removed the day a provider exists** — a
> reset token in an HTTP response is usable by anyone who can see the
> response.

---

## 5. Authorisation

Authentication answers *who*. Authorisation answers *may they*. They are
separate layers and both are mandatory server-side.

### The guards

Registered globally, so endpoints are **protected by default** and must opt
out with `@Public()`. Per-controller registration would fail open — a new
controller written without the decorator would be silently unauthenticated,
and no test would notice.

| Guard | Asks | Refuses with |
|---|---|---|
| `JwtAuthGuard` | Is there a valid session? | `401` |
| `RolesGuard` | Does the role permit this endpoint? | `403 FORBIDDEN_ROLE` |
| `DealPartyGuard` | Is the caller a party to *this deal*? | **`404`** |
| `AssignedFooGuard` | Is this the officer actually dispatched? | `403 NOT_ASSIGNED_FOO` |

**`DealPartyGuard` returns 404, not 403, on purpose.** A 403 confirms the
deal exists, which lets an attacker enumerate real deal IDs by probing.
Non-parties get exactly what they would get for an ID that was never
issued.

**`AssignedFooGuard` returns 403, and that difference is deliberate too.**
Every caller reaching it is already staff with legitimate system-wide
visibility, so hiding existence buys nothing and costs a dispatched officer
a baffling error.

### Declaring access

```ts
@Roles('tenant', 'admin')          // who may call it
@RequiresDealParty()               // …and must be on this deal
@Post('deals/:dealId/fund-escrow')
async fundEscrow(@Caller() caller: AuthenticatedCaller, @Body() dto: FundDto) {
  // `caller` is resolved SERVER-SIDE. Never take a party id from a body.
}
```

Three rules, and they are not negotiable:

1. **Every endpoint declares its roles.** The authorisation matrix in
   `House_For_Rent_API_Specification.md` §4 is the contract; an endpoint
   not listed for a role must return 403 for that role.
2. **The actor comes from `@Caller()`, never from the request.** An
   endpoint that accepts a party id in its body makes the whole matrix
   decorative.
3. **Bodies reject unknown fields.** The global `ValidationPipe` runs with
   `forbidNonWhitelisted`, so a body carrying `status`, `commissionAmount`
   or `actorPartyId` is a `400` rather than a silently ignored field. An
   endpoint that takes no body should declare `EmptyBodyDto` rather than
   omitting the parameter — otherwise a request whose evident intent was
   not honoured still gets a cheerful 200.

### Testing it

`authorization-matrix.spec.ts` asserts **both halves** of every cell:
permitted roles are not blocked, and every other role gets 403. Testing
only the happy path would let a wide-open endpoint pass.

That suite has been verified **load-bearing** — disabling the role check
failed exactly the denial half and nothing else. A permission test that
still passes with authz switched off proves nothing, so check yours the
same way.

---

## 6. Integrating a new module

A checklist, in the order you will need it.

**Identity.** Take `partyId` from `@Caller()`. Join to `party` for
identity, to `lister_profile` for tier. Never store a duplicate of a role
or a tier on your own tables — read it.

**Authorisation.** Add your endpoints to §4 of the API Specification
*first*, then implement to it, then test both halves of every cell. If your
resource has an owner, write a guard like `DealPartyGuard` rather than
checking ownership inside the handler: a guard is declarative, testable,
and cannot be forgotten by the next handler.

**Disclosure.** Decide 403 versus 404 explicitly. If confirming the
resource exists tells an outsider something, return 404.

**Scoped reads.** Scope from the session, never a query parameter.
`GET /v1/deals` returns the caller's deals because it reads the session; an
endpoint taking `?partyId=` would undo every ownership guard in one line.

**Verification, not authentication.** "Is this party identity-verified?" is
a different question from "are they signed in", and it belongs to
`IdentityService.isIdentityVerified()`. Do not re-implement the
three-factor check — ask.

**Money.** Authorisation is necessary and not sufficient. Every
money-moving endpoint additionally passes through the deal state machine,
whose transition graph is the real control. Being an admin does not let you
release escrow before move-in, because no such edge exists.

### What NOT to do

- Do not read `auth_role` and branch on it inside a service. Roles are
  enforced at the boundary by `RolesGuard`; a service that also checks is a
  second copy free to drift.
- Do not add a role. The four are the SSOT set; a new capability is a new
  guard or a new tier, not a new role.
- Do not trust anything from the client about who the caller is.
- Do not check `party.status` yourself. Use `account-status.ts`, or the
  meaning of "suspended" will differ between modules.

---

## 7. Better Auth

`better-auth` is installed, configured, and **not load-bearing**.

It lives at `apps/api/src/auth/better-auth/`, is mounted at `/api/auth/*`,
and owns four tables namespaced `ba_`. The namespace exists because Better
Auth's defaults collide head-on: it wants a table called `session`, and
`Data_Model.md` §2.3 already defines one with a completely different shape.
Taking the default would have dropped the table every signed-in user
depends on.

Nothing in the API trusts a Better Auth session today. `JwtAuthGuard` still
resolves the existing `session` table, and every authorisation decision
still runs through the guards above.

**Before it can become load-bearing:**

1. Reconcile its schema with `user_account` / `user_credential` /
   `session`, which the deal guards join against by `partyId`.
2. Migrate credentials. Existing passwords are bcrypt; Better Auth defaults
   to scrypt, so either configure its hasher or every user resets.
3. Re-point `JwtAuthGuard`, keeping `AuthenticatedCaller`
   (`{ userAccountId, partyId, role }`) intact — every guard and controller
   destructures it.
4. Re-run the full authorisation matrix **and re-verify it is still
   load-bearing**.

Do that as its own change. Swapping the credential store under the layer
that protects every money endpoint is not something to ship alongside
anything else.

---

## 8. Known gaps

| Gap | Status |
|---|---|
| SMS delivery for reset tokens | No provider contracted (SSOT §8); `devToken` is the temporary stand-in |
| Email verification | No email field exists — identity is phone + NIN |
| Rate limiting on auth endpoints | Deferred; belongs at the edge |
| MFA / OAuth / magic links | Post-V1. Better Auth is installed partly to make these cheap later |
| Account lockout after failed attempts | Not implemented; rate limiting is the better first control |
