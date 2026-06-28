import { Router } from "express";
import { db } from "@workspace/db";
import {
  goLiveFasenTable, goLiveAdviezenTable, goLiveLessenTable,
  gebruikersTable, gebouwenTable, voorzieningenTable,
  medewerkersTable, backupRecordsTable, activiteitenTable,
  accountviewInstellingenTable,
} from "@workspace/db";
import { eq, count, desc, gte, isNotNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { maakOpenAiClient, heeftOpenAi } from "../lib/openai";

const router = Router();

// ── Implementatiefasen seed-data ───────────────────────────────────────────────
const FASEN_SEED = [
  {
    sleutel: "basisinstellingen",
    naam: "Basisinstellingen",
    beschrijving: "Systeeminstellingen, mailinstellingen en opslag configureren",
    doel: "Platform technisch operationeel maken",
    afhankelijkheden: [] as string[],
    geschatteUren: 4,
    volgorde: 1,
    risico: "Verkeerde mailconfiguratie blokkeert alle notificaties",
  },
  {
    sleutel: "gebruikers_rollen",
    naam: "Gebruikers & rollen",
    beschrijving: "Gebruikers aanmaken, rollen toewijzen en bevoegdheden instellen",
    doel: "Ieder teamlid heeft de juiste toegang",
    afhankelijkheden: ["basisinstellingen"],
    geschatteUren: 3,
    volgorde: 2,
    risico: "Te brede rechten geven toegang tot gevoelige data",
  },
  {
    sleutel: "microsoft",
    naam: "Microsoft-koppeling",
    beschrijving: "Microsoft 365 integratie voor mail en authenticatie",
    doel: "SSO en gedeelde mailboxen actief",
    afhankelijkheden: ["basisinstellingen"],
    geschatteUren: 2,
    volgorde: 3,
    risico: "Foutieve Azure-configuratie blokkeert e-mailverwerking",
  },
  {
    sleutel: "gebouwen",
    naam: "Gebouwen",
    beschrijving: "Gebouwen, verdiepingen en plattegronden invoeren of importeren",
    doel: "Alle locaties staan in het systeem",
    afhankelijkheden: ["basisinstellingen", "gebruikers_rollen"],
    geschatteUren: 8,
    volgorde: 4,
    risico: "Incomplete gebouwdata vertraagt spot-registratie",
  },
  {
    sleutel: "enk_migratie",
    naam: "ENK SQL-migratie",
    beschrijving: "Historische gegevens vanuit ENK-systeem importeren",
    doel: "Continuïteit van historische data geborgd",
    afhankelijkheden: ["gebouwen", "gebruikers_rollen"],
    geschatteUren: 16,
    volgorde: 5,
    risico: "Dataverlies of dubbele records bij verkeerde mapping",
  },
  {
    sleutel: "historisch_archief",
    naam: "Historisch archief",
    beschrijving: "Oude rapporten, inspectiedossiers en documenten uploaden",
    doel: "Volledig historisch dossier per gebouw beschikbaar",
    afhankelijkheden: ["gebouwen"],
    geschatteUren: 12,
    volgorde: 6,
    risico: "Ontbrekend archief geeft onvolledig beeld bij klanten",
  },
  {
    sleutel: "projecten",
    naam: "Projecten",
    beschrijving: "Actieve projecten aanmaken, spots registreren en toewijzingen doen",
    doel: "Uitvoering kan digitaal worden bijgehouden",
    afhankelijkheden: ["gebouwen"],
    geschatteUren: 6,
    volgorde: 7,
    risico: "Spots zonder project zijn niet koppelbaar aan rapporten",
  },
  {
    sleutel: "hrm",
    naam: "HRM",
    beschrijving: "Medewerkers, functies, opleidingen en bekwaamheidsmatrix invullen",
    doel: "Personeelsdossiers digitaal bijgehouden",
    afhankelijkheden: ["gebruikers_rollen"],
    geschatteUren: 8,
    volgorde: 8,
    risico: "Ontbrekende certificaten geven compliance-risico",
  },
  {
    sleutel: "gereedschap",
    naam: "Gereedschap",
    beschrijving: "Gereedschapsinventaris registreren en toewijzen aan medewerkers",
    doel: "Volledig overzicht van gereedschap en locatie",
    afhankelijkheden: ["hrm"],
    geschatteUren: 4,
    volgorde: 9,
    risico: "Niet-geboekt gereedschap verhoogt verliesrisico",
  },
  {
    sleutel: "planning",
    naam: "Planning",
    beschrijving: "Werkagenda's inrichten en planningsitems koppelen aan projecten",
    doel: "Team heeft inzicht in het eigen werkrooster",
    afhankelijkheden: ["gebruikers_rollen", "projecten"],
    geschatteUren: 4,
    volgorde: 10,
    risico: "Dubbele planning zorgt voor capaciteitsproblemen",
  },
  {
    sleutel: "calculatie",
    naam: "Calculatie",
    beschrijving: "Kostprijzen, tarieven en calculatiesjablonen instellen",
    doel: "Nauwkeurige projectkostenbegroting mogelijk",
    afhankelijkheden: ["projecten"],
    geschatteUren: 6,
    volgorde: 11,
    risico: "Verkeerde tarieven leiden tot margeverlies",
  },
  {
    sleutel: "financieel",
    naam: "Financieel",
    beschrijving: "Facturatiestroom, BTW-codes en grootboekrekeningen inrichten",
    doel: "Factuurverwerking volledig digitaal",
    afhankelijkheden: ["projecten"],
    geschatteUren: 5,
    volgorde: 12,
    risico: "Foutieve BTW-codes geven problemen bij belastingaangifte",
  },
  {
    sleutel: "accountview",
    naam: "AccountView",
    beschrijving: "AccountView-koppeling configureren en testexport uitvoeren",
    doel: "Facturen worden automatisch naar AccountView geëxporteerd",
    afhankelijkheden: ["financieel"],
    geschatteUren: 4,
    volgorde: 13,
    risico: "Verkeerde mapping leidt tot boekingsfouten in AccountView",
  },
  {
    sleutel: "testfase",
    naam: "Testfase",
    beschrijving: "Volledige workflow testen met testgebruikers en testdata",
    doel: "Alle processen gevalideerd voor productie",
    afhankelijkheden: ["gebouwen", "projecten", "hrm"],
    geschatteUren: 8,
    volgorde: 14,
    risico: "Ongeteste processen geven storingen in productie",
  },
  {
    sleutel: "productie",
    naam: "Productie go-live",
    beschrijving: "Definitieve productiecontrole, testdata verwijderen en live gaan",
    doel: "FPS Connect is operationeel in productie",
    afhankelijkheden: ["testfase"],
    geschatteUren: 2,
    volgorde: 15,
    risico: "Testdata in productie geeft onjuiste rapportages",
  },
];

async function zaaieFasen() {
  for (const fase of FASEN_SEED) {
    await db
      .insert(goLiveFasenTable)
      .values({
        sleutel: fase.sleutel,
        naam: fase.naam,
        beschrijving: fase.beschrijving,
        doel: fase.doel,
        afhankelijkheden: fase.afhankelijkheden,
        geschatteUren: fase.geschatteUren,
        volgorde: fase.volgorde,
        risico: fase.risico ?? null,
      })
      .onConflictDoNothing();
  }
}

// ── Readiness checks ──────────────────────────────────────────────────────────
type ReadinessStatus = "groen" | "oranje" | "rood";

interface ReadinessItem {
  sleutel: string;
  label: string;
  status: ReadinessStatus;
  categorie: string;
  detail: string | null;
  waarde: string | null;
}

async function voerReadinessChecksUit(): Promise<ReadinessItem[]> {
  const items: ReadinessItem[] = [];

  const [{ waarde: aantalGebruikers }] = await db.select({ waarde: count() }).from(gebruikersTable);
  items.push({
    sleutel: "gebruikers",
    label: "Gebruikers aangemaakt",
    status: aantalGebruikers >= 2 ? "groen" : aantalGebruikers === 1 ? "oranje" : "rood",
    categorie: "Gebruikers",
    detail: aantalGebruikers < 2 ? "Minimaal 2 gebruikers aanbevolen" : null,
    waarde: String(aantalGebruikers),
  });

  const [{ waarde: metTotp }] = await db
    .select({ waarde: count() })
    .from(gebruikersTable)
    .where(isNotNull(gebruikersTable.totpSecret));
  items.push({
    sleutel: "totp",
    label: "Tweestapsverificatie ingesteld",
    status: metTotp > 0 && metTotp >= aantalGebruikers ? "groen" : metTotp > 0 ? "oranje" : "rood",
    categorie: "Beveiliging",
    detail: metTotp < aantalGebruikers ? `${aantalGebruikers - metTotp} gebruiker(s) zonder 2FA` : null,
    waarde: `${metTotp}/${aantalGebruikers}`,
  });

  const [{ waarde: aantalGebouwen }] = await db.select({ waarde: count() }).from(gebouwenTable);
  items.push({
    sleutel: "gebouwen",
    label: "Gebouwen ingevoerd",
    status: aantalGebouwen >= 1 ? "groen" : "rood",
    categorie: "Data",
    detail: aantalGebouwen === 0 ? "Geen gebouwen aangemaakt" : null,
    waarde: String(aantalGebouwen),
  });

  const [{ waarde: aantalSpots }] = await db.select({ waarde: count() }).from(voorzieningenTable);
  items.push({
    sleutel: "spots",
    label: "Spots geregistreerd",
    status: aantalSpots >= 1 ? "groen" : "oranje",
    categorie: "Data",
    detail: aantalSpots === 0 ? "Nog geen spots aangemaakt" : null,
    waarde: String(aantalSpots),
  });

  const [{ waarde: aantalMedewerkers }] = await db.select({ waarde: count() }).from(medewerkersTable);
  items.push({
    sleutel: "medewerkers",
    label: "HRM medewerkers ingevoerd",
    status: aantalMedewerkers >= 1 ? "groen" : "oranje",
    categorie: "HRM",
    detail: aantalMedewerkers === 0 ? "Geen medewerkers aangemaakt in HRM" : null,
    waarde: String(aantalMedewerkers),
  });

  const heeftMail = !!(process.env.MAIL_FROM ?? process.env.MAIL_MAILBOX);
  items.push({
    sleutel: "email",
    label: "E-mailconfiguratie",
    status: heeftMail ? "groen" : "rood",
    categorie: "Integraties",
    detail: heeftMail ? null : "MAIL_FROM niet ingesteld",
    waarde: heeftMail ? (process.env.MAIL_FROM ?? process.env.MAIL_MAILBOX ?? null) : null,
  });

  const heeftOpslag = !!(process.env.S3_BUCKET ?? process.env.GOOGLE_CLOUD_BUCKET);
  items.push({
    sleutel: "opslag",
    label: "Objectopslag geconfigureerd",
    status: heeftOpslag ? "groen" : "rood",
    categorie: "Infrastructuur",
    detail: heeftOpslag ? null : "S3_BUCKET / GOOGLE_CLOUD_BUCKET niet ingesteld",
    waarde: heeftOpslag ? (process.env.S3_BUCKET ?? process.env.GOOGLE_CLOUD_BUCKET ?? null) : null,
  });

  const heeftAi = heeftOpenAi();
  items.push({
    sleutel: "ai",
    label: "AI-services geconfigureerd",
    status: heeftAi ? "groen" : "oranje",
    categorie: "Integraties",
    detail: heeftAi ? null : "AI_INTEGRATIONS_OPENAI_* niet ingesteld — AI-functies beperkt",
    waarde: heeftAi ? "actief" : null,
  });

  const avInstellingen = await db.select().from(accountviewInstellingenTable).limit(1);
  const avActief = avInstellingen[0]?.exportActief ?? false;
  items.push({
    sleutel: "accountview",
    label: "AccountView-koppeling",
    status: avActief ? "groen" : "oranje",
    categorie: "Integraties",
    detail: !avActief ? "Koppeling nog niet geactiveerd — stel in via Beheer › AccountView" : null,
    waarde: avActief ? "actief" : "niet actief",
  });

  const tweeEndertigUurGeleden = new Date(Date.now() - 32 * 60 * 60 * 1000);
  const [{ waarde: aantalBackups }] = await db.select({ waarde: count() }).from(backupRecordsTable);
  const [{ waarde: recenteBackup }] = await db
    .select({ waarde: count() })
    .from(backupRecordsTable)
    .where(gte(backupRecordsTable.aangemaaktOp, tweeEndertigUurGeleden));
  items.push({
    sleutel: "backup",
    label: "Back-up actief",
    status: recenteBackup >= 1 ? "groen" : aantalBackups >= 1 ? "oranje" : "rood",
    categorie: "Infrastructuur",
    detail:
      recenteBackup === 0 && aantalBackups === 0
        ? "Nog geen back-up gedraaid"
        : recenteBackup === 0
        ? "Laatste back-up ouder dan 32 uur"
        : null,
    waarde: aantalBackups > 0 ? `${aantalBackups} back-up(s)` : null,
  });

  const [{ waarde: aantalActiviteiten }] = await db.select({ waarde: count() }).from(activiteitenTable);
  items.push({
    sleutel: "logging",
    label: "Activiteitslogging",
    status: aantalActiviteiten >= 1 ? "groen" : "oranje",
    categorie: "Beveiliging",
    detail: aantalActiviteiten === 0 ? "Nog geen activiteiten gelogd" : null,
    waarde: `${aantalActiviteiten} events`,
  });

  const heeftSessionSecret = !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  items.push({
    sleutel: "sessie",
    label: "Sessie-beveiliging",
    status: heeftSessionSecret ? "groen" : "rood",
    categorie: "Beveiliging",
    detail: heeftSessionSecret ? null : "SESSION_SECRET niet of te kort ingesteld",
    waarde: heeftSessionSecret ? "sterk" : null,
  });

  return items;
}

// ── Persoonlijke actielijsten ─────────────────────────────────────────────────
function mijnActiesVoorRol(rol: string, bevoegdheden: Record<string, number>) {
  type Actie = { id: string; titel: string; categorie: string; beschrijving: string | null; voltooid: boolean; link: string | null };
  const acties: Actie[] = [];

  if (rol === "hoofdbeheerder") {
    acties.push(
      { id: "sys_mail", titel: "Mailinstellingen controleren", categorie: "Systeem", beschrijving: "Stel MAIL_FROM in via Beheer › Mailinstellingen", voltooid: false, link: "/beheer/mail" },
      { id: "sys_profielen", titel: "Bevoegdheidsprofielen controleren", categorie: "Systeem", beschrijving: "Controleer de rollenmatrix en pas aan waar nodig", voltooid: false, link: "/beheer/rollen-rechten" },
      { id: "sys_backup", titel: "Back-up instellen", categorie: "Systeem", beschrijving: "Controleer of de dagelijkse back-up actief is", voltooid: false, link: "/beheer/backup" },
      { id: "sys_accountview", titel: "AccountView-koppeling configureren", categorie: "Financieel", beschrijving: "Stel de API-verbinding in via Beheer › AccountView", voltooid: false, link: "/beheer/boekhouding" },
    );
  }

  if ((bevoegdheden.financieel ?? 0) >= 2) {
    acties.push(
      { id: "fin_btw", titel: "BTW-codes controleren", categorie: "Financieel", beschrijving: "Controleer alle BTW-codes in AccountView-instellingen", voltooid: false, link: "/beheer/boekhouding" },
      { id: "fin_grootboek", titel: "Grootboekmapping controleren", categorie: "Financieel", beschrijving: "Koppel kostenplaatsen aan grootboekrekeningen", voltooid: false, link: "/beheer/boekhouding" },
      { id: "fin_testexport", titel: "Testexport uitvoeren naar AccountView", categorie: "Financieel", beschrijving: "Voer een proefexport uit van een testfactuur", voltooid: false, link: "/facturen/klaar-voor-export" },
      { id: "fin_sepa", titel: "SEPA-betalingen testen", categorie: "Financieel", beschrijving: "Upload een test-SEPA-bestand en accordeer het", voltooid: false, link: "/sepa-bestanden" },
      { id: "fin_crediteuren", titel: "Crediteuren controleren", categorie: "Financieel", beschrijving: "Controleer de crediteurmapping in AccountView", voltooid: false, link: "/beheer/boekhouding" },
    );
  }

  if ((bevoegdheden.personeel ?? 0) >= 2) {
    acties.push(
      { id: "hrm_mwd", titel: "Medewerkers controleren", categorie: "HRM", beschrijving: "Controleer of alle medewerkers correct zijn ingevoerd", voltooid: false, link: "/personeel" },
      { id: "hrm_opl", titel: "Opleidingen en certificaten invullen", categorie: "HRM", beschrijving: "Voeg relevante opleidingen toe aan het functiehuis", voltooid: false, link: "/personeel" },
      { id: "hrm_bekw", titel: "Bekwaamheidsmatrix invullen", categorie: "HRM", beschrijving: "Stel bekwaamheden in per medewerker", voltooid: false, link: "/personeel" },
      { id: "hrm_salaris", titel: "Salarisdocumenten uploaden", categorie: "HRM", beschrijving: "Upload loonstroken via het salarisarchief", voltooid: false, link: "/salarisarchief" },
    );
  }

  if ((bevoegdheden.gebouwen ?? 0) >= 2) {
    acties.push(
      { id: "wb_gebouwen", titel: "Gebouwen controleren", categorie: "Werkvoorbereiding", beschrijving: "Controleer alle gebouwen op volledigheid", voltooid: false, link: "/gebouwen" },
      { id: "wb_projecten", titel: "Projecten controleren", categorie: "Werkvoorbereiding", beschrijving: "Controleer actieve projecten en toewijzingen", voltooid: false, link: "/gebouwen" },
      { id: "wb_documenten", titel: "Documenten koppelen", categorie: "Werkvoorbereiding", beschrijving: "Koppel relevante documenten aan gebouwen", voltooid: false, link: "/gebouwen" },
    );
  }

  if ((bevoegdheden.voorzieningen ?? 0) >= 1) {
    acties.push(
      { id: "mon_profiel", titel: "Profiel controleren", categorie: "Monteur", beschrijving: "Controleer naam, rol en contactgegevens", voltooid: false, link: "/mijn" },
      { id: "mon_gereedschap", titel: "Gereedschap accepteren", categorie: "Monteur", beschrijving: "Bevestig het aan jou toegewezen gereedschap", voltooid: false, link: "/gereedschappen" },
      { id: "mon_spot", titel: "Eerste spot registreren", categorie: "Monteur", beschrijving: "Registreer een testspot op een gebouw", voltooid: false, link: "/gebouwen" },
    );
  }

  return acties;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/beheer/go-live/dashboard", requireAuth, async (req, res) => {
  await zaaieFasen();
  const fasen = await db.select().from(goLiveFasenTable).orderBy(goLiveFasenTable.volgorde);
  const fasenGereed = fasen.filter((f) => f.status === "gereed").length;
  const kritiekeBlokkades = fasen.filter((f) => {
    if (f.status === "gereed") return false;
    return f.afhankelijkheden.some((dep) => {
      const depFase = fasen.find((x) => x.sleutel === dep);
      return depFase && depFase.status !== "gereed";
    });
  }).length;
  const voortgangPct = fasen.length > 0 ? Math.round((fasenGereed / fasen.length) * 100) : 0;
  const [{ waarde: aantalGebruikers }] = await db.select({ waarde: count() }).from(gebruikersTable);
  const openAdviezen = await db
    .select()
    .from(goLiveAdviezenTable)
    .where(eq(goLiveAdviezenTable.status, "open"))
    .orderBy(desc(goLiveAdviezenTable.aangemaaktOp))
    .limit(1);

  res.json({
    voortgang_pct: voortgangPct,
    open_acties: fasen.filter((f) => f.status !== "gereed").length,
    afgeronde_acties: fasenGereed,
    kritieke_blokkades: kritiekeBlokkades,
    fasen_gereed: fasenGereed,
    fasen_totaal: fasen.length,
    gebruikers_zonder_start: Number(aantalGebruikers),
    heeft_open_advies: openAdviezen.length > 0,
    laatste_advies_titel: openAdviezen[0]?.titel ?? null,
  });
});

