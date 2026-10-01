import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import {
  DEFAULT_DESCRIPTION,
  JsonLd,
  SITE_NAME,
  SITE_URL,
  organizationLd,
  websiteLd,
} from '@/lib/seo';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  // SITE_URL falls back to the production domain - a canonical or share
  // URL must never resolve to localhost (see src/lib/seo.tsx).
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - verified homes to rent in Kampala`,
    template: '%s · House For Rent',
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'houses for rent in Kampala',
    'homes to rent in Uganda',
    'apartments for rent Kampala',
    'rentals in Wakiso',
    'verified rentals Uganda',
    'house for rent Uganda',
  ],
  applicationName: SITE_NAME,
  authors: [{ name: 'Natural Intellects Ltd' }],
  creator: 'Natural Intellects Ltd',
  publisher: 'Natural Intellects Ltd',
  category: 'real estate',
  // Indexable by default; private surfaces (portals, ops, auth) override
  // this in their own layouts/pages, and /api is excluded in robots.txt.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/favicon.png', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_UG',
    url: '/',
    title: `${SITE_NAME} - verified homes to rent in Kampala`,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: '/brand/og-cover.png',
        width: 1200,
        height: 630,
        alt: 'House For Rent - find your next home with ease.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} - verified homes to rent in Kampala`,
    description: DEFAULT_DESCRIPTION,
    images: ['/brand/og-cover.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light',
  // Light-only product: the browser chrome matches the page in both
  // orientations and at every brightness, so there is no two-tone flash.
  themeColor: '#ffffff',
};

/**
 * ── Fonts ──
 * `next/font/google` downloads Geist at BUILD time and self-hosts it - no
 * runtime request to Google, and the CSS is preloaded with `font-display:
 * swap` semantics, so a cold start on a Ugandan mobile connection (NFR-5)
 * pays one cached font file and no third-party round-trip. The identity is
 * still carried mainly by colour, spacing and hierarchy, which arrive with
 * the HTML.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // data-scroll-behavior tells Next.js this smooth scrolling is ours, so
  // route transitions may scroll instantly while in-page anchors stay
  // smooth - silencing the framework's console warning honestly.
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <body>
        {/* Site-wide structured data: who operates this marketplace, and
            the site's own search action for Google's sitelinks searchbox. */}
        <JsonLd data={[organizationLd(), websiteLd()]} />
        <a href="#main" className="skip">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
