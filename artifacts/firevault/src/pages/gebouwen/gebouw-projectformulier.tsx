import { useEffect, useRef, useState } from "react";
import {
  useGetGebouwEmailSamenvatting,
  useUpdateGebouwEmailSamenvatting,
  useGenerateGebouwEmailSamenvatting,
  useListGebouwToewijzingen,
  useCreateGebouwPartij,
  useListGebouwPartijen,
  useUpdateGebouw,
  useListWerkgevers,
  getGetGebouwEmailSamenvattingQueryKey,
  getListGebouwPartijenQueryKey,
} from "@workspace/api-client-react";
import type { EmailContactpersoon, GebouwPartij } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, ClipboardList, Building2, Phone, Handshake, ListChecks,
  CheckSquare, FileText, AlertTriangle, Users, ShieldCheck, Save,
  RefreshCw, Loader2, Pencil, Hash, Calendar, Mail, ChevronDown,
  ChevronUp, Check, UserPlus, Wrench, X, Info, Ruler,
} from "lucide-react";

// ── Typen ────────────────────────────────────────────────────────────────────

interface GebouwProp {
  naam: string;
  projectnummer?: string | null;
  werknummer?: string | null;
  adres?: string | null;
  stad?: string | null;
  postcode?: string | null;
  gebouw_type?: string | null;
  aangemaakt_op?: string | null;
  gereed_op?: string | null;
  aantal_verdiepingen?: number | null;
  hoogte?: number | null;
  breedte?: number | null;
  diepte?: number | null;
  oppervlakte?: number | null;
  werkgever_id?: number | null;
  werkmaatschappij_naam?: string | null;
}

type VeldSleutel =
  | "opdrachtomschrijving"
  | "opdrachtgever"
  | "contactgegevens"
  | "afspraken"
  | "actiepunten"
  | "besluiten"
  | "tekeningen"
  | "risicos";

type FormState = Record<VeldSleutel, string>;

type Afmetingen = {
  aantal_verdiepingen: string;
  hoogte: string;
  breedte: string;
  diepte: string;
  oppervlakte: string;
};

type Partij = GebouwPartij;

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function contactStatus(c: EmailContactpersoon): "voorstel" | "bevestigd" | "afgewezen" {
  const s = c.status as string | null | undefined;
  if (s === "bevestigd") return "bevestigd";
  if (s === "afgewezen") return "afgewezen";
  return "voorstel";
}

function contactRelevantie(c: EmailContactpersoon): "relevant" | "ter_controle" {
  return (c.relevantie as string | null | undefined) === "ter_controle"
    ? "ter_controle"
    : "relevant";
}

const ROL_LABELS: Record<string, string> = {
  opdrachtgever: "Opdrachtgever",
  gebruiker: "Gebouwgebruiker",
  installateur: "Installateur",
  aannemer: "Aannemer",
  eigenaar: "Gebouweigenaar",
  aanvrager: "Aanvrager",
};

function rolLabel(rol: string): string {
  return ROL_LABELS[rol] ?? rol;
}

const BASIS_ROL_LABELS: Record<string, string> = {
  beheerder: "Beheerder",
  hoofdbeheerder: "Hoofdbeheerder",
  monteur: "Monteur",
  controleur: "Controleur",
  klant: "Klant",
};

function basisRolLabel(rol: string): string {
  return BASIS_ROL_LABELS[rol] ?? rol;
}

function datum(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("nl-NL");
}

