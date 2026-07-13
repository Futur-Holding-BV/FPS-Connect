// Directiecockpit & Financieel Dashboard / Projectcontrol.
//
// - GET /financieel/liquiditeit — liquiditeitsdashboard (bank/kas, debiteuren,
//   crediteuren, aging, cashflow 7/30/90 dagen, drempelsignalen).
// - GET /directie/cockpit — geconsolideerde startpagina met max. 10 gekleurde
//   tegels die de bestaande dashboards samenvatten met doorklikpaden.
//
// Beide vereisen het directieniveau (financieel niveau 2 = directeur/
// hoofdbeheerder). De cockpit is resilient: elke bron wordt apart en fail-soft
// berekend, zodat één falende deelbron nooit de hele pagina laat crashen.
import { Router } from "express";
import { db, facturenTable, goedkeuringAanvragenTable } from "@workspace/db";
import { and, eq, count } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { berekenLiquiditeit } from "../services/liquiditeit-service";
import { berekenJaarprognose } from "../services/fie-service";

const router = Router();

const directie = requireBevoegdheid("financieel", 2);

// ─── Formattering ─────────────────────────────────────────────────────────────

function euro(v: number | null): string {
  if (v == null) return "onbekend";
  return `€ ${v.toLocaleString("nl-NL", { maximumFractionDigits: 0 })}`;
}

function pct(v: number | null): string {
  if (v == null) return "onbekend";
  return `${v.toLocaleString("nl-NL", { maximumFractionDigits: 1 })}%`;
}

// ─── GET /financieel/liquiditeit ──────────────────────────────────────────────

router.get("/financieel/liquiditeit", directie, async (req, res): Promise<void> => {
  try {
    const dashboard = await berekenLiquiditeit(true);
    res.json(dashboard);
  } catch (err) {
    req.log.error(err, "GET /financieel/liquiditeit");
    res.status(500).json({ message: "Kon het liquiditeitsdashboard niet berekenen." });
  }
});

// ─── GET /directie/cockpit ────────────────────────────────────────────────────

type Kleur = "rood" | "oranje" | "groen" | "blauw";

interface Tegel {
  sleutel: string;
  titel: string;
  waarde: string;
  subtitel: string | null;
  kleur: Kleur;
  pad: string;
  ernst: string | null;
}

function coverageKleur(coverage: number | null): Kleur {
  if (coverage == null) return "blauw";
  if (coverage < 80) return "rood";
  if (coverage < 95) return "oranje";
  if (coverage > 110) return "blauw";
  return "groen";
}

