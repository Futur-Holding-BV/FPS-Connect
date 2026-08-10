import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  Search, Settings2, Users, ShieldCheck, KeyRound, ShieldAlert,
  Bot, Activity, ScrollText, HardDrive, Upload, HardDriveUpload,
  Mail, MessageSquarePlus, LifeBuoy, Smartphone, Info, ListChecks,
  BarChart3, FileArchive, Target, Package, Award, ImageIcon, BookOpen,
  Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { magIetsImporteren } from "@/lib/import-rechten";
import { useRol } from "@/context/rol-context";

type InstItem = {
  label: string;
  pad: string;
  icoon: React.ComponentType<{ className?: string }>;
  beschrijving: string;
  zichtbaar: boolean;
};

type Groep = {
  id: string;
  titel: string;
  items: InstItem[];
};

export default function InstellingenPagina() {
  const [zoek, setZoek] = useState("");
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();
  const isHoofdbeheerder = rol === "hoofdbeheerder";
  const toonSysteem = heeftNiveau("systeem", 1);
  const toonGebruikers = heeftNiveau("gebruikers", 1);
  const toonBibliotheek = heeftNiveau("bibliotheek", 1);
  const toonInkoopStamgegevens = heeftNiveau("offertes", 1);

  const groepen: Groep[] = useMemo(() => [
    {
      id: "toegang",
      titel: "Toegang & Rechten",
      items: [
        {
          label: "Gebruikers",
          pad: "/gebruikers",
          icoon: Users,
          beschrijving: "Gebruikersaccounts aanmaken, bewerken en deactiveren",
          zichtbaar: toonGebruikers,
        },
        {
          label: "Profielen",
          pad: "/beheer/profielen",
          icoon: ShieldCheck,
          beschrijving: "Toegangsprofielen en standaard-presets beheren",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Rollen & Rechten",
          pad: "/beheer/rollen-rechten",
          icoon: KeyRound,
          beschrijving: "Rollen configureren en module-bevoegdheden toewijzen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Object-rechten",
          pad: "/beheer/object-rechten",
          icoon: ShieldCheck,
          beschrijving: "Gebouw- en objectspecifieke toegangsrechten instellen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Meting inkoopgebruik",
          pad: "/beheer/metingen-materiaal",
          icoon: ShieldCheck,
          beschrijving: "MATERIAAL_01: telling van alle inkoopsporen + werkbak-herstelronde",
          zichtbaar: isHoofdbeheerder,
        },
      ],
    },
    {
      // NP_INKOOP_01 — stamgegevens verhuisd uit het (opgeheven) sidebar-hoofdstuk Inkoop.
      id: "inkoop-stamgegevens",
      titel: "Inkoop-stamgegevens",
      items: [
        {
          label: "Leveranciers",
          pad: "/leveranciers",
          icoon: Truck,
          beschrijving: "Leveranciersregister beheren (adressen, contactpersonen, voorwaarden)",
          zichtbaar: toonInkoopStamgegevens,
        },
        {
          label: "Artikelen",
          pad: "/artikelen",
          icoon: Package,
          beschrijving: "Artikelbestand en prijzen voor inkoop en calculatie beheren",
          zichtbaar: toonInkoopStamgegevens,
        },
      ],
    },
    {
      id: "beveiliging",
      titel: "Systeem & Beveiliging",
      items: [
        {
          label: "Login-pogingen",
          pad: "/beheer/login-pogingen",
          icoon: ShieldAlert,
          beschrijving: "Mislukte inlogpogingen en verdachte activiteit volgen",
          zichtbaar: toonSysteem,
        },
        {
          label: "Beveiliging & Intake",
          pad: "/beheer/security-intake",
          icoon: ShieldAlert,
          beschrijving: "Beveiligingsinstellingen en intakecontroles beheren",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Governance & Risico",
          pad: "/beheer/governance-risico",
          icoon: ShieldAlert,
          beschrijving: "Goedkeuringsbeleid en risicobeheersing configureren",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "AI-governance",
          pad: "/beheer/ai-governance",
          icoon: ShieldAlert,
          beschrijving: "Beleidsregels en limieten voor AI-gebruik instellen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Security Validation",
          pad: "/beheer/security-validation",
          icoon: ShieldCheck,
          beschrijving: "Geautomatiseerde beveiligingsvalidaties uitvoeren",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Privacy AVG-matrix",
          pad: "/beheer/privacy",
          icoon: ShieldCheck,
          beschrijving: "Persoonsgegevensverwerking en AVG-registers bijhouden",
          zichtbaar: toonSysteem,
        },
        {
          label: "AVG-verzoeken",
          pad: "/beheer/avg",
          icoon: ShieldAlert,
          beschrijving: "Inzage-, correctie- en verwijderverzoeken afhandelen",
          zichtbaar: toonSysteem,
        },
        {
          label: "Mailinstellingen",
          pad: "/beheer/mail",
          icoon: Mail,
          beschrijving: "E-mailserver, afzenderadres en berichtsjablonen",
          zichtbaar: toonSysteem,
        },
      ],
    },
    {
      id: "ai",
      titel: "AI-tools",
      items: [
        {
          label: "AI-aanroepen",
          pad: "/beheer/ai-aanroepen",
          icoon: Bot,
          beschrijving: "Overzicht en verbruik van AI-API-aanroepen per module",
          zichtbaar: isHoofdbeheerder && toonSysteem,
        },
        {
          label: "AI-statistieken",
          pad: "/beheer/ai-log",
          icoon: Bot,
          beschrijving: "Logs en prestatiegegevens van AI-functies inzien",
          zichtbaar: toonSysteem,
        },
        {
          label: "Automation Engine",
          pad: "/beheer/biae",
          icoon: Activity,
          beschrijving: "Geautomatiseerde processen en bedrijfsregels beheren",
          zichtbaar: toonSysteem,
        },
      ],
    },
    {
      id: "data",
      titel: "Data & Export",
      items: [
        {
          label: "Audit trail",
          pad: "/beheer/audit",
          icoon: ScrollText,
          beschrijving: "Volledige loghistorie van alle systeemacties inzien",
          zichtbaar: toonSysteem,
        },
        {
          label: "Back-up & Herstel",
          pad: "/beheer/backup",
          icoon: HardDrive,
          beschrijving: "Databaseback-ups aanmaken en terugzetten",
          zichtbaar: toonSysteem,
        },
        {
          label: "Importeren",
          pad: "/beheer/import",
          icoon: Upload,
          beschrijving: "Gegevens importeren vanuit externe bestanden",
          zichtbaar: magIetsImporteren(heeftNiveau),
        },
        {
          label: "Toolbox",
          pad: "/toolbox",
          icoon: HardDriveUpload,
          beschrijving: "Bestandsbeheer en opslagtools voor beheerders",
          zichtbaar: toonSysteem,
        },
        {
          label: "Gebouwenarchief",
          pad: "/beheer/gebouwen-archief",
          icoon: FileArchive,
          beschrijving: "Gearchiveerde projecten bekijken en desgewenst herstellen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Visual Library",
          pad: "/beheer/visual-library",
          icoon: ImageIcon,
          beschrijving: "Gedeelde afbeeldingen en visuele assets beheren",
          zichtbaar: toonSysteem,
        },
        {
          label: "Bibliotheek",
          pad: "/beheer/bibliotheek",
          icoon: BookOpen,
          beschrijving: "Toepassingen, labels en producten beheren",
          zichtbaar: toonBibliotheek,
        },
      ],
    },
    {
      id: "ondersteuning",
      titel: "Ondersteuning",
      items: [
        {
          label: "Systeemstatus",
          pad: "/beheer/herstel",
          icoon: Activity,
          beschrijving: "Live status van alle systeemservices en connecties",
          zichtbaar: toonSysteem,
        },
        {
          label: "Helpdesk",
          pad: "/beheer/helpdesk",
          icoon: LifeBuoy,
          beschrijving: "Supporttickets en hulpverzoeken van gebruikers beheren",
          zichtbaar: toonSysteem,
        },
        {
          label: "Feedback",
          pad: "/beheer/feedback",
          icoon: MessageSquarePlus,
          beschrijving: "Gebruikersfeedback en verbeterverzoeken inzien",
          zichtbaar: toonSysteem,
        },
        {
          label: "Meldingen",
          pad: "/beheer/meldingen",
          icoon: MessageSquarePlus,
          beschrijving: "Systeem- en pushnotificaties configureren",
          zichtbaar: toonSysteem,
        },
        {
          label: "Ontwikkelstatus",
          pad: "/beheer/ontwikkelstatus",
          icoon: ListChecks,
          beschrijving: "Status van modules en release-beoordelingen inzien",
          zichtbaar: toonSysteem,
        },
        {
          label: "Projectstatus",
          pad: "/beheer/projectstatus",
          icoon: BarChart3,
          beschrijving: "Overzicht van projectvoortgang en statistieken",
          zichtbaar: toonSysteem,
        },
        {
          label: "Release Readiness",
          pad: "/beheer/release-readiness",
          icoon: Award,
          beschrijving: "Controlelijst voor productie-releases doorlopen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Systeemstatus",
          pad: "/beheer/systeemstatus",
          icoon: Activity,
          beschrijving: "Actieve commit, builddatum en verbindingsstatus van DB, opslag, mail en AI",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Indirecte werkzaamheden",
          pad: "/beheer/indirecte-werkzaamheden",
          icoon: Activity,
          beschrijving: "Lijst met indirecte urencodes beheren (zoals Reistijd, Overleg)",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Kantoor Release",
          pad: "/beheer/kantoor-release",
          icoon: Package,
          beschrijving: "Kantoorversie beheren en uitrollen naar gebruikers",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Go-Live Manager",
          pad: "/beheer/go-live",
          icoon: Target,
          beschrijving: "Go-live checklist en productie-migratie begeleiden",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Verlof-instellingen",
          pad: "/personeel/verlof-instellingen",
          icoon: Settings2,
          beschrijving: "Verloftypes, saldoregels en goedkeuringsstromen instellen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Spotconfiguratie",
          pad: "/beheer/spotconfiguratie",
          icoon: Settings2,
          beschrijving: "Spottypen, velden en validatieregels aanpassen",
          zichtbaar: isHoofdbeheerder,
        },
        {
          label: "Mobiele test",
          pad: "/beheer/pwa-test",
          icoon: Smartphone,
          beschrijving: "Mobiele app en PWA-installatie testen",
          zichtbaar: true,
        },
        {
          label: "Privacy & transparantie",
          pad: "/mijn/privacy",
          icoon: ShieldCheck,
          beschrijving: "Uw persoonsgegevens en privacy-instellingen inzien",
          zichtbaar: true,
        },
        {
          label: "App-informatie",
          pad: "/info",
          icoon: Info,
          beschrijving: "Versie-informatie, licenties en builddetails",
          zichtbaar: true,
        },
      ],
    },
  ], [toonSysteem, toonGebruikers, toonBibliotheek, isHoofdbeheerder]);

  const zoekterm = zoek.toLowerCase().trim();
  const gefilterd = groepen
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          item.zichtbaar &&
          (zoekterm === "" ||
            item.label.toLowerCase().includes(zoekterm) ||
            item.beschrijving.toLowerCase().includes(zoekterm)),
      ),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Instellingen</h1>
        <p className="text-sm text-muted-foreground">
          Systeemconfiguratie, toegangsbeheer en beheerhulpmiddelen
        </p>
      </div>

      <div className="relative mb-8 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Zoek in instellingen..."
          className="pl-9"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {gefilterd.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Geen resultaten voor &ldquo;{zoek}&rdquo;.
        </p>
      )}

      <div className="space-y-10">
        {gefilterd.map((groep) => (
          <section key={groep.id}>
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-0.5">
              {groep.titel}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {groep.items.map((item) => {
                const Icoon = item.icoon;
                return (
                  <Link
                    key={item.pad}
                    href={item.pad}
                    className="group flex items-start gap-3 rounded-lg border bg-card p-4 hover:bg-accent/40 hover:border-primary/30 transition-colors cursor-pointer"
                  >
                    <div className="mt-0.5 flex-shrink-0 rounded-md bg-muted p-2 group-hover:bg-background transition-colors">
                      <Icoon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground leading-tight">
                        {item.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 leading-snug">
                        {item.beschrijving}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
