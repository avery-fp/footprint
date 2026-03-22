"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/* Grid cells — vibrant, visible on dark bg */
const CELLS = [
  { r: "1/3", c: "1/2", hue: 25, sat: 70, lit: 38 },
  { r: "1/2", c: "2/3", hue: 270, sat: 60, lit: 35 },
  { r: "2/4", c: "3/4", hue: 345, sat: 55, lit: 33 },
  { r: "2/3", c: "2/3", hue: 200, sat: 50, lit: 30 },
  { r: "3/4", c: "1/2", hue: 175, sat: 55, lit: 32 },
  { r: "3/5", c: "2/3", hue: 40, sat: 65, lit: 36 },
  { r: "4/5", c: "1/2", hue: 310, sat: 50, lit: 34 },
  { r: "4/6", c: "3/4", hue: 15, sat: 60, lit: 35 },
  { r: "5/6", c: "1/3", hue: 220, sat: 55, lit: 32 },
  { r: "5/6", c: "2/3", hue: 50, sat: 45, lit: 30 },
  { r: "6/7", c: "1/2", hue: 290, sat: 50, lit: 33 },
  { r: "6/7", c: "2/4", hue: 10, sat: 55, lit: 35 },
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
          {/* Keyframe animation */}
              <style>{`
                      @keyframes cellPulse {
                                0%, 100% { opacity: 0.85; }
                                          50% { opacity: 1; }
                                                  }
                                                        `}</style>
        
          {/* Grid hero */}
              <div
                        style={{
                                    position: "relative",
                                    width: "min(88vw, 640px)",
                                    aspectRatio: "4 / 3",
                                    opacity: vis ? 1 : 0,
                                    transform: vis ? "translateY(0)" : "translateY(16px)",
                                    transition: "opacity 1s ease, transform 1s ease",
                        }}
                      >
                      <div
                                  style={{
                                                display: "grid",
                                                gridTemplateRows: "repeat(7, 1fr)",
                                                gridTemplateColumns: "repeat(4, 1fr)",
                                                gap: "6px",
                                                width: "100%",
                                                height: "100%",
                                  }}
                                >
                        {CELLS.map((c, i) => (
                                              <div
                                                              key={i}
                                                              style={{
                                                                                gridRow: c.r,
                                                                                gridColumn: c.c,
                                                                                borderRadius: "8px",
                                                                                background: `hsl(${c.hue} ${c.sat}% ${c.lit}%)`,
                                                                                border: `1px solid hsl(${c.hue} ${c.sat}% ${c.lit + 15}% / 0.3)`,
                                                                                boxShadow: `0 0 20px hsl(${c.hue} ${c.sat}% ${c.lit + 10}% / 0.15)`,
                                                                                animation: `cellPulse ${3 + (i % 3)}s ease-in-out infinite`,
                                                                                animationDelay: `${i * 0.3}s`,
                                                              }}
                                                            />
                                            ))}
                      </div>
              
                {/* Watermark */}
                      <div
                                  style={{
                                                position: "absolute",
                                                top: "50%",
                                                left: "50%",
                                                transform: "translate(-50%, -50%)",
                                                fontSize: "clamp(48px, 10vw, 80px)",
                                                fontWeight: 300,
                                                color: "rgba(210, 190, 160, 0.06)",
                                                pointerEvents: "none",
                                                zIndex: 2,
                                  }}
                                >
                                ae
                      </div>
              
                {/* Edge fade */}
                      <div
                                  style={{
                                                position: "absolute",
                                                inset: 0,
                                                pointerEvents: "none",
                                                zIndex: 3,
                                                background:
                                                                "linear-gradient(to bottom, #0c0c10 0%, transparent 12%, transparent 85%, #0c0c10 100%)",
                                  }}
                                />
              </div>
        
          {/* Tagline */}
              <p
                        style={{
                                    marginTop: "40px",
                                    color: "#d2bea0",
                                    fontSize: "clamp(14px, 2.4vw, 18px)",
                                    fontWeight: 300,
                                    letterSpacing: "0.04em",
                                    opacity: vis ? 1 : 0,
                                    transform: vis ? "translateY(0)" : "translateY(8px)",
                                    transition: "opacity 0.8s ease 0.3s, transform 0.8s ease 0.3s",
                        }}
                      >
                      all of you. one place. $10.
              </p>
        
          {/* CTA */}
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
                                                  "border-color 0.3s ease, background 0.3s ease, opacity 0.8s ease 0.45s, transform 0.8s ease 0.45s",
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
}</div>