router.get("/directie/cockpit", directie, async (req, res): Promise<void> => {
  const nu = new Date();
  const boekjaar = req.query.boekjaar
    ? parseInt(String(req.query.boekjaar), 10)
    : nu.getFullYear();

  const tegels: Tegel[] = [];

  // 1 + 2 + 3. Omzetprognose, AK-dekkingsgraad en onderhanden werk uit de FIE-prognose
  const prognoseRes = await Promise.allSettled([berekenJaarprognose(boekjaar)]);
  if (prognoseRes[0].status === "fulfilled") {
    const p = prognoseRes[0].value;
    tegels.push({
      sleutel: "omzetprognose",
      titel: "Omzetprognose",
      waarde: pct(p.coverage_pct),
      subtitel: `Prognose ${euro(p.prognose_omzet)} van doel ${euro(p.omzet_doel)}`,
      kleur: coverageKleur(p.coverage_pct),
      pad: "/beheer/bedrijfskompas",
      ernst: p.coverage_pct != null && p.coverage_pct < 80 ? "kritiek" : null,
    });
    tegels.push({
      sleutel: "ak_dekkingsgraad",
      titel: "AK-dekkingsgraad",
      waarde: pct(p.ak_dekkingsgraad_pct),
      subtitel: `Algemene kosten ${euro(p.totaal_ak)}`,
      kleur:
        p.ak_dekkingsgraad_pct == null
          ? "blauw"
          : p.ak_dekkingsgraad_pct >= 100
            ? "groen"
            : p.ak_dekkingsgraad_pct >= 80
              ? "oranje"
              : "rood",
      pad: "/beheer/bedrijfskompas",
      ernst: null,
    });
    tegels.push({
      sleutel: "onderhanden_werk",
      titel: "Onderhanden werk",
      waarde: euro(p.ohw_restwaarde),
      subtitel: `${p.aantal_ohw_opdrachten} lopende opdracht(en)`,
      kleur: "blauw",
      pad: "/financieel/onderhanden-werk",
      ernst: null,
    });
  } else {
    req.log.error(prognoseRes[0].reason, "cockpit: FIE-prognose faalde");
    tegels.push({
      sleutel: "omzetprognose",
      titel: "Omzetprognose",
      waarde: "onbekend",
      subtitel: "Prognose kon niet worden berekend",
      kleur: "blauw",
      pad: "/beheer/bedrijfskompas",
      ernst: null,
    });
  }

  // 4 + 5 + 6. Liquiditeit, cashflow, debiteuren, crediteuren
  const liqRes = await Promise.allSettled([berekenLiquiditeit(true)]);
  if (liqRes[0].status === "fulfilled") {
    const l = liqRes[0].value;
    const cf30 = l.cashflow.find((c) => c.horizon_dagen === 30) ?? null;
    tegels.push({
      sleutel: "liquiditeit",
      titel: "Liquiditeitspositie",
      waarde: l.netto_liquiditeit != null ? euro(l.netto_liquiditeit) : euro(l.werkkapitaal),
      subtitel:
        l.netto_liquiditeit != null
          ? `Incl. banksaldo ${euro(l.banksaldo)}`
          : "Werkkapitaal (banksaldo niet beschikbaar)",
      kleur:
        (l.netto_liquiditeit ?? l.werkkapitaal) < 0
          ? "rood"
          : l.netto_liquiditeit == null
            ? "blauw"
            : "groen",
      pad: "/financieel/liquiditeit",
      ernst: (l.netto_liquiditeit ?? l.werkkapitaal) < 0 ? "kritiek" : null,
    });
    tegels.push({
      sleutel: "cashflow_30d",
      titel: "Cashflow 30 dagen",
      waarde: cf30 ? euro(cf30.netto) : "onbekend",
      subtitel: cf30 ? `In ${euro(cf30.verwachte_inkomsten)} · uit ${euro(cf30.verwachte_uitgaven)}` : null,
      kleur: cf30 ? (cf30.netto < 0 ? "rood" : cf30.netto === 0 ? "oranje" : "groen") : "blauw",
      pad: "/financieel/liquiditeit",
      ernst: cf30 && cf30.netto < 0 ? "waarschuwing" : null,
    });
    const debVervallen =
      l.debiteuren_aging.vervallen_1_30 + l.debiteuren_aging.vervallen_31_60 + l.debiteuren_aging.vervallen_60_plus;
    tegels.push({
      sleutel: "debiteuren",
      titel: "Openstaande debiteuren",
      waarde: euro(l.openstaande_debiteuren),
      subtitel: `${l.aantal_debiteuren} factuur/facturen · ${euro(debVervallen)} vervallen`,
      kleur: debVervallen > 0 ? "oranje" : "blauw",
      pad: "/financieel/liquiditeit",
      ernst: null,
    });
    const credVervallen =
      l.crediteuren_aging.vervallen_1_30 + l.crediteuren_aging.vervallen_31_60 + l.crediteuren_aging.vervallen_60_plus;
    tegels.push({
      sleutel: "crediteuren",
      titel: "Openstaande crediteuren",
      waarde: euro(l.openstaande_crediteuren),
      subtitel: `${l.aantal_crediteuren} factuur/facturen · ${euro(credVervallen)} vervallen`,
      kleur: credVervallen > 0 ? "oranje" : "blauw",
      pad: "/financieel/crediteuren",
      ernst: null,
    });
  } else {
    req.log.error(liqRes[0].reason, "cockpit: liquiditeit faalde");
    tegels.push({
      sleutel: "liquiditeit",
      titel: "Liquiditeitspositie",
      waarde: "onbekend",
      subtitel: "Liquiditeit kon niet worden berekend",
      kleur: "blauw",
      pad: "/financieel/liquiditeit",
      ernst: null,
    });
  }

  // 7. Facturen ter controle
  try {
    const [rij] = await db
      .select({ n: count() })
      .from(facturenTable)
      .where(and(eq(facturenTable.status, "controle_nodig"), eq(facturenTable.geblokkeerd, false)));
    const n = rij?.n ?? 0;
    tegels.push({
      sleutel: "facturen_controle",
      titel: "Facturen ter controle",
      waarde: String(n),
      subtitel: n > 0 ? "Vereisen handmatige controle" : "Geen openstaande controles",
      kleur: n > 0 ? "oranje" : "groen",
      pad: "/facturen/controlebox",
      ernst: null,
    });
  } catch (err) {
    req.log.error(err, "cockpit: facturen ter controle faalde");
  }

  // 8. Openstaande goedkeuringen
  try {
    const [rij] = await db
      .select({ n: count() })
      .from(goedkeuringAanvragenTable)
      .where(eq(goedkeuringAanvragenTable.status, "ingediend"));
    const n = rij?.n ?? 0;
    tegels.push({
      sleutel: "goedkeuringen",
      titel: "Openstaande goedkeuringen",
      waarde: String(n),
      subtitel: n > 0 ? "Wachten op besluit" : "Niets in behandeling",
      kleur: n > 0 ? "oranje" : "groen",
      pad: "/beheer/goedkeuringen-dashboard",
      ernst: null,
    });
  } catch (err) {
    req.log.error(err, "cockpit: goedkeuringen faalde");
  }

  res.json({ boekjaar, tegels: tegels.slice(0, 10) });
});

export default router;
