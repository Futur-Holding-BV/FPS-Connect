import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useListMomentenVandaag } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PartyPopper } from "lucide-react";

function opslagSleutel(gebruikerId: number | string) {
  const vandaag = new Date().toISOString().slice(0, 10);
  return `fps_moments_gezien_${gebruikerId}_${vandaag}`;
}

function vuurConfetti() {
  const duur = 2500;
  const eind = Date.now() + duur;
  const kleuren = ["#F23B0D", "#212631", "#ffffff"];

  (function tik() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.6 },
      colors: kleuren,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.6 },
      colors: kleuren,
    });
    if (Date.now() < eind) {
      requestAnimationFrame(tik);
    }
  })();

  confetti({
    particleCount: 100,
    spread: 90,
    origin: { y: 0.4 },
    colors: kleuren,
  });
}

function initialen(naam: string) {
  return naam
    .split(" ")
    .map((d) => d[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function MomentsFelicitatie({ gebruikerId }: { gebruikerId?: number | null }) {
  const { data: momenten } = useListMomentenVandaag();
  const [open, setOpen] = useState(false);
  const afgehandeld = useRef(false);

  const eigenMoment = momenten?.find((m) => m.geldt_voor_jou);

  useEffect(() => {
    if (!eigenMoment || afgehandeld.current || gebruikerId == null) return;

    const sleutel = opslagSleutel(gebruikerId);
    if (localStorage.getItem(sleutel)) return;

    afgehandeld.current = true;
    localStorage.setItem(sleutel, "1");
    setOpen(true);
    vuurConfetti();
  }, [eigenMoment, gebruikerId]);

  if (!eigenMoment) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <PartyPopper className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl">Gefeliciteerd, {eigenMoment.naam.split(" ")[0]}!</DialogTitle>
          <DialogDescription className="text-sm">
            Het hele team van FPS Connect wenst je een fijne verjaardag toe.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}

export function VandaagJarigWidget() {
  const { data: momenten } = useListMomentenVandaag();

  const jarigen = (momenten ?? []).filter((m) => m.type === "verjaardag");

  if (jarigen.length === 0) return null;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PartyPopper className="h-4 w-4 text-primary" />
          Vandaag jarig
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {jarigen.map((m) => (
            <div key={m.medewerker_id} className="flex flex-col items-center gap-1.5 w-20">
              <Avatar className="h-12 w-12 border-2 border-primary/30">
                {m.foto_url && <AvatarImage src={m.foto_url} alt={m.naam} />}
                <AvatarFallback>{initialen(m.naam)}</AvatarFallback>
              </Avatar>
              <p className="text-xs font-medium text-center leading-tight truncate w-full">{m.naam}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