router.get("/beheer/go-live/fasen", requireAuth, async (req, res) => {
  await zaaieFasen();
  const fasen = await db.select().from(goLiveFasenTable).orderBy(goLiveFasenTable.volgorde);
  res.json(fasen.map((f) => ({
    id: f.id, sleutel: f.sleutel, naam: f.naam, beschrijving: f.beschrijving,
    doel: f.doel, afhankelijkheden: f.afhankelijkheden, verantwoordelijke: f.verantwoordelijke,
    geschatte_uren: f.geschatteUren, status: f.status, voortgang_pct: f.voortgangPct,
    opmerkingen: f.opmerkingen, risico: f.risico, volgorde: f.volgorde,
    aangemaakt_op: f.aangemaaktOp, bijgewerkt_op: f.bijgewerktOp,
  })));
});

router.patch("/beheer/go-live/fasen/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status, voortgang_pct, opmerkingen, risico, verantwoordelijke } = req.body as {
    status?: string; voortgang_pct?: number; opmerkingen?: string; risico?: string; verantwoordelijke?: string;
  };
  const updates: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (status !== undefined) updates.status = status;
  if (voortgang_pct !== undefined) updates.voortgangPct = voortgang_pct;
  if (opmerkingen !== undefined) updates.opmerkingen = opmerkingen;
  if (risico !== undefined) updates.risico = risico;
  if (verantwoordelijke !== undefined) updates.verantwoordelijke = verantwoordelijke;

  const [updated] = await db.update(goLiveFasenTable).set(updates).where(eq(goLiveFasenTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Fase niet gevonden" });
  res.json({
    id: updated.id, sleutel: updated.sleutel, naam: updated.naam, beschrijving: updated.beschrijving,
    doel: updated.doel, afhankelijkheden: updated.afhankelijkheden, verantwoordelijke: updated.verantwoordelijke,
    geschatte_uren: updated.geschatteUren, status: updated.status, voortgang_pct: updated.voortgangPct,
    opmerkingen: updated.opmerkingen, risico: updated.risico, volgorde: updated.volgorde,
    aangemaakt_op: updated.aangemaaktOp, bijgewerkt_op: updated.bijgewerktOp,
  });
});

