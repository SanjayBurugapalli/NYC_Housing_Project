import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/components/Providers";
import "./globals.css";

// Absolute base for OG/Twitter image URLs. Set NEXT_PUBLIC_SITE_URL to the
// production domain; falls back to the Vercel deployment URL, then localhost.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const description =
  "Health scores for every NYC residential building, based on complaints, violations, and inspections.";

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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.8.0/mapbox-gl.css"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/logo-mark.svg" />
      </head>
      <body className="bg-gray-900 text-white">
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
