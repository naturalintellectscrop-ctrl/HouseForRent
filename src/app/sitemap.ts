import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { freshnessWindowDays } from '@/server/listings';
import { SITE_URL } from '@/lib/seo';

/**
 * The XML sitemap: the seven public content pages plus every home that is
 * live right now.
 *
 * The listing query mirrors the public feed's three non-negotiable
 * constraints (live, field-verified, in-corridor) plus available - the
 * sitemap must never advertise a URL the marketplace itself would refuse
 * to render (that is how a sitemap becomes a 404 generator).
 *
 * The database read is wrapped: on a machine with no DATABASE_URL (the
 * build is required to work without one) the sitemap degrades to the
 * static routes instead of failing the build, and picks the listings up
 * on the next revalidation.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    {
      url: `${SITE_URL}/properties`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/areas`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/for-landlords`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/how-it-works`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  try {
    // Exactly the public feed's where-clause (src/server/listings.ts):
    // live, field-verified, in-corridor, available, and INSIDE the
    // freshness window - the same staleness rule that removes a home from
    // search removes it from the sitemap. The window itself comes from
    // config, so ops tuning the window retunes the sitemap with it.
    const windowDays = await freshnessWindowDays();
    const staleCutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await db.listing.findMany({
      where: {
        publicationState: 'live',
        verificationState: 'verified',
        availabilityStatus: 'available',
        availabilityConfirmedAt: { gte: staleCutoff },
        property: { neighbourhood: { inServiceArea: true } },
      },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });

    return [
      ...staticRoutes,
      ...rows.map((row) => ({
        url: `${SITE_URL}/properties/${row.id}`,
        lastModified: row.updatedAt,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // No database on this machine (build-time without env): ship the
    // static routes; the hourly revalidation fills the listings in later.
    return staticRoutes;
  }
}
