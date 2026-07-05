import React, { useState } from "react";

const modules = [
  {
    id: "projecten", label: "Projecten", sub: "14 actieve projecten",
    img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&q=90",
    col: "1 / 7", row: "1 / 3", height: "auto",
  },
  {
    id: "planning", label: "Planning", sub: "Weekoverzicht",
    img: "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=700&q=85",
    col: "7 / 10", row: "1 / 2",
  },
  {
    id: "uitvoering", label: "Uitvoering", sub: "6 lopende opdrachten",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=700&q=85",
    col: "10 / 13", row: "1 / 2",
  },
  {
    id: "werkvoorbereiding", label: "Werkvoorbereiding", sub: "3 in review",
    img: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=700&q=85",
    col: "7 / 10", row: "2 / 3",
  },
  {
    id: "calculatie", label: "Calculatie", sub: "€ 84.200 lopend",
    img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=700&q=85",
    col: "10 / 13", row: "2 / 3",
  },
  {
    id: "oplevering", label: "Oplevering", sub: "2 gereed voor overdracht",
    img: "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=700&q=85",
    col: "1 / 4", row: "3 / 4",
  },
  {
    id: "onderhoud", label: "Onderhoud", sub: "8 open werkorders",
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
    id: "inkoop", label: "Inkoop", sub: "4 aanvragen open",
    img: "https://images.unsplash.com/photo-1543013309-0d1f7f2a5765?w=700&q=85",
    col: "1 / 5", row: "4 / 5",
  },
  {
    id: "ai", label: "AI", sub: "3 nieuwe inzichten",
    gradient: "linear-gradient(145deg, #0a0f1e 0%, #0d1f40 40%, #0f3460 70%, #1a1a4e 100%)",
    col: "5 / 9", row: "4 / 5",
  },
];

const stars = Array.from({ length: 28 }, (_, i) => ({
  x: Math.random() * 100, y: Math.random() * 100,
  size: Math.random() * 1.5 + 0.5,
  op: Math.random() * 0.6 + 0.2,
}));

export function Dashboard() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      minHeight: "100vh", width: "100%", overflow: "auto",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "linear-gradient(160deg, #f0f6ff 0%, #fafcff 35%, #f5f9ff 65%, #eef5ff 100%)",
      position: "relative",
    }}>

      {/* Atmospheric depth blobs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{
          position: "absolute", width: 900, height: 900,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(180,215,255,0.38) 0%, transparent 65%)",
          top: -200, right: -200,
        }} />
        <div style={{
          position: "absolute", width: 600, height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,230,255,0.32) 0%, transparent 65%)",
          bottom: 0, left: "25%",
        }} />
        <div style={{
          position: "absolute", width: 400, height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 65%)",
          top: "40%", left: "45%",
        }} />
      </div>

      {/* Floating top nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100,
        padding: "18px 36px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(245,250,255,0.75)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(180,215,255,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, #0B1D3E 0%, #1e3d7a 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(11,29,62,0.3)",
          }}>
            <svg width="15" height="13" viewBox="0 0 15 13" fill="none">
              <path d="M7.5 0L15 13H0L7.5 0Z" fill="white" fillOpacity="0.95" />
            </svg>
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#0B1D3E", letterSpacing: "-0.3px" }}>FPS </span>
            <span style={{ fontSize: 14, fontWeight: 300, color: "#7090b8" }}>Connect</span>
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: "#0B1D3E", letterSpacing: "-0.2px" }}>
          Goedemorgen, René
          <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "#8aaacf" }}>Hoofdbeheerder</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.8)",
            border: "1px solid rgba(180,215,255,0.45)",
            borderRadius: 20, padding: "7px 14px",
            boxShadow: "0 2px 8px rgba(0,40,120,0.07)",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8aaacf" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 12, color: "#8aaacf" }}>Zoeken...</span>
          </div>
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #1a3d7a, #4a80e8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: 11, fontWeight: 700,
            boxShadow: "0 4px 10px rgba(26,61,122,0.35)",
          }}>RV</div>
        </div>
      </div>

      {/* Command space — bento grid */}
      <div style={{ position: "relative", zIndex: 1, padding: "28px 28px 40px" }}>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "260px 200px 190px 170px",
          gap: 16,
        }}>
          {modules.map((mod) => (
            <div
              key={mod.id}
              onMouseEnter={() => setHovered(mod.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                gridColumn: mod.col,
                gridRow: mod.row,
                borderRadius: 24,
                overflow: "hidden",
                position: "relative",
                cursor: "pointer",
                boxShadow: hovered === mod.id
                  ? "0 32px 64px -8px rgba(0,30,100,0.22), 0 8px 24px -4px rgba(0,30,100,0.14)"
                  : "0 16px 40px -8px rgba(0,30,100,0.14), 0 4px 14px -4px rgba(0,30,100,0.09)",
                transform: hovered === mod.id ? "translateY(-4px) scale(1.01)" : "translateY(0) scale(1)",
                transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease",
              }}
            >
              {/* Background */}
              {mod.img ? (
                <div style={{
                  position: "absolute", inset: 0,
                  backgroundImage: `url(${mod.img})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  transform: hovered === mod.id ? "scale(1.04)" : "scale(1)",
                  transition: "transform 0.5s ease",
                }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: mod.gradient }}>
                  {/* Stars for AI panel */}
                  {stars.map((s, i) => (
                    <div key={i} style={{
                      position: "absolute",
                      left: `${s.x}%`, top: `${s.y}%`,
                      width: s.size, height: s.size,
                      borderRadius: "50%",
                      background: "white",
                      opacity: s.op,
                    }} />
                  ))}
                </div>
              )}

              {/* Gradient overlay */}
              <div style={{
                position: "absolute", inset: 0,
                background: mod.id === "ai"
                  ? "linear-gradient(to top, rgba(5,8,20,0.85) 0%, rgba(5,8,20,0.3) 60%, transparent 100%)"
                  : "linear-gradient(to top, rgba(0,15,40,0.78) 0%, rgba(0,15,40,0.2) 55%, transparent 100%)",
              }} />

              {/* Content */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                padding: "20px 22px",
              }}>
                {mod.id === "ai" && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    background: "rgba(100,120,255,0.25)",
                    border: "1px solid rgba(150,170,255,0.3)",
                    borderRadius: 20, padding: "3px 10px",
                    marginBottom: 8,
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#a0b4ff" }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#c0d0ff", letterSpacing: "0.08em" }}>ACTIEF</span>
                  </div>
                )}
                <div style={{
                  fontSize: mod.col.includes("7") && mod.row === "1 / 3" ? 28 :
                            mod.col === "1 / 7" ? 32 : 19,
                  fontWeight: 300,
                  color: "white",
                  letterSpacing: "-0.5px",
                  lineHeight: 1.1,
                  marginBottom: 5,
                  textShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}>{mod.label}</div>
                <div style={{
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.65)",
                  letterSpacing: "0.02em",
                }}>{mod.sub}</div>
              </div>

              {/* Top right badge */}
              <div style={{ position: "absolute", top: 16, right: 16 }}>
                <div style={{
                  background: "rgba(255,255,255,0.12)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 20, padding: "4px 10px",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em" }}>
                    {mod.id.toUpperCase().slice(0, 3)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
