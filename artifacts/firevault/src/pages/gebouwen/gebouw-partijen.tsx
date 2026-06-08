import { useState } from "react";
import {
  useListGebouwPartijen,
  useCreateGebouwPartij,
  useDeleteGebouwPartij,
} from "@workspace/api-client-react";
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
import { Contact, Loader2, Plus, X, Mail, Phone, MapPin } from "lucide-react";

const PARTIJ_TYPES = [
  { waarde: "eigenaar", label: "Eigenaar" },
  { waarde: "gebruiker", label: "Gebruiker" },
  { waarde: "opdrachtgever", label: "Opdrachtgever" },
  { waarde: "aanvrager", label: "Aanvrager" },
];

function typeLabel(type: string): string {
  return PARTIJ_TYPES.find((t) => t.waarde === type)?.label ?? type;
}

const LEEG = {
  type: "eigenaar",
  naam: "",
  organisatie: "",
  telefoon: "",
  email: "",
  adres: "",
  postcode: "",
  plaats: "",
  opmerkingen: "",
};

export default function GebouwPartijen({
  gebouwId,
  isBeheerder,
}: {
  gebouwId: number;
  isBeheerder: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: partijen, isLoading } = useListGebouwPartijen(gebouwId);
  const maakPartij = useCreateGebouwPartij();
  const verwijderPartij = useDeleteGebouwPartij();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...LEEG });

  function veld(key: keyof typeof LEEG, waarde: string) {
    setForm((f) => ({ ...f, [key]: waarde }));
  }

  async function opslaan() {
    if (!form.naam.trim()) return;
    await maakPartij.mutateAsync({
      id: gebouwId,
      data: {
        type: form.type,
        naam: form.naam.trim(),
        organisatie: form.organisatie || undefined,
        telefoon: form.telefoon || undefined,
        email: form.email || undefined,
        adres: form.adres || undefined,
        postcode: form.postcode || undefined,
        plaats: form.plaats || undefined,
        opmerkingen: form.opmerkingen || undefined,
      },
    });
    setForm({ ...LEEG });
    setFormOpen(false);
    queryClient.invalidateQueries();
  }

  async function verwijder(partijId: number) {
    await verwijderPartij.mutateAsync({ partijId });
    queryClient.invalidateQueries();
  }

  const lijst = partijen ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Contact className="h-5 w-5 text-primary" /> Partijen
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Eigenaar, gebruiker, opdrachtgever en aanvrager met contactgegevens.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden...
          </div>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen partijen geregistreerd.
          </p>
        ) : (
          <ul className="space-y-3">
            {lijst.map((p) => (
              <li key={p.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.naam}</span>
                      <Badge variant="secondary" className="text-xs">
                        {typeLabel(p.type)}
                      </Badge>
                    </div>
                    {p.organisatie && (
                      <p className="text-sm text-muted-foreground">{p.organisatie}</p>
                    )}
                    <div className="mt-2 space-y-1 text-sm">
                      {p.email && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <a href={`mailto:${p.email}`} className="hover:underline truncate">
                            {p.email}
                          </a>
                        </div>
                      )}
                      {p.telefoon && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <a href={`tel:${p.telefoon}`} className="hover:underline">
                            {p.telefoon}
                          </a>
                        </div>
                      )}
                      {(p.adres || p.postcode || p.plaats) && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {[p.adres, [p.postcode, p.plaats].filter(Boolean).join(" ")]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                    {p.opmerkingen && (
                      <p className="mt-2 text-xs text-muted-foreground">{p.opmerkingen}</p>
                    )}
                  </div>
                  {isBeheerder && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => verwijder(p.id)}
                      disabled={verwijderPartij.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isBeheerder && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Partij toevoegen
          </Button>
        )}

        {isBeheerder && formOpen && (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => veld("type", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTIJ_TYPES.map((t) => (
                      <SelectItem key={t.waarde} value={t.waarde}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Naam</Label>
                <Input
                  value={form.naam}
                  onChange={(e) => veld("naam", e.target.value)}
                  placeholder="Naam contactpersoon"
                />
              </div>
              <div className="space-y-1">
                <Label>Organisatie</Label>
                <Input
                  value={form.organisatie}
                  onChange={(e) => veld("organisatie", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Telefoon</Label>
                <Input
                  value={form.telefoon}
                  onChange={(e) => veld("telefoon", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => veld("email", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Adres</Label>
                <Input
                  value={form.adres}
                  onChange={(e) => veld("adres", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Postcode</Label>
                <Input
                  value={form.postcode}
                  onChange={(e) => veld("postcode", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Plaats</Label>
                <Input
                  value={form.plaats}
                  onChange={(e) => veld("plaats", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Opmerkingen</Label>
              <Input
                value={form.opmerkingen}
                onChange={(e) => veld("opmerkingen", e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={opslaan}
                disabled={!form.naam.trim() || maakPartij.isPending}
              >
                {maakPartij.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Opslaan
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForm({ ...LEEG });
                  setFormOpen(false);
                }}
              >
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
