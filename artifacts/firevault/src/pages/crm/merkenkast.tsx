// MERK_01 deel A — Merkenkast: per werkmaatschappij de huisstijl uit één bron
// (de werkgever-huisstijl die ook de documentopmaak voedt). Bekijken en
// downloaden op crm niveau 3; beheren gebeurt via Organisatie → Documentopmaak.
import { useState } from "react";
import { useListMerkenkast, type MerkenkastWerkgever } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Download, Copy, Palette, Type, FileText, Building2, Package } from "lucide-react";

const VARIANT_LABELS: Record<string, string> = {
  kleur: "Kleur", wit: "Wit", zwart: "Zwart", liggend: "Liggend",
  vierkant: "Vierkant", transparant: "Transparant",
};

function Kleurvlak({ naam, hex }: { naam: string; hex: string }) {
  const { toast } = useToast();
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-muted"
      onClick={() => { navigator.clipboard.writeText(hex); toast({ title: `${hex} gekopieerd` }); }}
      data-testid={`kleur-${hex.replace("#", "")}`}
    >
      <span className="h-5 w-5 rounded border" style={{ backgroundColor: hex }} />
      <span className="text-left">
        <span className="block leading-tight">{naam}</span>
        <span className="block font-mono text-xs text-muted-foreground leading-tight">{hex}</span>
      </span>
      <Copy className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function Tekstblok({ label, tekst }: { label: string; tekst: string | null | undefined }) {
  const { toast } = useToast();
  if (!tekst) return null;
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2"
          onClick={() => { navigator.clipboard.writeText(tekst); toast({ title: `${label} gekopieerd` }); }}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
      <p className="whitespace-pre-wrap text-sm">{tekst}</p>
    </div>
  );
}

function MerkKaart({ merk }: { merk: MerkenkastWerkgever }) {
  const varianten = Object.entries(merk.logo_varianten ?? {});
  const kleuren = [{ naam: "Primair", hex: merk.primaire_kleur }, ...(merk.merk_kleuren ?? [])];
  const contactregels = [
    [merk.adres, [merk.postcode, merk.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [merk.telefoon, merk.email, merk.website].filter(Boolean).join(" · "),
    [merk.kvk ? `KvK ${merk.kvk}` : null, merk.btw ? `BTW ${merk.btw}` : null, merk.iban ? `IBAN ${merk.iban}` : null].filter(Boolean).join(" · "),
  ].filter(Boolean);

  return (
    <Card data-testid={`merkkaart-${merk.werkgever_id}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4" style={{ color: merk.primaire_kleur }} />
          {merk.naam}
        </CardTitle>
        <Button asChild size="sm" data-testid={`pakket-${merk.werkgever_id}`}>
          <a href={`/api/merkenkast/${merk.werkgever_id}/pakket`} download>
            <Package className="mr-1 h-4 w-4" /> Download pakket
          </a>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Logo's */}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Logo's</p>
          {merk.logo_url || varianten.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              {merk.logo_url ? (
                <a href={merk.logo_url} download className="group flex flex-col items-center gap-1 rounded-md border p-2 hover:bg-muted">
                  <img src={merk.logo_url} alt={`Logo ${merk.naam}`} className="h-14 max-w-32 object-contain" />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Download className="h-3 w-3" />Hoofdlogo</span>
                </a>
              ) : null}
              {varianten.map(([variant, url]) => (
                <a key={variant} href={url} download className="group flex flex-col items-center gap-1 rounded-md border p-2 hover:bg-muted"
                  data-testid={`logo-${variant}-${merk.werkgever_id}`}>
                  <img src={url} alt={`Logo ${VARIANT_LABELS[variant] ?? variant}`} className={`h-14 max-w-32 object-contain ${variant === "wit" ? "rounded bg-slate-800 p-1" : ""}`} />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><Download className="h-3 w-3" />{VARIANT_LABELS[variant] ?? variant}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nog geen logo's vastgelegd — beheer via Organisatie → Documentopmaak.</p>
          )}
        </div>
        {/* Kleuren */}
        <div>
          <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Palette className="h-3 w-3" />Merkkleuren</p>
          <div className="flex flex-wrap gap-2">
            {kleuren.map((k, index) => <Kleurvlak key={`${k.hex}-${index}`} naam={k.naam || "Kleur"} hex={k.hex} />)}
          </div>
        </div>
        {/* Lettertype */}
        <div>
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground"><Type className="h-3 w-3" />Lettertype</p>
          <p className="text-sm">{merk.lettertype ?? <span className="text-muted-foreground">Niet vastgelegd</span>}</p>
        </div>
        {/* Standaardteksten */}
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><FileText className="h-3 w-3" />Standaardteksten</p>
          <Tekstblok label="Korte omschrijving" tekst={merk.omschrijving_kort} />
          <Tekstblok label="Lange omschrijving" tekst={merk.omschrijving_lang} />
          {!merk.omschrijving_kort && !merk.omschrijving_lang ? (
            <p className="text-sm text-muted-foreground">Nog geen omschrijvingen vastgelegd.</p>
          ) : null}
          {contactregels.length > 0 ? <Tekstblok label="Contactgegevens" tekst={contactregels.join("\n")} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrmMerkenkast() {
  const { data: merken, isLoading } = useListMerkenkast();
  const [filter] = useState("");
  void filter;

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="pagina-merkenkast">
      <div>
        <h1 className="text-xl font-semibold">Merkenkast</h1>
        <p className="text-sm text-muted-foreground">
          De huisstijl per werkmaatschappij, uit dezelfde bron als de documentopmaak. Download losse
          bestanden of het volledige pakket voor CapCut, Canva en andere ontwerpprogramma's.
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">{[1, 2].map((n) => <Skeleton key={n} className="h-72" />)}</div>
      ) : !merken || merken.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Geen actieve werkmaatschappijen gevonden. <Badge variant="secondary">Beheer via Organisatie → Documentopmaak</Badge>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {merken.map((m) => <MerkKaart key={m.werkgever_id} merk={m} />)}
        </div>
      )}
    </div>
  );
}
