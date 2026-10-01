import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * The crawl policy, generated so the sitemap URL always rides along and
 * can never drift from the deployment it belongs to.
 *
 * Blocked here: the API surface and the two authenticated consoles
 * (/account, /landlord, /ops) - pure private application state with
 * nothing for an index.
 *
 * NOT blocked: /login and /register. Auth pages are kept out of the index
 * with a `noindex` robots meta (they stay crawlable so Google can read
 * the directive and drop them cleanly) - blocking them in robots.txt
 * instead would hide the noindex from the crawler.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/account', '/landlord', '/ops'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
