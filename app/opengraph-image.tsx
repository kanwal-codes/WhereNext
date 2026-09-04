import { ImageResponse } from "next/og";

// Satori (what ImageResponse renders with) can't resolve CSS custom properties or
// oklch() — these are literal hex mirrors of app/icon.svg's dark mark, not the real
// design tokens.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Where next? — a travel workspace";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#1b1c20",
          color: "#ffffff",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "#ffffff",
              color: "#1b1c20",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-1px",
            }}
          >
            WN
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px" }}>Where next?</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 64, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1.05 }}>
          Talk about it.
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: "-2px", lineHeight: 1.05, color: "rgba(255,255,255,0.55)" }}>
          Then go.
        </div>
      </div>
    ),
    size,
  );
}
