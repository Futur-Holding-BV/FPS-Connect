import { useState } from "react";
import { Link } from "wouter";
import {
  useListGebouwPartijen,
  useCreateGebouwPartij,
  useUpdateGebouwPartij,
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
import {
  Contact,
  Loader2,
  Plus,
  X,
  Pencil,
  Eye,
  Mail,
  Phone,
  MapPin,
  Globe,
} from "lucide-react";

const PARTIJ_TYPES = [
  { waarde: "eigenaar", label: "Eigenaar" },
  { waarde: "gebruiker", label: "Gebruiker" },
  { waarde: "opdrachtgever", label: "Opdrachtgever" },
  { waarde: "aanvrager", label: "Aanvrager" },
  { waarde: "installateur", label: "Installateur" },
  { waarde: "aannemer", label: "Aannemer" },
];

function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function typeLabel(type: string): string {
  return PARTIJ_TYPES.find((t) => t.waarde === type)?.label ?? type;
}

const LEEG = {
  type: "eigenaar",
  naam: "",
  organisatie: "",
  telefoon: "",
  email: "",
  website: "",
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
  const wijzigPartij = useUpdateGebouwPartij();
  const verwijderPartij = useDeleteGebouwPartij();

  const [formOpen, setFormOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...LEEG });
  const [ingeklapt, setIngeklapt] = useState<Set<number>>(new Set());

  function toggleIngeklapt(id: number) {
    setIngeklapt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const bezig = maakPartij.isPending || wijzigPartij.isPending;

  function veld(key: keyof typeof LEEG, waarde: string) {
    setForm((f) => ({ ...f, [key]: waarde }));
  }

  function sluitForm() {
    setForm({ ...LEEG });
    setBewerkId(null);
    setFormOpen(false);
  }

  function startBewerken(p: (typeof lijst)[number]) {
    setForm({
      type: p.type ?? "eigenaar",
      naam: p.naam ?? "",
      organisatie: p.organisatie ?? "",
      telefoon: p.telefoon ?? "",
      email: p.email ?? "",
      website: p.website ?? "",
      adres: p.adres ?? "",
      postcode: p.postcode ?? "",
      plaats: p.plaats ?? "",
      opmerkingen: p.opmerkingen ?? "",
    });
    setBewerkId(p.id);
    setFormOpen(true);
  }

  async function opslaan() {
    if (!form.naam.trim()) return;
    const data = {
      type: form.type,
      naam: form.naam.trim(),
      organisatie: form.organisatie || undefined,
      telefoon: form.telefoon || undefined,
      email: form.email || undefined,
      website: form.website || undefined,
      adres: form.adres || undefined,
      postcode: form.postcode || undefined,
      plaats: form.plaats || undefined,
      opmerkingen: form.opmerkingen || undefined,
    };
    if (bewerkId != null) {
      await wijzigPartij.mutateAsync({ partijId: bewerkId, data });
    } else {
      await maakPartij.mutateAsync({ id: gebouwId, data });
    }
    sluitForm();
    queryClient.invalidateQueries();
  }

  async function verwijder(partijId: number) {
    await verwijderPartij.mutateAsync({ partijId });
    queryClient.invalidateQueries();
  }

  const lijst = partijen ?? [];
  const heeftOpdrachtgever = lijst.some((p) => p.type === "opdrachtgever");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Contact className="h-5 w-5 text-primary" /> Opdrachtgevers
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Eigenaar, gebruiker, opdrachtgever en aanvrager met contactgegevens.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && !heeftOpdrachtgever && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2 mb-2">
            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-medium text-red-900">Let op: Opdrachtgever ontbreekt</p>
              <p>Dit gebouw heeft geen gekoppelde opdrachtgever. Voeg een partij van type "Opdrachtgever" toe voor volledige projectdata.</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden...
          </div>
        ) : lijst.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen opdrachtgevers geregistreerd.
          </p>
        ) : (
          <ul className="space-y-3">
            {lijst.map((p) => (
              <li key={p.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(p as any).klant_id && (
                        <Link href={`/crm/klanten/${(p as any).klant_id}`}>
                          <Badge variant="outline" className="text-[10px] bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600">
                            CRM Klant
                          </Badge>
                        </Link>
                      )}
                      {(p as any).contactpersoon_id && (
                        <Link href={`/crm/contactpersonen/${(p as any).contactpersoon_id}`}>
                          <Badge variant="outline" className="text-[10px] bg-slate-50 hover:bg-slate-100 cursor-pointer text-slate-600">
                            CRM Contact
                          </Badge>
                        </Link>
                      )}
                      <span className="font-medium">{p.naam}</span>
                      <Badge variant="secondary" className="text-xs">
                        {typeLabel(p.type)}
                      </Badge>
                    </div>
                    {p.organisatie && (
                      <p className="text-sm text-muted-foreground">{p.organisatie}</p>
                    )}
                    {!ingeklapt.has(p.id) && (
                      <>
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
                          {p.website && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Globe className="h-3.5 w-3.5 shrink-0" />
                              <a
                                href={websiteHref(p.website)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline truncate"
                              >
                                {p.website}
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
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      onClick={() => toggleIngeklapt(p.id)}
                      title={ingeklapt.has(p.id) ? "Details tonen" : "Details verbergen"}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isBeheerder && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          onClick={() => startBewerken(p)}
                          disabled={bezig || verwijderPartij.isPending}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => verwijder(p.id)}
                          disabled={verwijderPartij.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {isBeheerder && !formOpen && (
          <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Opdrachtgever toevoegen
          </Button>
        )}

        {isBeheerder && formOpen && (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">
              {bewerkId != null ? "Opdrachtgever wijzigen" : "Nieuwe opdrachtgever"}
            </p>
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
                <Label>Website</Label>
                <Input
                  type="url"
                  placeholder="bijv. www.bedrijf.nl"
                  value={form.website}
                  onChange={(e) => veld("website", e.target.value)}
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
                disabled={!form.naam.trim() || bezig}
              >
                {bezig ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {bewerkId != null ? "Wijzigingen opslaan" : "Opslaan"}
              </Button>
              <Button variant="ghost" size="sm" onClick={sluitForm}>
                Annuleren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
