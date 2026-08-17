import { useState, useRef } from "react";
import {
  useGetBoekhouderDashboard, useGetBoekhouderUploads,
  useGetBoekhouderDeclaraties, useGetBoekhouderVerlof,
  usePostBoekhouderDeclaratiesIdVerwerken, usePostBoekhouderVerlofIdVerwerken,
} from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, ClipboardList, Banknote, HardDriveUpload, LayoutDashboard, Receipt, CalendarDays, CheckCircle2 } from "lucide-react";

const HUIDIG_JAAR = new Date().getFullYear();

const MAP_OPTIES = [
  { waarde: "jaarrekening", label: "Jaarrekening" },
  { waarde: "btw-aangifte", label: "BTW-aangifte" },
  { waarde: "loonaangifte", label: "Loonaangifte" },
  { waarde: "verzekeringen", label: "Verzekeringen" },
  { waarde: "kvk", label: "KVK-documenten" },
  { waarde: "pensioen", label: "Pensioendocumenten" },
  { waarde: "audit", label: "Auditdocumenten" },
  { waarde: "overig", label: "Overig" },
];

export default function BoekhouderPage() {
  const [werkgeverId, setWerkgeverId] = useState<number | undefined>(undefined);
  const [mapFilter, setMapFilter] = useState("alle");
  const [jaarFilter, setJaarFilter] = useState(HUIDIG_JAAR);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: werkgevers = [] } = useListWerkgevers();

  const dashboardParams: Record<string, unknown> = {};
  if (werkgeverId) dashboardParams.werkgever_id = werkgeverId;
  const { data: dashboard } = useGetBoekhouderDashboard(dashboardParams);

  const uploadsParams: Record<string, unknown> = { jaar: jaarFilter };
  if (werkgeverId) uploadsParams.werkgever_id = werkgeverId;
  if (mapFilter !== "alle") uploadsParams.map = mapFilter;
  const { data: uploads = [], refetch: refetchUploads } = useGetBoekhouderUploads(uploadsParams);

  // LOON_01: goedgekeurde posten voor de loonstrook — na verwerken verdwijnen ze.
  const [toonVerwerkteDeclaraties, setToonVerwerkteDeclaraties] = useState(false);
  const [toonVerwerktVerlof, setToonVerwerktVerlof] = useState(false);
  const { data: declaraties = [], refetch: refetchDeclaraties } =
    useGetBoekhouderDeclaraties({ verwerkt: toonVerwerkteDeclaraties });
  const { data: verlofposten = [], refetch: refetchVerlof } =
    useGetBoekhouderVerlof({ verwerkt: toonVerwerktVerlof });
  const verwerkDeclaratie = usePostBoekhouderDeclaratiesIdVerwerken({
    mutation: { onSuccess: () => { refetchDeclaraties(); } },
  });
  const verwerkVerlof = usePostBoekhouderVerlofIdVerwerken({
    mutation: { onSuccess: () => { refetchVerlof(); } },
  });

  async function uploadBestand(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("bestand", file);
      formData.append("map", mapFilter !== "alle" ? mapFilter : "overig");
      if (werkgeverId) formData.append("werkgever_id", String(werkgeverId));
      formData.append("periode_jaar", String(jaarFilter));

      const res = await fetch("/api/boekhouder/uploads", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload mislukt");
      refetchUploads();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1, HUIDIG_JAAR - 2, HUIDIG_JAAR - 3];

  const geselecteerdeWerkgever = werkgevers.find((wg) => wg.id === werkgeverId);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">Boekhouderportaal</h1>
            <p className="text-sm text-muted-foreground">Documenten voor de externe boekhouder — uploads en overzichten</p>
          </div>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.xlsx,.csv,.zip,.docx"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBestand(file);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <HardDriveUpload size={16} className="mr-2" />
            {uploading ? "Uploaden..." : "Document uploaden"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select
          value={werkgeverId ? String(werkgeverId) : "alle"}
          onValueChange={(v) => setWerkgeverId(v === "alle" ? undefined : Number(v))}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Alle werkgevers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkgevers</SelectItem>
            {werkgevers.map((wg) => <SelectItem key={wg.id} value={String(wg.id)}>{wg.naam}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[
            { label: "Openstaande mutaties", waarde: dashboard.openstaande_mutaties, icoon: ClipboardList, kleur: "text-amber-600" },
            { label: "Wachtend loon-output", waarde: dashboard.wachtend_loon_output, icoon: FileText, kleur: "text-blue-600" },
            { label: "Eigen uploads", waarde: dashboard.eigen_uploads, icoon: Upload, kleur: "text-green-600" },
            { label: "SEPA-bestanden", waarde: dashboard.sepa_bestanden, icoon: Banknote, kleur: "text-purple-600" },
            { label: "Loonaanlever-conceptmails", waarde: dashboard.scab_mails_concept ?? 0, icoon: FileText, kleur: "text-orange-600" },
          ].map(({ label, waarde, icoon: Icoon, kleur }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icoon size={18} className={kleur} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
                <p className="text-2xl font-bold">{waarde}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt size={16} className="text-muted-foreground" />
              {toonVerwerkteDeclaraties ? "Verwerkte declaraties" : "Goedgekeurde declaraties voor de loonstrook"}
            </CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => setToonVerwerkteDeclaraties((v) => !v)}>
              {toonVerwerkteDeclaraties ? "Toon openstaand" : "Toon verwerkt"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {declaraties.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              {toonVerwerkteDeclaraties ? "Nog geen verwerkte declaraties." : "Geen openstaande goedgekeurde declaraties."}
            </div>
          ) : (
            <div className="space-y-2">
              {declaraties.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{d.medewerker_naam} — {d.omschrijving}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{d.categorie}</span>
                      <span>{d.datum}</span>
                      {d.goedgekeurd_op && <span>goedgekeurd {new Date(d.goedgekeurd_op).toLocaleDateString("nl-NL")}{d.goedgekeurd_door_naam ? ` door ${d.goedgekeurd_door_naam}` : ""}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">€ {(d.bedrag_totaal_cents / 100).toFixed(2)}</span>
                    {toonVerwerkteDeclaraties ? (
                      <Badge variant="secondary" className="text-xs"><CheckCircle2 size={12} className="mr-1" />Verwerkt</Badge>
                    ) : (
                      <Button size="sm" className="h-7 text-xs"
                        disabled={verwerkDeclaratie.isPending}
                        onClick={() => verwerkDeclaratie.mutate({ id: d.id })}>
                        Markeer als verwerkt
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays size={16} className="text-muted-foreground" />
              {toonVerwerktVerlof ? "Verwerkt verlof" : "Goedgekeurd verlof voor de loonstrook"}
            </CardTitle>
            <Button variant="outline" size="sm" className="h-8 text-xs"
              onClick={() => setToonVerwerktVerlof((v) => !v)}>
              {toonVerwerktVerlof ? "Toon openstaand" : "Toon verwerkt"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {verlofposten.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              {toonVerwerktVerlof ? "Nog geen verwerkt verlof." : "Geen openstaand goedgekeurd verlof."}
            </div>
          ) : (
            <div className="space-y-2">
              {verlofposten.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{v.medewerker_naam} — {v.verlofsoort_naam}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span>{v.start_datum} t/m {v.eind_datum}</span>
                      {v.goedgekeurd_op && <span>goedgekeurd {new Date(v.goedgekeurd_op).toLocaleDateString("nl-NL")}{v.goedgekeurd_door_naam ? ` door ${v.goedgekeurd_door_naam}` : ""}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-semibold">{v.aantal_uren} uur</span>
                    {toonVerwerktVerlof ? (
                      <Badge variant="secondary" className="text-xs"><CheckCircle2 size={12} className="mr-1" />Verwerkt</Badge>
                    ) : (
                      <Button size="sm" className="h-7 text-xs"
                        disabled={verwerkVerlof.isPending}
                        onClick={() => verwerkVerlof.mutate({ id: v.id })}>
                        Markeer als verwerkt
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Geüploade documenten</CardTitle>
            <div className="flex gap-2">
              <Select value={mapFilter} onValueChange={setMapFilter}>
                <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Alle mappen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle mappen</SelectItem>
                  {MAP_OPTIES.map((m) => <SelectItem key={m.waarde} value={m.waarde}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(jaarFilter)} onValueChange={(v) => setJaarFilter(Number(v))}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {uploads.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Geen documenten gevonden. Upload het eerste document via de knop rechtsboven.
            </div>
          ) : (
            <div className="space-y-2">
              {uploads.map((u) => {
                const mapLabel = MAP_OPTIES.find((m) => m.waarde === u.map)?.label ?? u.map;
                return (
                  <div key={u.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText size={18} className="text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.bestandsnaam}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span>{mapLabel}</span>
                          {u.periode_jaar && <span>{u.periode_jaar}</span>}
                          {u.uploader_naam && <span>door {u.uploader_naam}</span>}
                          {u.bestandsgrootte && <span>{(u.bestandsgrootte / 1024).toFixed(0)} KB</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!u.gelezen && (
                        <Badge variant="secondary" className="text-xs">Nieuw</Badge>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                        <a href={`/api/storage/download?path=${encodeURIComponent(u.object_path)}`} download={u.bestandsnaam}>
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
