import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'House For Rent — verified homes to rent in Kampala',
    template: '%s · House For Rent',
  },
  description:
    'Every home on House For Rent is visited and confirmed in person by one of our field officers before it reaches you. Free for tenants.',
  icons: { icon: '/favicon.png' },
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
 * ── No web fonts ──
 * The identity board specifies Poppins, and the native app bundles it. On
 * the web the same choice costs a download and a layout shift on every cold
 * start over a Ugandan mobile connection (NFR-5). The identity here is
 * carried by colour, spacing and hierarchy, which arrive with the HTML.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
