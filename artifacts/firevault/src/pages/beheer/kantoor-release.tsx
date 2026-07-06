import { useState, useEffect, useCallback } from "react";
import { useRol } from "@/context/rol-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Package, CheckCircle2, XCircle, Clock, RotateCcw,
  Plus, ShieldCheck, AlertTriangle, ChevronDown, ChevronUp,
  FileText, Database, Zap, History,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface KantoorRelease {
  id: number;
  versienummer: string;
  label: string;
  samenvatting: string | null;
  aangemaaktOp: string;
  vrijgegevenOp: string | null;
  status: string;
  isActief: boolean;
  commitInfo: string | null;
  dbVersie: string | null;
  buildGeslaagd: boolean | null;
  testsGeslaagd: boolean | null;
  releaseReadinessAkkoord: boolean | null;
  dbWijzigingenGecontroleerd: boolean | null;
  releaseNotesAangemaakt: boolean | null;
  geenKritiekeFouten: boolean | null;
  vrijgegevenDoorNaam: string | null;
  bekendeBeperkingenJson: string | null;
  vorigeVersieId: number | null;
}

interface UpdateNotes {
  id: number;
  releaseId: number;
  toegevoegd: string | null;
  verbeterd: string | null;
  opgelost: string | null;
  beveiliging: string | null;
  bekendeProblemen: string | null;
  instructies: string | null;
}

// ── Hulpfuncties ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  acceptatie: "In acceptatie",
  vrijgegeven: "Vrijgegeven",
  vervangen: "Vervangen",
  teruggedraaid: "Teruggedraaid",
  rollback: "Teruggedraaid",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  concept: "outline",
  acceptatie: "secondary",
  vrijgegeven: "default",
  vervangen: "secondary",
  teruggedraaid: "destructive",
  rollback: "destructive",
};

