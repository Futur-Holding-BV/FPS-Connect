import { useParams, Link } from "wouter";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInspectie,
  useUpdateInspectie,
  useListInspectieBevindingen,
  useCreateInspectieBevinding,
  usePatchInspectieBevinding,
  useDeleteInspectieBevinding,
  useAddBevindingFoto,
  useDeleteBevindingFoto,
  useCreateBevindingHerstel,
  useCreateHerinspectie,
  useListVoorzieningen,
  useListToewijsbareGebruikers,
  getListInspectieBevindingenQueryKey,
  getGetInspectieQueryKey,
  InspectieBevinding,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Plus, Pencil,
  Trash2, Camera, Wrench, RefreshCw, Image, ExternalLink,
} from "lucide-react";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fotoSrc(path: string): string {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  return `/api/storage/${path}`;
}

// Sentinel-waarden: Radix Select crasht bij value="" (zelfde bug als profielen-bewerken)
const GEEN_SPOT = "__geen_spot__";
const GEEN_TOEWIJZING = "__geen_toewijzing__";
const ZELFDE_INSPECTEUR = "__zelfde_inspecteur__";

const BEVINDING_STATUS = {
  goed: { label: "Goed", kleur: "bg-green-100 text-green-800 border-green-200", icoon: CheckCircle2 },
  aandacht: { label: "Aandacht vereist", kleur: "bg-amber-100 text-amber-800 border-amber-200", icoon: AlertTriangle },
  afkeur: { label: "Afgekeurd", kleur: "bg-red-100 text-red-800 border-red-200", icoon: XCircle },
};

const STATUS_KLEUR: Record<string, string> = {
  gepland: "bg-blue-100 text-blue-800 border-blue-200",
  in_uitvoering: "bg-yellow-100 text-yellow-800 border-yellow-200",
  afgerond: "bg-green-100 text-green-800 border-green-200",
  afgekeurd: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  gepland: "Gepland",
  in_uitvoering: "In uitvoering",
  afgerond: "Afgerond",
  afgekeurd: "Afgekeurd",
};

const TYPE_LABEL: Record<string, string> = {
  oplevering: "Opleveringsinspectie",
  periodiek: "Periodieke inspectie",
  jaarlijks: "Jaarlijkse inspectie",
  herstel: "Herstelinspectie",
};

// ── BevindingKaart ─────────────────────────────────────────────────────────────

