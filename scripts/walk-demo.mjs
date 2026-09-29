/**
 * Walks the seeded introductions through the deal lifecycle using ONLY the
 * real service functions — the sandbox counterpart of journey-http.mjs's
 * money path. Idempotent: each deal advances from wherever it actually is.
 *
 * Run: DEMO_PASSWORD=… bun scripts/walk-demo.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
if (!process.env.DEMO_PASSWORD) {
  console.error('DEMO_PASSWORD required (guards against accidental runs)');
  process.exit(1);
}

const deals = await import('../src/server/deals.ts');

const accounts = await prisma.userAccount.findMany({ include: { party: true } });
const byRole = (r) => accounts.find((a) => a.role === r)?.partyId;

async function advance(deal) {
  const d = await prisma.deal.findUnique({ where: { id: deal.id } });
  const tenant = byRole('tenant');
  const admin = byRole('admin');
  const step = async (fn, name) => {
    await fn();
    console.log(`  ${deal.id.slice(0, 8)}: ${name}`);
  };

  if (d.status === 'created') await step(() => deals.matchTenant({ dealId: d.id, actorPartyId: byRole('foo') }), 'tenant_matched');
  if (d.status === 'tenant_matched') await step(() => deals.signAgreement({ dealId: d.id, actorPartyId: d.landlordPartyId }), 'agreement_signed');
  if (d.status === 'agreement_signed') await step(() => deals.fundEscrow({ dealId: d.id, actorPartyId: d.tenantPartyId }), 'escrow_funded');

  const after = await prisma.deal.findUnique({ where: { id: deal.id } });
  // The Naalya room (450k) walks to closed; the Ntinda flat stays funded so
  // the tenant portal has a live move-in to confirm.
  if (after.monthlyRentSnapshot === 450000n) {
    if (after.status === 'escrow_funded') await step(() => deals.confirmMoveIn({ dealId: after.id, actorPartyId: after.tenantPartyId }), 'move_in_confirmed');
    if (after.status === 'move_in_confirmed') await step(() => deals.earnCommission({ dealId: after.id, actorPartyId: admin }), 'commission_earned');
    if (after.status === 'commission_earned') await step(() => deals.settle({ dealId: after.id, actorPartyId: admin }), 'settled');
    if (after.status === 'settled') {
      await step(() => deals.close({ dealId: after.id, actorPartyId: admin }), 'closed');
      await prisma.listing.update({
        where: { id: after.listingId },
        data: { publicationState: 'rented', availabilityStatus: 'unavailable' },
      });
    }
  }
}

async function main() {
  const intros = await prisma.introductionRecord.findMany();
  for (const intro of intros) {
    const existing = await prisma.deal.findFirst({
      where: { introductionRecordId: intro.id, status: { notIn: ['cancelled', 'refunded'] } },
    });
    if (existing) {
      await advance(existing);
      continue;
    }
    const deal = await deals.createFromIntroduction({
      introductionRecordId: intro.id,
      actorPartyId: byRole('foo'),
      actorRole: 'foo',
    });
    console.log(`created deal ${deal.id.slice(0, 8)} from introduction`);
    await advance(deal);
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
