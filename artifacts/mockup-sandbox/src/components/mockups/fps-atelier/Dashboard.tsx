import React, { useState } from "react";

const NAV = [
  { id: "dashboard", label: "Dashboard", active: true, path: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { id: "projecten", label: "Projecten", path: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" },
  { id: "planning", label: "Planning", path: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" },
  { id: "uitvoering", label: "Uitvoering", path: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" },
  { id: "oplevering", label: "Oplevering", path: "M22 11.08V12a10 10 0 1 1-5.93-9.14" },
  { id: "onderhoud", label: "Onderhoud", path: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" },
  { id: "hrm", label: "HRM", path: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" },
  { id: "ai", label: "AI", path: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24" },
];

const MODULES = [
  { id: "projecten",        label: "Projecten",        val: "14",  unit: "actief",    icon: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z", color: "#C2410C" },
  { id: "planning",         label: "Planning",          val: "23",  unit: "items",     icon: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",            color: "#92400E" },
  { id: "uitvoering",       label: "Uitvoering",        val: "6",   unit: "lopend",    icon: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z", color: "#B45309" },
  { id: "werkvoorbereiding",label: "Werkvoorbereiding", val: "3",   unit: "open",      icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",   color: "#78350F" },
  { id: "calculatie",       label: "Calculatie",        val: "84K", unit: "EUR",       icon: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",   color: "#A16207" },
  { id: "oplevering",       label: "Oplevering",        val: "2",   unit: "gereed",    icon: "M22 11.08V12a10 10 0 1 1-5.93-9.14",                           color: "#166534" },
  { id: "onderhoud",        label: "Onderhoud",         val: "8",   unit: "werkorders", icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",                 color: "#991B1B" },
  { id: "hrm",              label: "HRM",               val: "12",  unit: "actief",    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",                    color: "#9D3D00" },
  { id: "magazijn",         label: "Magazijn",          val: "247", unit: "items",     icon: "M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9zM3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4", color: "#7C2D12" },
  { id: "inkoop",           label: "Inkoop",            val: "4",   unit: "open",      icon: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0", color: "#C2410C" },
  { id: "ai",               label: "AI Adviseur",       val: "3",   unit: "inzichten", icon: "M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24", color: "#B45309" },
];

const COPPER = "#C4943A";
const SIDEBAR = "#1C0C06";

function SvgIcon({ path, size = 16, color = "currentColor" }: { path: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

export function Dashboard() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [navHovered, setNavHovered] = useState<string | null>(null);

  const cardShadow = (isHovered: boolean) => isHovered
    ? `inset 0 1px 0 rgba(255,255,255,1),
       0 6px 14px rgba(60,20,0,0.1),
       0 20px 44px rgba(60,20,0,0.12),
       0 40px 72px rgba(60,20,0,0.06)`
    : `inset 0 1px 0 rgba(255,255,255,1),
       0 2px 5px rgba(60,20,0,0.05),
       0 8px 18px rgba(60,20,0,0.07),
       0 20px 40px rgba(60,20,0,0.04)`;

  return (
    <div style={{
      height: "100vh", width: "100%", display: "flex", overflow: "hidden",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#F5EDE2",
    }}>
      {/* Sidebar */}
      <div style={{
        width: 216, flexShrink: 0, background: SIDEBAR,
        display: "flex", flexDirection: "column", padding: "0 0 20px",
      }}>
        <div style={{
          padding: "24px 20px 22px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(145deg, #3d1a06 0%, #6b2d0e 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}>
            <svg width="15" height="13" viewBox="0 0 15 13" fill="none">
              <path d="M7.5 0L15 13H0L7.5 0Z" fill={COPPER} fillOpacity="0.95" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.3px" }}>FPS</div>
            <div style={{ fontSize: 11, color: `rgba(196,148,58,0.5)`, letterSpacing: "0.06em" }}>Connect</div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((item) => {
            const isActive = item.active;
            const isNavHov = navHovered === item.id;
            return (
              <div
                key={item.id}
                onMouseEnter={() => setNavHovered(item.id)}
                onMouseLeave={() => setNavHovered(null)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                  background: isActive ? "rgba(196,148,58,0.12)" : isNavHov ? "rgba(255,255,255,0.04)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <SvgIcon path={item.path} size={15} color={isActive ? COPPER : "rgba(255,255,255,0.4)"} />
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? COPPER : "rgba(255,255,255,0.4)" }}>
                  {item.label}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{
          margin: "0 12px", padding: "12px", borderRadius: 12,
          background: "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `linear-gradient(135deg, ${COPPER}, #8B6020)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
          }}>RV</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>René Vink</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>Hoofdbeheerder</div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          height: 64, flexShrink: 0,
          background: "rgba(245,237,226,0.8)",
          backdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(60,20,0,0.06)",
          padding: "0 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#1C0C06", letterSpacing: "-0.4px" }}>Goedemorgen, René</div>
            <div style={{ fontSize: 12, color: "#A0856A", marginTop: 1 }}>Zaterdag 5 juli 2026</div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#FFFFFF", borderRadius: 22, padding: "8px 16px",
            boxShadow: "0 1px 4px rgba(60,20,0,0.07), 0 4px 12px rgba(60,20,0,0.05)",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A0856A" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <span style={{ fontSize: 12.5, color: "#C0A080" }}>Zoeken in Connect...</span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "28px 32px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {MODULES.map((mod) => {
              const isHov = hovered === mod.id;
              const iconBg = mod.color + "12";
              return (
                <div
                  key={mod.id}
                  onMouseEnter={() => setHovered(mod.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: 20, padding: "22px 22px 20px",
                    cursor: "pointer",
                    boxShadow: cardShadow(isHov),
                    transform: isHov ? "translateY(-4px)" : "translateY(0)",
                    transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.24s ease",
                    display: "flex", flexDirection: "column", gap: 20,
                    minHeight: 160,
                    border: "1px solid rgba(255,255,255,0.9)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 13,
                      background: iconBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      boxShadow: `0 1px 0 rgba(255,255,255,0.8), 0 2px 8px ${mod.color}15`,
                    }}>
                      <SvgIcon path={mod.icon} size={18} color={mod.color} />
                    </div>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 4,
                      background: "#FFF8EE", borderRadius: 20, padding: "4px 10px",
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22C55E" }} />
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: "#16A34A", letterSpacing: "0.05em" }}>ACTIEF</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: "#A0806A", marginBottom: 6 }}>{mod.label}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 32, fontWeight: 700, color: "#1C0C06", letterSpacing: "-1.5px", lineHeight: 1 }}>{mod.val}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#C0A080" }}>{mod.unit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