function getalOfNull(v: string): number | null {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function heelGetalOfNull(v: string): number | null {
  const n = getalOfNull(v);
  return n == null ? null : Math.round(n);
}

const leegFormulier = (): FormState => ({
  opdrachtomschrijving: "",
  opdrachtgever: "",
  contactgegevens: "",
  afspraken: "",
  actiepunten: "",
  besluiten: "",
  tekeningen: "",
  risicos: "",
});

const PARTIJ_ROLLEN = new Set([
  "opdrachtgever", "gebruiker", "installateur", "aannemer", "eigenaar", "aanvrager",
]);

// Eén betrokkene (persoon) binnen een partij — afkomstig van een AI-contact of
// een handmatig geregistreerde partij.
type Betrokkene = {
  naam: string;
  rol: string;
  functie?: string | null;
  organisatie?: string | null;
  email?: string | null;
  telefoon?: string | null;
  bron: "contact" | "partij";
  status: "voorstel" | "bevestigd" | "afgewezen";
  bron_onderwerp?: string | null;
  contact?: EmailContactpersoon;
};

// Een partij = unieke combinatie van rol + organisatie, met haar contactpersonen.
type Partijgroep = {
  rol: string;
  organisatie: string | null;
  personen: Betrokkene[];
};

// Sleutel om dezelfde persoon uit verschillende bronnen te ontdubbelen.
function persoonKey(naam?: string | null, email?: string | null): string {
  const e = (email ?? "").trim().toLowerCase();
  return e ? `e:${e}` : `n:${(naam ?? "").trim().toLowerCase()}`;
}

const ROL_VOLGORDE = [
  "opdrachtgever", "eigenaar", "gebruiker", "aanvrager", "installateur", "aannemer",
];

function rolIndex(rol: string): number {
  const i = ROL_VOLGORDE.indexOf(rol);
  return i < 0 ? ROL_VOLGORDE.length : i;
}

function contactNaarBetrokkene(c: EmailContactpersoon): Betrokkene {
  return {
    naam: c.naam,
    rol: c.rol,
    functie: c.functie ?? null,
    organisatie: c.organisatie ?? null,
    email: c.email ?? null,
    telefoon: c.telefoon ?? null,
    bron: "contact",
    status: contactStatus(c),
    bron_onderwerp: c.bron_onderwerp ?? null,
    contact: c,
  };
}

function partijNaarBetrokkene(p: Partij): Betrokkene {
  return {
    naam: p.naam,
    rol: p.type,
    functie: null,
    organisatie: p.organisatie ?? null,
    email: p.email ?? null,
    telefoon: p.telefoon ?? null,
    bron: "partij",
    status: "bevestigd",
  };
}

// Groepeer betrokkenen per partij (rol + organisatie) en sorteer op rol-volgorde.
function groepeerPartijen(betrokkenen: Betrokkene[]): Partijgroep[] {
  const map = new Map<string, Partijgroep>();
  for (const b of betrokkenen) {
    const orgNorm = (b.organisatie ?? "").trim().toLowerCase();
    const key = `${b.rol}|${orgNorm}`;
    let g = map.get(key);
    if (!g) {
      g = { rol: b.rol, organisatie: b.organisatie ?? null, personen: [] };
      map.set(key, g);
    }
    g.personen.push(b);
  }
  return [...map.values()].sort((a, b) => {
    const d = rolIndex(a.rol) - rolIndex(b.rol);
    return d !== 0 ? d : (a.organisatie ?? "").localeCompare(b.organisatie ?? "", "nl");
  });
}

// ── Sub-componenten ───────────────────────────────────────────────────────────

function SectieLabel({
  icoon,
  titel,
  extra,
}: {
  icoon: React.ReactNode;
  titel: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
      {icoon}
      {titel}
      {extra}
    </div>
  );
}

function KVRij({ label, waarde }: { label: string; waarde?: string | null }) {
  if (!waarde) return null;
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{waarde}</dd>
    </div>
  );
}

function AfmetingRij({
  label,
  waarde,
  eenheid,
}: {
  label: string;
  waarde?: number | null;
  eenheid?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">
        {waarde != null ? `${waarde}${eenheid ? ` ${eenheid}` : ""}` : "—"}
      </dd>
    </div>
  );
}

// Eén betrokken partij (opdrachtgever, installateur, …) met haar contactpersonen,
// gegroepeerd onder de organisatienaam.
function PartijBlok({
  groep,
  toonRol,
  toonActies,
  opslaan,
  alleContacten,
  gebouwId,
}: {
  groep: Partijgroep;
  toonRol: boolean;
  toonActies: boolean;
  opslaan: (updated: EmailContactpersoon[]) => Promise<void>;
  alleContacten: EmailContactpersoon[];
  gebouwId: number;
}) {
  const kop = groep.organisatie
    ? toonRol
      ? `${rolLabel(groep.rol)} · ${groep.organisatie}`
      : groep.organisatie
    : rolLabel(groep.rol);
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-semibold text-foreground">{kop}</div>
      <div className="space-y-2 border-l-2 border-muted pl-3">
        {groep.personen.map((b, i) => (
          <PersoonRegel
            key={`${persoonKey(b.naam, b.email)}-${i}`}
            betrokkene={b}
            toonActies={toonActies}
            opslaan={opslaan}
            alleContacten={alleContacten}
            gebouwId={gebouwId}
          />
        ))}
      </div>
    </div>
  );
}

