import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "BeforeYouRent",
  description: "Health scores for every NYC residential building, based on complaints, violations, and inspections.",
  openGraph: {
    title: "BeforeYouRent",
    description: "Health scores for every NYC residential building, based on complaints, violations, and inspections.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BeforeYouRent",
    description: "Health scores for every NYC residential building, based on complaints, violations, and inspections.",
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
