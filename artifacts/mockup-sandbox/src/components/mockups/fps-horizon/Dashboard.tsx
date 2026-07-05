import React, { useState } from "react";

const modules = [
  {
    id: "projecten", label: "Projecten", sub: "14 actief",
    img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=90",
    col: "1 / 5", row: "1 / 3",
    stat: { n: "14", u: "actief" },
  },
  {
    id: "uitvoering", label: "Uitvoering", sub: "6 lopend",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=700&q=85",
    col: "5 / 9", row: "1 / 3",
    stat: { n: "6", u: "lopend" },
  },
  {
    id: "planning", label: "Planning", sub: "Weekoverzicht",
    img: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=700&q=85",
    col: "9 / 11", row: "1 / 2",
    stat: { n: "23", u: "items" },
  },
  {
    id: "werkvoorbereiding", label: "Werkvoorbereiding", sub: "3 in review",
    img: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=700&q=85",
    col: "11 / 13", row: "1 / 2",
    stat: { n: "3", u: "open" },
  },
  {
    id: "calculatie", label: "Calculatie", sub: "€ 84.200",
    img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=700&q=85",
    col: "9 / 11", row: "2 / 3",
    stat: { n: "84K", u: "EUR" },
  },
  {
    id: "oplevering", label: "Oplevering", sub: "2 gereed",
    img: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=700&q=85",
    col: "11 / 13", row: "2 / 3",
    stat: { n: "2", u: "gereed" },
  },
  {
    id: "onderhoud", label: "Onderhoud", sub: "8 werkorders",
    img: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=700&q=85",
    col: "1 / 4", row: "3 / 4",
    stat: { n: "8", u: "open" },
  },
  {
    id: "hrm", label: "HRM", sub: "12 medewerkers",
    img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&q=85",
    col: "4 / 7", row: "3 / 4",
    stat: { n: "12", u: "actief" },
  },
  {
    id: "magazijn", label: "Magazijn", sub: "247 artikelen",
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=700&q=85",
    col: "7 / 10", row: "3 / 4",
    stat: { n: "247", u: "items" },
  },
  {
    id: "inkoop", label: "Inkoop", sub: "4 aanvragen",
    img: "https://images.unsplash.com/photo-1543013309-0d1f7f2a5765?w=700&q=85",
    col: "10 / 13", row: "3 / 4",
    stat: { n: "4", u: "open" },
  },
  {
    id: "ai", label: "AI", sub: "3 inzichten",
    gradient: "linear-gradient(145deg, #0a0f1e 0%, #0d1530 45%, #0f2550 75%, #081535 100%)",
    col: "1 / 13", row: "4 / 5",
    stat: { n: "3", u: "inzichten" },
    wide: true,
  },
];

const BLUE = "#3B82F6";

