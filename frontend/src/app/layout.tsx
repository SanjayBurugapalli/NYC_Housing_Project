import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Building Health Score",
  description: "Interactive map of NYC residential building health scores based on complaints, violations, and inspections.",
  openGraph: {
    title: "NYC Building Health Score",
    description: "Interactive map of NYC residential building health scores based on complaints, violations, and inspections.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "NYC Building Health Score",
    description: "Interactive map of NYC residential building health scores based on complaints, violations, and inspections.",
  },
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
      </head>
      <body className="h-screen w-screen bg-gray-900 text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
