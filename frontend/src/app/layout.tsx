import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Self-hosted at build time by next/font, so no Google Fonts request (and no
// CSP change) at runtime. Exposed as CSS variables for tailwind's font-sans /
// font-display families.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

// Absolute base for OG/Twitter image URLs. Set NEXT_PUBLIC_SITE_URL to the
// production domain; falls back to the Vercel deployment URL, then localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const description =
  "Paste a listing or type an address: see how healthy an NYC building is, how long your commute takes and what there is to eat nearby.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BeforeYouRent",
  description,
  openGraph: {
    title: "BeforeYouRent",
    description,
    type: "website",
    siteName: "BeforeYouRent",
  },
  twitter: {
    card: "summary_large_image",
    title: "BeforeYouRent",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F4F6F8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/logo-mark.svg" />
      </head>
      <body className="bg-surface font-sans text-ink antialiased">
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
