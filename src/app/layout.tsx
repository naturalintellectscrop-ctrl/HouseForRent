import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import './proof-strip.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'House For Rent — verified homes to rent in Kampala',
    template: '%s · House For Rent',
  },
  description:
    'Find your next home with ease. Every home on House For Rent is visited and confirmed in person by one of our field officers before it reaches you — free for tenants, in Kampala and Wakiso.',
  icons: {
    icon: [{ url: '/favicon.ico' }, { url: '/favicon.png', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'House For Rent',
    title: 'House For Rent — verified homes to rent in Kampala',
    description:
      'Find your next home with ease. Every home is visited and confirmed in person by a field officer before it reaches you. Free for tenants.',
    images: [
      {
        url: '/brand/og-cover.png',
        width: 1200,
        height: 630,
        alt: 'House For Rent — find your next home with ease.',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The identity is drawn on a near-black surface; matching the browser
  // chrome to the page stops the two-tone flash on a phone.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1412' },
  ],
};

/**
 * ── System fonts ──
 * A webfont over a Ugandan mobile connection costs a download and a layout
 * shift on every cold start (NFR-5). The identity is carried by colour,
 * spacing and hierarchy, which arrive with the HTML.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
