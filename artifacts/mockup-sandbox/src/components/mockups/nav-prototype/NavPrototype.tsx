import { useState } from "react";

type View =
  | "dashboard"
  | "gebouwen"
  | "gebouw-detail"
  | "planning"
  | "urenregistratie"
  | "gereedschappen"
  | "documenten"
  | "bibliotheek"
  | "berichten"
  | "relaties"
  | "personeel"
  | "hall-of-fame"
  | "beheer";

type GebouwTab =
  | "opnames"
  | "calculaties"
  | "werkvoorbereiding"
  | "uitvoering"
  | "oplevering"
  | "onderhoud";

const GEBOUWEN = [
  { id: 1, naam: "De Rode Molen", adres: "Industrieweg 14, Breda", spots: 84, status: "actief" },
  { id: 2, naam: "Kantoorpand Centrum", adres: "Marktstraat 2, Utrecht", spots: 42, status: "actief" },
  { id: 3, naam: "Logistiek Centrum Noord", adres: "Havenweg 88, Rotterdam", spots: 127, status: "actief" },
  { id: 4, naam: "Schoolgebouw Oost", adres: "Schoollaan 5, Eindhoven", spots: 31, status: "actief" },
];

const NAV_GROUPS = [
  {
    label: "Projecten",
    items: [
      { id: "gebouwen", label: "Gebouwen", icon: "🏢" },
    ],
  },
  {
    label: "Planning & Capaciteit",
    items: [
      { id: "planning", label: "Planning", icon: "📅" },
      { id: "urenregistratie", label: "Urenregistratie", icon: "⏱" },
      { id: "gereedschappen", label: "Gereedschappen", icon: "🔧" },
    ],
  },
  {
    label: "Documenten",
    items: [
      { id: "documenten", label: "Documenten", icon: "📄" },
      { id: "bibliotheek", label: "Bibliotheek", icon: "📚" },
    ],
  },
  {
    label: "Communicatie",
    items: [
      { id: "berichten", label: "Berichten", icon: "💬", badge: 3 },
      { id: "relaties", label: "Relaties", icon: "🤝" },
    ],
  },
  {
    label: "HRM",
    items: [
      { id: "personeel", label: "Personeel", icon: "👥" },
      { id: "hall-of-fame", label: "Hall of Fame", icon: "🏆" },
    ],
  },
];

const GEBOUW_TABS: { id: GebouwTab; label: string; beschrijving: string; icon: string }[] = [
  { id: "opnames", label: "Opnames", beschrijving: "Schouw locatie, registreer spots en documenteer de beginsituatie.", icon: "📋" },
  { id: "calculaties", label: "Calculaties", beschrijving: "Stel de projectbegroting op op basis van geregistreerde spots.", icon: "🧮" },
  { id: "werkvoorbereiding", label: "Werkvoorbereiding", beschrijving: "Plan materialen, monteurs en tijdsblokken vóór de uitvoering.", icon: "🔩" },
  { id: "uitvoering", label: "Uitvoering", beschrijving: "Volg de voortgang per spot en monteur tijdens het project.", icon: "👷" },
  { id: "oplevering", label: "Oplevering", beschrijving: "Genereer het opleverrapport en onderteken het digitaal.", icon: "✅" },
  { id: "onderhoud", label: "Onderhoud", beschrijving: "Beheer werkorders, periodieke keuringen en servicecontracten.", icon: "🛠" },
];

function SidebarItem({
  item,
  active,
  onClick,
}: {
  item: { id: string; label: string; icon: string; badge?: number };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-colors text-left ${
        active
          ? "bg-[#F23B0D] text-white font-medium"
          : "text-gray-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="text-base leading-none w-4 text-center">{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {item.badge && (
        <span className="bg-[#F23B0D] text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
          {item.badge}
        </span>
      )}
    </button>
  );
}

