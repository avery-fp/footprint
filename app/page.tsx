"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* ── Fake grid cells ── */
const CELLS = [
  { r: "1/3", c: "1/2", hue: 20 },
  { r: "1/2", c: "2/3", hue: 260 },
  { r: "2/3", c: "2/3", hue: 340 },
  { r: "3/4", c: "1/2", hue: 180 },
  { r: "3/5", c: "2/3", hue: 40 },
  { r: "4/5", c: "1/2", hue: 300 },
  { r: "5/6", c: "1/3", hue: 210 },
];

export default function LandingPage() {
  const [vis, setVis] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap";
    document.head.appendChild(link);
    const t = setTimeout(() => setVis(true), 400);
    return () => { clearTimeout(t); document.head.removeChild(link); };
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#0c0c10",
        fontFamily: "'DM Mono', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {/* ── Hero: abstract grid ── */}
      <div
        style={{
          position: "relative",
          width: "min(88vw, 680px)",
          aspectRatio: "4 / 3",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(210, 190, 160, 0.10)",
          boxShadow: "0 0 80px rgba(210, 190, 160, 0.05)",
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(14px)",
          transition: "opacity 1s ease, transform 1s ease",
        }}
      >
        {/* Grid mock */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateRows: "repeat(5, 1fr)",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "6px",
            padding: "6px",
          }}
        >
          {CELLS.map((c, i) => (
            <div
              key={i}
              style={{
                gridRow: c.r,
                gridColumn: c.c,
                borderRadius: "8px",
                background: `linear-gradient(135deg, hsl(${c.hue} 30% 14%), hsl(${c.hue} 20% 10%))`,
                opacity: 0.7,
              }}
            />
          ))}
        </div>

        {/* ae watermark */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingTop: "clamp(20px, 5%, 40px)",
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "rgba(210, 190, 160, 0.25)", fontSize: "28px", fontWeight: 300 }}>
            æ
          </span>
          <div style={{ display: "flex", gap: "20px", marginTop: "10px" }}>
            {["void", "world", "fits", "sound", "archive"].map((t) => (
              <span
                key={t}
                style={{
                  color: "rgba(210, 190, 160, 0.15)",
                  fontSize: "10px",
                  letterSpacing: "0.12em",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Edge fades */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, #0c0c10 0%, transparent 12%, transparent 85%, #0c0c10 100%)",
          }}
        />
      </div>

      {/* ── Tagline ── */}
      <p
        style={{
          marginTop: "40px",
          color: "#d2bea0",
          fontSize: "clamp(14px, 2.4vw, 18px)",
          fontWeight: 300,
          letterSpacing: "0.04em",
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 1s ease 0.15s, transform 1s ease 0.15s",
        }}
      >
        all of you. one place. $10.
      </p>

      {/* ── CTA ── */}
      <Link
        href="/login"
        style={{
          marginTop: "28px",
          padding: "14px 36px",
          background: "transparent",
          color: "#d2bea0",
          border: "1px solid rgba(210, 190, 160, 0.3)",
          borderRadius: "6px",
          fontFamily: "'DM Mono', monospace",
          fontSize: "clamp(13px, 2vw, 15px)",
          fontWeight: 400,
          letterSpacing: "0.06em",
          textDecoration: "none",
          cursor: "pointer",
          transition:
            "border-color 0.3s, background 0.3s, opacity 1s ease 0.3s, transform 1s ease 0.3s",
          opacity: vis ? 1 : 0,
          transform: vis ? "translateY(0)" : "translateY(8px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgba(210, 190, 160, 0.6)";
          e.currentTarget.style.background = "rgba(210, 190, 160, 0.04)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgba(210, 190, 160, 0.3)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        make yours →
      </Link>
    </div>
  );
}

