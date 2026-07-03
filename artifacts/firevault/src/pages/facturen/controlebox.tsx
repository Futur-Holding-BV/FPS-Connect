import { useState } from "react";
import { Link } from "wouter";
import {
  useListFacturen,
  useAiUitlezenFactuur,
  useAccorderenFactuur,
  useAfkeurenFactuur,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Inbox, AlertTriangle, CheckCircle2, ArrowUpRight, Sparkles,
  Eye, Loader2, ShieldAlert, Info, Landmark, Ban, Clock,
  XCircle, TriangleAlert,
} from "lucide-react";
import type { Factuur } from "@workspace/api-client-react";

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

function DatumBadge({ datum }: { datum?: string | null }) {
  if (!datum) return <span className="text-muted-foreground text-xs">Geen datum</span>;
  const d = new Date(datum);
  const vandaag = new Date();
  const verschilDagen = Math.ceil((d.getTime() - vandaag.getTime()) / (1000 * 60 * 60 * 24));
  if (verschilDagen < 0) return (
    <span className="text-xs text-red-600 font-medium">{datum} (verlopen)</span>
  );
  if (verschilDagen < 7) return (
    <span className="text-xs text-amber-600 font-medium">{datum} (binnenkort)</span>
  );
  return <span className="text-xs text-muted-foreground">{datum}</span>;
}

type AfwijkingSignaal = {
  code: string;
  ernst: "kritisch" | "waarschuwing" | "info";
};

