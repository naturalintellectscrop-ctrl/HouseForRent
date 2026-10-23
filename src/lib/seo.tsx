import type { Metadata } from 'next';
import { CONTACT, TAGLINE } from '@/app/ui';

/**
 * ── SEO single source of truth ──
 *
 * Every canonical, Open Graph and sitemap URL on the site resolves through
 * `SITE_URL`. The fallback is the PRODUCTION domain, not localhost: a
 * deployment that ships without `NEXT_PUBLIC_SITE_URL` configured must
 * still emit canonicals Google can actually crawl. (A canonical that points
 * at http://localhost:3000 is worse than no canonical at all - it tells
 * Google every page is a duplicate of a page that does not exist.)
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://houseforrentug.vercel.app'
).replace(/\/+$/, '');

export const SITE_NAME = 'House For Rent';

/** The default meta description - the root layout's, and the OG fallback. */
export const DEFAULT_DESCRIPTION =
  'Find your next home with ease. Every home on House For Rent is visited and confirmed in person by one of our field officers before it reaches you - free for tenants, in Kampala and Wakiso.';

/** Turns a root-relative path into an absolute, crawlable URL. */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Standard metadata for one public page: title (through the root template,
 * so the brand suffix is applied exactly once), description, canonical,
 * Open Graph and Twitter card. One helper so no page can ship with a
 * missing canonical or a card-less share again.
 */
export function pageMetadata(opts: {
  /** The page-specific part of the title; the brand suffix is added. */
  title: string;
  description: string;
  /** Canonical path, e.g. "/about". */
  path: string;
  keywords?: string[];
}): Metadata {
  const fullTitle =
    opts.title.trim().length === 0 ? SITE_NAME : `${opts.title} · ${SITE_NAME}`;

  const images = [
    {
      url: '/brand/og-cover.png',
      width: 1200,
      height: 630,
      alt: `${SITE_NAME} - ${TAGLINE}`,
    },
  ];

  return {
    title: opts.title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: { canonical: opts.path },
    openGraph: {
      title: fullTitle,
      description: opts.description,
      url: opts.path,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_UG',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: opts.description,
      images: images.map((i) => i.url),
    },
  };
}

/* ── JSON-LD (schema.org) ──────────────────────────────────────────────── */

/**
 * Renders one or more schema.org graphs as a script tag. `<` is escaped so
 * no closing-script sequence inside a data string can break out of the
 * element (the standard JSON-LD hardening).
 */
export function JsonLd({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/** The organisation behind the marketplace, served site-wide. */
export function organizationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    name: SITE_NAME,
    legalName: 'Natural Intellects Ltd',
    slogan: TAGLINE,
    url: SITE_URL,
    logo: absoluteUrl('/brand/house-for-rent-logo.png'),
    email: CONTACT.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Kampala',
      addressCountry: 'UG',
    },
    areaServed: [
      { '@type': 'City', name: 'Kampala' },
      { '@type': 'AdministrativeArea', name: 'Wakiso District' },
    ],
    contactPoint: CONTACT.phones.map((phone) => ({
      '@type': 'ContactPoint',
      contactType: 'customer service',
      telephone: phone.tel,
      areaServed: 'UG',
      availableLanguage: ['en'],
    })),
  };
}

/**
 * The site itself, with the search action so Google can offer a sitelinks
 * search box straight into our real search results page.
 */
export function websiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: 'House For Rent Uganda',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/properties?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/**
 * A breadcrumb trail. `items` is ordered from the root; the last item is
 * the page itself.
 */
export function breadcrumbLd(
  items: { name: string; path: string }[],
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/* ── the listing-detail graph ──────────────────────────────────────────── */

/** The minimal shape of a listing the JSON-LD builder needs. */
export interface SeoListing {
  listingId: string;
  monthlyRent: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  neighbourhoodName: string;
  landmarkText: string;
  descriptionText: string | null;
  isVerified: boolean;
  isStale: boolean;
  geoLat: number | null;
  geoLng: number | null;
  amenities: { id: string; name: string }[];
  photos: { url: string; isDevelopmentFixture: boolean }[];
}

/**
 * The structured-data graph for one listing. Only photographs our own
 * system holds are offered as `image` - development fixtures are excluded
 * here exactly as they are labelled on the page, and the graph never
 * claims availability the freshness window has retired (`isStale` →
 * OutOfStock).
 */
export function realEstateListingLd(
  l: SeoListing,
  title: string,
): Record<string, unknown> {
  const images = l.photos
    .filter((p) => !p.isDevelopmentFixture && p.url.startsWith('/'))
    .slice(0, 10)
    .map((p) => absoluteUrl(p.url));

  const description =
    l.descriptionText ??
    `${l.bedrooms}-bedroom ${l.propertyType} for rent in ${l.neighbourhoodName}, Kampala. ${l.landmarkText}. ${
      l.isVerified
        ? 'Visited and confirmed in person by a House For Rent field officer.'
        : 'Listed on House For Rent.'
    } Free for tenants.`;

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: title,
    url: absoluteUrl(`/properties/${l.listingId}`),
    description,
    ...(images.length > 0 ? { image: images } : {}),
    offers: {
      '@type': 'Offer',
      price: l.monthlyRent,
      priceCurrency: 'UGX',
      availability: l.isStale
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      url: absoluteUrl(`/properties/${l.listingId}`),
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: l.neighbourhoodName,
      addressRegion: 'Central Region',
      addressCountry: 'UG',
      streetAddress: l.landmarkText,
    },
    ...(l.geoLat != null && l.geoLng != null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: l.geoLat,
            longitude: l.geoLng,
          },
        }
      : {}),
  };
}