router.get("/beheer/go-live/readiness", requireAuth, async (req, res) => {
  const items = await voerReadinessChecksUit();
  res.json(items);
});

router.get("/beheer/go-live/adviezen", requireAuth, async (req, res) => {
  const adviezen = await db.select().from(goLiveAdviezenTable).orderBy(desc(goLiveAdviezenTable.aangemaaktOp));
  res.json(adviezen.map((a) => ({
    id: a.id, titel: a.titel, inhoud: a.inhoud, reden: a.reden,
    impact: a.impact, risico: a.risico, tijdwinst_uur: a.tijdwinst_uur,
    afhankelijkheden: a.afhankelijkheden, status: a.status,
    aangemaakt_op: a.aangemaaktOp, bijgewerkt_op: a.bijgewerktOp,
  })));
});

router.post("/beheer/go-live/adviezen/genereer", requireAuth, async (req, res) => {
  if (!heeftOpenAi()) {
    return res.status(503).json({ error: "AI-services niet geconfigureerd" });
  }
  const readiness = await voerReadinessChecksUit();
  const fasen = await db.select().from(goLiveFasenTable).orderBy(goLiveFasenTable.volgorde);
  const lessen = await db.select().from(goLiveLessenTable).orderBy(desc(goLiveLessenTable.bijgewerktOp)).limit(10);

  const context = {
    readiness_samenvatting: readiness.map((r) => `${r.label}: ${r.status}${r.detail ? ` (${r.detail})` : ""}`).join("\n"),
    fasen_status: fasen.map((f) => `${f.naam}: ${f.status} (${f.voortgangPct}%)`).join("\n"),
    kritieke_rood: readiness.filter((r) => r.status === "rood").map((r) => r.label).join(", "),
    eerdere_lessen: lessen.map((l) => l.omschrijving).join("\n"),
  };

  const prompt = `Je bent een implementatiecoach voor FPS Connect, een Nederlands brandpreventie-platform.
Analyseer de huidige implementatiestatus en geef EEN concreet, onderbouwd advies.

Readiness-checks:
${context.readiness_samenvatting}

Fasen-voortgang:
${context.fasen_status}

Kritieke rode punten: ${context.kritieke_rood || "geen"}
Eerdere lessen: ${context.eerdere_lessen || "geen"}

Geef je advies als JSON:
{
  "titel": "korte actietitel (max 60 tekens)",
  "inhoud": "uitleg in 2-3 zinnen",
  "reden": "waarom is dit nu de beste volgende stap?",
  "impact": "wat bereik je als je dit doet?",
  "risico": "wat is het risico als je dit NIET doet?",
  "tijdwinst_uur": getal,
  "afhankelijkheden": ["sleutel1"]
}

Antwoord ALLEEN met geldige JSON.`;

  const openai = maakOpenAiClient();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 800,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  } catch {
    return res.status(500).json({ error: "AI-antwoord kon niet worden verwerkt" });
  }

  const [nieuw] = await db.insert(goLiveAdviezenTable).values({
    titel: String(parsed.titel ?? "AI-advies"),
    inhoud: String(parsed.inhoud ?? ""),
    reden: parsed.reden ? String(parsed.reden) : null,
    impact: parsed.impact ? String(parsed.impact) : null,
    risico: parsed.risico ? String(parsed.risico) : null,
    tijdwinst_uur: typeof parsed.tijdwinst_uur === "number" ? parsed.tijdwinst_uur : null,
    afhankelijkheden: Array.isArray(parsed.afhankelijkheden) ? (parsed.afhankelijkheden as string[]) : [],
    contextJson: context,
  }).returning();

  res.json({
    id: nieuw.id, titel: nieuw.titel, inhoud: nieuw.inhoud, reden: nieuw.reden,
    impact: nieuw.impact, risico: nieuw.risico, tijdwinst_uur: nieuw.tijdwinst_uur,
    afhankelijkheden: nieuw.afhankelijkheden, status: nieuw.status,
    aangemaakt_op: nieuw.aangemaaktOp, bijgewerkt_op: nieuw.bijgewerktOp,
  });
});

