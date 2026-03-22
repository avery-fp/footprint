"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function LandingPage() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&display=swap";
    document.head.appendChild(link);

    const t = setTimeout(() => setVisible(true), 600);
    return () => {
      clearTimeout(t);
      document.head.removeChild(link);
    };
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
      {/* Grid hero */}
      <div
        style={{
          position: "relative",
          width: "min(90vw, 720px)",
          aspectRatio: "4 / 3",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid rgba(210, 190, 160, 0.12)",
          boxShadow: "0 0 80px rgba(210, 190, 160, 0.06)",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.8s ease, transform 0.8s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
            background:
              "linear-gradient(to bottom, #0c0c10 0%, transparent 8%, transparent 88%, #0c0c10 100%)",
          }}
        />
        <iframe
          src="/ae"
          title="footprint grid"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            pointerEvents: "none",
            display: "block",
          }}
        />
      </div>

      <p
        style={{
          marginTop: "40px",
          color: "#d2bea0",
          fontSize: "clamp(14px, 2.4vw, 18px)",
          fontWeight: 300,
          letterSpacing: "0.04em",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 0.8s ease 0.15s, transform 0.8s ease 0.15s",
        }}
      >
        all of you. one place. $10.
      </p>

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
            "border-color 0.3s ease, background 0.3s ease, opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s",
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(8px)",
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