function AfwijkingIndicatoren({ factuur }: { factuur: Factuur }) {
  const signalen: AfwijkingSignaal[] = [];

  if (factuur.iban_afwijking) {
    signalen.push({ code: "IBAN afwijking", ernst: "kritisch" });
  }
  if (factuur.g_rekening_van_toepassing) {
    signalen.push({ code: "G-rekening", ernst: "info" });
  }
  if (!factuur.gebouw_id && !factuur.opdracht_id && !factuur.project_code) {
    signalen.push({ code: "Geen koppeling", ernst: "waarschuwing" });
  }
  if (factuur.accountview_status === "error") {
    signalen.push({ code: "Export fout", ernst: "kritisch" });
  }

  if (signalen.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {signalen.map((s) => (
        <span
          key={s.code}
          className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${
            s.ernst === "kritisch"
              ? "bg-red-100 text-red-700"
              : s.ernst === "waarschuwing"
              ? "bg-amber-100 text-amber-700"
              : "bg-blue-50 text-blue-600"
          }`}
        >
          {s.ernst === "kritisch" && <ShieldAlert className="h-3 w-3" />}
          {s.ernst === "waarschuwing" && <TriangleAlert className="h-3 w-3" />}
          {s.ernst === "info" && <Info className="h-3 w-3" />}
          {s.code}
        </span>
      ))}
    </div>
  );
}

const TAB_STATUSSEN: Record<string, string[]> = {
  inbox: ["ontvangen", "ai_gelezen"],
  beoordelen: ["te_beoordelen_pl", "te_beoordelen_wvb", "te_beoordelen_medewerker"],
  controle: ["controle_nodig"],
  exportklaar: ["klaar_voor_accountview", "klaar_voor_boeking"],
  fouten: ["fout_bij_verzending"],
};

function isInTab(status: string, tab: string): boolean {
  const lijst = TAB_STATUSSEN[tab];
  if (!lijst) return false;
  return lijst.includes(status);
}

type SnelActieProps = {
  factuur: Factuur;
  aiBezig: number | null;
  onAi: (id: number) => void;
  onAkkoord: (id: number) => void;
  onAfwijzen: (id: number) => void;
  bezig: Record<string, number | null>;
};

function SnelActies({ factuur, aiBezig, onAi, onAkkoord, onAfwijzen, bezig }: SnelActieProps) {
  const kanAiUitlezen = ["ontvangen", "controle_nodig", "ai_gelezen"].includes(factuur.status) && !!factuur.pdf_url;
  const kanAccorderen = !factuur.geaccordeerd && !factuur.geblokkeerd && factuur.status !== "verwerkt";
  const kanAfwijzen = !["afgekeurd", "verwerkt"].includes(factuur.status);

  return (
    <div className="flex items-center gap-1.5 justify-end flex-wrap">
      {kanAiUitlezen && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={aiBezig === factuur.id}
          onClick={() => onAi(factuur.id)}
        >
          {aiBezig === factuur.id
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <Sparkles className="h-3 w-3" />}
          AI uitlezen
        </Button>
      )}
      {kanAccorderen && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          disabled={bezig["akkoord"] === factuur.id}
          onClick={() => onAkkoord(factuur.id)}
        >
          {bezig["akkoord"] === factuur.id
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <CheckCircle2 className="h-3 w-3" />}
          Akkoord
        </Button>
      )}
      {kanAfwijzen && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
          disabled={bezig["afwijzen"] === factuur.id}
          onClick={() => onAfwijzen(factuur.id)}
        >
          <XCircle className="h-3 w-3" />
          Afwijzen
        </Button>
      )}
      <Link href={`/facturen/${factuur.id}`}>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
          <Eye className="h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Nieuw",
  ai_gelezen: "AI gelezen",
  controle_nodig: "Controle nodig",
  te_beoordelen_pl: "Te beoordelen",
  te_beoordelen_wvb: "WVB beoordeling",
  te_beoordelen_medewerker: "Medewerker",
  klaar_voor_boeking: "Klaar voor boeking",
  klaar_voor_accountview: "Exportklaar",
  verzonden_naar_accountview: "Verzonden",
  fout_bij_verzending: "Export fout",
  verwerkt: "Verwerkt",
  afgekeurd: "Afgekeurd",
};

const STATUS_KLEUR: Record<string, string> = {
  ontvangen: "bg-slate-100 text-slate-600",
  ai_gelezen: "bg-blue-100 text-blue-700",
  controle_nodig: "bg-amber-100 text-amber-700",
  te_beoordelen_pl: "bg-violet-100 text-violet-700",
  te_beoordelen_wvb: "bg-violet-100 text-violet-700",
  te_beoordelen_medewerker: "bg-violet-100 text-violet-700",
  klaar_voor_accountview: "bg-emerald-100 text-emerald-700",
  fout_bij_verzending: "bg-red-100 text-red-700",
  afgekeurd: "bg-red-100 text-red-600",
};

function FactuurRij({
  factuur,
  aiBezig,
  onAi,
  onAkkoord,
  onAfwijzen,
  bezig,
}: {
  factuur: Factuur;
  aiBezig: number | null;
  onAi: (id: number) => void;
  onAkkoord: (id: number) => void;
  onAfwijzen: (id: number) => void;
  bezig: Record<string, number | null>;
}) {
  return (
    <div className={`px-4 py-3 border-b last:border-b-0 hover:bg-slate-50/50 ${factuur.geblokkeerd ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Type badge */}
        <span className={`mt-0.5 shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
          factuur.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"
        }`}>
          {factuur.type === "inkoop" ? "INK" : "VRK"}
        </span>

        {/* Factuur info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 text-sm truncate">
              {factuur.factuurnummer ?? factuur.bestandsnaam ?? `Factuur #${factuur.id}`}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_KLEUR[factuur.status] ?? "bg-slate-100 text-slate-600"}`}>
              {STATUS_LABEL[factuur.status] ?? factuur.status}
            </span>
            {factuur.geblokkeerd && (
              <span className="text-xs text-slate-500 flex items-center gap-0.5">
                <Ban className="h-3 w-3" /> Geblokkeerd
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span>{factuur.relatienaam ?? "Onbekende leverancier"}</span>
            {factuur.factuurdatum && <span>{factuur.factuurdatum}</span>}
            {factuur.vervaldatum && (
              <span>Vervalt: <DatumBadge datum={factuur.vervaldatum} /></span>
            )}
            {factuur.gebouw_naam && (
              <span className="flex items-center gap-0.5">
                <Landmark className="h-3 w-3" />
                {factuur.gebouw_naam}
              </span>
            )}
          </div>

          <AfwijkingIndicatoren factuur={factuur} />
        </div>

        {/* Bedrag */}
        <div className="text-right shrink-0 min-w-20">
          <span className="font-mono text-sm font-medium text-slate-900">{euro(factuur.bedrag_incl_btw)}</span>
          {factuur.betaalstatus === "betaald" && (
            <div className="text-xs text-emerald-600 flex items-center justify-end gap-0.5 mt-0.5">
              <CheckCircle2 className="h-3 w-3" /> Betaald
            </div>
          )}
        </div>

        {/* Acties */}
        <div className="shrink-0 w-52">
          <SnelActies
            factuur={factuur}
            aiBezig={aiBezig}
            onAi={onAi}
            onAkkoord={onAkkoord}
            onAfwijzen={onAfwijzen}
            bezig={bezig}
          />
        </div>
      </div>
    </div>
  );
}

export default function ControleboxPagina() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("inbox");
  const [filter, setFilter] = useState<"alle" | "inkoop" | "verkoop">("alle");
  const [aiBezig, setAiBezig] = useState<number | null>(null);
  const [bezig, setBezig] = useState<Record<string, number | null>>({});

  const { data: facturen = [], isLoading } = useListFacturen(
    {},
    { query: { queryKey: ["facturen-controlebox"] } },
  );
  const aiMut = useAiUitlezenFactuur({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }) },
  });
  const akkoordMut = useAccorderenFactuur({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }) },
  });
  const afwijzenMut = useAfkeurenFactuur({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facturen-controlebox"] }) },
  });

  function handleAi(id: number) {
    setAiBezig(id);
    aiMut.mutate({ id }, { onSettled: () => setAiBezig(null) });
  }

  function handleAkkoord(id: number) {
    setBezig((p) => ({ ...p, akkoord: id }));
    akkoordMut.mutate({ id }, { onSettled: () => setBezig((p) => ({ ...p, akkoord: null })) });
  }

  function handleAfwijzen(id: number) {
    const reden = prompt("Reden voor afwijzing (verplicht):");
    if (!reden?.trim()) return;
    setBezig((p) => ({ ...p, afwijzen: id }));
    afwijzenMut.mutate(
      { id, data: { reden } },
      { onSettled: () => setBezig((p) => ({ ...p, afwijzen: null })) },
    );
  }

  const lijst = (facturen as Factuur[]).filter((f) => {
    if (filter !== "alle" && f.type !== filter) return false;
    return isInTab(f.status, tab);
  });

  // Tellers per tab
  const alleFacturen = facturen as Factuur[];
  const tellerInbox = alleFacturen.filter((f) => isInTab(f.status, "inbox")).length;
  const tellerBeoordelen = alleFacturen.filter((f) => isInTab(f.status, "beoordelen")).length;
  const tellerControle = alleFacturen.filter((f) => isInTab(f.status, "controle")).length;
  const tellerFouten = alleFacturen.filter((f) => isInTab(f.status, "fouten")).length;
  const aantalAfwijkingen = alleFacturen.filter((f) => f.iban_afwijking || f.accountview_status === "error").length;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      {/* Koptekst */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Financiële controlebox
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Verwerk inkomende facturen — akkordeer, corrigeer of wijs af vóór export naar AccountView.
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/facturen">
            <Button size="sm" variant="outline">
              <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
              Alle facturen
            </Button>
          </Link>
        </div>
      </div>

      {/* Samenvatting-kaartjes */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("inbox")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center">
                <Clock className="h-4.5 w-4.5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{tellerInbox}</p>
                <p className="text-xs text-muted-foreground">Nieuw / AI gelezen</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("beoordelen")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
                <CheckCircle2 className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{tellerBeoordelen}</p>
                <p className="text-xs text-muted-foreground">Te beoordelen</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("controle")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{tellerControle}</p>
                <p className="text-xs text-muted-foreground">Controle nodig</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab("fouten")}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center">
                <ShieldAlert className="h-4.5 w-4.5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{tellerFouten}</p>
                <p className="text-xs text-muted-foreground">Export fouten</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IBAN-afwijking banner */}
      {aantalAfwijkingen > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {aantalAfwijkingen} factuur{aantalAfwijkingen > 1 ? "en" : ""} met kritische afwijking
            </p>
            <p className="text-xs text-red-600">
              IBAN-afwijking of export-fout aangetroffen. Controleer vóór verdere verwerking.
            </p>
          </div>
        </div>
      )}

      {/* Tabs + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5">
              Nieuw {tellerInbox > 0 && (
                <Badge variant="secondary" className="h-4.5 text-xs px-1.5">{tellerInbox}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="beoordelen" className="gap-1.5">
              Te beoordelen {tellerBeoordelen > 0 && (
                <Badge variant="secondary" className="h-4.5 text-xs px-1.5">{tellerBeoordelen}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="controle" className="gap-1.5">
              Controle {tellerControle > 0 && (
                <Badge className="h-4.5 text-xs px-1.5 bg-amber-500">{tellerControle}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="exportklaar">Exportklaar</TabsTrigger>
            <TabsTrigger value="fouten" className="gap-1.5">
              Fouten {tellerFouten > 0 && (
                <Badge className="h-4.5 text-xs px-1.5 bg-red-500">{tellerFouten}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-1">
          {(["alle", "inkoop", "verkoop"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setFilter(f)}
            >
              {f === "alle" ? "Alle" : f === "inkoop" ? "Inkoop" : "Verkoop"}
            </Button>
          ))}
        </div>
      </div>

      {/* Factuurlijst */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-10">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : lijst.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Geen facturen in deze categorie</p>
            <p className="text-xs mt-1">
              {tab === "inbox" ? "Alle ingekomen facturen zijn reeds verwerkt." :
               tab === "beoordelen" ? "Geen facturen wachten op beoordeling." :
               tab === "controle" ? "Geen facturen vereisen handmatige controle." :
               tab === "fouten" ? "Geen export-fouten aangetroffen." :
               "Geen exportklare facturen."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y">
            {lijst.map((f) => (
              <FactuurRij
                key={f.id}
                factuur={f}
                aiBezig={aiBezig}
                onAi={handleAi}
                onAkkoord={handleAkkoord}
                onAfwijzen={handleAfwijzen}
                bezig={bezig}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