export function Dashboard() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      minHeight: "100vh", width: "100%", overflow: "auto",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#F4F7FB",
      position: "relative",
    }}>

      {/* Very subtle grid background */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Floating nav — architectural precision */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        padding: "0 32px",
        height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(244,247,251,0.9)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(59,130,246,0.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "0 14px 0 0",
            borderRight: "1px solid rgba(59,130,246,0.15)",
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: BLUE,
              boxShadow: `0 0 0 3px rgba(59,130,246,0.15)`,
            }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#0C1526", letterSpacing: "0.04em" }}>FPS CONNECT</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.18)",
            borderRadius: 20, padding: "2px 9px",
          }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#22C55E" }} />
            <span style={{ fontSize: 9.5, fontWeight: 700, color: "#16A34A", letterSpacing: "0.1em" }}>OPERATIONEEL</span>
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(12,21,38,0.4)", letterSpacing: "0.08em", fontFamily: "monospace" }}>
          GOEDEMORGEN &nbsp;·&nbsp; RENÉ VINK &nbsp;·&nbsp; HOOFDBEHEERDER
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#FFFFFF", border: "1px solid rgba(59,130,246,0.15)",
            borderRadius: 6, padding: "6px 12px",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(12,21,38,0.3)" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 11.5, color: "rgba(12,21,38,0.3)" }}>Zoeken...</span>
          </div>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${BLUE}, #1D4ED8)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 10.5, fontWeight: 700, fontFamily: "monospace",
          }}>RV</div>
        </div>
      </div>

      {/* Command space */}
      <div style={{ position: "relative", zIndex: 1, padding: "24px 24px 40px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "240px 200px 180px 100px",
          gap: 12,
        }}>
          {modules.map((mod) => (
            <div
              key={mod.id}
              onMouseEnter={() => setHovered(mod.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                gridColumn: mod.col,
                gridRow: mod.row,
                borderRadius: 16,
                overflow: "hidden",
                position: "relative",
                cursor: "pointer",
                boxShadow: hovered === mod.id
                  ? `0 20px 48px -8px rgba(59,130,246,0.18), 0 4px 16px -4px rgba(59,130,246,0.1), 0 0 0 1.5px rgba(59,130,246,0.2)`
                  : "0 4px 20px -4px rgba(12,21,38,0.1), 0 1px 6px -2px rgba(12,21,38,0.06)",
                transform: hovered === mod.id ? "translateY(-3px) scale(1.008)" : "translateY(0) scale(1)",
                transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease",
              }}
            >
              {/* Background */}
              {mod.img ? (
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `url(${mod.img})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "brightness(0.75) saturate(0.8)",
                  transform: hovered === mod.id ? "scale(1.04)" : "scale(1)",
                  transition: "transform 0.5s ease",
                }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: mod.gradient }}>
                  {/* Grid overlay for AI panel */}
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: "linear-gradient(rgba(59,130,246,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.12) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }} />
                </div>
              )}

              {/* Blue precision overlay */}
              {mod.img && (
                <div style={{
                  position: "absolute", inset: 0,
                  background: `linear-gradient(145deg, rgba(59,130,246,0.08) 0%, transparent 100%)`,
                }} />
              )}

              {/* Bottom gradient */}
              <div style={{
                position: "absolute", inset: 0,
                background: mod.wide
                  ? "linear-gradient(to right, rgba(5,15,40,0.9) 0%, rgba(5,15,40,0.5) 40%, transparent 100%)"
                  : "linear-gradient(to top, rgba(5,15,40,0.85) 0%, rgba(5,15,40,0.1) 55%, transparent 100%)",
              }} />

              {/* Blue top rule */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 1.5,
                background: `linear-gradient(to right, ${BLUE}, transparent)`,
                opacity: hovered === mod.id ? 1 : 0.3,
                transition: "opacity 0.3s",
              }} />

              {/* Content */}
              <div style={{
                position: "absolute",
                bottom: mod.wide ? "50%" : 0,
                top: mod.wide ? "50%" : "auto",
                left: 0, right: 0,
                padding: mod.wide ? "0 28px" : "18px 20px",
                transform: mod.wide ? "translateY(-50%)" : "none",
                display: mod.wide ? "flex" : "block",
                alignItems: mod.wide ? "center" : "flex-start",
                gap: mod.wide ? 32 : 0,
              }}>
                <div>
                  <div style={{
                    fontSize: mod.col.includes("1 / 5") || mod.col.includes("5 / 9") ? 26
                            : mod.wide ? 22 : 16,
                    fontWeight: 300,
                    color: "#FFFFFF",
                    letterSpacing: mod.wide ? "0.06em" : "-0.3px",
                    textTransform: mod.wide ? "uppercase" : "none",
                    lineHeight: 1.1,
                    marginBottom: 4,
                  }}>{mod.label}</div>
                  <div style={{
                    fontSize: 10.5,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.04em",
                    fontFamily: "monospace",
                  }}>{mod.sub}</div>
                </div>
                {mod.wide && mod.stat && (
                  <div style={{ display: "flex", gap: 48, marginLeft: 48 }}>
                    {["3 inzichten actief", "Brandveiligheid geanalyseerd", "Compliance 98%"].map((t, i) => (
                      <div key={i} style={{ borderLeft: `1px solid rgba(59,130,246,0.3)`, paddingLeft: 16 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "monospace", letterSpacing: "0.06em" }}>{t}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Data badge — top right */}
              {mod.stat && !mod.wide && (
                <div style={{ position: "absolute", top: 14, right: 14 }}>
                  <div style={{
                    background: "rgba(255,255,255,0.1)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 8, padding: "5px 10px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "white", lineHeight: 1, fontFamily: "monospace" }}>{mod.stat.n}</div>
                    <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>{mod.stat.u}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