function DashboardView() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welkom terug — overzicht van vandaag</p>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Actieve gebouwen", waarde: "12", kleur: "bg-blue-50 border-blue-200", text: "text-blue-700" },
          { label: "Openstaande spots", waarde: "248", kleur: "bg-orange-50 border-orange-200", text: "text-orange-700" },
          { label: "Werkorders open", waarde: "7", kleur: "bg-amber-50 border-amber-200", text: "text-amber-700" },
          { label: "Inspecties deze maand", waarde: "34", kleur: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
        ].map((s) => (
          <div key={s.label} className={`rounded-lg border p-4 ${s.kleur}`}>
            <div className={`text-3xl font-bold ${s.text}`}>{s.waarde}</div>
            <div className="text-xs text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Recente activiteit</h2>
        <div className="space-y-2">
          {[
            { tekst: "Spot B-042 gekeurd", tijd: "10 min geleden", type: "✅" },
            { tekst: "Werkorder WO-2024-089 aangemaakt", tijd: "1 uur geleden", type: "🔧" },
            { tekst: "Oplevering De Rode Molen klaar voor review", tijd: "2 uur geleden", type: "📦" },
            { tekst: "Nieuwe opname gestart: Schoolgebouw Oost", tijd: "gisteren", type: "📋" },
          ].map((a, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0 text-sm">
              <span>{a.type}</span>
              <span className="flex-1 text-gray-700">{a.tekst}</span>
              <span className="text-gray-400 text-xs">{a.tijd}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GebouwenView({ onOpen }: { onOpen: (id: number) => void }) {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gebouwen</h1>
          <p className="text-gray-500 text-sm mt-1">Alle projecten op één plek</p>
        </div>
        <button className="flex items-center gap-2 bg-[#F23B0D] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#d63309] transition-colors">
          + Nieuw gebouw
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {GEBOUWEN.map((g) => (
          <button
            key={g.id}
            onClick={() => onOpen(g.id)}
            className="text-left rounded-lg border border-gray-200 bg-white p-5 hover:border-[#F23B0D] hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="h-10 w-10 rounded-lg bg-[#F23B0D]/10 flex items-center justify-center text-xl">🏢</div>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{g.status}</span>
            </div>
            <div className="font-semibold text-gray-900 group-hover:text-[#F23B0D] transition-colors">{g.naam}</div>
            <div className="text-sm text-gray-500 mt-0.5">{g.adres}</div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
              <span>{g.spots} spots</span>
              <span>→ open gebouw</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function GebouwDetailView({
  gebouwId,
  onTerug,
}: {
  gebouwId: number;
  onTerug: () => void;
}) {
  const [actieveTab, setActieveTab] = useState<GebouwTab>("opnames");
  const gebouw = GEBOUWEN.find((g) => g.id === gebouwId) ?? GEBOUWEN[0];
  const tab = GEBOUW_TABS.find((t) => t.id === actieveTab)!;

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb + header */}
      <div className="px-8 pt-6 pb-0 border-b border-gray-100 bg-white">
        <button onClick={onTerug} className="text-xs text-gray-400 hover:text-[#F23B0D] mb-3 flex items-center gap-1 transition-colors">
          ← Alle gebouwen
        </button>
        <div className="flex items-center gap-4 mb-4">
          <div className="h-12 w-12 rounded-xl bg-[#F23B0D]/10 flex items-center justify-center text-2xl flex-shrink-0">🏢</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{gebouw.naam}</h1>
            <p className="text-sm text-gray-500">{gebouw.adres} · {gebouw.spots} spots</p>
          </div>
        </div>

        {/* Workflow-tabs */}
        <div className="flex gap-0 -mb-px">
          {GEBOUW_TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActieveTab(t.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                actieveTab === t.id
                  ? "border-[#F23B0D] text-[#F23B0D] bg-orange-50/50"
                  : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
              {/* Stap-nummer */}
              <span
                className={`ml-0.5 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center ${
                  actieveTab === t.id ? "bg-[#F23B0D] text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {i + 1}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 p-8 bg-gray-50 overflow-auto">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-2xl shadow-sm">
              {tab.icon}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{tab.label}</h2>
              <p className="text-sm text-gray-500">{tab.beschrijving}</p>
            </div>
          </div>

          {actieveTab === "opnames" && <OpnamesContent />}
          {actieveTab === "calculaties" && <PlaceholderContent label="Calculaties" tekst="Nog geen calculatie gekoppeld aan dit gebouw." actie="Calculatie starten" />}
          {actieveTab === "werkvoorbereiding" && <PlaceholderContent label="Werkvoorbereiding" tekst="Plan materialen en monteurs vóór aanvang uitvoering." actie="Voorbereiding starten" />}
          {actieveTab === "uitvoering" && <UitvoeringContent />}
          {actieveTab === "oplevering" && <PlaceholderContent label="Oplevering" tekst="Genereer en onderteken het definitieve opleverrapport." actie="Rapport opstellen" />}
          {actieveTab === "onderhoud" && <OnderhoudContent />}
        </div>
      </div>
    </div>
  );
}

function OpnamesContent() {
  return (
    <div className="space-y-3">
      {[
        { naam: "Beginsituatie schouw", datum: "12 mei 2025", spots: 84, status: "Afgerond" },
        { naam: "Herbeoordeling verdieping 2", datum: "3 jun 2025", spots: 18, status: "In uitvoering" },
      ].map((o, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg flex-shrink-0">📋</div>
          <div className="flex-1">
            <div className="font-medium text-gray-800">{o.naam}</div>
            <div className="text-xs text-gray-400">{o.datum} · {o.spots} spots</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === "Afgerond" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
            {o.status}
          </span>
        </div>
      ))}
      <button className="w-full mt-2 border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-400 hover:border-[#F23B0D] hover:text-[#F23B0D] transition-colors">
        + Nieuwe opname starten
      </button>
    </div>
  );
}

function UitvoeringContent() {
  return (
    <div className="space-y-3">
      {[
        { spot: "B-041", monteur: "J. de Vries", status: "Klaar", type: "Branddeur" },
        { spot: "B-042", monteur: "M. Bakker", status: "In uitvoering", type: "Doorvoering" },
        { spot: "C-015", monteur: "J. de Vries", status: "Openstaand", type: "Brandklep" },
        { spot: "C-016", monteur: "—", status: "Openstaand", type: "Manchet" },
      ].map((r, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="font-mono text-sm font-bold text-gray-500 w-12 flex-shrink-0">{r.spot}</div>
          <div className="flex-1">
            <div className="font-medium text-gray-800">{r.type}</div>
            <div className="text-xs text-gray-400">Monteur: {r.monteur}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            r.status === "Klaar" ? "bg-emerald-100 text-emerald-700" :
            r.status === "In uitvoering" ? "bg-blue-100 text-blue-700" :
            "bg-gray-100 text-gray-500"
          }`}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function OnderhoudContent() {
  return (
    <div className="space-y-3">
      {[
        { nr: "WO-089", omschr: "Jaarlijkse keuring branddeuren", deadline: "30 jun 2025", prioriteit: "Hoog" },
        { nr: "WO-091", omschr: "Periodieke controle brandkleppen", deadline: "15 jul 2025", prioriteit: "Normaal" },
      ].map((w, i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-4">
          <div className="font-mono text-xs text-gray-400 w-16 flex-shrink-0">{w.nr}</div>
          <div className="flex-1">
            <div className="font-medium text-gray-800">{w.omschr}</div>
            <div className="text-xs text-gray-400">Deadline: {w.deadline}</div>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            w.prioriteit === "Hoog" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
          }`}>
            {w.prioriteit}
          </span>
        </div>
      ))}
      <button className="w-full mt-2 border border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-400 hover:border-[#F23B0D] hover:text-[#F23B0D] transition-colors">
        + Werkorder aanmaken
      </button>
    </div>
  );
}

function PlaceholderContent({ label, tekst, actie }: { label: string; tekst: string; actie: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <p className="text-gray-400 text-sm mb-4">{tekst}</p>
      <button className="bg-[#F23B0D] text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-[#d63309] transition-colors">
        {actie}
      </button>
    </div>
  );
}

function GenericView({ label }: { label: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{label}</h1>
      <p className="text-gray-500 text-sm">Dit scherm is onderdeel van het navigatieprototype.</p>
      <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-400 text-sm">
        Scherminhoud voor {label} — wordt in de echte implementatie gevuld.
      </div>
    </div>
  );
}

export function NavPrototype() {
  const [view, setView] = useState<View>("dashboard");
  const [selectedGebouwId, setSelectedGebouwId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function navigeer(v: View) {
    setView(v);
    if (v !== "gebouw-detail") setSelectedGebouwId(null);
  }

  function openGebouw(id: number) {
    setSelectedGebouwId(id);
    setView("gebouw-detail");
  }

  const isActief = (v: View) => {
    if (v === "gebouwen" && (view === "gebouwen" || view === "gebouw-detail")) return true;
    return view === v;
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col bg-[#212631] transition-all duration-200 flex-shrink-0 h-full"
        style={{ width: sidebarOpen ? 220 : 52 }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 py-4 border-b border-white/10">
          <div
            className="h-7 w-7 rounded-md flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
            style={{ backgroundColor: "#F23B0D" }}
          >
            FPS
          </div>
          {sidebarOpen && (
            <span className="text-white font-semibold text-sm leading-tight">FPS Connect</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-gray-500 hover:text-white transition-colors text-xs p-1"
            title={sidebarOpen ? "Samenvouwen" : "Uitklappen"}
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {/* Dashboard */}
        <div className="px-2 py-2 border-b border-white/10">
          <button
            onClick={() => navigeer("dashboard")}
            className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
              view === "dashboard"
                ? "bg-[#F23B0D] text-white font-medium"
                : "text-gray-300 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="text-base leading-none w-4 text-center flex-shrink-0">🏠</span>
            {sidebarOpen && <span>Dashboard</span>}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-0.5">
              {sidebarOpen && (
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-2 pt-3 pb-1">
                  {group.label}
                </div>
              )}
              {!sidebarOpen && <div className="border-t border-white/10 my-1" />}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigeer(item.id as View)}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    isActief(item.id as View)
                      ? "bg-[#F23B0D] text-white font-medium"
                      : "text-gray-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none w-4 text-center flex-shrink-0">{item.icon}</span>
                  {sidebarOpen && <span className="flex-1 text-left">{item.label}</span>}
                  {sidebarOpen && item.badge && (
                    <span className="bg-[#F23B0D] text-white text-[10px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}

          {/* Beheer */}
          <div className="space-y-0.5">
            {sidebarOpen && (
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold px-2 pt-3 pb-1">
                Beheer
              </div>
            )}
            {!sidebarOpen && <div className="border-t border-white/10 my-1" />}
            <button
              onClick={() => navigeer("beheer")}
              title={!sidebarOpen ? "Beheer" : undefined}
              className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors ${
                view === "beheer"
                  ? "bg-[#F23B0D] text-white font-medium"
                  : "text-gray-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="text-base leading-none w-4 text-center flex-shrink-0">⚙️</span>
              {sidebarOpen && <span className="flex-1 text-left">Beheer</span>}
            </button>
          </div>
        </nav>

        {/* Gebruiker footer */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-[#F23B0D]/30 flex items-center justify-center text-xs text-white font-semibold flex-shrink-0">
              JD
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <div className="text-xs text-white font-medium truncate">Jan de Groot</div>
                <div className="text-[10px] text-gray-500 truncate">Hoofdbeheerder</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-white">
        {view === "dashboard" && <DashboardView />}
        {view === "gebouwen" && <GebouwenView onOpen={openGebouw} />}
        {view === "gebouw-detail" && selectedGebouwId && (
          <GebouwDetailView
            gebouwId={selectedGebouwId}
            onTerug={() => navigeer("gebouwen")}
          />
        )}
        {view === "planning" && <GenericView label="Planning" />}
        {view === "urenregistratie" && <GenericView label="Urenregistratie" />}
        {view === "gereedschappen" && <GenericView label="Gereedschappen" />}
        {view === "documenten" && <GenericView label="Documenten" />}
        {view === "bibliotheek" && <GenericView label="Bibliotheek" />}
        {view === "berichten" && <GenericView label="Berichten" />}
        {view === "relaties" && <GenericView label="Relaties" />}
        {view === "personeel" && <GenericView label="Personeel" />}
        {view === "hall-of-fame" && <GenericView label="Hall of Fame" />}
        {view === "beheer" && <GenericView label="Beheer" />}
      </main>
    </div>
  );
}
