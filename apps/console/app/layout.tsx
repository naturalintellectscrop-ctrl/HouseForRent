import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'House For Rent — Field Console',
  description:
    'Internal Field Operations Officer console. Not a public surface.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

/**
 * No web fonts. The scaffold shipped two Google font families; a system font
 * stack renders instantly on a phone with no network round trip and no
 * layout shift, which matters more here than typographic personality
 * (NFR-5, Technical Architecture §7).
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
