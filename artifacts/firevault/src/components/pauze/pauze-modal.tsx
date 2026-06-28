import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Coffee, RefreshCw, Trophy, ArrowLeft,
  Brain, Layers, Zap,
} from "lucide-react";
import {
  SidebarMenuItem, SidebarMenuButton,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════
// Hulpfuncties
// ═══════════════════════════════════════════════════════════

function formatTijd(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ═══════════════════════════════════════════════════════════
// SPEL 1 — SUDOKU
// ═══════════════════════════════════════════════════════════

const SUDOKU_PUZZELS = [
  {
    naam: "Beginners",
    vast: [
      [5,3,0,0,7,0,0,0,0],
      [6,0,0,1,9,5,0,0,0],
      [0,9,8,0,0,0,0,6,0],
      [8,0,0,0,6,0,0,0,3],
      [4,0,0,8,0,3,0,0,1],
      [7,0,0,0,2,0,0,0,6],
      [0,6,0,0,0,0,2,8,0],
      [0,0,0,4,1,9,0,0,5],
      [0,0,0,0,8,0,0,7,9],
    ],
    oplossing: [
      [5,3,4,6,7,8,9,1,2],
      [6,7,2,1,9,5,3,4,8],
      [1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],
      [4,2,6,8,5,3,7,9,1],
      [7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],
      [2,8,7,4,1,9,6,3,5],
      [3,4,5,2,8,6,1,7,9],
    ],
  },
  {
    naam: "Gemiddeld",
    vast: [
      [0,2,0,0,0,0,0,0,0],
      [0,0,0,6,0,0,0,0,3],
      [0,7,4,0,8,0,0,0,0],
      [0,0,0,0,0,3,0,0,2],
      [0,8,0,0,4,0,0,1,0],
      [6,0,0,5,0,0,0,0,0],
      [0,0,0,0,1,0,7,8,0],
      [5,0,0,0,0,9,0,0,0],
      [0,0,0,0,0,0,0,4,0],
    ],
    oplossing: [
      [1,2,6,4,3,7,9,5,8],
      [8,9,5,6,2,1,4,7,3],
      [3,7,4,9,8,5,1,2,6],
      [4,5,7,1,9,3,8,6,2],
      [9,8,3,2,4,6,5,1,7],
      [6,1,2,5,7,8,3,9,4],
      [2,6,9,3,1,4,7,8,5],
      [5,4,8,7,6,9,2,3,1],
      [7,3,1,8,5,2,6,4,9],
    ],
  },
];

function heeftConflict(grid: number[][], r: number, k: number): boolean {
  const val = grid[r][k];
  if (!val) return false;
  for (let i = 0; i < 9; i++) {
    if (i !== k && grid[r][i] === val) return true;
    if (i !== r && grid[i][k] === val) return true;
  }
  const br = Math.floor(r / 3) * 3;
  const bk = Math.floor(k / 3) * 3;
  for (let dr = 0; dr < 3; dr++)
    for (let dk = 0; dk < 3; dk++) {
      const nr = br + dr; const nk = bk + dk;
      if ((nr !== r || nk !== k) && grid[nr][nk] === val) return true;
    }
  return false;
}

function SudokuSpel() {
  const [puzzelIdx, setPuzzelIdx] = useState(0);
  const puzzel = SUDOKU_PUZZELS[puzzelIdx];
  const [grid, setGrid] = useState<number[][]>(() => puzzel.vast.map(r => [...r]));
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [gewonnen, setGewonnen] = useState(false);
  const [gecontroleerd, setGecontroleerd] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function nieuwePuzzel(idx: number) {
    setPuzzelIdx(idx);
    setGrid(SUDOKU_PUZZELS[idx].vast.map(r => [...r]));
    setSel(null);
    setGewonnen(false);
    setGecontroleerd(false);
  }

  function setWaarde(r: number, k: number, val: number) {
    if (puzzel.vast[r][k] !== 0) return;
    const nieuw = grid.map(row => [...row]);
    nieuw[r][k] = val;
    setGrid(nieuw);
    setGecontroleerd(false);
    if (nieuw.every((row, ri) => row.every((c, ki) => c === puzzel.oplossing[ri][ki])))
      setGewonnen(true);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (!sel) return;
    const [r, k] = sel;
    if (e.key >= "1" && e.key <= "9") { setWaarde(r, k, +e.key); e.preventDefault(); }
    else if (["Backspace", "Delete", "0"].includes(e.key)) { setWaarde(r, k, 0); e.preventDefault(); }
    else if (e.key === "ArrowRight") { setSel([r, Math.min(8, k + 1)]); e.preventDefault(); }
    else if (e.key === "ArrowLeft")  { setSel([r, Math.max(0, k - 1)]); e.preventDefault(); }
    else if (e.key === "ArrowDown")  { setSel([Math.min(8, r + 1), k]); e.preventDefault(); }
    else if (e.key === "ArrowUp")    { setSel([Math.max(0, r - 1), k]); e.preventDefault(); }
  }

  useEffect(() => { containerRef.current?.focus(); }, []);

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center gap-3 outline-none"
      onKeyDown={handleKey}
      tabIndex={0}
    >
      {/* Puzzel-keuze */}
      <div className="flex gap-2">
        {SUDOKU_PUZZELS.map((p, i) => (
          <Button key={i} size="sm" variant={puzzelIdx === i ? "default" : "outline"}
            onClick={() => nieuwePuzzel(i)}>
            {p.naam}
          </Button>
        ))}
      </div>

      {gewonnen && (
        <div className="flex items-center gap-2 text-emerald-600 font-semibold animate-in fade-in">
          <Trophy className="h-5 w-5" /> Opgelost! Goed gedaan.
        </div>
      )}

      {/* Grid */}
      <div className="inline-grid grid-cols-9 border-2 border-foreground rounded overflow-hidden">
        {grid.map((rij, r) => rij.map((cel, k) => {
          const isVast = puzzel.vast[r][k] !== 0;
          const isSel = sel?.[0] === r && sel?.[1] === k;
          const verwant = sel && (sel[0] === r || sel[1] === k ||
            (Math.floor(sel[0]/3) === Math.floor(r/3) && Math.floor(sel[1]/3) === Math.floor(k/3)));
          const conflict = heeftConflict(grid, r, k);
          const fout = gecontroleerd && !isVast && cel !== 0 && cel !== puzzel.oplossing[r][k];
          return (
            <div
              key={`${r}-${k}`}
              onClick={() => { if (!isVast) setSel([r, k]); }}
              className={cn(
                "flex items-center justify-center w-9 h-9 text-sm border border-border/30 cursor-pointer select-none transition-colors",
                k === 2 || k === 5 ? "border-r-2 border-r-foreground/60" : "",
                r === 2 || r === 5 ? "border-b-2 border-b-foreground/60" : "",
                isSel ? "bg-primary/25" : verwant ? "bg-muted/50" : "bg-background",
                isVast ? "font-bold text-foreground" : conflict ? "text-destructive font-semibold" : "text-primary",
                fout ? "bg-destructive/15 text-destructive" : "",
              )}
            >
              {cel !== 0 ? cel : ""}
            </div>
          );
        }))}
      </div>

      {/* Numpad */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {[1,2,3,4,5,6,7,8,9].map(n => (
          <button key={n} onClick={() => sel && setWaarde(sel[0], sel[1], n)}
            className="w-9 h-9 rounded border border-border hover:bg-muted text-sm font-medium transition-colors">
            {n}
          </button>
        ))}
        <button onClick={() => sel && setWaarde(sel[0], sel[1], 0)}
          className="w-9 h-9 rounded border border-border hover:bg-muted text-sm transition-colors">
          ✕
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setGecontroleerd(true)}>Controleer</Button>
        <Button variant="outline" size="sm" onClick={() => nieuwePuzzel(puzzelIdx)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Opnieuw
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setGrid(puzzel.oplossing.map(r => [...r])); setGewonnen(true); }}>
          Oplossing
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPEL 2 — GEHEUGENSPEL (Memory)
// ═══════════════════════════════════════════════════════════

const KAART_SYMBOLEN = ["🔥","🏢","🔧","🛡️","🚒","⚠️","🔑","📋","🌿","🎯"];

function maakKaarten(aantalParen: number) {
  const symbolen = KAART_SYMBOLEN.slice(0, aantalParen);
  const paren = [...symbolen, ...symbolen];
  for (let i = paren.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paren[i], paren[j]] = [paren[j], paren[i]];
  }
  return paren.map((symbool, idx) => ({ id: idx, symbool, omgedraaid: false, gevonden: false }));
}

function GeheugenSpel() {
  const PAREN = 8;
  const [kaarten, setKaarten] = useState(() => maakKaarten(PAREN));
  const [omgekeerd, setOmgekeerd] = useState<number[]>([]);
  const [zetten, setZetten] = useState(0);
  const [gewonnen, setGewonnen] = useState(false);
  const wachtenRef = useRef(false);

  function reset() {
    setKaarten(maakKaarten(PAREN));
    setOmgekeerd([]);
    setZetten(0);
    setGewonnen(false);
    wachtenRef.current = false;
  }

  function klik(id: number) {
    if (wachtenRef.current) return;
    const kaart = kaarten[id];
    if (kaart.gevonden || kaart.omgedraaid) return;
    if (omgekeerd.length === 2) return;

    const nieuweKaarten = kaarten.map(k => k.id === id ? { ...k, omgedraaid: true } : k);
    const nieuweOmgekeerd = [...omgekeerd, id];
    setKaarten(nieuweKaarten);
    setOmgekeerd(nieuweOmgekeerd);

    if (nieuweOmgekeerd.length === 2) {
      setZetten(z => z + 1);
      const [a, b] = nieuweOmgekeerd;
      if (nieuweKaarten[a].symbool === nieuweKaarten[b].symbool) {
        const gevondenKaarten = nieuweKaarten.map(k =>
          k.id === a || k.id === b ? { ...k, gevonden: true } : k
        );
        setKaarten(gevondenKaarten);
        setOmgekeerd([]);
        if (gevondenKaarten.every(k => k.gevonden)) setGewonnen(true);
      } else {
        wachtenRef.current = true;
        setTimeout(() => {
          setKaarten(prev => prev.map(k =>
            k.id === a || k.id === b ? { ...k, omgedraaid: false } : k
          ));
          setOmgekeerd([]);
          wachtenRef.current = false;
        }, 1000);
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>Zetten: <strong className="text-foreground">{zetten}</strong></span>
        <span>Gevonden: <strong className="text-foreground">{kaarten.filter(k => k.gevonden).length / 2} / {PAREN}</strong></span>
      </div>

      {gewonnen && (
        <div className="flex items-center gap-2 text-emerald-600 font-semibold">
          <Trophy className="h-5 w-5" /> Alle paren gevonden in {zetten} zetten!
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        {kaarten.map(kaart => (
          <button
            key={kaart.id}
            onClick={() => klik(kaart.id)}
            className={cn(
              "w-16 h-16 rounded-lg border-2 text-2xl transition-all duration-200 select-none",
              "flex items-center justify-center font-medium",
              kaart.gevonden
                ? "border-emerald-400 bg-emerald-50 cursor-default scale-95"
                : kaart.omgedraaid
                ? "border-primary bg-primary/10 shadow-md"
                : "border-border bg-muted hover:border-primary/40 hover:bg-muted/80 cursor-pointer"
            )}
          >
            {kaart.omgedraaid || kaart.gevonden ? kaart.symbool : ""}
          </button>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={reset}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Nieuw spel
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPEL 3 — SLANG (Snake)
// ═══════════════════════════════════════════════════════════

const RIJEN = 18;
const KOLOMMEN = 22;
type Positie = { x: number; y: number };
type Richting = "boven" | "onder" | "links" | "rechts";

function willekeurigVoedsel(slang: Positie[]): Positie {
  let pos: Positie;
  do {
    pos = { x: Math.floor(Math.random() * KOLOMMEN), y: Math.floor(Math.random() * RIJEN) };
  } while (slang.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

function SlangSpel() {
  const [slang, setSlang] = useState<Positie[]>([{ x: 10, y: 9 }]);
  const [voedsel, setVoedsel] = useState<Positie>({ x: 16, y: 9 });
  const [richting, setRichting] = useState<Richting>("rechts");
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gestart, setGestart] = useState(false);

  const richtingRef = useRef<Richting>("rechts");
  const slangRef = useRef(slang);
  const voedselRef = useRef(voedsel);
  const gameOverRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  slangRef.current = slang;
  voedselRef.current = voedsel;
  gameOverRef.current = gameOver;

  function stap() {
    if (gameOverRef.current) return;
    const huidige = slangRef.current;
    const kop = huidige[0];
    const r = richtingRef.current;

    const nieuwKop: Positie = {
      x: r === "links" ? kop.x - 1 : r === "rechts" ? kop.x + 1 : kop.x,
      y: r === "boven"  ? kop.y - 1 : r === "onder"  ? kop.y + 1 : kop.y,
    };

    if (
      nieuwKop.x < 0 || nieuwKop.x >= KOLOMMEN ||
      nieuwKop.y < 0 || nieuwKop.y >= RIJEN ||
      huidige.some(s => s.x === nieuwKop.x && s.y === nieuwKop.y)
    ) {
      setGameOver(true);
      return;
    }

    const etendVoedsel = nieuwKop.x === voedselRef.current.x && nieuwKop.y === voedselRef.current.y;
    const nieuweSlang = etendVoedsel ? [nieuwKop, ...huidige] : [nieuwKop, ...huidige.slice(0, -1)];

    setSlang(nieuweSlang);
    if (etendVoedsel) {
      setScore(s => s + 1);
      setVoedsel(willekeurigVoedsel(nieuweSlang));
    }
  }

  // Game loop
  const stapRef = useRef(stap);
  stapRef.current = stap;

  useEffect(() => {
    if (!gestart || gameOver) return;
    const snelheid = Math.max(80, 200 - score * 8);
    const interval = setInterval(() => stapRef.current(), snelheid);
    return () => clearInterval(interval);
  }, [gestart, gameOver, score]);

  // Toetsenbord
  useEffect(() => {
    if (!gestart) return;
    const handler = (e: KeyboardEvent) => {
      const r = richtingRef.current;
      if (e.key === "ArrowUp"    && r !== "onder")  { richtingRef.current = "boven";  setRichting("boven"); }
      if (e.key === "ArrowDown"  && r !== "boven")  { richtingRef.current = "onder";  setRichting("onder"); }
      if (e.key === "ArrowLeft"  && r !== "rechts") { richtingRef.current = "links";  setRichting("links"); }
      if (e.key === "ArrowRight" && r !== "links")  { richtingRef.current = "rechts"; setRichting("rechts"); }
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [gestart]);

  function herstart() {
    const startSlang = [{ x: 10, y: 9 }];
    setSlang(startSlang);
    richtingRef.current = "rechts";
    setRichting("rechts");
    setVoedsel({ x: 16, y: 9 });
    setScore(0);
    setGameOver(false);
    setGestart(true);
  }

  // Mobiele richting-knoppen
  function zetRichting(r: Richting) {
    const huidig = richtingRef.current;
    if ((r === "boven" && huidig !== "onder") ||
        (r === "onder" && huidig !== "boven") ||
        (r === "links" && huidig !== "rechts") ||
        (r === "rechts" && huidig !== "links")) {
      richtingRef.current = r;
      setRichting(r);
    }
  }

  // Bouw celset voor snelle lookup
  const slangSet = new Set(slang.map(s => `${s.x},${s.y}`));

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-4 text-sm">
        <span>Score: <strong>{score}</strong></span>
        {gestart && !gameOver && (
          <span className="text-muted-foreground text-xs">
            Gebruik de pijltjestoetsen of knoppen
          </span>
        )}
      </div>

      {/* Speelveld */}
      <div
        className="border-2 border-foreground/60 rounded overflow-hidden bg-gray-50"
        style={{ display: "grid", gridTemplateColumns: `repeat(${KOLOMMEN}, 22px)`, gridTemplateRows: `repeat(${RIJEN}, 22px)` }}
      >
        {Array.from({ length: RIJEN }, (_, y) =>
          Array.from({ length: KOLOMMEN }, (_, x) => {
            const isKop = slang[0].x === x && slang[0].y === y;
            const isLijf = !isKop && slangSet.has(`${x},${y}`);
            const isVoedsel = voedsel.x === x && voedsel.y === y;
            return (
              <div
                key={`${x},${y}`}
                className={cn(
                  "w-[22px] h-[22px]",
                  isKop ? "bg-primary rounded-sm" :
                  isLijf ? "bg-primary/60 rounded-sm" :
                  isVoedsel ? "bg-red-500 rounded-full" :
                  "bg-transparent"
                )}
              />
            );
          })
        )}
      </div>

      {/* Game-over overlay */}
      {gameOver && (
        <div className="text-center space-y-1">
          <div className="font-semibold text-destructive">Game over!</div>
          <div className="text-sm text-muted-foreground">Je scoorde {score} punt{score !== 1 ? "en" : ""}</div>
        </div>
      )}

      {/* Start / herstart */}
      {(!gestart || gameOver) && (
        <Button onClick={herstart} className="gap-2">
          <Zap className="h-4 w-4" /> {gameOver ? "Opnieuw spelen" : "Spelen"}
        </Button>
      )}

      {/* Mobiele richtingsknoppen */}
      {gestart && !gameOver && (
        <div className="grid grid-cols-3 gap-1 mt-1">
          <div />
          <button onClick={() => zetRichting("boven")} className="h-9 w-9 rounded border border-border hover:bg-muted flex items-center justify-center">▲</button>
          <div />
          <button onClick={() => zetRichting("links")}  className="h-9 w-9 rounded border border-border hover:bg-muted flex items-center justify-center">◀</button>
          <button onClick={() => zetRichting("onder")}  className="h-9 w-9 rounded border border-border hover:bg-muted flex items-center justify-center">▼</button>
          <button onClick={() => zetRichting("rechts")} className="h-9 w-9 rounded border border-border hover:bg-muted flex items-center justify-center">▶</button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Spelkeuze-scherm
// ═══════════════════════════════════════════════════════════

const SPELLEN = [
  { id: "sudoku",  label: "Sudoku",        omschrijving: "Vul het 9×9 rooster in",  icoon: Brain },
  { id: "geheugen",label: "Geheugenspel",  omschrijving: "Vind alle paren",         icoon: Layers },
  { id: "slang",   label: "Slang",         omschrijving: "Klassieke snake",          icoon: Zap },
] as const;

function SpelKeuze({ onKies }: { onKies: (s: Spel) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {SPELLEN.map(({ id, label, omschrijving, icoon: Icoon }) => (
        <button
          key={id}
          onClick={() => onKies(id as Spel)}
          className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all group"
        >
          <Icoon className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
          <div className="text-center">
            <div className="font-semibold">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{omschrijving}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Hoofd modal
// ═══════════════════════════════════════════════════════════

type Spel = "keuze" | "sudoku" | "geheugen" | "slang";

interface PauzeModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PauzeModal({ open, onOpenChange }: PauzeModalProps) {
  const [huidigSpel, setHuidigSpel] = useState<Spel>("keuze");
  const [seconden, setSeconden] = useState(0);

  useEffect(() => {
    if (open) { setHuidigSpel("keuze"); setSeconden(0); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => setSeconden(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, [open]);

  const spelLabel = SPELLEN.find(s => s.id === huidigSpel)?.label;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl w-full max-h-[92vh] overflow-y-auto p-0 gap-0"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-3 bg-background border-b">
          <Coffee className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold leading-none">Pauzetijd</div>
            {spelLabel && (
              <div className="text-xs text-muted-foreground mt-0.5">{spelLabel}</div>
            )}
          </div>
          <div className="text-sm tabular-nums text-muted-foreground font-mono">
            {formatTijd(seconden)}
          </div>
          {huidigSpel !== "keuze" && (
            <Button variant="ghost" size="sm" onClick={() => setHuidigSpel("keuze")}
              className="gap-1 text-xs h-7">
              <ArrowLeft className="h-3.5 w-3.5" /> Keuze
            </Button>
          )}
        </div>

        {/* Spelinhoud */}
        <div className="p-5">
          {huidigSpel === "keuze"   && <SpelKeuze onKies={setHuidigSpel} />}
          {huidigSpel === "sudoku"  && <SudokuSpel />}
          {huidigSpel === "geheugen"&& <GeheugenSpel />}
          {huidigSpel === "slang"   && <SlangSpel />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════
// Pauzeknop — plaatsen in SidebarFooter
// ═══════════════════════════════════════════════════════════

export function PauzeKnop() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setOpen(true)}
          title="Pauze — even een spelletje"
          className="text-muted-foreground hover:text-foreground"
        >
          <Coffee className="h-4 w-4" />
          <span>Pauze</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <PauzeModal open={open} onOpenChange={setOpen} />
    </>
  );
}
