import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigModule } from '../config/config.module';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { IdentityModule } from '../identity/identity.module';
import { IdentityService } from '../identity/identity.service';
import { ScreeningModule } from './screening.module';
import {
  ScreeningService,
  UnknownScreeningModuleError,
} from './screening.service';
import { OnboardingService } from './onboarding.service';

/**
 * Stage 6 tests (FR-6.1, FR-6.2, FR-6.3, FR-1.4).
 *
 * The assertion that matters most is the seam: enabling the stub module by
 * CONFIG ALONE changes behaviour, with no change to the tenant flow code.
 */
describe('Screening pipeline & tenant onboarding (Stage 6)', () => {
  let screening: ScreeningService;
  let onboarding: OnboardingService;
  let identityService: IdentityService;
  let config: ConfigService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, ConfigModule, IdentityModule, ScreeningModule],
    }).compile();

    screening = moduleRef.get(ScreeningService);
    onboarding = moduleRef.get(OnboardingService);
    identityService = moduleRef.get(IdentityService);
    config = moduleRef.get(ConfigService);
    prisma = moduleRef.get(PrismaService);

    await config.defineParameter(CONFIG_KEYS.screeningModules, 'json');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  let seq = 0;
  function phone(tag: string) {
    seq += 1;
    return `+2563${String(Date.now()).slice(-8)}${seq}${tag}`.slice(0, 19);
  }

  async function admin() {
    return prisma.party.create({
      data: { displayName: 'Screening Admin', primaryPhone: phone('adm') },
    });
  }

  /** Sets the active module set. This is the ONLY lever these tests pull. */
  async function setActiveModules(keys: string[]) {
    const by = await admin();
    await config.setValue({
      key: CONFIG_KEYS.screeningModules,
      value: keys,
      createdByPartyId: by.id,
      effectiveFrom: new Date(Date.now() - 60_000),
    });
  }

  /** A fully identity-verified tenant, onboarded through the real flow. */
  async function verifiedTenant() {
    const { party } = await onboarding.registerTenant({
      displayName: 'Screened Tenant',
      primaryPhone: phone('t'),
      policyVersion: 'v1',
    });
    await onboarding.submitIdentity({
      tenantPartyId: party.id,
      nin: 'CM12345678',
      phone: '+256700123456',
      selfieRef: 'selfie-ok',
      idPhotoRef: 'id-photo',
    });
    return party;
  }

  describe('V1 configuration is identity-only (FR-6.1)', () => {
    test('with config = ["identity"], ONLY the identity module runs', async () => {
      await setActiveModules(['identity']);
      const tenant = await verifiedTenant();

      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      expect(run.moduleResults).toHaveLength(1);
      expect(run.moduleResults[0].moduleKey).toBe('identity');
      expect(run.overallState).toBe('passed');
    });

    test('the run snapshots WHICH modules ran, so history stays interpretable', async () => {
      await setActiveModules(['identity']);
      const tenant = await verifiedTenant();
      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      expect(run.moduleSet).toEqual(['identity']);

      // config later changes — the historical run still records what it ran
      await setActiveModules(['identity', 'employment']);
      const reloaded = await screening.getRun(run.id);
      expect(reloaded!.moduleSet).toEqual(['identity']);
    });

    test('an unverified tenant FAILS screening', async () => {
      await setActiveModules(['identity']);
      // registered, consented, but never submitted identity
      const { party } = await onboarding.registerTenant({
        displayName: 'Unverified Tenant',
        primaryPhone: phone('u'),
        policyVersion: 'v1',
      });

      const run = await onboarding.screenTenant({ tenantPartyId: party.id });

      expect(run.overallState).toBe('failed');
      expect(run.moduleResults[0].state).toBe('failed');
    });

    test('a partially verified tenant (2 of 3 factors) still FAILS', async () => {
      await setActiveModules(['identity']);
      const { party } = await onboarding.registerTenant({
        displayName: 'Partial Tenant',
        primaryPhone: phone('p'),
        policyVersion: 'v1',
      });

      // NIN and phone verify, but the selfie factor is never submitted —
      // two of three is not identity-verified (FR-1.2)
      await identityService.verifyNin(party.id, 'CM55556666');
      await identityService.verifyPhone(party.id, '+256700555666');

      const run = await onboarding.screenTenant({ tenantPartyId: party.id });
      expect(run.overallState).toBe('failed');
    });

    test('a tenant whose selfie match FAILS is not identity-verified', async () => {
      await setActiveModules(['identity']);
      const { party } = await onboarding.registerTenant({
        displayName: 'Bad Selfie Tenant',
        primaryPhone: phone('bs'),
        policyVersion: 'v1',
      });

      await identityService.verifyNin(party.id, 'CM77778888');
      await identityService.verifyPhone(party.id, '+256700777888');
      // the mock provider fails any input ending in '-fail'
      await identityService.verifySelfieMatch(
        party.id,
        'selfie-fail',
        'id-photo',
      );

      const run = await onboarding.screenTenant({ tenantPartyId: party.id });
      expect(run.overallState).toBe('failed');
    });
  });

  describe('THE SEAM (FR-6.2) — a module is enabled by CONFIG, with no flow change', () => {
    test('the stub module is REGISTERED but does not run under V1 config', async () => {
      await setActiveModules(['identity']);

      // it exists in the application...
      expect(screening.registeredModuleKeys()).toContain('employment');
      // ...but is not switched on
      expect(await screening.activeModuleKeys()).toEqual(['identity']);

      const tenant = await verifiedTenant();
      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      expect(run.moduleResults.map((r) => r.moduleKey)).toEqual(['identity']);
    });

    test('enabling it by config ALONE changes behaviour — the tenant flow code is untouched', async () => {
      const tenant = await verifiedTenant();

      // exactly the same call, before and after; only config differs
      await setActiveModules(['identity']);
      const before = await onboarding.screenTenant({
        tenantPartyId: tenant.id,
      });
      expect(before.moduleResults.map((r) => r.moduleKey)).toEqual([
        'identity',
      ]);

      await setActiveModules(['identity', 'employment']);
      const after = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      expect(after.moduleResults.map((r) => r.moduleKey).sort()).toEqual([
        'employment',
        'identity',
      ]);
      // and the new module's result is persisted with no schema change
      const employmentResult = after.moduleResults.find(
        (r) => r.moduleKey === 'employment',
      );
      expect(employmentResult).toBeDefined();
      expect(employmentResult!.state).toBe('skipped');
    });

    test('a skipped module does not block an otherwise passing run', async () => {
      await setActiveModules(['identity', 'employment']);
      const tenant = await verifiedTenant();

      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });
      expect(run.overallState).toBe('passed');
    });

    test('a configured-but-unregistered module FAILS LOUDLY rather than being skipped', async () => {
      await setActiveModules(['identity', 'risk_scoring_not_built_yet']);
      const tenant = await verifiedTenant();

      // silently ignoring it would mean tenants "pass" a check nobody ran
      await expect(
        onboarding.screenTenant({ tenantPartyId: tenant.id }),
      ).rejects.toThrow(UnknownScreeningModuleError);
    });

    test('an unknown module aborts BEFORE any run row is written', async () => {
      await setActiveModules(['identity', 'does_not_exist']);
      const tenant = await verifiedTenant();

      const before = await prisma.screeningRun.count({
        where: { tenantPartyId: tenant.id },
      });
      await expect(
        onboarding.screenTenant({ tenantPartyId: tenant.id }),
      ).rejects.toThrow(UnknownScreeningModuleError);
      const after = await prisma.screeningRun.count({
        where: { tenantPartyId: tenant.id },
      });

      expect(after).toBe(before);
    });
  });

  describe('ABILITY TO PAY IS NOT A SCREENING MODULE (FR-6.3)', () => {
    test('no financial or employment document is collected or stored anywhere', async () => {
      await setActiveModules(['identity', 'employment']);
      const tenant = await verifiedTenant();
      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      // the stub explicitly records that it collected nothing
      const employment = run.moduleResults.find(
        (r) => r.moduleKey === 'employment',
      );
      const detail = employment!.detail as { reason: string };
      expect(detail.reason).toContain('No employment data is collected');

      // and nothing in the run carries document-like fields
      const serialised = JSON.stringify(run);
      for (const forbidden of [
        'payslip',
        'bankStatement',
        'salary',
        'employerName',
        'reference',
      ]) {
        expect(serialised.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    });

    test('the screening result carries no raw personal data (DPA 2019, NFR-3)', async () => {
      await setActiveModules(['identity']);
      const nin = 'CM99887766';
      const { party } = await onboarding.registerTenant({
        displayName: 'PII Tenant',
        primaryPhone: phone('pii'),
        policyVersion: 'v1',
      });
      await onboarding.submitIdentity({
        tenantPartyId: party.id,
        nin,
        phone: '+256700999888',
        selfieRef: 'selfie-ok',
        idPhotoRef: 'id-photo',
      });

      const run = await onboarding.screenTenant({ tenantPartyId: party.id });
      expect(JSON.stringify(run)).not.toContain(nin);
    });
  });

  describe('consent precedes verification (FR-1.4, DPA 2019)', () => {
    test('onboarding records consent with purpose, timestamp and policy version', async () => {
      const { party, consent } = await onboarding.registerTenant({
        displayName: 'Consent Tenant',
        primaryPhone: phone('c'),
        policyVersion: 'v2.1',
        retentionUntil: new Date('2030-01-01'),
      });

      expect(consent.purpose).toBe('identity_verification');
      expect(consent.policyVersion).toBe('v2.1');
      expect(consent.grantedAt).toBeInstanceOf(Date);
      expect(consent.retentionUntil).toEqual(new Date('2030-01-01'));
      expect(consent.partyId).toBe(party.id);
    });

    test('identity verification is refused for a party with no consent record', async () => {
      // a party created outside the onboarding flow has no consent
      const party = await prisma.party.create({
        data: { displayName: 'No Consent', primaryPhone: phone('nc') },
      });

      await expect(
        onboarding.submitIdentity({
          tenantPartyId: party.id,
          nin: 'CM11112222',
          phone: '+256700111222',
          selfieRef: 'selfie-ok',
          idPhotoRef: 'id-photo',
        }),
      ).rejects.toThrow(/no consent recorded/);
    });
  });

  describe('the landlord-facing tenant summary discloses a verdict, not PII', () => {
    test('summary carries verification and screening state with retention metadata', async () => {
      await setActiveModules(['identity']);
      const tenant = await verifiedTenant();
      await onboarding.screenTenant({ tenantPartyId: tenant.id });

      const summary = await onboarding.tenantSummary(tenant.id);

      expect(summary.identityVerified).toBe(true);
      expect(summary.screeningState).toBe('passed');
      expect(summary.screeningModulesRun).toEqual(['identity']);
      expect(summary.consentRecordedAt).toBeInstanceOf(Date);
      expect(summary.consentPolicyVersion).toBe('v1');
    });
  });

  describe('overall state resolution is conservative', () => {
    test('"no checks ran" resolves to pending, never to passed', async () => {
      await setActiveModules([]);
      const tenant = await verifiedTenant();

      const run = await onboarding.screenTenant({ tenantPartyId: tenant.id });

      expect(run.moduleResults).toHaveLength(0);
      // an empty pipeline must NOT read as "cleared"
      expect(run.overallState).toBe('pending');
    });

    test('any failure fails the whole run', async () => {
      await setActiveModules(['identity', 'employment']);
      const { party } = await onboarding.registerTenant({
        displayName: 'Failing Tenant',
        primaryPhone: phone('f'),
        policyVersion: 'v1',
      });

      const run = await onboarding.screenTenant({ tenantPartyId: party.id });
      expect(run.overallState).toBe('failed');
    });
  });
});