function BevindingKaart({
  bev,
  inspectieId,
  gebouwId,
  onEdit,
  onHerstel,
}: {
  bev: InspectieBevinding;
  inspectieId: number;
  gebouwId: number | null | undefined;
  onEdit: (bev: InspectieBevinding) => void;
  onHerstel: (bevId: number) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    uploadFile,
    retryUpload,
    isUploading,
    error: uploadError,
    uploadFoutType,
  } = useUpload({
    gebouw_id: gebouwId ?? 0,
    bestand_type: "inspectie",
  });

  const deleteMutatie = useDeleteInspectieBevinding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
      },
      onError: () => toast({ title: "Verwijderen mislukt", variant: "destructive" }),
    },
  });

  const addFotoMutatie = useAddBevindingFoto({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
      },
      onError: () => toast({ title: "Foto opslaan mislukt", variant: "destructive" }),
    },
  });

  const deleteFotoMutatie = useDeleteBevindingFoto({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
      },
    },
  });

  async function verwerkFoto(file: File) {
    const res = await uploadFile(file);
    if (res?.objectPath) {
      addFotoMutatie.mutate({ id: inspectieId, bevId: bev.id, data: { url: res.objectPath } });
    }
  }

  async function probeerFotoOpnieuw() {
    const res = await retryUpload();
    if (res?.objectPath) {
      addFotoMutatie.mutate({ id: inspectieId, bevId: bev.id, data: { url: res.objectPath } });
    }
  }

  const statusInfo = BEVINDING_STATUS[bev.status as keyof typeof BEVINDING_STATUS] ?? BEVINDING_STATUS.goed;
  const Icoon = statusInfo.icoon;

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`mt-0.5 p-1.5 rounded-md border shrink-0 ${statusInfo.kleur}`}>
              <Icoon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`text-xs ${statusInfo.kleur}`}>
                  {statusInfo.label}
                </Badge>
                {bev.voorziening_objectnummer && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {bev.voorziening_objectnummer}
                    {bev.voorziening_type && ` — ${bev.voorziening_type}`}
                  </span>
                )}
                {!bev.voorziening_objectnummer && (
                  <span className="text-xs text-muted-foreground italic">Algemeen</span>
                )}
              </div>
              {bev.omschrijving && (
                <p className="text-sm mt-1 text-foreground">{bev.omschrijving}</p>
              )}
              {bev.aanbeveling && (
                <p className="text-sm mt-1 text-muted-foreground italic">
                  Aanbeveling: {bev.aanbeveling}
                </p>
              )}
              {bev.herstel_werkbon_id && (
                <div className="mt-2">
                  <Link href={`/onderhoud/${bev.herstel_werkbon_id}`}>
                    <Badge variant="outline" className="text-xs gap-1 cursor-pointer hover:bg-muted">
                      <Wrench className="h-3 w-3" />
                      Werkbon #{bev.herstel_werkbon_id}
                      <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </Link>
                </div>
              )}
              {bev.foto_urls.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {bev.foto_urls.map((url, i) => (
                    <div key={i} className="relative group/foto">
                      <a href={fotoSrc(url)} target="_blank" rel="noreferrer">
                        <img
                          src={fotoSrc(url)}
                          alt={`Foto ${i + 1}`}
                          className="h-16 w-16 object-cover rounded border"
                        />
                      </a>
                      <button
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 text-xs hidden group-hover/foto:flex items-center justify-center"
                        onClick={() => deleteFotoMutatie.mutate({ id: inspectieId, bevId: bev.id, data: { url } })}
                        title="Foto verwijderen"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Foto toevoegen"
              onClick={() => fileRef.current?.click()}
              disabled={isUploading || !gebouwId}
            >
              {isUploading ? (
                <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void verwerkFoto(file);
                e.target.value = "";
              }}
            />

            {(bev.status === "afkeur" || bev.status === "aandacht") && !bev.herstel_werkbon_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Herstelwerkbon aanmaken"
                onClick={() => onHerstel(bev.id)}
              >
                <Wrench className="h-4 w-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Bewerken"
              onClick={() => onEdit(bev)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              title="Verwijderen"
              onClick={() => {
                if (confirm("Bevinding verwijderen?")) {
                  deleteMutatie.mutate({ id: inspectieId, bevId: bev.id });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {uploadError && (
          <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-1.5">
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {uploadFoutType === "netwerk"
                ? "Verbinding tijdelijk weggevallen"
                : uploadFoutType === "bestandstype"
                  ? "Bestandstype geweigerd"
                  : "Foto-upload mislukt"}
            </p>
            <p className="text-xs text-muted-foreground">{uploadError.message}</p>
            <div className="flex gap-2">
              {uploadFoutType !== "bestandstype" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={isUploading}
                  onClick={() => void probeerFotoOpnieuw()}
                >
                  Opnieuw proberen
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={isUploading}
                onClick={() => fileRef.current?.click()}
              >
                Ander bestand kiezen
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Hoofd-pagina ───────────────────────────────────────────────────────────────

type BevindingForm = {
  voorziening_id: string;
  status: string;
  omschrijving: string;
  aanbeveling: string;
  herstel_vereist: boolean;
};

const LEEG_FORM: BevindingForm = {
  voorziening_id: "",
  status: "goed",
  omschrijving: "",
  aanbeveling: "",
  herstel_vereist: false,
};

export default function InspectieDetail() {
  const { id } = useParams<{ id: string }>();
  const inspectieId = parseInt(id ?? "0");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<BevindingForm>(LEEG_FORM);

  const [editBev, setEditBev] = useState<InspectieBevinding | null>(null);
  const [editForm, setEditForm] = useState<BevindingForm>(LEEG_FORM);

  const [herstellBevId, setHerstellBevId] = useState<number | null>(null);
  const [herstellForm, setHerstellForm] = useState({ titel: "", omschrijving: "", prioriteit: "normaal", toegewezen_aan_id: "" });

  const [herinspectieOpen, setHerinspectieOpen] = useState(false);
  const [herinspectieForm, setHerinspectieForm] = useState({ geplande_datum: "", inspecteur_id: "" });

  const { data: inspectie, isLoading } = useGetInspectie(inspectieId);

  const { data: bevindingen } = useListInspectieBevindingen(inspectieId);

  const { data: voorzieningenData } = useListVoorzieningen(
    { gebouw_id: inspectie?.gebouw_id ?? undefined, per_pagina: 500 }
  );

  const { data: toewijsbareGebruikers } = useListToewijsbareGebruikers({});

  const statusMutatie = useUpdateInspectie({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetInspectieQueryKey(inspectieId) });
        toast({ title: "Status bijgewerkt" });
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });

  const createMutatie = useCreateInspectieBevinding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
        setAddOpen(false);
        setAddForm(LEEG_FORM);
        toast({ title: "Bevinding toegevoegd" });
      },
      onError: () => toast({ title: "Toevoegen mislukt", variant: "destructive" }),
    },
  });

  const editMutatie = usePatchInspectieBevinding({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
        setEditBev(null);
        toast({ title: "Bevinding bijgewerkt" });
      },
      onError: () => toast({ title: "Bijwerken mislukt", variant: "destructive" }),
    },
  });

  const herstellMutatie = useCreateBevindingHerstel({
    mutation: {
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: getListInspectieBevindingenQueryKey(inspectieId) });
        setHerstellBevId(null);
        toast({ title: `Werkbon aangemaakt: ${data.werkbon_titel}` });
      },
      onError: () => toast({ title: "Aanmaken werkbon mislukt", variant: "destructive" }),
    },
  });

  const herinspectieMutatie = useCreateHerinspectie({
    mutation: {
      onSuccess: (data) => {
        setHerinspectieOpen(false);
        toast({ title: "Herinspectie ingepland" });
        window.location.href = `/inspecties/${data.id}`;
      },
      onError: () => toast({ title: "Herinspectie aanmaken mislukt", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Laden...</div>;
  }

  if (!inspectie) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Inspectie niet gevonden.</p>
        <Button variant="outline" className="mt-3" asChild>
          <Link href="/inspecties"><ArrowLeft className="h-4 w-4 mr-1" /> Terug</Link>
        </Button>
      </div>
    );
  }

  const telGoed = (bevindingen ?? []).filter((b) => b.status === "goed").length;
  const telAandacht = (bevindingen ?? []).filter((b) => b.status === "aandacht").length;
  const telAfkeur = (bevindingen ?? []).filter((b) => b.status === "afkeur").length;
  const totaal = (bevindingen ?? []).length;

  const heeftAfkeur = telAfkeur > 0;
  const isGepland = inspectie.status === "gepland";
  const isInUitvoering = inspectie.status === "in_uitvoering";
  const isAfgerond = inspectie.status === "afgerond";
  const isAfgekeurd = inspectie.status === "afgekeurd";

  function slaOpBevinding() {
    createMutatie.mutate({
      id: inspectieId,
      data: {
        voorziening_id: addForm.voorziening_id ? parseInt(addForm.voorziening_id) : undefined,
        status: addForm.status as "goed" | "aandacht" | "afkeur",
        omschrijving: addForm.omschrijving || undefined,
        aanbeveling: addForm.aanbeveling || undefined,
        herstel_vereist: addForm.herstel_vereist,
      },
    });
  }

  function slaEditOp() {
    if (!editBev) return;
    editMutatie.mutate({
      id: inspectieId,
      bevId: editBev.id,
      data: {
        status: editForm.status as "goed" | "aandacht" | "afkeur",
        omschrijving: editForm.omschrijving || undefined,
        aanbeveling: editForm.aanbeveling || undefined,
        herstel_vereist: editForm.herstel_vereist,
      },
    });
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" asChild>
          <Link href="/inspecties"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 data-paginatitel className="text-xl font-bold">
              {TYPE_LABEL[inspectie.type ?? ""] ?? inspectie.type}
            </h1>
            <Badge variant="outline" className={STATUS_KLEUR[inspectie.status ?? ""]}>
              {STATUS_LABEL[inspectie.status ?? ""] ?? inspectie.status}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground flex-wrap">
            {inspectie.gebouw_naam && <span>{inspectie.gebouw_naam}</span>}
            {inspectie.geplande_datum && (
              <span>Gepland: {new Date(inspectie.geplande_datum + "T00:00:00").toLocaleDateString("nl-NL")}</span>
            )}
            {inspectie.uitgevoerd_datum && (
              <span>Uitgevoerd: {new Date(inspectie.uitgevoerd_datum + "T00:00:00").toLocaleDateString("nl-NL")}</span>
            )}
            {inspectie.inspecteur_naam && <span>Inspecteur: {inspectie.inspecteur_naam}</span>}
          </div>
        </div>
      </div>

      {/* Status workflow */}
      <div className="flex items-center gap-2 flex-wrap">
        {isGepland && (
          <Button
            size="sm"
            onClick={() => statusMutatie.mutate({ id: inspectieId, data: { status: "in_uitvoering" } })}
            disabled={statusMutatie.isPending}
          >
            Inspectie starten
          </Button>
        )}
        {isInUitvoering && (
          <>
            <Button
              size="sm"
              onClick={() => statusMutatie.mutate({
                id: inspectieId,
                data: { status: "afgerond", uitgevoerd_datum: new Date().toISOString().slice(0, 10) },
              })}
              disabled={statusMutatie.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Inspectie afronden
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => statusMutatie.mutate({ id: inspectieId, data: { status: "afgekeurd" } })}
              disabled={statusMutatie.isPending}
            >
              Afkeuren
            </Button>
          </>
        )}
        {(isAfgerond || isAfgekeurd) && heeftAfkeur && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHerinspectieOpen(true)}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Herinspectie inplannen
          </Button>
        )}
      </div>

      {/* Goedkeuring */}
      <div className="flex items-center gap-2 flex-wrap">
        <GoedkeuringWidget
          objectType="inspectie"
          objectId={inspectieId}
          documentType="inspectie"
          omschrijving={`${TYPE_LABEL[inspectie.type ?? ""] ?? inspectie.type}${inspectie.gebouw_naam ? ` — ${inspectie.gebouw_naam}` : ""}`}
          toonIndienKnop={isAfgerond}
        />
      </div>

      {/* Statistieken */}
      {totaal > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-2xl font-bold text-green-600">{telGoed}</p>
              <p className="text-xs text-muted-foreground">Goed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{telAandacht}</p>
              <p className="text-xs text-muted-foreground">Aandacht</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <p className="text-2xl font-bold text-red-600">{telAfkeur}</p>
              <p className="text-xs text-muted-foreground">Afgekeurd</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bevindingen */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bevindingen ({totaal})</h2>
          <Button size="sm" onClick={() => { setAddForm(LEEG_FORM); setAddOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Toevoegen
          </Button>
        </div>

        {totaal === 0 && (
          <Card>
            <CardContent className="py-10 text-center">
              <Image className="h-8 w-8 mx-auto text-muted-foreground opacity-30 mb-2" />
              <p className="text-sm text-muted-foreground">Nog geen bevindingen geregistreerd.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => { setAddForm(LEEG_FORM); setAddOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Eerste bevinding toevoegen
              </Button>
            </CardContent>
          </Card>
        )}

        {(bevindingen ?? []).map((bev) => (
          <BevindingKaart
            key={bev.id}
            bev={bev}
            inspectieId={inspectieId}
            gebouwId={inspectie.gebouw_id}
            onEdit={(b) => {
              setEditBev(b);
              setEditForm({
                voorziening_id: String(b.voorziening_id ?? ""),
                status: b.status,
                omschrijving: b.omschrijving ?? "",
                aanbeveling: b.aanbeveling ?? "",
                herstel_vereist: b.herstel_vereist,
              });
            }}
            onHerstel={(bevId) => {
              setHerstellBevId(bevId);
              const bv = (bevindingen ?? []).find((x) => x.id === bevId);
              setHerstellForm({
                titel: `Herstel ${bv?.voorziening_objectnummer ?? "bevinding"}`,
                omschrijving: bv?.omschrijving ?? "",
                prioriteit: "normaal",
                toegewezen_aan_id: "",
              });
            }}
          />
        ))}
      </div>

      {/* Notities */}
      {(inspectie.bevindingen || inspectie.aanbevelingen) && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm">Algemene notities</CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-2 text-sm">
            {inspectie.bevindingen && <p>{inspectie.bevindingen}</p>}
            {inspectie.aanbevelingen && (
              <p className="text-muted-foreground italic">Aanbevelingen: {inspectie.aanbevelingen}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog: Bevinding toevoegen */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bevinding toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Spot (optioneel)</Label>
              <Select value={addForm.voorziening_id || GEEN_SPOT} onValueChange={(v) => setAddForm((f) => ({ ...f, voorziening_id: v === GEEN_SPOT ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Algemene bevinding (geen spot)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_SPOT}>Algemeen</SelectItem>
                  {(voorzieningenData?.items ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.objectnummer} — {v.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={addForm.status} onValueChange={(v) => setAddForm((f) => ({ ...f, status: v, herstel_vereist: v === "afkeur" ? true : f.herstel_vereist }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="goed">Goed</SelectItem>
                  <SelectItem value="aandacht">Aandacht vereist</SelectItem>
                  <SelectItem value="afkeur">Afgekeurd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea
                value={addForm.omschrijving}
                onChange={(e) => setAddForm((f) => ({ ...f, omschrijving: e.target.value }))}
                placeholder="Beschrijf de bevinding..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aanbeveling (optioneel)</Label>
              <Input
                value={addForm.aanbeveling}
                onChange={(e) => setAddForm((f) => ({ ...f, aanbeveling: e.target.value }))}
                placeholder="Wat moet er gedaan worden?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuleren</Button>
            <Button onClick={slaOpBevinding} disabled={createMutatie.isPending}>
              {createMutatie.isPending ? "Opslaan..." : "Toevoegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Bevinding bewerken */}
      <Dialog open={!!editBev} onOpenChange={(o) => !o && setEditBev(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bevinding bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="goed">Goed</SelectItem>
                  <SelectItem value="aandacht">Aandacht vereist</SelectItem>
                  <SelectItem value="afkeur">Afgekeurd</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea
                value={editForm.omschrijving}
                onChange={(e) => setEditForm((f) => ({ ...f, omschrijving: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aanbeveling</Label>
              <Input
                value={editForm.aanbeveling}
                onChange={(e) => setEditForm((f) => ({ ...f, aanbeveling: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBev(null)}>Annuleren</Button>
            <Button onClick={slaEditOp} disabled={editMutatie.isPending}>
              {editMutatie.isPending ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Herstelwerkbon aanmaken */}
      <Dialog open={herstellBevId !== null} onOpenChange={(o) => !o && setHerstellBevId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Herstelwerkbon aanmaken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Titel</Label>
              <Input
                value={herstellForm.titel}
                onChange={(e) => setHerstellForm((f) => ({ ...f, titel: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea
                value={herstellForm.omschrijving}
                onChange={(e) => setHerstellForm((f) => ({ ...f, omschrijving: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioriteit</Label>
              <Select value={herstellForm.prioriteit} onValueChange={(v) => setHerstellForm((f) => ({ ...f, prioriteit: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="laag">Laag</SelectItem>
                  <SelectItem value="normaal">Normaal</SelectItem>
                  <SelectItem value="hoog">Hoog</SelectItem>
                  <SelectItem value="kritiek">Kritiek</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Toewijzen aan (optioneel)</Label>
              <Select value={herstellForm.toegewezen_aan_id || GEEN_TOEWIJZING} onValueChange={(v) => setHerstellForm((f) => ({ ...f, toegewezen_aan_id: v === GEEN_TOEWIJZING ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Niet toewijzen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_TOEWIJZING}>Niet toewijzen</SelectItem>
                  {(toewijsbareGebruikers ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHerstellBevId(null)}>Annuleren</Button>
            <Button
              onClick={() => {
                if (!herstellBevId) return;
                herstellMutatie.mutate({
                  id: inspectieId,
                  bevId: herstellBevId,
                  data: {
                    titel: herstellForm.titel || undefined,
                    omschrijving: herstellForm.omschrijving || undefined,
                    prioriteit: herstellForm.prioriteit,
                    toegewezen_aan_id: herstellForm.toegewezen_aan_id ? parseInt(herstellForm.toegewezen_aan_id) : undefined,
                  },
                });
              }}
              disabled={herstellMutatie.isPending}
            >
              <Wrench className="h-4 w-4 mr-1" />
              {herstellMutatie.isPending ? "Aanmaken..." : "Werkbon aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Herinspectie */}
      <Dialog open={herinspectieOpen} onOpenChange={(o) => !o && setHerinspectieOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Herinspectie inplannen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Er wordt een nieuwe herstelinspectie aangemaakt op basis van deze inspectie.
              Er {telAfkeur === 1 ? "is" : "zijn"} {telAfkeur} afgekeurde {telAfkeur === 1 ? "bevinding" : "bevindingen"}.
            </p>
            <div className="space-y-1.5">
              <Label>Geplande datum (optioneel)</Label>
              <Input
                type="date"
                value={herinspectieForm.geplande_datum}
                onChange={(e) => setHerinspectieForm((f) => ({ ...f, geplande_datum: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Inspecteur (optioneel)</Label>
              <Select value={herinspectieForm.inspecteur_id || ZELFDE_INSPECTEUR} onValueChange={(v) => setHerinspectieForm((f) => ({ ...f, inspecteur_id: v === ZELFDE_INSPECTEUR ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Zelfde als huidige inspectie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ZELFDE_INSPECTEUR}>Zelfde inspecteur</SelectItem>
                  {(toewijsbareGebruikers ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHerinspectieOpen(false)}>Annuleren</Button>
            <Button
              onClick={() => herinspectieMutatie.mutate({
                id: inspectieId,
                data: {
                  geplande_datum: herinspectieForm.geplande_datum || undefined,
                  inspecteur_id: herinspectieForm.inspecteur_id ? parseInt(herinspectieForm.inspecteur_id) : undefined,
                },
              })}
              disabled={herinspectieMutatie.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              {herinspectieMutatie.isPending ? "Aanmaken..." : "Herinspectie aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
