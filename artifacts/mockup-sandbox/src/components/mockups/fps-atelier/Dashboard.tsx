import React, { useState } from "react";
import { Search, Bell, ArrowUpRight, AlertTriangle, TrendingUp, Shield } from "lucide-react";

const nav = [
  { label: "Ontvangsthal", active: true },
  { label: "Gebouwbeheer" },
  { label: "Documenten" },
  { label: "Taken" },
  { label: "AI Adviseur" },
  { label: "Planning" },
  { label: "Rapportages" },
  { label: "Instellingen" },
];

const projects = [
  { name: "Orionfiat", city: "Enschede", spots: 147, status: 98, trend: "up" as const },
  { name: "Gemeentehuis Hengelo", city: "Hengelo", spots: 84, status: 91, trend: "up" as const },
  { name: "ROC Twente", city: "Enschede", spots: 212, status: 76, trend: "down" as const },
  { name: "Brandweer Rotterdam", city: "Rotterdam", spots: 63, status: 100, trend: "up" as const },
];

const COPPER = "#C4943A";
const COPPER_DIM = "rgba(196,148,58,0.12)";

export function Dashboard() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100%", overflow: "hidden",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#0D0D10",
      color: "#E8E4DC",
    }}>

      {/* Sidebar */}
      <aside style={{
        width: 200,
        background: "#0A0A0D",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: "28px 24px 32px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.3px", color: "#E8E4DC" }}>FPS</span>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.25em",
              color: COPPER, textTransform: "uppercase",
            }}>Connect</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "16px 0" }}>
          {nav.map((item, i) => (
            <div key={i} style={{
              padding: "9px 24px",
              fontSize: 12.5,
              fontWeight: item.active ? 500 : 400,
              color: item.active ? COPPER : "rgba(232,228,220,0.35)",
              borderLeft: item.active ? `1px solid ${COPPER}` : "1px solid transparent",
              cursor: "pointer",
              letterSpacing: "0.01em",
              transition: "color 0.15s",
            }}>
              {item.label}
            </div>
          ))}
        </nav>

        {/* Divider + user */}
        <div style={{ padding: "18px 24px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "#E8E4DC" }}>René Vink</div>
          <div style={{ fontSize: 10.5, color: "rgba(232,228,220,0.35)", marginTop: 2, letterSpacing: "0.04em" }}>HOOFDBEHEERDER</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", background: "#0D0D10" }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 48px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: "rgba(13,13,16,0.9)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", color: "rgba(232,228,220,0.3)", textTransform: "uppercase" }}>
            Goedemorgen, René
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 20, padding: "7px 14px",
            }}>
              <Search size={12} color="rgba(232,228,220,0.3)" />
              <span style={{ fontSize: 12, color: "rgba(232,228,220,0.25)" }}>Zoeken...</span>
            </div>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={13} color="rgba(232,228,220,0.4)" />
            </div>
          </div>
        </div>

        <div style={{ padding: "52px 48px 60px" }}>

          {/* Metrics — instrument-gauge style */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, marginBottom: 64, background: "rgba(255,255,255,0.04)" }}>
            {[
              { n: "25", label: "Gebouwen", unit: "actief" },
              { n: "842", label: "Documenten", unit: "totaal" },
              { n: "3", label: "Acties", unit: "vandaag" },
              { n: "98%", label: "Compliance", unit: "gemiddeld" },
            ].map((m, i) => (
              <div key={i} style={{ background: "#111115", padding: "36px 30px" }}>
                {/* Copper rule on top */}
                <div style={{ width: 24, height: 1, background: COPPER, marginBottom: 20 }} />
                <div style={{
                  fontSize: 52,
                  fontWeight: 200,
                  letterSpacing: "-3px",
                  lineHeight: 1,
                  color: "#E8E4DC",
                  marginBottom: 10,
                }}>{m.n}</div>
                <div style={{ fontSize: 11, color: COPPER, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: "rgba(232,228,220,0.25)", letterSpacing: "0.08em" }}>{m.unit}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 56 }}>

            {/* Project list */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", color: "rgba(232,228,220,0.3)", textTransform: "uppercase", marginBottom: 24 }}>
                Actieve Projecten
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {projects.map((p, i) => (
                  <div
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "22px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      opacity: hovered !== null && hovered !== i ? 0.25 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <div>
                      <div style={{
                        fontSize: 20, fontWeight: 300, letterSpacing: "-0.5px",
                        color: hovered === i ? "#E8E4DC" : "rgba(232,228,220,0.75)",
                        marginBottom: 5,
                      }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: "rgba(232,228,220,0.28)", letterSpacing: "0.06em" }}>{p.city} &nbsp;·&nbsp; {p.spots} SPOTS</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: p.status >= 95 ? COPPER_DIM : "rgba(255,255,255,0.04)",
                        border: p.status >= 95 ? `1px solid rgba(196,148,58,0.25)` : "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 6, padding: "6px 12px",
                      }}>
                        {p.status >= 95 ? (
                          <Shield size={11} color={COPPER} />
                        ) : (
                          <AlertTriangle size={11} color="rgba(232,228,220,0.4)" />
                        )}
                        <span style={{
                          fontSize: 13, fontWeight: 500,
                          color: p.status >= 95 ? COPPER : "rgba(232,228,220,0.5)",
                          letterSpacing: "-0.3px",
                        }}>{p.status}%</span>
                      </div>
                      <ArrowUpRight size={14} color="rgba(232,228,220,0.2)" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right panel */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", color: "rgba(232,228,220,0.3)", textTransform: "uppercase", marginBottom: 18 }}>
                Signaleringen
              </div>

              {[
                { label: "Branddeurcertificaat verloopt", sub: "Orionfiat — 3e verdieping", lvl: "warn" as const },
                { label: "Onderhoud lift installatie", sub: "Gemeentehuis Hengelo", lvl: "warn" as const },
                { label: "Document verouderd", sub: "ROC Twente", lvl: "alert" as const },
              ].map((a, i) => (
                <div key={i} style={{
                  background: "#111115",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8,
                  padding: "13px 15px",
                  marginBottom: 10,
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <div style={{
                    width: 3, flexShrink: 0, alignSelf: "stretch", borderRadius: 2,
                    background: a.lvl === "warn" ? "#E8A020" : "#E53935",
                  }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#E8E4DC", marginBottom: 3 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(232,228,220,0.3)" }}>{a.sub}</div>
                  </div>
                </div>
              ))}

              <div style={{ marginTop: 40 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.18em", color: "rgba(232,228,220,0.3)", textTransform: "uppercase", marginBottom: 18 }}>
                  Recente Activiteit
                </div>
                {[
                  { label: "Inspectie afgerond", sub: "Orionfiat · 09:15" },
                  { label: "Document toegevoegd", sub: "ROC Twente · 08:42" },
                  { label: "Werkorder aangemaakt", sub: "Gisteren · 16:30" },
                ].map((a, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "11px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}>
                    <div style={{ fontSize: 12, color: "rgba(232,228,220,0.7)" }}>{a.label}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(232,228,220,0.25)", whiteSpace: "nowrap", marginLeft: 12 }}>{a.sub}</div>
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
