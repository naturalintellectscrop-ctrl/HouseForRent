import { notFound } from 'next/navigation';
import { api, ApiError, type DealDetail } from '@/lib/api';
import { DealView } from '../../../deal-view';

export const metadata = { title: 'Your letting' };

/**
 * A tenant's view of one deal.
 *
 * The API refuses a non-party with 404 (API Spec §7.4) — not 403, which
 * would confirm the deal exists. This page passes that through rather than
 * checking anything itself; the gate is the `@RequiresDealParty()` guard on
 * the endpoint, and it holds whether or not this page is reached from a
 * browser.
 */
export default async function TenantDealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;

  let detail: DealDetail;
  try {
    detail = await api<DealDetail>(`/v1/deals/${dealId}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  return (
    <DealView detail={detail} side="tenant" backHref="/account/deals" />
  );
}
