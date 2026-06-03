import { ImageResponse } from "next/og";

// Dynamically generated social share image (no static asset to maintain).
// Next.js auto-wires this as og:image; twitter-image.tsx re-exports it.
export const runtime = "edge";
export const alt = "BeforeYouRent — health scores for every NYC residential building";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b1220 0%, #111827 55%, #0f291c 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "#22c55e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "34px",
              fontWeight: 800,
              color: "#0b1220",
            }}
          >
            B
          </div>
          <div style={{ fontSize: "34px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            BeforeYouRent
          </div>
        </div>

        <div
          style={{
            marginTop: "44px",
            fontSize: "68px",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: "950px",
          }}
        >
          Health scores for every NYC residential building
        </div>

        <div style={{ marginTop: "28px", fontSize: "30px", color: "#9ca3af", maxWidth: "900px" }}>
          Built on public complaints, violations, and inspections.
        </div>
      </div>
    ),
    { ...size }
  );
}
