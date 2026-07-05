import React, { useState } from "react";

const modules = [
  {
    id: "projecten", label: "Projecten", sub: "14 actieve projecten",
    img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=90",
    col: "1 / 6", row: "1 / 3",
  },
  {
    id: "uitvoering", label: "Uitvoering", sub: "6 lopend",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=700&q=85",
    col: "6 / 9", row: "1 / 2",
  },
  {
    id: "planning", label: "Planning", sub: "Weekoverzicht",
    img: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=700&q=85",
    col: "9 / 13", row: "1 / 2",
  },
  {
    id: "werkvoorbereiding", label: "Werkvoorbereiding", sub: "3 in review",
    img: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=700&q=85",
    col: "6 / 9", row: "2 / 3",
  },
  {
    id: "calculatie", label: "Calculatie", sub: "€ 84.200 lopend",
    img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=700&q=85",
    col: "9 / 13", row: "2 / 3",
  },
  {
    id: "oplevering", label: "Oplevering", sub: "2 gereed",
    img: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=700&q=85",
    col: "1 / 4", row: "3 / 4",
  },
  {
    id: "onderhoud", label: "Onderhoud", sub: "8 werkorders",
    img: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=700&q=85",
    col: "4 / 7", row: "3 / 4",
  },
  {
    id: "hrm", label: "HRM", sub: "12 medewerkers",
    img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=700&q=85",
    col: "7 / 10", row: "3 / 4",
  },
  {
    id: "magazijn", label: "Magazijn", sub: "247 artikelen",
    img: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=700&q=85",
    col: "10 / 13", row: "3 / 4",
  },
  {
    id: "inkoop", label: "Inkoop", sub: "4 aanvragen",
    img: "https://images.unsplash.com/photo-1543013309-0d1f7f2a5765?w=700&q=85",
    col: "1 / 5", row: "4 / 5",
  },
  {
    id: "ai", label: "AI", sub: "3 nieuwe inzichten",
    gradient: "linear-gradient(145deg, #1a0a00 0%, #3d1a00 40%, #6b2d00 70%, #4a1800 100%)",
    col: "5 / 9", row: "4 / 5",
  },
];

const COPPER = "#C4943A";

export function Dashboard() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      minHeight: "100vh", width: "100%", overflow: "auto",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#0C0C0F",
      position: "relative",
    }}>

      {/* Atmospheric dark depth */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", width: 800, height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(60,30,10,0.5) 0%, transparent 65%)",
          top: -150, right: -100,
        }} />
        <div style={{
          position: "absolute", width: 500, height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(40,20,5,0.4) 0%, transparent 65%)",
          bottom: 100, left: "30%",
        }} />
      </div>

      {/* Floating nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(12,12,15,0.85)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: `1px solid rgba(196,148,58,0.15)`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 1, height: 28, background: COPPER, opacity: 0.5 }} />
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#E8E4DC", letterSpacing: "0.05em" }}>FPS</span>
            <span style={{ fontSize: 13, fontWeight: 300, color: COPPER, marginLeft: 6, letterSpacing: "0.12em" }}>CONNECT</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: "rgba(232,228,220,0.4)", letterSpacing: "0.08em" }}>
          GOEDEMORGEN, RENÉ &nbsp;·&nbsp; HOOFDBEHEERDER
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(196,148,58,0.18)",
            borderRadius: 20, padding: "7px 14px",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(196,148,58,0.5)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 12, color: "rgba(196,148,58,0.4)" }}>Zoeken...</span>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: `linear-gradient(135deg, ${COPPER}, #8B6020)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 11, fontWeight: 700,
            boxShadow: `0 4px 12px rgba(196,148,58,0.3)`,
          }}>RV</div>
        </div>
      </div>

      {/* Command space */}
      <div style={{ position: "relative", zIndex: 1, padding: "24px 24px 40px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "260px 200px 190px 170px",
          gap: 14,
        }}>
          {modules.map((mod) => (
            <div
              key={mod.id}
              onMouseEnter={() => setHovered(mod.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                gridColumn: mod.col,
                gridRow: mod.row,
                borderRadius: 20,
                overflow: "hidden",
                position: "relative",
                cursor: "pointer",
                boxShadow: hovered === mod.id
                  ? `0 32px 64px -8px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,148,58,0.2), inset 0 1px 0 rgba(196,148,58,0.12)`
                  : "0 16px 40px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
                transform: hovered === mod.id ? "translateY(-5px) scale(1.01)" : "translateY(0) scale(1)",
                transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease",
                border: hovered === mod.id ? `1px solid rgba(196,148,58,0.2)` : "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Background */}
              {mod.img ? (
                <>
                  <div style={{
                    position: "absolute", inset: 0,
                    backgroundImage: `url(${mod.img})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "brightness(0.6) saturate(0.7)",
                    transform: hovered === mod.id ? "scale(1.05)" : "scale(1)",
                    transition: "transform 0.5s ease, filter 0.3s ease",
                  }} />
                  {/* Tonal overlay */}
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(145deg, rgba(40,20,5,0.5) 0%, rgba(10,8,4,0.2) 100%)",
                    mixBlendMode: "multiply",
                  }} />
                </>
              ) : (
                <div style={{ position: "absolute", inset: 0, background: mod.gradient }} />
              )}

              {/* Bottom gradient */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)",
              }} />

              {/* Copper rule */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 1,
                background: `linear-gradient(to right, ${COPPER}, transparent)`,
                opacity: hovered === mod.id ? 1 : 0.35,
                transition: "opacity 0.3s",
              }} />

              {/* Content */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "18px 20px" }}>
                <div style={{
                  fontSize: mod.col === "1 / 6" ? 30 : 18,
                  fontWeight: 300,
                  color: "#E8E4DC",
                  letterSpacing: "-0.3px",
                  lineHeight: 1.1,
                  marginBottom: 4,
                }}>{mod.label}</div>
                <div style={{ fontSize: 11, color: "rgba(232,228,220,0.45)", letterSpacing: "0.04em" }}>{mod.sub}</div>
              </div>

              {/* Module code */}
              <div style={{ position: "absolute", top: 14, right: 14 }}>
                <span style={{
                  fontSize: 9, fontWeight: 600, color: COPPER,
                  letterSpacing: "0.15em", textTransform: "uppercase",
                  background: "rgba(0,0,0,0.4)",
                  backdropFilter: "blur(4px)",
                  WebkitBackdropFilter: "blur(4px)",
                  borderRadius: 4, padding: "3px 7px",
                  border: `1px solid rgba(196,148,58,0.2)`,
                }}>{mod.id.slice(0, 3).toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
