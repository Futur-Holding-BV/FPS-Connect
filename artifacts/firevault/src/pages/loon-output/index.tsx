import { useState, useRef } from "react";
import { useGetLoonOutput, usePatchLoonOutputId, usePostLoonOutputIdPubliceer } from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Eye, EyeOff, FileText } from "lucide-react";

const HUIDIG_JAAR = new Date().getFullYear();
const HUIDIG_MAAND = new Date().getMonth() + 1;

const MAAND_NAMEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

const BESTAND_TYPE_LABELS: Record<string, string> = {
  loonstrook: "Loonstrook",
  jaaropgave: "Jaaropgave",
  loonaangifte: "Loonaangifte",
  urenexport: "Urenexport",
  verlofoverzicht: "Verlofoverzicht",
  overig: "Overig",
};

const STATUS_KLEUR: Record<string, string> = {
  ontvangen: "bg-yellow-100 text-yellow-800",
  gepubliceerd: "bg-green-100 text-green-800",
  gearchiveerd: "bg-gray-100 text-gray-700",
};

export default function LoonOutputPage() {
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [maand, setMaand] = useState(HUIDIG_MAAND);
  const [typeFilter, setTypeFilter] = useState("alle");
  const [werkmaatschappijFilter, setWerkmaatschappijFilter] = useState("alle");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const params: Record<string, unknown> = { jaar, maand };
  if (typeFilter !== "alle") params.type = typeFilter;
  if (werkmaatschappijFilter !== "alle") params.werkmaatschappij = werkmaatschappijFilter;

  const { data: bestanden = [], refetch } = useGetLoonOutput(params);
  const { data: werkgevers = [] } = useListWerkgevers();
  const patchBestand = usePatchLoonOutputId();
  const publiceerBestand = usePostLoonOutputIdPubliceer();

  async function uploadBestand(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("bestand", file);
      formData.append("type", "overig");
      if (werkmaatschappijFilter !== "alle") formData.append("werkmaatschappij", werkmaatschappijFilter);
      formData.append("periode_jaar", String(jaar));
      formData.append("periode_maand", String(maand));
      formData.append("bron", "beheerder");

      const res = await fetch("/api/loon-output", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) throw new Error("Upload mislukt");
      refetch();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function publiceer(id: number) {
    await publiceerBestand.mutateAsync({ id });
    refetch();
  }

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1, HUIDIG_JAAR - 2];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="text-primary" size={24} />
          <div>
            <h1 data-paginatitel className="text-2xl font-semibold">Loon-output bestanden</h1>
            <p className="text-sm text-muted-foreground">Loonstroken, jaaropgaven en overige output van de salarisverwerker</p>
          </div>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.xlsx,.csv,.zip"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadBestand(file);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload size={16} className="mr-2" />
            {uploading ? "Uploaden..." : "Bestand uploaden"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAAND_NAMEN.map((nm, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Alle types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle types</SelectItem>
            {Object.entries(BESTAND_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={werkmaatschappijFilter} onValueChange={setWerkmaatschappijFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Alle werkmaatschappijen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {bestanden.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Geen bestanden voor {MAAND_NAMEN[maand - 1]} {jaar}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {bestanden.map((b) => {
            const statusKleur = STATUS_KLEUR[b.status] ?? "bg-gray-100 text-gray-700";
            return (
              <Card key={b.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{b.bestandsnaam}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {BESTAND_TYPE_LABELS[b.type] ?? b.type}
                        </Badge>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusKleur}`}>
                          {b.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                        {b.werkmaatschappij && <span>{b.werkmaatschappij}</span>}
                        {b.medewerker_naam && <span>{b.medewerker_naam}</span>}
                        {b.bron && <span>Bron: {b.bron}</span>}
                        {b.bestandsgrootte && (
                          <span>{(b.bestandsgrootte / 1024).toFixed(0)} KB</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {b.status === "ontvangen" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => publiceer(b.id)}
                          disabled={publiceerBestand.isPending}>
                          <Eye size={12} className="mr-1" />
                          Publiceren
                        </Button>
                      )}
                      {b.status === "gepubliceerd" && (
                        <Badge variant="secondary" className="text-xs">
                          <Eye size={10} className="mr-1" /> Zichtbaar voor medewerker
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