function CheckItem({ label, value }: { label: string; value: boolean | null }) {
  if (value === true) return (
    <div className="flex items-center gap-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      <span>{label}</span>
    </div>
  );
  if (value === false) return (
    <div className="flex items-center gap-2 text-sm">
      <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      <span>{label}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

// ── Acceptatiechecklist-component ──────────────────────────────────────────────

function AcceptatieChecklist({
  release,
  onSaved,
}: {
  release: KantoorRelease;
  onSaved: () => void;
}) {
  const [checks, setChecks] = useState({
    buildGeslaagd: release.buildGeslaagd ?? false,
    testsGeslaagd: release.testsGeslaagd ?? false,
    releaseReadinessAkkoord: release.releaseReadinessAkkoord ?? false,
    dbWijzigingenGecontroleerd: release.dbWijzigingenGecontroleerd ?? false,
    releaseNotesAangemaakt: release.releaseNotesAangemaakt ?? false,
    geenKritiekeFouten: release.geenKritiekeFouten ?? false,
  });
  const [opslaan, setOpslaan] = useState(false);

  const slaOp = useCallback(async () => {
    setOpslaan(true);
    await fetch(`/api/kantoor-release/releases/${release.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checks),
      credentials: "include",
    });
    setOpslaan(false);
    onSaved();
  }, [checks, release.id, onSaved]);

  const LABELS: Record<string, string> = {
    buildGeslaagd: "Build geslaagd",
    testsGeslaagd: "Tests geslaagd",
    releaseReadinessAkkoord: "Release Readiness akkoord",
    dbWijzigingenGecontroleerd: "DB-wijzigingen gecontroleerd",
    releaseNotesAangemaakt: "Releasenotes aangemaakt",
    geenKritiekeFouten: "Geen kritieke fouten openstaand",
  };

  const alleGroen = Object.values(checks).every(Boolean);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Alle checks moeten groen zijn voor vrijgave naar kantoor.
      </p>
      {Object.entries(LABELS).map(([key, label]) => (
        <div key={key} className="flex items-center gap-3">
          <Checkbox
            id={key}
            checked={checks[key as keyof typeof checks]}
            onCheckedChange={(v) => setChecks(prev => ({ ...prev, [key]: Boolean(v) }))}
          />
          <label htmlFor={key} className="text-sm cursor-pointer">{label}</label>
        </div>
      ))}
      <div className={`mt-2 rounded-md px-3 py-2 text-sm font-medium ${alleGroen ? "bg-green-50 text-green-700 border border-green-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
        {alleGroen ? "Alle checks groen — vrijgave mogelijk" : `${Object.values(checks).filter(Boolean).length}/6 checks groen`}
      </div>
      <Button size="sm" onClick={slaOp} disabled={opslaan}>
        {opslaan ? "Opslaan..." : "Checks opslaan"}
      </Button>
    </div>
  );
}

// ── Nieuw release formulier ───────────────────────────────────────────────────

function NieuweReleaseDialog({ onAangemaakt }: { onAangemaakt: () => void }) {
  const [open, setOpen] = useState(false);
  const [laden, setLaden] = useState(false);
  const [form, setForm] = useState({
    versienummer: "",
    label: "",
    samenvatting: "",
    commitInfo: "",
    dbVersie: "",
    toegevoegd: "",
    verbeterd: "",
    opgelost: "",
    beveiliging: "",
    bekendeProblemen: "",
  });

  const maakAan = useCallback(async () => {
    if (!form.versienummer.trim() || !form.label.trim()) return;
    setLaden(true);
    await fetch("/api/kantoor-release/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
      credentials: "include",
    });
    setLaden(false);
    setOpen(false);
    setForm({ versienummer: "", label: "", samenvatting: "", commitInfo: "", dbVersie: "", toegevoegd: "", verbeterd: "", opgelost: "", beveiliging: "", bekendeProblemen: "" });
    onAangemaakt();
  }, [form, onAangemaakt]);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Nieuwe release
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuwe kantoorrelease aanmaken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="versienummer">Versienummer *</Label>
                <Input id="versienummer" placeholder="bijv. 1.1.0" value={form.versienummer} onChange={e => setForm(p => ({ ...p, versienummer: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="label">Label *</Label>
                <Input id="label" placeholder="bijv. Office Release v1.1.0" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="samenvatting">Samenvatting</Label>
              <Textarea id="samenvatting" rows={2} value={form.samenvatting} onChange={e => setForm(p => ({ ...p, samenvatting: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="commitInfo">Commit / checkpoint</Label>
                <Input id="commitInfo" placeholder="bijv. Checkpoint 6 jul 2026" value={form.commitInfo} onChange={e => setForm(p => ({ ...p, commitInfo: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dbVersie">DB-versie</Label>
                <Input id="dbVersie" placeholder="bijv. migratie-20260706" value={form.dbVersie} onChange={e => setForm(p => ({ ...p, dbVersie: e.target.value }))} />
              </div>
            </div>
            <Separator />
            <p className="text-sm font-medium">Releasenotes</p>
            {[
              { key: "toegevoegd", label: "Toegevoegd" },
              { key: "verbeterd", label: "Verbeterd" },
              { key: "opgelost", label: "Opgelost" },
              { key: "beveiliging", label: "Beveiliging" },
              { key: "bekendeProblemen", label: "Bekende problemen" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Textarea rows={2} value={form[key as keyof typeof form]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder="Een item per regel" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={maakAan} disabled={laden || !form.versienummer.trim() || !form.label.trim()}>
              {laden ? "Aanmaken..." : "Aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Release-kaart component ───────────────────────────────────────────────────

function ReleaseKaart({
  release,
  notes,
  onRefresh,
}: {
  release: KantoorRelease;
  notes: UpdateNotes | null;
  onRefresh: () => void;
}) {
  const [uitgevouwen, setUitgevouwen] = useState(release.isActief);
  const [vrijgeefLaden, setVrijgeefLaden] = useState(false);
  const [rollbackLaden, setRollbackLaden] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const geefVrij = useCallback(async () => {
    setVrijgeefLaden(true);
    setFout(null);
    const resp = await fetch(`/api/kantoor-release/releases/${release.id}/vrijgeven`, {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok) {
      const data = await resp.json() as { fout?: string };
      setFout(data.fout ?? "Vrijgave mislukt");
    }
    setVrijgeefLaden(false);
    onRefresh();
  }, [release.id, onRefresh]);

  const rollback = useCallback(async () => {
    if (!confirm(`Terugzetten naar v${release.versienummer}? De huidige actieve versie wordt gedeactiveerd.`)) return;
    setRollbackLaden(true);
    await fetch(`/api/kantoor-release/releases/${release.id}/rollback`, {
      method: "POST",
      credentials: "include",
    });
    setRollbackLaden(false);
    onRefresh();
  }, [release.id, release.versienummer, onRefresh]);

  const beperkingen = (() => {
    try { return release.bekendeBeperkingenJson ? JSON.parse(release.bekendeBeperkingenJson) as string[] : []; }
    catch { return []; }
  })();

  const alleChecksGroen = [
    release.buildGeslaagd,
    release.testsGeslaagd,
    release.releaseReadinessAkkoord,
    release.dbWijzigingenGecontroleerd,
    release.releaseNotesAangemaakt,
    release.geenKritiekeFouten,
  ].every(Boolean);

  return (
    <Card className={release.isActief ? "border-primary border-2" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Package className={`h-5 w-5 shrink-0 ${release.isActief ? "text-primary" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{release.label}</span>
                {release.isActief && <Badge>Actief op kantoor</Badge>}
                <Badge variant={STATUS_VARIANT[release.status] ?? "outline"}>{STATUS_LABEL[release.status] ?? release.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {release.vrijgegevenOp
                  ? `Vrijgegeven op ${new Date(release.vrijgegevenOp).toLocaleString("nl-NL")} door ${release.vrijgegevenDoorNaam ?? "—"}`
                  : `Aangemaakt op ${new Date(release.aangemaaktOp).toLocaleString("nl-NL")}`}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setUitgevouwen(v => !v)}>
            {uitgevouwen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      {uitgevouwen && (
        <CardContent className="space-y-4 pt-0">
          {release.samenvatting && (
            <p className="text-sm text-muted-foreground">{release.samenvatting}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Acceptatiechecklist */}
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Acceptatiechecklist
              </p>
              {release.status === "concept" || release.status === "acceptatie" ? (
                <AcceptatieChecklist release={release} onSaved={onRefresh} />
              ) : (
                <div className="space-y-1.5">
                  <CheckItem label="Build geslaagd" value={release.buildGeslaagd} />
                  <CheckItem label="Tests geslaagd" value={release.testsGeslaagd} />
                  <CheckItem label="Release Readiness akkoord" value={release.releaseReadinessAkkoord} />
                  <CheckItem label="DB-wijzigingen gecontroleerd" value={release.dbWijzigingenGecontroleerd} />
                  <CheckItem label="Releasenotes aangemaakt" value={release.releaseNotesAangemaakt} />
                  <CheckItem label="Geen kritieke fouten" value={release.geenKritiekeFouten} />
                </div>
              )}
            </div>

            {/* Technische info */}
            <div className="space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Database className="h-4 w-4" />
                Technische gegevens
              </p>
              <div className="space-y-1 text-sm">
                {release.commitInfo && <div className="text-muted-foreground">Commit: <span className="text-foreground">{release.commitInfo}</span></div>}
                {release.dbVersie && <div className="text-muted-foreground">DB-versie: <span className="text-foreground">{release.dbVersie}</span></div>}
              </div>
              {beperkingen.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-amber-700">Bekende beperkingen:</p>
                  <ul className="space-y-0.5">
                    {beperkingen.map((b, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Releasenotes */}
          {notes && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Releasenotes
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "toegevoegd", label: "Toegevoegd" },
                  { key: "verbeterd", label: "Verbeterd" },
                  { key: "opgelost", label: "Opgelost" },
                  { key: "beveiliging", label: "Beveiliging" },
                  { key: "bekendeProblemen", label: "Bekende problemen" },
                ].map(({ key, label }) => {
                  const val = notes[key as keyof UpdateNotes] as string | null;
                  if (!val?.trim()) return null;
                  const regels = val.split("\n").filter(r => r.trim());
                  return (
                    <div key={key} className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                      <ul className="space-y-0.5">
                        {regels.map((r, i) => (
                          <li key={i} className="text-xs flex gap-1.5">
                            <span className="text-muted-foreground shrink-0">•</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Acties */}
          {fout && <div className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{fout}</div>}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
            {!release.isActief && (release.status === "concept" || release.status === "acceptatie") && (
              <Button
                size="sm"
                disabled={!alleChecksGroen || vrijgeefLaden}
                onClick={geefVrij}
              >
                <Zap className="h-4 w-4 mr-1" />
                {vrijgeefLaden ? "Vrijgeven..." : "Vrijgeven naar kantoor"}
              </Button>
            )}
            {!release.isActief && release.status === "vrijgegeven" && (
              <Button size="sm" variant="outline" onClick={rollback} disabled={rollbackLaden}>
                <RotateCcw className="h-4 w-4 mr-1" />
                {rollbackLaden ? "Terugzetten..." : "Terugzetten (rollback)"}
              </Button>
            )}
            {release.isActief && release.vorigeVersieId && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <History className="h-3 w-3" />
                Vorige versie beschikbaar voor rollback in de lijst hieronder
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function KantoorReleaseDashboard() {
  const { echteRol } = useRol();
  const isHoofdbeheerder = echteRol === "hoofdbeheerder";

  const [releases, setReleases] = useState<KantoorRelease[]>([]);
  const [notesMap, setNotesMap] = useState<Record<number, UpdateNotes>>({});
  const [laden, setLaden] = useState(true);
  const [actieveTab, setActieveTab] = useState<"dashboard" | "releases">("dashboard");

  const laadReleases = useCallback(async () => {
    setLaden(true);
    try {
      const resp = await fetch("/api/kantoor-release/releases", { credentials: "include" });
      if (!resp.ok) return;
      const data = await resp.json() as KantoorRelease[];
      setReleases(data);

      // Laad notes voor elke release
      const map: Record<number, UpdateNotes> = {};
      await Promise.all(
        data.map(async (r) => {
          const d = await fetch(`/api/kantoor-release/releases/${r.id}`, { credentials: "include" });
          if (d.ok) {
            const detail = await d.json() as { release: KantoorRelease; notes: UpdateNotes | null };
            if (detail.notes) map[r.id] = detail.notes;
          }
        })
      );
      setNotesMap(map);
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => { void laadReleases(); }, [laadReleases]);

  const actieve = releases.find(r => r.isActief);

  if (!isHoofdbeheerder) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Alleen toegankelijk voor de hoofdbeheerder.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kantoor Release Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Versie- en releasebeheer van FPS Connect voor kantoorgebruik
          </p>
        </div>
        <NieuweReleaseDialog onAangemaakt={laadReleases} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {[
          { id: "dashboard", label: "Dashboard" },
          { id: "releases", label: `Alle releases (${releases.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${actieveTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            onClick={() => setActieveTab(tab.id as typeof actieveTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {laden ? (
        <div className="text-center py-16 text-muted-foreground">Laden...</div>
      ) : actieveTab === "dashboard" ? (
        <div className="space-y-6">
          {/* Huidige kantoorversie */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Huidige kantoorversie</CardTitle>
              </CardHeader>
              <CardContent>
                {actieve ? (
                  <>
                    <div className="text-2xl font-bold">v{actieve.versienummer}</div>
                    <div className="text-sm text-muted-foreground mt-1">{actieve.label}</div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">Geen actieve versie</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Vrijgegeven op</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-semibold">
                  {actieve?.vrijgegevenOp
                    ? new Date(actieve.vrijgegevenOp).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
                    : "—"}
                </div>
                {actieve?.vrijgegevenDoorNaam && (
                  <div className="text-sm text-muted-foreground mt-1">door {actieve.vrijgegevenDoorNaam}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Release status</CardTitle>
              </CardHeader>
              <CardContent>
                {actieve ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-700">Vrijgegeven</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <span className="font-semibold text-amber-700">Geen actieve versie</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  {releases.filter(r => r.status === "concept" || r.status === "acceptatie").length} in voorbereiding
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actieve release detail */}
          {actieve && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">Actieve kantoorversie</h2>
              <ReleaseKaart
                release={actieve}
                notes={notesMap[actieve.id] ?? null}
                onRefresh={laadReleases}
              />
            </div>
          )}

          {/* Releases in voorbereiding */}
          {releases.filter(r => r.status === "concept" || r.status === "acceptatie").length > 0 && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold">In voorbereiding</h2>
              {releases
                .filter(r => r.status === "concept" || r.status === "acceptatie")
                .map(r => (
                  <ReleaseKaart key={r.id} release={r} notes={notesMap[r.id] ?? null} onRefresh={laadReleases} />
                ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {releases.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              Nog geen releases aangemaakt
            </div>
          ) : (
            releases.map(r => (
              <ReleaseKaart key={r.id} release={r} notes={notesMap[r.id] ?? null} onRefresh={laadReleases} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
