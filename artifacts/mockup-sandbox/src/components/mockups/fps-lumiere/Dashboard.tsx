import React, { useState } from "react";
import { Building2, FileText, ClipboardList, Sparkles, Calendar, BarChart3, Settings, Search, Bell, ArrowUpRight, AlertTriangle } from "lucide-react";

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
  { name: "Orionfiat", city: "Enschede", spots: 147, status: 98 },
  { name: "Gemeentehuis Hengelo", city: "Hengelo", spots: 84, status: 91 },
  { name: "ROC Twente", city: "Enschede", spots: 212, status: 76 },
  { name: "Brandweer Rotterdam Noord", city: "Rotterdam", spots: 63, status: 100 },
];

const alerts = [
  { label: "Branddeurcertificaat verloopt", sub: "Orionfiat — 3e verdieping", level: "warn" as const },
  { label: "Onderhoud lift installatie", sub: "Gemeentehuis Hengelo", level: "warn" as const },
  { label: "Document verouderd", sub: "ROC Twente — Bouwkundig rapport", level: "alert" as const },
];

export function Dashboard() {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{
      display: "flex", height: "100vh", width: "100%", overflow: "hidden",
      fontFamily: "'SF Pro Display','Inter','Helvetica Neue',sans-serif",
      background: "#F8F8F6",
      color: "#0A0A0A",
    }}>

      {/* Sidebar — pure white, almost invisible */}
      <aside style={{
        width: 200,
        background: "#FFFFFF",
        borderRight: "1px solid rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        padding: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: "28px 24px 24px" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.5px", color: "#0A0A0A" }}>
            FPS <span style={{ fontWeight: 300, color: "#888" }}>ONE</span>
          </div>
        </div>

        {/* Nav — minimal, no icons, just labels */}
        <nav style={{ flex: 1, padding: "0 0 0 0" }}>
          {nav.map((item, i) => (
            <div key={i} style={{
              padding: "10px 24px",
              fontSize: 13,
              fontWeight: item.active ? 600 : 400,
              color: item.active ? "#0A0A0A" : "#888",
              borderLeft: item.active ? "2px solid #0A0A0A" : "2px solid transparent",
              cursor: "pointer",
              letterSpacing: "-0.1px",
            }}>
              {item.label}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "20px 24px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0A0A0A" }}>René Vink</div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 2 }}>Hoofdbeheerder</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", background: "#F8F8F6" }}>

        {/* Header bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 48px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
          background: "rgba(255,255,255,0.8)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          position: "sticky", top: 0, zIndex: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#888", textTransform: "uppercase" }}>
            Goedemorgen, René
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#F0F0EE", borderRadius: 20, padding: "7px 14px",
            }}>
              <Search size={12} color="#888" />
              <span style={{ fontSize: 12, color: "#aaa" }}>Zoeken...</span>
            </div>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: "#F0F0EE",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={13} color="#666" />
            </div>
          </div>
        </div>

        <div style={{ padding: "48px 48px 60px" }}>

          {/* Hero numbers — sculptural, enormous */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, marginBottom: 64, background: "rgba(0,0,0,0.06)" }}>
            {[
              { n: "25", label: "Gebouwen actief" },
              { n: "842", label: "Documenten totaal" },
              { n: "3", label: "Acties vandaag" },
              { n: "98%", label: "Compliance gemiddeld" },
            ].map((m, i) => (
              <div key={i} style={{
                background: "#FFFFFF",
                padding: "36px 32px",
              }}>
                <div style={{
                  fontSize: 56,
                  fontWeight: 200,
                  letterSpacing: "-3px",
                  lineHeight: 1,
                  color: "#0A0A0A",
                  marginBottom: 12,
                }}>{m.n}</div>
                <div style={{ fontSize: 11, fontWeight: 500, color: "#888", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Two column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 48 }}>

            {/* Project list — editorial, magazine */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#888", textTransform: "uppercase", marginBottom: 24 }}>
                Actieve Projecten
              </div>
              <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                {projects.map((p, i) => (
                  <div
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "22px 0",
                      borderBottom: "1px solid rgba(0,0,0,0.08)",
                      cursor: "pointer",
                      opacity: hovered !== null && hovered !== i ? 0.35 : 1,
                      transition: "opacity 0.2s ease",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-0.8px", color: "#0A0A0A", marginBottom: 5 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "0.05em" }}>{p.city} &nbsp;·&nbsp; {p.spots} spots</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: "-1px", color: p.status >= 95 ? "#0A0A0A" : p.status >= 80 ? "#666" : "#E53935" }}>{p.status}%</div>
                        <div style={{ fontSize: 10, color: "#aaa", letterSpacing: "0.05em" }}>COMPLIANT</div>
                      </div>
                      <ArrowUpRight size={16} color="#ccc" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div>
              {/* Signaleringen */}
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#888", textTransform: "uppercase", marginBottom: 18 }}>
                  AI Signaleringen
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{
                      background: "#FFFFFF",
                      borderRadius: 10,
                      padding: "14px 16px",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                    }}>
                      <AlertTriangle size={13} color={a.level === "warn" ? "#E8A020" : "#E53935"} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500, color: "#0A0A0A", marginBottom: 2 }}>{a.label}</div>
                        <div style={{ fontSize: 11, color: "#aaa" }}>{a.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recente activiteit */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#888", textTransform: "uppercase", marginBottom: 18 }}>
                  Recente Activiteit
                </div>
                {[
                  { label: "Inspectie afgerond", sub: "Orionfiat · 09:15" },
                  { label: "Document toegevoegd", sub: "ROC Twente · 08:42" },
                  { label: "Werkorder aangemaakt", sub: "Gisteren · 16:30" },
                ].map((a, i) => (
                  <div key={i} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    padding: "12px 0",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                  }}>
                    <div style={{ fontSize: 12.5, fontWeight: 400, color: "#0A0A0A" }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap", marginLeft: 12 }}>{a.sub}</div>
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
