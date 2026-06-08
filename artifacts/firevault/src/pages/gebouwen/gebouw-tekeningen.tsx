import { useRef, useState } from "react";
import {
  useListGebouwTekeningen,
  useCreateGebouwTekening,
  useDeleteGebouwTekening,
} from "@workspace/api-client-react";
import type { Verdieping } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Plus, X, Upload, ExternalLink } from "lucide-react";

const TEKENING_TYPES = [
  { waarde: "plattegrond", label: "Plattegrond" },
  { waarde: "gevelaanzicht", label: "Gevelaanzicht" },
  { waarde: "doorsnede", label: "Doorsnede" },
  { waarde: "situatietekening", label: "Situatietekening" },
  { waarde: "installatietekening", label: "Installatietekening" },
  { waarde: "detailtekening", label: "Detailtekening" },
  { waarde: "overig", label: "Overig" },
];

function typeLabel(type: string): string {
  return TEKENING_TYPES.find((t) => t.waarde === type)?.label ?? type;
}

const GEEN_BOUWLAAG = "geen";

export default function GebouwTekeningen({
  gebouwId,
  verdiepingen = [],
  isBeheerder,
}: {
  gebouwId: number;
  verdiepingen?: Verdieping[];
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: tekeningen, isLoading } = useListGebouwTekeningen(gebouwId);
  const maakTekening = useCreateGebouwTekening();
  const verwijderTekening = useDeleteGebouwTekening();
  const { uploadFile, isUploading } = useUpload();

  const inputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [naam, setNaam] = useState("");
  const [type, setType] = useState("plattegrond");
  const [schaal, setSchaal] = useState("");
  const [verdiepingId, setVerdiepingId] = useState<string>(GEEN_BOUWLAAG);
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [objectPath, setObjectPath] = useState("");
  const [fout, setFout] = useState("");

  const gesorteerdeVerdiepingen = [...verdiepingen].sort(
    (a, b) => a.niveau - b.niveau,
  );

  function bouwlaagNaam(id: number | null | undefined): string | null {
    if (id == null) return null;
    return verdiepingen.find((v) => v.id === id)?.naam ?? null;
  }

  async function kiesBestand(file: File) {
    setFout("");
    try {
      const res = await uploadFile(file);
      if (!res) {
        setFout("Uploaden mislukt. Probeer het opnieuw.");
        return;
      }
      setObjectPath(res.objectPath);
      setBestandsnaam(file.name);
      if (!naam) setNaam(file.name.replace(/\.[^.]+$/, ""));
    } catch {
      setFout("Uploaden mislukt. Probeer het opnieuw.");
    }
  }

  function reset() {
    setNaam("");
    setType("plattegrond");
    setSchaal("");
    setVerdiepingId(GEEN_BOUWLAAG);
    setBestandsnaam("");
    setObjectPath("");
    setFout("");
    setFormOpen(false);
  }

  async function opslaan() {
    if (!naam.trim() || !objectPath) return;
    await maakTekening.mutateAsync({
      id: gebouwId,
      data: {
        naam: naam.trim(),
        type,
        schaal: schaal || undefined,
        url: objectPath,
        verdieping_id:
          verdiepingId === GEEN_BOUWLAAG ? null : Number(verdiepingId),
      },
    });
    reset();
    queryClient.invalidateQueries();
  }

  async function verwijder(tekeningId: number) {
    await verwijderTekening.mutateAsync({ tekeningId });
    queryClient.invalidateQueries();
  }

  const lijst = tekeningen ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Tekeningen
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bouwtekeningen met naam, type en schaal.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden...
          </div>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen tekeningen.</p>
        ) : (
          <ul className="space-y-2">
            {lijst.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`/api/storage${t.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-sm hover:underline truncate inline-flex items-center gap-1"
                    >
                      {t.naam}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {typeLabel(t.type)}
                    </Badge>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {bouwlaagNaam(t.verdieping_id) ?? "Hele gebouw"}
                    </Badge>
                    {t.schaal && (
                      <span className="text-xs text-muted-foreground">
                        schaal {t.schaal}
                      </span>
                    )}
                  </div>
                </div>
                {isBeheerder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => verwijder(t.id)}
                    disabled={verwijderTekening.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isBeheerder && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tekening toevoegen
          </Button>
        )}

        {isBeheerder && formOpen && (
          <div className="space-y-3 rounded-md border p-3">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await kiesBestand(file);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input
                  value={naam}
                  onChange={(e) => setNaam(e.target.value)}
                  placeholder="Naam van de tekening"
                />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEKENING_TYPES.map((t) => (
                      <SelectItem key={t.waarde} value={t.waarde}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Bouwlaag</Label>
                <Select value={verdiepingId} onValueChange={setVerdiepingId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_BOUWLAAG}>Hele gebouw</SelectItem>
                    {gesorteerdeVerdiepingen.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.naam}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Schaal</Label>
                <Input
                  value={schaal}
                  onChange={(e) => setSchaal(e.target.value)}
                  placeholder="bijv. 1:100"
                />
              </div>
              <div className="space-y-1">
                <Label>Bestand</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                  disabled={isUploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  <span className="truncate">
                    {bestandsnaam || "Kies PDF of afbeelding"}
                  </span>
                </Button>
              </div>
            </div>
            {fout && <p className="text-sm text-destructive">{fout}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={opslaan}
                disabled={!naam.trim() || !objectPath || maakTekening.isPending}
              >
                {maakTekening.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Opslaan
              </Button>
              <Button variant="ghost" size="sm" onClick={reset}>
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
