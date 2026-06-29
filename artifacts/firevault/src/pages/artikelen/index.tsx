import { useState } from "react";
import { useListArtikelen, useCreateArtikel, useDeleteArtikel } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Plus, Search, Package, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useListLeveranciers } from "@workspace/api-client-react";
import type { ArtikelInput } from "@workspace/api-client-react";

export default function ArtikelenPagina() {
  const [zoek, setZoek] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const { toast } = useToast();

  const { data: artikelen = [], refetch } = useListArtikelen({ zoek: zoek || undefined });
  const { data: leveranciers = [] } = useListLeveranciers();

  const { mutate: maakAan, isPending } = useCreateArtikel({
    mutation: {
      onSuccess: () => {
        toast({ title: "Artikel aangemaakt" });
        setNieuwOpen(false);
        void refetch();
      },
      onError: () => toast({ title: "Fout bij aanmaken", variant: "destructive" }),
    },
  });

  const { mutate: verwijder } = useDeleteArtikel({
    mutation: {
      onSuccess: () => {
        toast({ title: "Artikel verwijderd" });
        void refetch();
      },
    },
  });

  const leveranciersMap = Object.fromEntries(leveranciers.map((l) => [l.id, l.naam]));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Kop */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Artikelen</h1>
          <p className="text-sm text-muted-foreground mt-1">{artikelen.length} artikel{artikelen.length !== 1 ? "en" : ""}</p>
        </div>
        <Button onClick={() => setNieuwOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nieuw artikel
        </Button>
      </div>

      {/* Zoekbalk */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Zoek op naam of code..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
        />
      </div>

      {/* Tabel */}
      {artikelen.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Geen artikelen gevonden</p>
          <p className="text-sm mt-1">Maak een nieuw artikel aan of importeer via de importmodule.</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Leverancier</TableHead>
                <TableHead>Eenheid</TableHead>
                <TableHead className="text-right">Inkoopprijs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {artikelen.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-sm">{a.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{a.naam}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {a.leverancier_naam ?? (a.leverancier_id ? leveranciersMap[a.leverancier_id] : null) ?? "—"}
                  </TableCell>
                  <TableCell>{a.eenheid}</TableCell>
                  <TableCell className="text-right">
                    {a.inkoopprijs != null
                      ? new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(a.inkoopprijs)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.actief ? "default" : "secondary"} className="text-xs">
                      {a.actief ? "Actief" : "Inactief"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      onClick={() => verwijder({ id: a.id })}
                      title="Verwijderen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Nieuw artikel modal */}
      <NieuwArtikelModal
        open={nieuwOpen}
        onClose={() => setNieuwOpen(false)}
        onOpslaan={(data) => maakAan({ data: data as ArtikelInput })}
        isPending={isPending}
        leveranciers={leveranciers.map((l) => ({ id: l.id, naam: l.naam }))}
      />
    </div>
  );
}

function NieuwArtikelModal({
  open, onClose, onOpslaan, isPending, leveranciers,
}: {
  open: boolean;
  onClose: () => void;
  onOpslaan: (data: ArtikelInput) => void;
  isPending: boolean;
  leveranciers: { id: number; naam: string }[];
}) {
  const [naam, setNaam] = useState("");
  const [code, setCode] = useState("");
  const [eenheid, setEenheid] = useState("st");
  const [inkoopprijs, setInkoopprijs] = useState("");
  const [verkoopprijs, setVerkoopprijs] = useState("");
  const [categorie, setCategorie] = useState("");
  const [leverancierId, setLeverancierId] = useState("");

  function reset() {
    setNaam(""); setCode(""); setEenheid("st"); setInkoopprijs(""); setVerkoopprijs(""); setCategorie(""); setLeverancierId("");
  }

  function handleClose() { reset(); onClose(); }

  function handleOpslaan() {
    if (!naam.trim()) return;
    const payload: ArtikelInput = {
      naam: naam.trim(),
      eenheid,
      ...(code ? { code } : {}),
      ...(inkoopprijs ? { inkoopprijs: parseFloat(inkoopprijs.replace(",", ".")) } : {}),
      ...(verkoopprijs ? { verkoopprijs: parseFloat(verkoopprijs.replace(",", ".")) } : {}),
      ...(categorie ? { categorie } : {}),
      ...(leverancierId ? { leverancier_id: parseInt(leverancierId) } : {}),
    };
    onOpslaan(payload);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuw artikel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Naam *</Label>
              <Input value={naam} onChange={(e) => setNaam(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Artikelcode</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Eenheid</Label>
              <select
                value={eenheid}
                onChange={(e) => setEenheid(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {["st", "m", "m2", "m3", "uur", "kg", "set", "doos"].map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Inkoopprijs (excl. BTW)</Label>
              <Input value={inkoopprijs} onChange={(e) => setInkoopprijs(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Verkoopprijs (excl. BTW)</Label>
              <Input value={verkoopprijs} onChange={(e) => setVerkoopprijs(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1">
              <Label>Categorie</Label>
              <Input value={categorie} onChange={(e) => setCategorie(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Leverancier</Label>
              <select
                value={leverancierId}
                onChange={(e) => setLeverancierId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">— Geen leverancier —</option>
                {leveranciers.map((l) => (
                  <option key={l.id} value={l.id}>{l.naam}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Annuleren</Button>
          <Button onClick={handleOpslaan} disabled={!naam.trim() || isPending}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
