import React, { useState } from "react";

const modules = [
  { id: "projecten",        label: "Projecten",        icon: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", val: "14", unit: "actief",   col: "1 / 3" },
  { id: "planning",         label: "Planning",          icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", val: "23", unit: "items",    col: "3 / 4" },
  { id: "uitvoering",       label: "Uitvoering",        icon: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z", val: "6", unit: "lopend",   col: "4 / 5" },
  { id: "werkvoorbereiding",label: "Werkvoorbereiding", icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", val: "3", unit: "open",     col: "1 / 2" },
  { id: "calculatie",       label: "Calculatie",        icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6", val: "84K", unit: "EUR",      col: "2 / 3" },
  { id: "oplevering",       label: "Oplevering",        icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14", val: "2", unit: "gereed",   col: "3 / 4" },
  { id: "onderhoud",        label: "Onderhoud",         icon: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z", val: "8", unit: "orders",   col: "4 / 5" },
  { id: "hrm",              label: "HRM",               icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", val: "12", unit: "actief",   col: "1 / 2" },
  { id: "magazijn",         label: "Magazijn",          icon: "M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4", val: "247", unit: "items",    col: "2 / 3" },
  { id: "inkoop",           label: "Inkoop",            icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0", val: "4", unit: "open",     col: "3 / 4" },
  { id: "ai",               label: "AI Adviseur",       icon: "M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z", val: "3", unit: "inzichten", col: "4 / 5", special: true },
];

const shadow3d = (lifted: boolean) => lifted
  ? `inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.07),
     0 4px 8px rgba(0,0,0,0.12), 0 16px 40px rgba(0,0,0,0.22),
     0 40px 80px rgba(0,0,0,0.18), 0 60px 120px rgba(0,0,0,0.1)`
  : `inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05),
     0 2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.12),
     0 20px 48px rgba(0,0,0,0.1), 0 36px 72px rgba(0,0,0,0.06)`;

export function Dashboard() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div style={{
      height: "100vh", width: "100%", overflow: "hidden",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      position: "relative",
    }}>

      {/* Full-bleed background — architectural photo, manganese treatment */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "url(https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1600&q=90)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "grayscale(1) brightness(0.42) contrast(1.25)",
      }} />

      {/* Manganese tint overlay — MnO₂ purple-grey */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(160deg, rgba(28,22,42,0.72) 0%, rgba(20,18,32,0.65) 50%, rgba(32,26,46,0.72) 100%)",
      }} />

      {/* Subtle vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 30%, rgba(10,8,18,0.5) 100%)",
      }} />

      {/* All foreground content */}
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column" }}>

        {/* Floating nav — pure white pill */}
        <div style={{
          margin: "20px 24px 0",
          padding: "0 20px",
          height: 52,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          borderRadius: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1), 0 8px 32px rgba(0,0,0,0.16), 0 24px 56px rgba(0,0,0,0.1)",
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 9,
              background: "linear-gradient(145deg, #12103a 0%, #1e1c58 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(18,16,58,0.4)",
            }}>
              <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                <path d="M7 0L14 12H0L7 0Z" fill="white" fillOpacity="0.95" />
              </svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0A0A14", letterSpacing: "-0.3px" }}>
              FPS <span style={{ fontWeight: 300, color: "#8090B0" }}>Connect</span>
            </div>
          </div>

          {/* Center greeting */}
          <div style={{ fontSize: 13, color: "#0A0A14", letterSpacing: "-0.1px" }}>
            Goedemorgen, <strong>René</strong>
          </div>

          {/* Right actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "#F2F4F8", borderRadius: 18,
              padding: "7px 13px",
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8090B0" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <span style={{ fontSize: 12, color: "#9AAABE" }}>Zoeken...</span>
            </div>
            {/* Avatar */}
            <div style={{
              width: 30, height: 30, borderRadius: "50%",
              background: "linear-gradient(135deg, #2D3A6E, #4A6ACA)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: 10.5, fontWeight: 700,
              boxShadow: "0 2px 8px rgba(45,58,110,0.4)",
            }}>RV</div>
          </div>
        </div>

        {/* Module grid */}
        <div style={{
          flex: 1,
          padding: "18px 24px 22px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "repeat(3, 1fr)",
          gap: 14,
          overflow: "hidden",
        }}>
          {modules.map((mod) => {
            const isHovered = hovered === mod.id;
            const isSpecial = mod.special;

            return (
              <div
                key={mod.id}
                onMouseEnter={() => setHovered(mod.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  gridColumn: mod.col,
                  borderRadius: 22,
                  background: isSpecial
                    ? "linear-gradient(145deg, #0d0b1e 0%, #140f2e 50%, #0a0820 100%)"
                    : "rgba(255,255,255,0.97)",
                  boxShadow: shadow3d(isHovered),
                  transform: isHovered ? "translateY(-5px) scale(1.012)" : "translateY(0) scale(1)",
                  transition: "transform 0.32s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease",
                  cursor: "pointer",
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden",
                  border: isSpecial ? "1px solid rgba(100,80,200,0.25)" : "1px solid rgba(255,255,255,0.8)",
                }}
              >
                {/* Special AI: star field */}
                {isSpecial && (
                  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                    {Array.from({ length: 40 }).map((_, i) => (
                      <div key={i} style={{
                        position: "absolute",
                        left: `${(i * 37 + 11) % 100}%`,
                        top: `${(i * 53 + 7) % 100}%`,
                        width: i % 5 === 0 ? 2 : 1,
                        height: i % 5 === 0 ? 2 : 1,
                        borderRadius: "50%",
                        background: "white",
                        opacity: 0.15 + (i % 4) * 0.1,
                      }} />
                    ))}
                    {/* Subtle nebula */}
                    <div style={{
                      position: "absolute",
                      width: 120, height: 120,
                      borderRadius: "50%",
                      background: "radial-gradient(circle, rgba(100,80,220,0.25) 0%, transparent 70%)",
                      top: "50%", left: "50%",
                      transform: "translate(-50%,-50%)",
                    }} />
                  </div>
                )}

                {/* Top row: icon + badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
                  {/* Icon container — 3D pill */}
                  <div style={{
                    width: 40, height: 40,
                    borderRadius: 12,
                    background: isSpecial
                      ? "rgba(100,80,220,0.2)"
                      : "linear-gradient(145deg, #F6F8FC 0%, #EAEEF5 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isSpecial
                      ? "0 2px 8px rgba(100,80,220,0.2)"
                      : "0 1px 0 rgba(255,255,255,1), 0 2px 6px rgba(0,0,0,0.08), inset 0 1px 2px rgba(255,255,255,0.9)",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke={isSpecial ? "#a090ff" : "#3A5AA0"}
                      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={mod.icon} />
                    </svg>
                  </div>

                  {/* Status badge */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 4,
                    background: isSpecial ? "rgba(100,80,220,0.15)" : "#F0F4FA",
                    borderRadius: 20, padding: "4px 10px",
                    border: isSpecial ? "1px solid rgba(100,80,220,0.2)" : "none",
                  }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: isSpecial ? "#8070e8" : "#22C55E",
                    }} />
                    <span style={{ fontSize: 10, fontWeight: 600, color: isSpecial ? "#8070e8" : "#16A34A", letterSpacing: "0.04em" }}>
                      ACTIEF
                    </span>
                  </div>
                </div>

                {/* Bottom: name + value */}
                <div style={{ position: "relative" }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: isSpecial ? "rgba(255,255,255,0.6)" : "#334155",
                    letterSpacing: "-0.1px",
                    marginBottom: 6,
                  }}>{mod.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{
                      fontSize: 28, fontWeight: 700,
                      color: isSpecial ? "#FFFFFF" : "#0A0A1E",
                      letterSpacing: "-1.5px", lineHeight: 1,
                    }}>{mod.val}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: isSpecial ? "rgba(255,255,255,0.4)" : "#94A3B8",
                      letterSpacing: "0.04em",
                    }}>{mod.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
