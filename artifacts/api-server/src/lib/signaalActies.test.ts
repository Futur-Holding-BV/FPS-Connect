import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GetFiePrognoseResponse } from "@workspace/api-zod";
import { maakFiePrognoseResponse } from "./fiePrognoseResponse";
import {
  bepaalSignaalActie,
  FIE_SIGNAAL_TYPES,
  LIQUIDITEIT_SIGNAAL_TYPES,
} from "./signaalActies";

const BEKENDE_TYPES = [...FIE_SIGNAAL_TYPES, ...LIQUIDITEIT_SIGNAAL_TYPES];

test("elk bekend directiesignaal heeft een concrete actie", () => {
  for (const type of BEKENDE_TYPES) {
    const actie = bepaalSignaalActie(type);
    assert.ok(actie.actie_pad, `${type} mist een actiepad`);
    assert.ok(actie.actie_label, `${type} mist een actielabel`);
  }
});

test("een onbekend signaaltype krijgt geen misleidende doorklik", () => {
  assert.deepEqual(bepaalSignaalActie("toekomstig_onbekend_type"), {
    actie_pad: null,
    actie_label: null,
  });
});

test("alle toegewezen actiepaden bestaan in de webrouter", async () => {
  const routes = await readFile(
    new URL("../../../firevault/src/routes/connect-routes.tsx", import.meta.url),
    "utf8",
  );
  const paden = new Set(
    BEKENDE_TYPES.map((type) => bepaalSignaalActie(type).actie_pad).filter(
      (pad): pad is string => pad !== null,
    ),
  );

  for (const pad of paden) {
    assert.match(routes, new RegExp(`path=["']${pad.replaceAll("/", "\\/")}["']`));
  }
});

test("de live FIE-prognoserespons behoudt de signaalactie in het OpenAPI-contract", () => {
  const actie = bepaalSignaalActie("omzet_risico");
  const respons = maakFiePrognoseResponse({
    boekjaar: 2026,
    heeft_begroting: true,
    omzet_doel: 1_000_000,
    doel_marge_pct: 10,
    totaal_ak: 100_000,
    bevestigde_omzet: 500_000,
    aantal_bevestigde_offertes: 1,
    gewogen_pipeline: 100_000,
    pijplijn_bruto: 200_000,
    aantal_pipeline_offertes: 1,
    ohw_restwaarde: 0,
    aantal_ohw_opdrachten: 0,
    prognose_omzet: 600_000,
    prognose_inclusief_ohw: 600_000,
    coverage_pct: 60,
    gap_tot_doel: 400_000,
    ak_dekkingsgraad_pct: 600,
    break_even_omzet: 111_111.11,
    break_even_bereikt: true,
    prognose_brutowinst: 60_000,
    prognose_nettoresultaat: -40_000,
    kwartaal_verdeling: [],
    begroting_per_kwartaal: [],
    observaties: [{
      type: "omzet_risico",
      ernst: "kritiek",
      omschrijving: "De prognose blijft achter.",
      waarde: 600_000,
      drempelwaarde: 1_000_000,
      afwijking_pct: -40,
      impact: "Omzetderving.",
      advies: "Versterk de pipeline.",
      betrouwbaarheidsscore: 90,
      ...actie,
    }],
    werkmaatschappij_verdeling: [],
  });

  const contract = GetFiePrognoseResponse.parse(respons);
  assert.equal(contract.observaties[0]?.actie_pad, "/offertes");
  assert.equal(contract.observaties[0]?.actie_label, "Offertes en pipeline bekijken");
});