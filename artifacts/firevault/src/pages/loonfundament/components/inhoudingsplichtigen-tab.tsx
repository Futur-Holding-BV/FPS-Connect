import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLoonInhoudingsplichtigen,
  useUpdateLoonInhoudingsplichtige,
  useListLoonfundamentCaoCatalogus,
  getListLoonInhoudingsplichtigenQueryKey,
  LoonInhoudingsplichtigeUpdateAangiftetijdvak,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Building2, ChevronDown, ChevronUp, Save } from "lucide-react";
import { StatusBadge } from "./helpers";

type FormState = {
  loonheffingennummer: string;
  sectorcode: string;
  risicogroep: string;
  aangiftetijdvak: string;
  eigenrisicodrager_wga: boolean;
  eigenrisicodrager_zw: boolean;
  loonkostenvoordeel_instelling: boolean;
  cao_id: string;
};

const LEEG_FORM: FormState = {
  loonheffingennummer: "",
  sectorcode: "",
  risicogroep: "",
  aangiftetijdvak: "",
  eigenrisicodrager_wga: false,
  eigenrisicodrager_zw: false,
  loonkostenvoordeel_instelling: false,
  cao_id: "",
};

const BOOL_VELDEN: { key: keyof FormState; label: string }[] = [
  { key: "eigenrisicodrager_wga", label: "Eigenrisicodrager WGA" },
  { key: "eigenrisicodrager_zw", label: "Eigenrisicodrager ZW" },
  { key: "loonkostenvoordeel_instelling", label: "LKV-instelling" },
];

export function InhoudingsplichtigenTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: inhoudingsplichtigen = [], isLoading } = useListLoonInhoudingsplichtigen();
  const { data: caos = [] } = useListLoonfundamentCaoCatalogus();

  const [bewerkenId, setBewerkenId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(LEEG_FORM);

  const updateMutation = useUpdateLoonInhoudingsplichtige({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListLoonInhoudingsplichtigenQueryKey() });
        toast({ title: "Fiscale werkgever bijgewerkt" });
        setBewerkenId(null);
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  type IP = (typeof inhoudingsplichtigen)[number];

  function startBewerken(ip: IP) {
    setBewerkenId(ip.id);
    setForm({
      loonheffingennummer: ip.loonheffingennummer ?? "",
      sectorcode: ip.sectorcode ?? "",
      risicogroep: ip.risicogroep ?? "",
      aangiftetijdvak: ip.aangiftetijdvak ?? "",
      eigenrisicodrager_wga: ip.eigenrisicodrager_wga,
      eigenrisicodrager_zw: ip.eigenrisicodrager_zw,
      loonkostenvoordeel_instelling: ip.loonkostenvoordeel_instelling,
      cao_id: String(ip.cao_id),
    });
  }

  function slaOp(id: number) {
    updateMutation.mutate({
      id,
      data: {
        cao_id: form.cao_id ? Number(form.cao_id) : undefined,
        loonheffingennummer: form.loonheffingennummer || null,
        sectorcode: form.sectorcode || null,
        risicogroep: form.risicogroep || null,
        aangiftetijdvak:
          (form.aangiftetijdvak as LoonInhoudingsplichtigeUpdateAangiftetijdvak) || null,
        eigenrisicodrager_wga: form.eigenrisicodrager_wga,
        eigenrisicodrager_zw: form.eigenrisicodrager_zw,
        loonkostenvoordeel_instelling: form.loonkostenvoordeel_instelling,
      },
    });
  }

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Laden…</div>;
  }

  if (inhoudingsplichtigen.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground text-sm">
        Geen inhoudingsplichtigen gevonden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {inhoudingsplichtigen.map((ip) => (
        <Card key={ip.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                {ip.naam}
                <StatusBadge volledig={ip.compleet} />
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  bewerkenId === ip.id ? setBewerkenId(null) : startBewerken(ip)
                }
              >
                {bewerkenId === ip.id ? (
                  <><ChevronUp className="w-3 h-3 mr-1" />Sluiten</>
                ) : (
                  <><ChevronDown className="w-3 h-3 mr-1" />Bewerken</>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-3">
              <div>
                <dt className="text-muted-foreground text-xs">CAO</dt>
                <dd>{ip.cao_naam} ({ip.cao_code})</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Loonheffingennummer</dt>
                <dd>
                  {ip.loonheffingennummer ?? (
                    <span className="text-amber-600">Ontbreekt</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Sectorcode</dt>
                <dd>{ip.sectorcode ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Risicogroep</dt>
                <dd>{ip.risicogroep ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Aangiftetijdvak</dt>
                <dd>
                  {ip.aangiftetijdvak === "maand"
                    ? "Maand"
                    : ip.aangiftetijdvak === "vier_weken"
                    ? "Vier weken"
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Eigenrisicodrager WGA</dt>
                <dd>{ip.eigenrisicodrager_wga ? "Ja" : "Nee"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Eigenrisicodrager ZW</dt>
                <dd>{ip.eigenrisicodrager_zw ? "Ja" : "Nee"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">LKV-instelling</dt>
                <dd>{ip.loonkostenvoordeel_instelling ? "Ja" : "Nee"}</dd>
              </div>
            </dl>

            {ip.migratiebevindingen.length > 0 && (
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-0.5">
                {ip.migratiebevindingen.map((b) => (
                  <div key={b.id}>⚠ {b.veld}: {b.reden}</div>
                ))}
              </div>
            )}

            {bewerkenId === ip.id && (
              <div className="mt-4 border-t pt-4 space-y-4">
                <h4 className="text-sm font-medium">Fiscale werkgever bijwerken</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor={`cao-${ip.id}`}>CAO</Label>
                    <Select
                      value={form.cao_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, cao_id: v }))}
                    >
                      <SelectTrigger id={`cao-${ip.id}`}>
                        <SelectValue placeholder="Kies CAO" />
                      </SelectTrigger>
                      <SelectContent>
                        {caos.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.naam} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`lhn-${ip.id}`}>Loonheffingennummer</Label>
                    <Input
                      id={`lhn-${ip.id}`}
                      placeholder="000000000L00"
                      value={form.loonheffingennummer}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, loonheffingennummer: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`sec-${ip.id}`}>Sectorcode</Label>
                    <Input
                      id={`sec-${ip.id}`}
                      placeholder="bijv. 52"
                      maxLength={2}
                      value={form.sectorcode}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, sectorcode: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`rg-${ip.id}`}>Risicogroep</Label>
                    <Input
                      id={`rg-${ip.id}`}
                      placeholder="bijv. 1"
                      maxLength={2}
                      value={form.risicogroep}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, risicogroep: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`atv-${ip.id}`}>Aangiftetijdvak</Label>
                    <Select
                      value={form.aangiftetijdvak || "_geen"}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          aangiftetijdvak: v === "_geen" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger id={`atv-${ip.id}`}>
                        <SelectValue placeholder="Kies tijdvak" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_geen">— niet ingesteld —</SelectItem>
                        <SelectItem value="maand">Maand</SelectItem>
                        <SelectItem value="vier_weken">Vier weken</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  {BOOL_VELDEN.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={form[key] as boolean}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: e.target.checked }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => slaOp(ip.id)}
                    disabled={updateMutation.isPending}
                  >
                    <Save className="w-3.5 h-3.5 mr-1.5" />
                    {updateMutation.isPending ? "Opslaan…" : "Opslaan"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBewerkenId(null)}
                  >
                    Annuleren
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
