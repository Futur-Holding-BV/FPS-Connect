import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListWerkgevers,
  getListAanvraagVoorstellenQueryKey,
  useVerwerkInboxOfferteavanvraag,
} from "@workspace/api-client-react";
import type { InboxOfferteverwerkingResultaat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FileText, Plus, XCircle, Sparkles, Upload, Building2, Mail,
  Paperclip, X, CheckCircle, ExternalLink,
} from "lucide-react";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type AanvraagStap = "werkmaatschappij" | "upload" | "verwerken" | "resultaat";

interface AanvraagState {
  stap: AanvraagStap;
  werkmaatschappijId: string;
  emailBestand: File | null;
  bijlagen: File[];
  resultaat: InboxOfferteverwerkingResultaat | null;
  fout: string | null;
}

const ACCEPTEER_EMAIL = ".eml,.msg,.pdf,.docx,.doc,.txt";
const ACCEPTEER_BIJLAGEN = ".pdf,.docx,.doc,.xlsx,.xls,.txt,.jpg,.jpeg,.png,.eml,.msg";

const LEEG: AanvraagState = {
  stap: "werkmaatschappij",
  werkmaatschappijId: "",
  emailBestand: null,
  bijlagen: [],
  resultaat: null,
  fout: null,
};

export function OfferteAanvraagWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const verwerkMutatie = useVerwerkInboxOfferteavanvraag();
  const [aanvraag, setAanvraag] = useState<AanvraagState>(LEEG);
  const [dropActief, setDropActief] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const bijlagenInputRef = useRef<HTMLInputElement>(null);

  const { data: werkgevers = [] } = useListWerkgevers();

  function sluit() {
    onOpenChange(false);
    setAanvraag(LEEG);
    setDropActief(false);
  }

  const onEmailDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropActief(false);
    const bestand = e.dataTransfer.files[0];
    if (bestand) setAanvraag((a) => ({ ...a, emailBestand: bestand }));
  }, []);

  const onBijlagenDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const nieuw = Array.from(e.dataTransfer.files);
    setAanvraag((a) => ({ ...a, bijlagen: [...a.bijlagen, ...nieuw] }));
  }, []);

  async function verwerkAanvraag() {
    if (!aanvraag.werkmaatschappijId || !aanvraag.emailBestand) return;
    setAanvraag((a) => ({ ...a, stap: "verwerken", fout: null }));

    try {
      const resultaat = await verwerkMutatie.mutateAsync({
        data: {
          werkmaatschappij_id: Number(aanvraag.werkmaatschappijId),
          email: aanvraag.emailBestand,
          bijlagen: aanvraag.bijlagen.length > 0 ? aanvraag.bijlagen : undefined,
        },
      });

      setAanvraag((a) => ({ ...a, stap: "resultaat", resultaat }));
      await qc.invalidateQueries({ queryKey: getListAanvraagVoorstellenQueryKey() });
    } catch (err) {
      setAanvraag((a) => ({ ...a, stap: "upload", fout: err instanceof Error ? err.message : "Verwerken mislukt" }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) sluit(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" /> Aanvraag-voorstel verwerken
          </DialogTitle>
        </DialogHeader>

        {/* Stap 1 — Werkmaatschappij */}
        {aanvraag.stap === "werkmaatschappij" && (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-800">
              <p className="font-medium flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Werkmaatschappij selecteren</p>
              <p className="mt-1">Kies eerst welke werkmaatschappij deze aanvraag in behandeling neemt. AI verwerkt de e-mail daarna automatisch als voorstel.</p>
            </div>
            <div>
              <Label>Werkmaatschappij <span className="text-destructive">*</span></Label>
              <Select value={aanvraag.werkmaatschappijId} onValueChange={(v) => setAanvraag((a) => ({ ...a, werkmaatschappijId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecteer werkmaatschappij..." />
                </SelectTrigger>
                <SelectContent>
                  {werkgevers.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>{w.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {werkgevers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Geen werkmaatschappijen gevonden. Voeg ze toe via HRM.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={sluit}>Annuleren</Button>
              <Button disabled={!aanvraag.werkmaatschappijId} onClick={() => setAanvraag((a) => ({ ...a, stap: "upload" }))}>
                Volgende
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Stap 2 — Upload */}
        {aanvraag.stap === "upload" && (
          <div className="space-y-4">
            {aanvraag.fout && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-start gap-2">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{aanvraag.fout}</span>
              </div>
            )}

            {/* E-mail uploaden */}
            <div>
              <Label className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Bron aanvraag</Label>
              <div
                className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${dropActief ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                onDragOver={(e) => { e.preventDefault(); setDropActief(true); }}
                onDragLeave={() => setDropActief(false)}
                onDrop={onEmailDrop}
                onClick={() => emailInputRef.current?.click()}
              >
                <input
                  ref={emailInputRef}
                  type="file"
                  accept={ACCEPTEER_EMAIL}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setAanvraag((a) => ({ ...a, emailBestand: f }));
                  }}
                />
                {aanvraag.emailBestand ? (
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="font-medium truncate max-w-[220px]">{aanvraag.emailBestand.name}</span>
                    <span className="text-muted-foreground text-xs">({formatBytes(aanvraag.emailBestand.size)})</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAanvraag((a) => ({ ...a, emailBestand: null })); }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-xs">Sleep of klik om de aanvraag te uploaden</p>
                    <p className="text-xs opacity-60 mt-0.5">.eml, .msg, .pdf, .docx, .txt</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Verplicht: de bron-email moet worden geüpload.</p>
            </div>

            {/* Bijlagen */}
            <div>
              <Label className="flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> Bijlagen <span className="text-muted-foreground font-normal">(optioneel)</span></Label>
              <div
                className="mt-1 border border-dashed border-border rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={onBijlagenDrop}
                onClick={() => bijlagenInputRef.current?.click()}
              >
                <input
                  ref={bijlagenInputRef}
                  type="file"
                  accept={ACCEPTEER_BIJLAGEN}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const bestanden = Array.from(e.target.files ?? []);
                    setAanvraag((a) => ({ ...a, bijlagen: [...a.bijlagen, ...bestanden] }));
                  }}
                />
                <p className="text-xs text-muted-foreground">Sleep bijlagen of klik</p>
              </div>
              {aanvraag.bijlagen.length > 0 && (
                <div className="mt-2 space-y-1">
                  {aanvraag.bijlagen.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1">
                      <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{b.name}</span>
                      <span className="text-muted-foreground shrink-0">{formatBytes(b.size)}</span>
                      <button
                        onClick={() => setAanvraag((a) => ({ ...a, bijlagen: a.bijlagen.filter((_, j) => j !== i) }))}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAanvraag((a) => ({ ...a, stap: "werkmaatschappij", fout: null }))}>
                Terug
              </Button>
              <Button onClick={verwerkAanvraag} disabled={!aanvraag.emailBestand} className="gap-1.5" data-testid="button-ai-verwerken">
                <Sparkles className="w-3.5 h-3.5" /> AI laten verwerken
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Stap 3 — Verwerken */}
        {aanvraag.stap === "verwerken" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto animate-pulse">
              <Sparkles className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="font-medium">AI analyseert de aanvraag...</p>
              <p className="text-sm text-muted-foreground mt-1">Leesbare tekst uit de e-mail en bijlagen wordt als bron verwerkt. Even geduld.</p>
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>Relatie en contactpersoon koppelen</p>
              <p>Gevraagde werkzaamheden samenvatten</p>
              <p>Intake-voorstel klaarzetten ter beoordeling</p>
            </div>
          </div>
        )}

        {/* Stap 4 — Resultaat */}
        {aanvraag.stap === "resultaat" && aanvraag.resultaat && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-800 text-sm">Aanvraag klaargezet</p>
                {aanvraag.resultaat.ai_samenvatting && (
                  <p className="text-xs text-emerald-700 mt-1">{aanvraag.resultaat.ai_samenvatting}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {aanvraag.resultaat.aangemaakt?.voorstel && aanvraag.resultaat.voorstel_id && (
                <Link href={`/crm/aanvragen`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-lg border hover:border-amber-400 hover:bg-amber-50 transition-colors group cursor-pointer"
                    onClick={sluit}
                    data-testid="voorstel-id" data-voorstel-id={aanvraag.resultaat.voorstel_id}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center">
                        <FileText className="w-4 h-4 text-amber-700" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Beoordeel het voorstel</p>
                        <p className="text-xs text-muted-foreground group-hover:text-amber-700 transition-colors">Controleer de AI suggesties en bevestig de intake</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-amber-700 transition-colors" />
                  </div>
                </Link>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={sluit}>Sluiten</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
