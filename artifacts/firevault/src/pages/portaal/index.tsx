import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPortaal,
  usePatchPortaalTracking,
  useCreatePortaalVraag,
  useOndertekenenPortaal,
  useAfwijzenPortaal,
  getGetPortaalQueryKey,
} from "@workspace/api-client-react";
import type { PortaalOfferte } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, MessageSquare, PenLine, AlertTriangle } from "lucide-react";

function euro(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

const PORTAAL_STATUS_LABEL: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  bekeken: "Bekeken",
  ondertekend: "Geaccepteerd",
  afgewezen: "Afgewezen",
};

interface PortaalPaginaProps {
  token: string;
}

export default function PortaalPagina({ token }: PortaalPaginaProps) {
  const qc = useQueryClient();
  const { data: offerte, isLoading, isError, error } = useGetPortaal(token);

  const trackEvent = usePatchPortaalTracking();
  const stelVraag = useCreatePortaalVraag();
  const onderteken = useOndertekenenPortaal();
  const afwijs = useAfwijzenPortaal();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tekenRef = useRef(false);
  const [heeftHandtekening, setHeeftHandtekening] = useState(false);
  const [handtekeningFase, setHandtekeningFase] = useState<"wacht" | "tekenen" | "naam" | "voltooid" | "afgewezen">("wacht");

  const [sigNaam, setSigNaam] = useState("");
  const [sigBedrijf, setSigBedrijf] = useState("");
  const [sigFunctie, setSigFunctie] = useState("");

  const [vraagOpen, setVraagOpen] = useState(false);
  const [vraagNaam, setVraagNaam] = useState("");
  const [vraagEmail, setVraagEmail] = useState("");
  const [vraagTekst, setVraagTekst] = useState("");
  const [vraagVerstuurd, setVraagVerstuurd] = useState(false);

  const [bezig, setBezig] = useState(false);
  const [afwijsReden, setAfwijsReden] = useState("");
  const [afwijsOpen, setAfwijsOpen] = useState(false);

  const heeftGespoord = useRef(false);

  useEffect(() => {
    if (offerte && !heeftGespoord.current) {
      heeftGespoord.current = true;
      trackEvent.mutate({ token, data: { event: "geopend" } });
    }
  }, [offerte]);

  const tekenStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    tekenRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const tekenBeweeg = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!tekenRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHeeftHandtekening(true);
  }, []);

  const tekenEinde = useCallback(() => {
    tekenRef.current = false;
  }, []);

  function wisHandtekening() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHeeftHandtekening(false);
  }

  async function bevestigHandtekening() {
    if (!heeftHandtekening) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setBezig(true);
    try {
      await onderteken.mutateAsync({
        token,
        data: {
          naam: sigNaam.trim(),
          bedrijf: sigBedrijf.trim() || undefined,
          functie: sigFunctie.trim() || undefined,
          handtekening_data_url: dataUrl,
        },
      });
      await qc.invalidateQueries({ queryKey: getGetPortaalQueryKey(token) });
      setHandtekeningFase("voltooid");
    } catch {
      setHandtekeningFase("tekenen");
    } finally {
      setBezig(false);
    }
  }

  async function bevestigAfwijzen() {
    setBezig(true);
    try {
      await afwijs.mutateAsync({ token, data: { reden: afwijsReden.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getGetPortaalQueryKey(token) });
      setHandtekeningFase("afgewezen");
      setAfwijsOpen(false);
    } catch {
      // noop
    } finally {
      setBezig(false);
    }
  }

  async function verstuurVraag() {
    if (!vraagTekst.trim()) return;
    setBezig(true);
    try {
      await stelVraag.mutateAsync({
        token,
        data: {
          naam: vraagNaam.trim() || undefined,
          email: vraagEmail.trim() || undefined,
          vraag: vraagTekst.trim(),
        },
      });
      setVraagVerstuurd(true);
      setVraagOpen(false);
      setVraagTekst("");
      setVraagEmail("");
    } catch {
      // noop
    } finally {
      setBezig(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !offerte) {
    const isVerlopen = isError && error && "status" in error && (error as { status: number }).status === 410;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 mx-auto text-amber-500" />
            {isVerlopen ? (
              <>
                <p className="font-semibold">Uw uitnodiging is verlopen</p>
                <p className="text-sm text-muted-foreground">
                  Vraag een nieuwe link aan bij de afzender.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Link niet gevonden</p>
                <p className="text-sm text-muted-foreground">Neem contact op met de afzender voor een nieuwe uitnodiging.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const o = offerte as PortaalOfferte;
  const isGesloten = o.portaal_status === "ondertekend" || o.portaal_status === "afgewezen" || handtekeningFase === "voltooid" || handtekeningFase === "afgewezen";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: "#F23B0D" }}
            >
              F
            </div>
            <span className="font-semibold text-foreground text-sm">FPS Brandpreventie</span>
          </div>
          <Badge
            variant="outline"
            className={
              o.portaal_status === "ondertekend" || handtekeningFase === "voltooid"
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : o.portaal_status === "afgewezen" || handtekeningFase === "afgewezen"
                ? "bg-rose-100 text-rose-800 border-rose-200"
                : "bg-blue-100 text-blue-800 border-blue-200"
            }
          >
            {PORTAAL_STATUS_LABEL[o.portaal_status] ?? o.portaal_status}
          </Badge>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{o.titel}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
            {o.opdrachtgever && <span>Opdrachtgever: {o.opdrachtgever}</span>}
            {o.datum && <span>Datum: {new Date(o.datum).toLocaleDateString("nl-NL")}</span>}
            {o.offertenummer && <span>Nr. {o.offertenummer}</span>}
            <span>Geldig: {o.geldigheid_dagen} dagen</span>
          </div>
        </div>

        {(o.secties ?? []).length > 0 && (
          <div className="space-y-4">
            {(o.secties as Array<{
              id: number;
              type: string;
              naam: string;
              inhoud?: string | null;
              regels?: Array<{ id: number; omschrijving?: string | null; aantal?: number | null; eenheidsprijs?: number | null; totaalprijs?: number | null }>;
            }>).map((s) => (
              <Card key={s.id}>
                <CardContent className="p-5 space-y-3">
                  <h2 className="font-semibold">{s.naam}</h2>
                  {s.type === "tekst" && s.inhoud && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{s.inhoud}</p>
                  )}
                  {s.type === "regels" && (s.regels ?? []).length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left pb-2 pr-4 font-medium">Omschrijving</th>
                            <th className="text-right pb-2 pr-4 font-medium">Aantal</th>
                            <th className="text-right pb-2 pr-4 font-medium">Eenheidsprijs</th>
                            <th className="text-right pb-2 font-medium">Totaal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.regels!.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="py-2 pr-4">{r.omschrijving ?? "—"}</td>
                              <td className="py-2 pr-4 text-right">{r.aantal ?? "—"}</td>
                              <td className="py-2 pr-4 text-right">{r.eenheidsprijs != null ? euro(r.eenheidsprijs) : "—"}</td>
                              <td className="py-2 text-right font-medium">{r.totaalprijs != null ? euro(r.totaalprijs) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotaal excl. btw</span>
                <span>{euro(o.bedrag_excl_btw)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Btw {o.btw_percentage}%</span>
                <span>{euro(o.bedrag_incl_btw - o.bedrag_excl_btw)}</span>
              </div>
              <div className="flex items-center justify-between font-bold border-t pt-2 mt-1">
                <span>Totaal incl. btw</span>
                <span className="text-primary">{euro(o.bedrag_incl_btw)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {handtekeningFase === "voltooid" || (o.portaal_status === "ondertekend" && !isGesloten) ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <CheckCircle className="h-12 w-12 mx-auto text-emerald-600" />
              <p className="font-semibold text-lg">Offerte geaccepteerd</p>
              <p className="text-sm text-muted-foreground">Bedankt voor uw akkoord. Wij nemen spoedig contact met u op.</p>
            </CardContent>
          </Card>
        ) : handtekeningFase === "afgewezen" || (o.portaal_status === "afgewezen" && !isGesloten) ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <XCircle className="h-12 w-12 mx-auto text-rose-500" />
              <p className="font-semibold text-lg">Offerte afgewezen</p>
              <p className="text-sm text-muted-foreground">Bedankt voor uw reactie. Mocht u vragen hebben, neem dan gerust contact op.</p>
            </CardContent>
          </Card>
        ) : o.portaal_status === "ondertekend" ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <CheckCircle className="h-12 w-12 mx-auto text-emerald-600" />
              <p className="font-semibold text-lg">Offerte eerder ondertekend</p>
              <p className="text-sm text-muted-foreground">Deze offerte is al geaccepteerd.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-5 space-y-5">
              <div>
                <h2 className="font-semibold mb-1">Offerte accepteren</h2>
                <p className="text-sm text-muted-foreground">
                  Zet uw handtekening en vul uw gegevens in om akkoord te gaan.
                </p>
              </div>

              {handtekeningFase === "wacht" && (
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => setHandtekeningFase("tekenen")}>
                    <PenLine className="h-4 w-4" />
                    Offerte ondertekenen
                  </Button>
                  <Button variant="outline" onClick={() => setAfwijsOpen(true)} className="text-rose-600 border-rose-200 hover:bg-rose-50">
                    <XCircle className="h-4 w-4" />
                    Afwijzen
                  </Button>
                </div>
              )}

              {(handtekeningFase === "tekenen" || handtekeningFase === "naam") && (
                <div className="space-y-4">
                  {handtekeningFase === "tekenen" && (
                    <div className="space-y-2">
                      <Label>Teken uw handtekening</Label>
                      <div className="border rounded-md bg-white overflow-hidden">
                        <canvas
                          ref={canvasRef}
                          width={600}
                          height={180}
                          className="w-full touch-none cursor-crosshair"
                          style={{ height: "180px" }}
                          onMouseDown={tekenStart}
                          onMouseMove={tekenBeweeg}
                          onMouseUp={tekenEinde}
                          onMouseLeave={tekenEinde}
                          onTouchStart={tekenStart}
                          onTouchMove={tekenBeweeg}
                          onTouchEnd={tekenEinde}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={wisHandtekening}>Opnieuw</Button>
                        <Button
                          size="sm"
                          onClick={() => setHandtekeningFase("naam")}
                          disabled={!heeftHandtekening}
                        >
                          Volgende
                        </Button>
                      </div>
                    </div>
                  )}

                  {handtekeningFase === "naam" && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Volledige naam *</Label>
                        <Input value={sigNaam} onChange={(e) => setSigNaam(e.target.value)} placeholder="Voor- en achternaam" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Bedrijf (optioneel)</Label>
                          <Input value={sigBedrijf} onChange={(e) => setSigBedrijf(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Functie (optioneel)</Label>
                          <Input value={sigFunctie} onChange={(e) => setSigFunctie(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setHandtekeningFase("tekenen")}>Terug</Button>
                        <Button
                          size="sm"
                          onClick={bevestigHandtekening}
                          disabled={!sigNaam.trim() || bezig}
                        >
                          {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                          {bezig ? "Bezig…" : "Akkoord geven"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {afwijsOpen && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <h2 className="font-semibold text-rose-700">Offerte afwijzen</h2>
              <div className="space-y-1.5">
                <Label>Reden (optioneel)</Label>
                <Textarea
                  value={afwijsReden}
                  onChange={(e) => setAfwijsReden(e.target.value)}
                  placeholder="Waarom gaat u niet akkoord?"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAfwijsOpen(false)}>Annuleren</Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={bevestigAfwijzen}
                  disabled={bezig}
                >
                  {bezig ? "Bezig…" : "Definitief afwijzen"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Vraag stellen</h2>
              </div>
              {!vraagOpen && !vraagVerstuurd && (
                <Button variant="outline" size="sm" onClick={() => setVraagOpen(true)}>
                  Stel een vraag
                </Button>
              )}
            </div>
            {vraagVerstuurd && (
              <p className="text-sm text-emerald-700">Uw vraag is verstuurd. Wij nemen zo snel mogelijk contact op.</p>
            )}
            {vraagOpen && !vraagVerstuurd && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Uw naam (optioneel)</Label>
                    <Input value={vraagNaam} onChange={(e) => setVraagNaam(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>E-mailadres (optioneel)</Label>
                    <Input
                      type="email"
                      value={vraagEmail}
                      onChange={(e) => setVraagEmail(e.target.value)}
                      placeholder="u@bedrijf.nl"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Vraag *</Label>
                  <Textarea
                    value={vraagTekst}
                    onChange={(e) => setVraagTekst(e.target.value)}
                    rows={3}
                    placeholder="Wat wilt u weten?"
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setVraagOpen(false)}>Annuleren</Button>
                  <Button size="sm" onClick={verstuurVraag} disabled={!vraagTekst.trim() || bezig}>
                    {bezig ? "Bezig…" : "Versturen"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground pb-8">
          Dit portaal is beveiligd door FPS Brandpreventie. Uw gegevens worden vertrouwelijk behandeld.
        </p>
      </main>
    </div>
  );
}