router.patch("/beheer/go-live/adviezen/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: string };
  const [updated] = await db
    .update(goLiveAdviezenTable)
    .set({ status, bijgewerktOp: new Date() })
    .where(eq(goLiveAdviezenTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Advies niet gevonden" });
  res.json({
    id: updated.id, titel: updated.titel, inhoud: updated.inhoud, reden: updated.reden,
    impact: updated.impact, risico: updated.risico, tijdwinst_uur: updated.tijdwinst_uur,
    afhankelijkheden: updated.afhankelijkheden, status: updated.status,
    aangemaakt_op: updated.aangemaaktOp, bijgewerkt_op: updated.bijgewerktOp,
  });
});

router.get("/beheer/go-live/mijn-acties", requireAuth, async (req, res) => {
  const userId = req.session.userId;
  if (!userId) { res.status(401).json({ error: "Niet ingelogd" }); return; }
  const [gebruiker] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  if (!gebruiker) { res.status(404).json({ error: "Gebruiker niet gevonden" }); return; }
  const bevoegdheden = (gebruiker.bevoegdheden ?? {}) as Record<string, number>;
  res.json(mijnActiesVoorRol(gebruiker.rol, bevoegdheden));
});

router.get("/beheer/go-live/testdata", requireAuth, async (req, res) => {
  const [[{ waarde: gebouwen }], [{ waarde: spots }], [{ waarde: medewerkers }], [{ waarde: gebruikers }]] = await Promise.all([
    db.select({ waarde: count() }).from(gebouwenTable),
    db.select({ waarde: count() }).from(voorzieningenTable),
    db.select({ waarde: count() }).from(medewerkersTable),
    db.select({ waarde: count() }).from(gebruikersTable),
  ]);
  res.json({
    gebruikers: Number(gebruikers), gebouwen: Number(gebouwen),
    projecten: 0, spots: Number(spots),
    documenten: 0, facturen: 0, medewerkers: Number(medewerkers),
  });
});

router.post("/beheer/go-live/lessen", requireAuth, async (req, res) => {
  const { fase_sleutel, omschrijving, tijd_koste_uur } = req.body as {
    fase_sleutel: string; omschrijving: string; tijd_koste_uur?: number;
  };
  const [nieuw] = await db.insert(goLiveLessenTable).values({
    faseSleutel: fase_sleutel,
    omschrijving,
    tijdKosteUur: tijd_koste_uur ?? null,
  }).returning();
  res.status(201).json({
    id: nieuw.id, fase_sleutel: nieuw.faseSleutel, omschrijving: nieuw.omschrijving,
    tijd_koste_uur: nieuw.tijdKosteUur, aantal_keer: nieuw.aantalKeer,
    bijgewerkt_op: nieuw.bijgewerktOp,
  });
});

export default router;
