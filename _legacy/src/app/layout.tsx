import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import StructuredData from "@/components/house-for-rent/StructuredData";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "House For Rent - Uganda's #1 Rental Platform",
  description:
    "Find your perfect rental home in Uganda. Discover thousands of rental properties across Uganda. From cozy bedsitters to luxurious villas, your perfect home awaits.",
  keywords: [
    "rental",
    "Uganda",
    "apartments",
    "houses",
    "real estate",
    "Kampala",
    "Entebbe",
    "rent",
    "house for rent",
    "property",
    "landlord",
    "tenant",
    "Uganda real estate",
    "Kampala apartments",
    "Uganda property",
    "homes for rent Uganda",
    "rental properties Kampala",
    "Entebbe rentals",
    "Jinja apartments",
    "Mbarara houses",
    "bedsitter Uganda",
    "villa Uganda",
    "condo Kampala",
  ],
  authors: [{ name: "House For Rent" }],
  creator: "House For Rent",
  publisher: "House For Rent",
  metadataBase: new URL("https://houseforrent.co.ug"),
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.png", sizes: "32x32" },
      { url: "/logo.png", sizes: "192x192" },
    ],
    apple: "/logo.png",
  },
  openGraph: {
    title: "House For Rent - Uganda's #1 Rental Platform",
    description:
      "Find your perfect rental home in Uganda. Discover thousands of rental properties across Uganda.",
    url: "https://houseforrent.co.ug",
    siteName: "House For Rent",
    type: "website",
    locale: "en_UG",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "House For Rent - Uganda's #1 Rental Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "House For Rent - Uganda's #1 Rental Platform",
    description:
      "Find your perfect rental home in Uganda. Discover thousands of rental properties.",
    images: ["/logo.png"],
  },
  category: "real estate",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#dc2626" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HouseForRent" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <StructuredData />
          {children}
          <Toaster />
        </ThemeProvider>
        {/* Initial page loading screen */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var loader = document.createElement('div');
                loader.id = 'initial-loader';
                loader.className = 'loading-screen-overlay';
                loader.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#fff;';
                loader.innerHTML = '<div style="text-align:center"><div style="width:48px;height:48px;border-radius:12px;background:oklch(0.577 0.245 27.325);display:flex;align-items:center;justify-content:center;margin:0 auto 16px"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></div><div style="height:4px;width:120px;background:rgba(0,0,0,0.1);border-radius:4px;overflow:hidden"><div class="loading-bar" style="height:100%;width:40%;background:oklch(0.577 0.245 27.325);border-radius:4px"></div></div></div>';
                document.body.appendChild(loader);
                window.addEventListener('load', function() {
                  setTimeout(function() {
                    loader.style.transition = 'opacity 0.4s ease-out';
                    loader.style.opacity = '0';
                    setTimeout(function() { loader.remove(); }, 400);
                  }, 200);
                });
              })();
            `,
          }}
        />
        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('SW registered: ', registration.scope);
                    setInterval(function() {
                      registration.update().catch(function() {});
                    }, 3600000);
                  }).catch(function(error) {
                    console.log('SW registration failed: ', error);
                  });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