// Volledige weergave van betrokken partijen: opdrachtgever bovenaan, daarna de
// overige betrokken partijen (installateur, aannemer, …).
function BetrokkenenWeergave({
  groepen,
  toonActies,
  opslaan,
  alleContacten,
  gebouwId,
}: {
  groepen: Partijgroep[];
  toonActies: boolean;
  opslaan: (updated: EmailContactpersoon[]) => Promise<void>;
  alleContacten: EmailContactpersoon[];
  gebouwId: number;
}) {
  const opdrachtgever = groepen.filter((g) => g.rol === "opdrachtgever");
  const overig = groepen.filter((g) => g.rol !== "opdrachtgever");
  return (
    <div className="space-y-4">
      {opdrachtgever.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> Opdrachtgever
          </p>
          {opdrachtgever.map((g, i) => (
            <PartijBlok
              key={`og-${i}`}
              groep={g}
              toonRol={false}
              toonActies={toonActies}
              opslaan={opslaan}
              alleContacten={alleContacten}
              gebouwId={gebouwId}
            />
          ))}
        </div>
      )}
      {overig.length > 0 && (
        <div className="space-y-2">
          {opdrachtgever.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Handshake className="h-3.5 w-3.5" /> Betrokken partijen
            </p>
          )}
          {overig.map((g, i) => (
            <PartijBlok
              key={`bt-${i}`}
              groep={g}
              toonRol
              toonActies={toonActies}
              opslaan={opslaan}
              alleContacten={alleContacten}
              gebouwId={gebouwId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Eén persoon binnen een partij. Rustige, formulierachtige regel: naam · functie
// met contactgegevens eronder. AI-voorstellen krijgen een gele markering,
// bevestigde betrokkenen blijven neutraal.
function PersoonRegel({
  betrokkene,
  toonActies,
  opslaan,
  alleContacten,
  gebouwId,
  toonContext = false,
}: {
  betrokkene: Betrokkene;
  toonActies: boolean;
  opslaan: (updated: EmailContactpersoon[]) => Promise<void>;
  alleContacten: EmailContactpersoon[];
  gebouwId: number;
  toonContext?: boolean;
}) {
  const contact = betrokkene.contact;
  const status = betrokkene.status;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const maakPartij = useCreateGebouwPartij();
  const [partijToegevoegd, setPartijToegevoegd] = useState(false);
  const [bezig, setBezig] = useState(false);

  function metStatus(nieuw: "voorstel" | "bevestigd" | "afgewezen"): EmailContactpersoon[] {
    return alleContacten.map((c) => (c === contact ? { ...c, status: nieuw } : c));
  }

  async function muteer(nieuw: "voorstel" | "bevestigd" | "afgewezen") {
    if (!contact) return;
    setBezig(true);
    try {
      await opslaan(metStatus(nieuw));
    } finally {
      setBezig(false);
    }
  }

  async function toevoegenAlsPartij() {
    try {
      await maakPartij.mutateAsync({
        id: gebouwId,
        data: {
          type: betrokkene.rol,
          naam: betrokkene.naam,
          organisatie: betrokkene.organisatie ?? undefined,
          email: betrokkene.email ?? undefined,
          telefoon: betrokkene.telefoon ?? undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListGebouwPartijenQueryKey(gebouwId) });
      setPartijToegevoegd(true);
      toast({ title: "Toegevoegd als partij", description: `${betrokkene.naam} (${rolLabel(betrokkene.rol)})` });
    } catch {
      toast({ title: "Toevoegen mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1 text-sm leading-snug">
        <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span className={status === "afgewezen" ? "font-medium line-through text-muted-foreground" : "font-medium"}>
            {betrokkene.naam}
          </span>
          {betrokkene.functie && (
            <span className="text-xs text-muted-foreground">{betrokkene.functie}</span>
          )}
          {status === "voorstel" && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] font-normal px-1.5 normal-case">
              <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI-voorstel
            </Badge>
          )}
          {betrokkene.bron === "partij" && (
            <Badge variant="outline" className="text-[10px] font-normal px-1.5 text-muted-foreground">
              Handmatig
            </Badge>
          )}
        </div>
        {toonContext && (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {rolLabel(betrokkene.rol)}
            {betrokkene.organisatie ? ` · ${betrokkene.organisatie}` : ""}
          </div>
        )}
        {(betrokkene.email || betrokkene.telefoon) && (
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {betrokkene.email && (
              <a href={`mailto:${betrokkene.email}`} className="flex items-center gap-1 hover:underline">
                <Mail className="h-3 w-3 shrink-0" /> {betrokkene.email}
              </a>
            )}
            {betrokkene.telefoon && (
              <a href={`tel:${betrokkene.telefoon}`} className="flex items-center gap-1 hover:underline">
                <Phone className="h-3 w-3 shrink-0" /> {betrokkene.telefoon}
              </a>
            )}
          </div>
        )}
        {betrokkene.bron_onderwerp && status === "voorstel" && (
          <div className="mt-0.5 text-xs text-muted-foreground/70 flex items-center gap-1">
            <Mail className="h-2.5 w-2.5 shrink-0" /> Uit: {betrokkene.bron_onderwerp}
          </div>
        )}
      </div>

      {toonActies && contact && (
        <div className="flex items-center gap-0.5 shrink-0">
          {status === "voorstel" && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                onClick={() => muteer("bevestigd")}
                disabled={bezig}
                title="Bevestigen"
              >
                {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline ml-0.5">Bevestigen</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => muteer("afgewezen")}
                disabled={bezig}
                title="Afwijzen"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {status === "bevestigd" && (
            <>
              {PARTIJ_ROLLEN.has(betrokkene.rol) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={toevoegenAlsPartij}
                  disabled={maakPartij.isPending || partijToegevoegd}
                  title="Opslaan als vaste contactpartij"
                >
                  {partijToegevoegd ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : maakPartij.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={() => muteer("afgewezen")}
                disabled={bezig}
                title="Afwijzen"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {status === "afgewezen" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => muteer("voorstel")}
              disabled={bezig}
              title="Terugzetten als voorstel"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

export function Projectformulier({
  gebouwId,
  isBeheerder,
  gebouw,
}: {
  gebouwId: number;
  isBeheerder: boolean;
  gebouw: GebouwProp;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: samenvatting, isLoading } = useGetGebouwEmailSamenvatting(gebouwId);
  const { data: toewijzingen } = useListGebouwToewijzingen(gebouwId);
  const update = useUpdateGebouwEmailSamenvatting();
  const genereer = useGenerateGebouwEmailSamenvatting();
  const wijzigGebouw = useUpdateGebouw();
  const { data: partijen } = useListGebouwPartijen(gebouwId);
  const { data: werkgevers } = useListWerkgevers();

  const [form, setForm] = useState<FormState>(leegFormulier);
  const [afmetingen, setAfmetingen] = useState<Afmetingen>({
    aantal_verdiepingen: "",
    hoogte: "",
    breedte: "",
    diepte: "",
    oppervlakte: "",
  });
  const [werkgeverId, setWerkgeverId] = useState<number | null>(gebouw.werkgever_id ?? null);
  const [localContacten, setLocalContacten] = useState<EmailContactpersoon[]>([]);
  const [bewerken, setBewerken] = useState(false);
  const [versie, setVersie] = useState<string | null>(null);
  const [terControleOpen, setTerControleOpen] = useState(false);
  const [afgewezenOpen, setAfgewezenOpen] = useState(false);

  // Houdt bij of de beheerder midden in een bewerking zit.
  const bewerkenRef = useRef(bewerken);
  bewerkenRef.current = bewerken;

  // Synchroniseer formulier en contacten met server-data.
  useEffect(() => {
    if (!samenvatting) return;
    const stempel = `${samenvatting.id}:${samenvatting.bijgewerkt_op}`;
    if (stempel === versie) return;
    if (bewerkenRef.current) return;
    setForm({
      opdrachtomschrijving: samenvatting.opdrachtomschrijving ?? "",
      opdrachtgever: samenvatting.opdrachtgever ?? "",
      contactgegevens: samenvatting.contactgegevens ?? "",
      afspraken: samenvatting.afspraken ?? "",
      actiepunten: samenvatting.actiepunten ?? "",
      besluiten: samenvatting.besluiten ?? "",
      tekeningen: samenvatting.tekeningen ?? "",
      risicos: samenvatting.risicos ?? "",
    });
    setLocalContacten(samenvatting.contactpersonen ?? []);
    setVersie(stempel);
  }, [samenvatting, versie]);

  function invalidate() {
    return queryClient.invalidateQueries({
      queryKey: getGetGebouwEmailSamenvattingQueryKey(gebouwId),
    });
  }

  // Bouw een volledig PATCH-payload op (tekstvelden + contacten).
  function bouwPayload(contacten: EmailContactpersoon[], bevestigen?: boolean) {
    return {
      opdrachtomschrijving: form.opdrachtomschrijving || null,
      opdrachtgever: form.opdrachtgever || null,
      contactgegevens: form.contactgegevens || null,
      afspraken: form.afspraken || null,
      actiepunten: form.actiepunten || null,
      besluiten: form.besluiten || null,
      tekeningen: form.tekeningen || null,
      risicos: form.risicos || null,
      geverifieerd: bevestigen ?? (samenvatting?.geverifieerd ?? false),
      contactpersonen: contacten,
    };
  }

  // Vul de afmeting-invoervelden met de huidige gebouwwaarden en open de bewerkmode.
  function startBewerken() {
    setAfmetingen({
      aantal_verdiepingen:
        gebouw.aantal_verdiepingen != null ? String(gebouw.aantal_verdiepingen) : "",
      hoogte: gebouw.hoogte != null ? String(gebouw.hoogte) : "",
      breedte: gebouw.breedte != null ? String(gebouw.breedte) : "",
      diepte: gebouw.diepte != null ? String(gebouw.diepte) : "",
      oppervlakte: gebouw.oppervlakte != null ? String(gebouw.oppervlakte) : "",
    });
    setWerkgeverId(gebouw.werkgever_id ?? null);
    setBewerken(true);
  }

  async function bewaar(bevestigen: boolean) {
    try {
      await update.mutateAsync({
        id: gebouwId,
        data: bouwPayload(localContacten, bevestigen),
      });
      // Afmetingen en werkmaatschappij horen bij het gebouw zelf; partiële PATCH laat overige velden ongemoeid.
      await wijzigGebouw.mutateAsync({
        id: gebouwId,
        data: {
          aantal_verdiepingen: heelGetalOfNull(afmetingen.aantal_verdiepingen),
          hoogte: getalOfNull(afmetingen.hoogte),
          breedte: getalOfNull(afmetingen.breedte),
          diepte: getalOfNull(afmetingen.diepte),
          oppervlakte: getalOfNull(afmetingen.oppervlakte),
          werkgever_id: werkgeverId ?? undefined,
        },
      });
      await invalidate();
      await queryClient.invalidateQueries();
      setBewerken(false);
      setVersie(null);
      toast({ title: bevestigen ? "Projectgegevens bevestigd" : "Projectgegevens opgeslagen" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function bewaarContacten(updatedContacten: EmailContactpersoon[]) {
    setLocalContacten(updatedContacten);
    try {
      await update.mutateAsync({
        id: gebouwId,
        data: bouwPayload(updatedContacten),
      });
      await invalidate();
    } catch {
      // Terugzetten bij fout
      setLocalContacten(samenvatting?.contactpersonen ?? []);
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function herbereken() {
    try {
      await genereer.mutateAsync({ id: gebouwId });
      await invalidate();
      setBewerken(false);
      setVersie(null);
      toast({ title: "AI-suggesties bijgewerkt" });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  // ── Toewijzingen / team (alle leden, gegroepeerd per gebruiker) ──
  const teamleden = Object.values(
    (toewijzingen ?? []).reduce<
      Record<number, { gebruikerId: number; naam: string; rol: string; rollen: string[] }>
    >((acc, t) => {
      if (!acc[t.gebruiker_id]) {
        acc[t.gebruiker_id] = {
          gebruikerId: t.gebruiker_id,
          naam: t.naam,
          rol: t.rol ?? "",
          rollen: [],
        };
      }
      if (t.project_rol && !acc[t.gebruiker_id].rollen.includes(t.project_rol)) {
        acc[t.gebruiker_id].rollen.push(t.project_rol);
      }
      return acc;
    }, {}),
  );

  // ── Contact-groeperingen ──
  const bevestigdeContacten = localContacten.filter((c) => contactStatus(c) === "bevestigd");
  const voorstelRelevant = localContacten.filter(
    (c) => contactStatus(c) === "voorstel" && contactRelevantie(c) === "relevant",
  );
  const voorstelTerControle = localContacten.filter(
    (c) => contactStatus(c) === "voorstel" && contactRelevantie(c) === "ter_controle",
  );
  const afgewezenContacten = localContacten.filter((c) => contactStatus(c) === "afgewezen");
  const partijLijst = partijen ?? [];

  // ── Betrokken partijen (gegroepeerd op rol + organisatie) ──
  const bevestigdBetrokken = bevestigdeContacten.map(contactNaarBetrokkene);
  const voorstelBetrokken = voorstelRelevant.map(contactNaarBetrokkene);

  // Handmatige partijen die nog niet als (bevestigd/voorgesteld) contact bestaan,
  // zodat dezelfde persoon niet dubbel verschijnt.
  const handmatigeBetrokken = (bestaandeKeys: Set<string>) =>
    partijLijst
      .filter((p) => !bestaandeKeys.has(persoonKey(p.naam, p.email)))
      .map(partijNaarBetrokkene);

  const beheerKeys = new Set(
    [...bevestigdBetrokken, ...voorstelBetrokken].map((b) => persoonKey(b.naam, b.email)),
  );
  const beheerGroepen = groepeerPartijen([
    ...bevestigdBetrokken,
    ...voorstelBetrokken,
    ...handmatigeBetrokken(beheerKeys),
  ]);

  const leesKeys = new Set(bevestigdBetrokken.map((b) => persoonKey(b.naam, b.email)));
  const leesGroepen = groepeerPartijen([
    ...bevestigdBetrokken,
    ...handmatigeBetrokken(leesKeys),
  ]);

  const aantalBetrokken = beheerGroepen.reduce((n, g) => n + g.personen.length, 0);

  const heeftSamenvatting = !!samenvatting;
  const geverifieerd = samenvatting?.geverifieerd ?? false;
  const aantalEmails = samenvatting?.aantal_emails ?? 0;
  const bezig = update.isPending || genereer.isPending || wijzigGebouw.isPending;

  // Projectstatus
  const projectStatus = gebouw.gereed_op ? "Gereed" : "Actief";
  const projectStatusKleur = gebouw.gereed_op
    ? "text-green-700 bg-green-50 border-green-200"
    : "text-blue-700 bg-blue-50 border-blue-200";

  // ── Laadindicator ──
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  // ── Niet-beheerder (alleen-lezen) ──
  if (!isBeheerder) {
    const bevestigdeVelden = (
      [
        { s: "opdrachtomschrijving", t: "Opdrachtomschrijving", i: <ClipboardList className="h-3.5 w-3.5" /> },
        { s: "actiepunten", t: "Openstaande actiepunten", i: <ListChecks className="h-3.5 w-3.5" /> },
        { s: "opdrachtgever", t: "Opdrachtgever", i: <Building2 className="h-3.5 w-3.5" /> },
        { s: "afspraken", t: "Gemaakte afspraken", i: <Handshake className="h-3.5 w-3.5" /> },
        { s: "besluiten", t: "Besluiten", i: <CheckSquare className="h-3.5 w-3.5" /> },
      ] as const
    ).filter((v) => (samenvatting?.[v.s] ?? "").trim());

    if (
      bevestigdeVelden.length === 0 &&
      bevestigdeContacten.length === 0 &&
      partijLijst.length === 0
    )
      return null;

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4" /> Projectinformatie
            {geverifieerd && (
              <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                <ShieldCheck className="h-3 w-3 mr-1" /> Gecontroleerd
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bevestigdeVelden.map((v) => (
            <div key={v.s}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-0.5">
                {v.i} {v.t}
              </div>
              <p className="text-sm whitespace-pre-wrap text-foreground/80">
                {samenvatting?.[v.s]}
              </p>
            </div>
          ))}
          {leesGroepen.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                <Users className="h-4 w-4" /> Betrokken partijen
              </div>
              <BetrokkenenWeergave
                groepen={leesGroepen}
                toonActies={false}
                opslaan={bewaarContacten}
                alleContacten={localContacten}
                gebouwId={gebouwId}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Beheerder weergave ──
  return (
    <Card className="border-primary/25">
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Projectformulier
              {heeftSamenvatting && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {aantalEmails} {aantalEmails === 1 ? "e-mail" : "e-mails"}
                </Badge>
              )}
            </CardTitle>
            {geverifieerd ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Gecontroleerd
                {samenvatting?.gecontroleerd_door ? ` door ${samenvatting.gecontroleerd_door}` : ""}
                {" · "}{datum(samenvatting?.gecontroleerd_op)}
              </p>
            ) : heeftSamenvatting ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                AI aangevuld — controleer de contacten en bevestig de gegevens.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Voeg e-mails toe via tabblad Beheer voor AI-extractie.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!bewerken && (
              <Button size="sm" variant="outline" onClick={startBewerken}>
                <Pencil className="h-3.5 w-3.5" /> Bewerken
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={herbereken}
              disabled={bezig}
              title="Projectgegevens opnieuw door AI laten invullen vanuit de gearchiveerde e-mails"
            >
              {genereer.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              AI-suggesties
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">

        {/* ── Opdracht en inhoud (bovenaan) ── */}
        <div className="space-y-3">
          <SectieLabel
            icoon={<ClipboardList className="h-3.5 w-3.5" />}
            titel="Opdracht en inhoud"
            extra={heeftSamenvatting && !geverifieerd ? (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs font-normal normal-case tracking-normal ml-1">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" /> AI aangevuld
              </Badge>
            ) : geverifieerd ? (
              <Badge variant="secondary" className="text-xs font-normal normal-case tracking-normal ml-1 text-muted-foreground">
                <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> Bevestigd
              </Badge>
            ) : undefined}
          />

          {bewerken ? (
            /* Bewerkingsmodus */
            <div className="space-y-3">
              {(
                [
                  { s: "opdrachtomschrijving", t: "Opdrachtomschrijving", rijen: 3 },
                  { s: "opdrachtgever", t: "Opdrachtgever / bedrijf", rijen: 2 },
                  { s: "contactgegevens", t: "Contactgegevens (vrij veld)", rijen: 2 },
                  { s: "afspraken", t: "Gemaakte afspraken", rijen: 3 },
                  { s: "actiepunten", t: "Openstaande actiepunten", rijen: 3 },
                  { s: "besluiten", t: "Besluiten", rijen: 2 },
                  { s: "tekeningen", t: "Tekeningen en bijlagen", rijen: 2 },
                  { s: "risicos", t: "Risico's en aandachtspunten", rijen: 2 },
                ] as const
              ).map((v) => (
                <div key={v.s} className="space-y-1">
                  <Label className="text-xs">{v.t}</Label>
                  <Textarea
                    rows={v.rijen}
                    value={form[v.s]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [v.s]: e.target.value }))
                    }
                    placeholder="Niet ingevuld"
                    className="text-sm resize-y"
                  />
                </div>
              ))}

              <div className="flex items-center justify-end gap-2 pt-1 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBewerken(false);
                    setVersie(null);
                  }}
                  disabled={bezig}
                >
                  Annuleren
                </Button>
                <Button variant="outline" size="sm" onClick={() => bewaar(false)} disabled={bezig}>
                  {update.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Save className="h-3.5 w-3.5" />}
                  Opslaan
                </Button>
                <Button size="sm" onClick={() => bewaar(true)} disabled={bezig}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Opslaan en bevestigen
                </Button>
              </div>
            </div>
          ) : (
            /* Leesweergave */
            <div className="space-y-3">
              {(
                [
                  { s: "opdrachtomschrijving", t: "Opdrachtomschrijving", i: <ClipboardList className="h-3.5 w-3.5" /> },
                  { s: "actiepunten", t: "Openstaande actiepunten", i: <ListChecks className="h-3.5 w-3.5" /> },
                  { s: "opdrachtgever", t: "Opdrachtgever", i: <Building2 className="h-3.5 w-3.5" /> },
                  { s: "contactgegevens", t: "Contactgegevens", i: <Phone className="h-3.5 w-3.5" /> },
                  { s: "afspraken", t: "Gemaakte afspraken", i: <Handshake className="h-3.5 w-3.5" /> },
                  { s: "besluiten", t: "Besluiten", i: <CheckSquare className="h-3.5 w-3.5" /> },
                  { s: "tekeningen", t: "Tekeningen en bijlagen", i: <FileText className="h-3.5 w-3.5" /> },
                  { s: "risicos", t: "Risico's en aandachtspunten", i: <AlertTriangle className="h-3.5 w-3.5" /> },
                ] as const
              )
                .filter((v) => (samenvatting?.[v.s] ?? "").trim())
                .map((v) => (
                  <div key={v.s}>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-0.5">
                      {v.i} {v.t}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground/80">
                      {samenvatting?.[v.s]}
                    </p>
                  </div>
                ))}
              {!heeftSamenvatting && (
                <p className="text-sm text-muted-foreground">
                  Nog geen inhoud. Klik op{" "}
                  <span className="font-medium">Bewerken</span> om handmatig in te vullen of
                  gebruik <span className="font-medium">AI-suggesties</span> nadat u e-mails hebt
                  toegevoegd.
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* ── Sectie 1: Projectidentiteit ── */}
        <div className="space-y-2.5">
          <SectieLabel icoon={<Hash className="h-3.5 w-3.5" />} titel="Projectidentiteit" />
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <KVRij label="Projectnaam" waarde={gebouw.naam} />
            <KVRij label="Projectnummer" waarde={gebouw.projectnummer} />
            <KVRij label="Werknummer" waarde={gebouw.werknummer} />
            <KVRij label="Adres" waarde={gebouw.adres} />
            <KVRij label="Stad" waarde={gebouw.stad} />
            <KVRij label="Postcode" waarde={gebouw.postcode} />
            <KVRij label="Gebouwtype" waarde={gebouw.gebouw_type} />
            <KVRij label="Werkmaatschappij" waarde={gebouw.werkmaatschappij_naam} />
            {gebouw.aangemaakt_op && (
              <div>
                <dt className="text-xs text-muted-foreground">Startdatum</dt>
                <dd className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {datum(gebouw.aangemaakt_op)}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>
                <Badge variant="outline" className={`text-xs font-normal ${projectStatusKleur}`}>
                  {projectStatus}
                </Badge>
              </dd>
            </div>
          </dl>
        </div>

        <Separator />

        {/* ── Sectie: Gebouwafmetingen ── */}
        <div className="space-y-2.5">
          <SectieLabel
            icoon={<Ruler className="h-3.5 w-3.5" />}
            titel="Gebouwafmetingen"
          />
          {bewerken ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Werkmaatschappij</Label>
                <Select
                  value={werkgeverId != null ? String(werkgeverId) : "__geen__"}
                  onValueChange={(v) => setWerkgeverId(v === "__geen__" ? null : Number(v))}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecteer werkmaatschappij" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__geen__">Niet gekoppeld</SelectItem>
                    {(werkgevers ?? []).map((wg) => (
                      <SelectItem key={wg.id} value={String(wg.id)}>{wg.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(
                [
                  { s: "aantal_verdiepingen", t: "Verdiepingen", stap: "1" },
                  { s: "hoogte", t: "Hoogte (m)", stap: "0.1" },
                  { s: "breedte", t: "Breedte (m)", stap: "0.1" },
                  { s: "diepte", t: "Diepte (m)", stap: "0.1" },
                  { s: "oppervlakte", t: "Oppervlakte (m²)", stap: "1" },
                ] as const
              ).map((v) => (
                <div key={v.s} className="space-y-1">
                  <Label className="text-xs">{v.t}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step={v.stap}
                    value={afmetingen[v.s]}
                    onChange={(e) =>
                      setAfmetingen((a) => ({ ...a, [v.s]: e.target.value }))
                    }
                    placeholder="—"
                    className="text-sm"
                  />
                </div>
              ))}
              </div>
            </div>
          ) : gebouw.aantal_verdiepingen != null ||
            gebouw.hoogte != null ||
            gebouw.breedte != null ||
            gebouw.diepte != null ||
            gebouw.oppervlakte != null ? (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              <AfmetingRij label="Verdiepingen" waarde={gebouw.aantal_verdiepingen} />
              <AfmetingRij label="Hoogte" waarde={gebouw.hoogte} eenheid="m" />
              <AfmetingRij label="Breedte" waarde={gebouw.breedte} eenheid="m" />
              <AfmetingRij label="Diepte" waarde={gebouw.diepte} eenheid="m" />
              <AfmetingRij label="Oppervlakte" waarde={gebouw.oppervlakte} eenheid="m²" />
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nog geen afmetingen bekend. Klik op Bewerken om ze in te vullen — de
              AI kan hoogte, breedte, diepte en oppervlakte ook schatten via de
              gebouwpagina.
            </p>
          )}
        </div>

        <Separator />

        {/* ── Sectie 2: Projectteam ── */}
        <div className="space-y-2.5">
          <SectieLabel
            icoon={<Wrench className="h-3.5 w-3.5" />}
            titel="FPS Projectteam"
            extra={
              teamleden.length > 0 ? (
                <span className="font-normal normal-case tracking-normal text-muted-foreground ml-1">
                  — {teamleden.length}
                </span>
              ) : undefined
            }
          />
          {teamleden.length > 0 ? (
            <ul className="space-y-1.5">
              {teamleden.map((lid) => (
                <li
                  key={lid.gebruikerId}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background/50 px-3 py-2"
                >
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{lid.naam}</span>
                    {lid.rol && (
                      <span className="text-xs text-muted-foreground">{basisRolLabel(lid.rol)}</span>
                    )}
                  </div>
                  {lid.rollen.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-end shrink-0">
                      {lid.rollen.map((r) => (
                        <Badge key={r} variant="secondary" className="text-xs font-normal px-1.5">
                          {r}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Geen teamleden toegewezen. Voeg toe via het tabblad Beheer.
            </p>
          )}
        </div>

        <Separator />

        {/* ── Sectie 3: Betrokken partijen ── */}
        <div className="space-y-3">
          <SectieLabel
            icoon={<Users className="h-3.5 w-3.5" />}
            titel="Betrokken partijen"
            extra={
              aantalBetrokken > 0 ? (
                <span className="font-normal normal-case tracking-normal text-muted-foreground ml-1">
                  — {aantalBetrokken} {aantalBetrokken === 1 ? "persoon" : "personen"}
                </span>
              ) : undefined
            }
          />

          {beheerGroepen.length > 0 && (
            <BetrokkenenWeergave
              groepen={beheerGroepen}
              toonActies
              opslaan={bewaarContacten}
              alleContacten={localContacten}
              gebouwId={gebouwId}
            />
          )}

          {beheerGroepen.length === 0 &&
            voorstelTerControle.length === 0 &&
            afgewezenContacten.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {heeftSamenvatting
                  ? "Geen contactpersonen gevonden in de e-mails."
                  : "Nog geen e-mails verwerkt."}
              </p>
            )}

          {/* Twijfelgevallen ter controle (inklapbaar) */}
          {voorstelTerControle.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
                onClick={() => setTerControleOpen((v) => !v)}
              >
                {terControleOpen
                  ? <ChevronUp className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />}
                Twijfelgevallen ter controle ({voorstelTerControle.length})
              </button>
              {terControleOpen && (
                <div className="space-y-2 border-l-2 border-muted pl-3">
                  {voorstelTerControle.map((c, i) => (
                    <PersoonRegel
                      key={`controle-${persoonKey(c.naam, c.email)}-${i}`}
                      betrokkene={contactNaarBetrokkene(c)}
                      toonActies
                      toonContext
                      opslaan={bewaarContacten}
                      alleContacten={localContacten}
                      gebouwId={gebouwId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Afgewezen (inklapbaar) */}
          {afgewezenContacten.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAfgewezenOpen((v) => !v)}
              >
                {afgewezenOpen
                  ? <ChevronUp className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />}
                Afgewezen ({afgewezenContacten.length})
              </button>
              {afgewezenOpen && (
                <div className="space-y-2 border-l-2 border-muted pl-3">
                  {afgewezenContacten.map((c, i) => (
                    <PersoonRegel
                      key={`afgewezen-${persoonKey(c.naam, c.email)}-${i}`}
                      betrokkene={contactNaarBetrokkene(c)}
                      toonActies
                      toonContext
                      opslaan={bewaarContacten}
                      alleContacten={localContacten}
                      gebouwId={gebouwId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
