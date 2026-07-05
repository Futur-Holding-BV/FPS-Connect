import React, { useState } from "react";
import { Search, Bell, ArrowUpRight, AlertTriangle, Shield, ChevronRight } from "lucide-react";

const nav = [
  { code: "01", label: "Ontvangsthal", active: true },
  { code: "02", label: "Gebouwbeheer" },
  { code: "03", label: "Documenten" },
  { code: "04", label: "Taken" },
  { code: "05", label: "AI Adviseur" },
  { code: "06", label: "Planning" },
  { code: "07", label: "Rapportages" },
  { code: "08", label: "Instellingen" },
];

const projects = [
  { name: "Orionfiat", city: "Enschede", spots: 147, status: 98 },
  { name: "Gemeentehuis Hengelo", city: "Hengelo", spots: 84, status: 91 },
  { name: "ROC Twente", city: "Enschede", spots: 212, status: 76 },
  { name: "Brandweer Rotterdam Noord", city: "Rotterdam", spots: 63, status: 100 },
];

const BLUE = "#3B82F6";
const BLUE_DIM = "rgba(59,130,246,0.10)";

export function Dashboard() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100%", overflow: "hidden",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#F2F5F9",
      color: "#0C1526",
    }}>

      {/* Sidebar — engineered, precision */}
      <aside style={{
        width: 200,
        background: "#FFFFFF",
        borderRight: "1px solid rgba(12,21,38,0.07)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: "26px 24px", borderBottom: "1px solid rgba(12,21,38,0.06)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.08em", color: "#0C1526" }}>FPS</span>
            <span style={{ fontSize: 11, fontWeight: 400, letterSpacing: "0.12em", color: BLUE }}>CONNECT</span>
          </div>
        </div>

        {/* Nav with codes */}
        <nav style={{ flex: 1, padding: "14px 0" }}>
          {nav.map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 20px",
              cursor: "pointer",
              borderLeft: item.active ? `2px solid ${BLUE}` : "2px solid transparent",
              background: item.active ? BLUE_DIM : "transparent",
            }}>
              <span style={{
                fontSize: 9, fontWeight: 600, letterSpacing: "0.08em",
                color: item.active ? BLUE : "rgba(12,21,38,0.25)",
                fontVariantNumeric: "tabular-nums",
                fontFamily: "monospace",
              }}>{item.code}</span>
              <span style={{
                fontSize: 12.5,
                fontWeight: item.active ? 600 : 400,
                color: item.active ? "#0C1526" : "rgba(12,21,38,0.45)",
              }}>{item.label}</span>
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(12,21,38,0.06)" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 4,
              background: `linear-gradient(135deg, ${BLUE} 0%, #1D4ED8 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0,
            }}>RV</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#0C1526" }}>René Vink</div>
              <div style={{ fontSize: 9.5, color: "rgba(12,21,38,0.35)", letterSpacing: "0.05em" }}>HOOFDBEHEERDER</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto" }}>

        {/* Top bar — HMI style */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 44px",
          height: 52,
          background: "#FFFFFF",
          borderBottom: "1px solid rgba(12,21,38,0.07)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", color: "rgba(12,21,38,0.35)", textTransform: "uppercase" }}>
              Goedemorgen, René
            </div>
            {/* Status pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 20, padding: "3px 10px",
            }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22C55E" }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: "#16A34A", letterSpacing: "0.06em" }}>ALLE SYSTEMEN OPERATIONEEL</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              background: "#F2F5F9", borderRadius: 6,
              padding: "6px 12px", border: "1px solid rgba(12,21,38,0.07)",
            }}>
              <Search size={12} color="rgba(12,21,38,0.35)" />
              <span style={{ fontSize: 11.5, color: "rgba(12,21,38,0.3)" }}>Zoeken...</span>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: "#F2F5F9", border: "1px solid rgba(12,21,38,0.07)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={13} color="rgba(12,21,38,0.4)" />
            </div>
          </div>
        </div>

        <div style={{ padding: "40px 44px 60px" }}>

          {/* Metric panels — automotive instrument cluster */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 48 }}>
            {[
              { n: "25", label: "Gebouwen", unit: "actief" },
              { n: "842", label: "Documenten", unit: "totaal" },
              { n: "3", label: "Acties", unit: "vandaag" },
              { n: "98%", label: "Compliance", unit: "gemiddeld" },
            ].map((m, i) => (
              <div key={i} style={{
                background: "#FFFFFF",
                border: "1px solid rgba(12,21,38,0.07)",
                borderRadius: 10,
                padding: "24px 22px",
                position: "relative",
                overflow: "hidden",
              }}>
                {/* Blue top accent */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: BLUE, opacity: i === 0 ? 1 : 0.25 }} />
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.14em",
                  color: "rgba(12,21,38,0.3)", textTransform: "uppercase",
                  fontFamily: "monospace",
                  marginBottom: 10,
                }}>{m.unit}</div>
                <div style={{
                  fontSize: 44, fontWeight: 300, letterSpacing: "-2.5px",
                  lineHeight: 1, color: "#0C1526", marginBottom: 8,
                }}>{m.n}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: BLUE, letterSpacing: "0.06em" }}>{m.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", gap: 40 }}>

            {/* Project table — precision engineered */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(12,21,38,0.3)", textTransform: "uppercase", marginBottom: 16 }}>
                Actieve Projecten
              </div>

              {/* Table header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 80px 90px 28px",
                padding: "8px 0",
                borderBottom: "2px solid rgba(12,21,38,0.08)",
                marginBottom: 0,
              }}>
                {["Project", "Spots", "Status", ""].map((h, i) => (
                  <div key={i} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", color: "rgba(12,21,38,0.3)", textTransform: "uppercase", fontFamily: "monospace" }}>{h}</div>
                ))}
              </div>

              {projects.map((p, i) => (
                <div
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 90px 28px",
                    padding: "18px 0",
                    borderBottom: "1px solid rgba(12,21,38,0.06)",
                    alignItems: "center",
                    cursor: "pointer",
                    opacity: hovered !== null && hovered !== i ? 0.3 : 1,
                    transition: "opacity 0.15s",
                    background: hovered === i ? "rgba(59,130,246,0.03)" : "transparent",
                    borderRadius: 4,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: "#0C1526", letterSpacing: "-0.3px", marginBottom: 3 }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(12,21,38,0.35)", letterSpacing: "0.03em" }}>{p.city}</div>
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: "rgba(12,21,38,0.6)",
                    fontFamily: "monospace", letterSpacing: "-0.5px",
                  }}>{p.spots}</div>
                  <div>
                    <div style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      background: p.status >= 95 ? BLUE_DIM : p.status >= 85 ? "rgba(12,21,38,0.04)" : "rgba(239,68,68,0.06)",
                      border: `1px solid ${p.status >= 95 ? "rgba(59,130,246,0.25)" : p.status >= 85 ? "rgba(12,21,38,0.08)" : "rgba(239,68,68,0.2)"}`,
                      borderRadius: 4, padding: "4px 8px",
                    }}>
                      {p.status >= 95 ? <Shield size={10} color={BLUE} /> : <AlertTriangle size={10} color={p.status >= 85 ? "rgba(12,21,38,0.4)" : "#EF4444"} />}
                      <span style={{
                        fontSize: 12, fontWeight: 600, fontFamily: "monospace",
                        color: p.status >= 95 ? BLUE : p.status >= 85 ? "rgba(12,21,38,0.6)" : "#EF4444",
                      }}>{p.status}%</span>
                    </div>
                  </div>
                  <ArrowUpRight size={14} color={hovered === i ? BLUE : "rgba(12,21,38,0.15)"} />
                </div>
              ))}
            </div>

            {/* Right panel */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(12,21,38,0.3)", textTransform: "uppercase", marginBottom: 16 }}>
                Signaleringen
              </div>

              {[
                { label: "Branddeurcertificaat verloopt", sub: "Orionfiat — 3e verdieping", lvl: "warn" as const },
                { label: "Onderhoud lift installatie", sub: "Gemeentehuis Hengelo", lvl: "warn" as const },
                { label: "Document verouderd", sub: "ROC Twente", lvl: "alert" as const },
              ].map((a, i) => (
                <div key={i} style={{
                  background: "#FFFFFF",
                  border: "1px solid rgba(12,21,38,0.07)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  marginBottom: 8,
                  display: "flex", gap: 10, alignItems: "flex-start",
                  cursor: "pointer",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: a.lvl === "warn" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <AlertTriangle size={13} color={a.lvl === "warn" ? "#F59E0B" : "#EF4444"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: "#0C1526", marginBottom: 2 }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(12,21,38,0.4)" }}>{a.sub}</div>
                  </div>
                  <ChevronRight size={13} color="rgba(12,21,38,0.2)" style={{ flexShrink: 0, marginTop: 2 }} />
                </div>
              ))}

              <div style={{ marginTop: 32 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: "rgba(12,21,38,0.3)", textTransform: "uppercase", marginBottom: 16 }}>
                  Recente Activiteit
                </div>
                {[
                  { label: "Inspectie afgerond", sub: "Orionfiat · 09:15" },
                  { label: "Document toegevoegd", sub: "ROC Twente · 08:42" },
                  { label: "Werkorder aangemaakt", sub: "Gisteren · 16:30" },
                ].map((a, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                    padding: "11px 0",
                    borderBottom: "1px solid rgba(12,21,38,0.05)",
                  }}>
                    <div style={{ fontSize: 12, color: "#0C1526" }}>{a.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(12,21,38,0.3)", whiteSpace: "nowrap", marginLeft: 12, fontFamily: "monospace" }}>{a.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
