// Deterministische tests voor het afstootbeleid (Task 844).
// Draaien: pnpm --filter @workspace/api-server exec tsx src/lib/wagenparkAfstootBeleid.test.ts
import {
  pasAfstootBeleidToe,
  MIN_KOSTENREGELS_VOOR_AFSTOOT,
} from "./wagenparkAfstootBeleid";

function eis(v: boolean, naam: string, detail?: unknown): void {
  if (!v) throw new Error(`FAIL — ${naam}: ${JSON.stringify(detail)}`);
  console.log(`OK — ${naam}`);
}

const medianen = { mediaan_kosten_laatste_12m: 3000, mediaan_kosten_per_km: 0.05 };

// 1. Geen kostendata + AI zegt "afstoten" → gedwongen naar monitoren met data-onderbouwing.
const geenData = pasAfstootBeleidToe(
  "afstoten", "Dit voertuig is oud.",
  { aantal_kostenregels: 0, kosten_laatste_12m: 0, kosten_per_km_totaal: null },
  medianen,
);
eis(geenData.advies === "monitoren" && geenData.afgezwakt, "geen data → nooit afstoten", geenData);
eis(geenData.onderbouwing.includes("Te weinig eigen kostendata"), "data-onvoldoende-onderbouwing", geenData);

// 2. Te weinig regels (< minimum) + "vervangen" → monitoren.
const weinigData = pasAfstootBeleidToe(
  "vervangen", "x",
  { aantal_kostenregels: MIN_KOSTENREGELS_VOOR_AFSTOOT - 1, kosten_laatste_12m: 9000, kosten_per_km_totaal: 0.2 },
  medianen,
);
eis(weinigData.advies === "monitoren" && weinigData.afgezwakt, "te weinig regels → nooit vervangen", weinigData);

// 3. Genoeg data maar ONDER de medianen + "afstoten" → monitoren (geen bewijs).
const onderMediaan = pasAfstootBeleidToe(
  "afstoten", "x",
  { aantal_kostenregels: 5, kosten_laatste_12m: 1000, kosten_per_km_totaal: 0.02 },
  medianen,
);
eis(onderMediaan.advies === "monitoren" && onderMediaan.afgezwakt, "onder mediaan → nooit afstoten", onderMediaan);
eis(onderMediaan.onderbouwing.includes("niet boven de vlootmediaan"), "mediaan-onderbouwing", onderMediaan);

// 4. Genoeg data en BOVEN de mediaan + "afstoten" → toegestaan, onderbouwing intact.
const bovenMediaan = pasAfstootBeleidToe(
  "afstoten", "Kosten €8770 vs mediaan €3000.",
  { aantal_kostenregels: 4, kosten_laatste_12m: 8770, kosten_per_km_totaal: 0.03 },
  medianen,
);
eis(bovenMediaan.advies === "afstoten" && !bovenMediaan.afgezwakt, "boven mediaan → afstoten toegestaan", bovenMediaan);

// 5. Medianen onbekend (te kleine vloot) + "vervangen" → monitoren (fail-closed).
const geenMediaan = pasAfstootBeleidToe(
  "vervangen", "x",
  { aantal_kostenregels: 5, kosten_laatste_12m: 9000, kosten_per_km_totaal: 0.2 },
  { mediaan_kosten_laatste_12m: null, mediaan_kosten_per_km: null },
);
eis(geenMediaan.advies === "monitoren" && geenMediaan.afgezwakt, "geen medianen → fail-closed", geenMediaan);

// 6. Onbekend/ongeldig advies → monitoren; "behouden" blijft gewoon staan.
const rommel = pasAfstootBeleidToe("slopen", "x", { aantal_kostenregels: 0, kosten_laatste_12m: 0, kosten_per_km_totaal: null }, medianen);
eis(rommel.advies === "monitoren", "ongeldig advies → monitoren", rommel);
const behouden = pasAfstootBeleidToe("behouden", "prima staat", { aantal_kostenregels: 0, kosten_laatste_12m: 0, kosten_per_km_totaal: null }, medianen);
eis(behouden.advies === "behouden" && !behouden.afgezwakt, "behouden mag altijd", behouden);

console.log("\nALLE BELEIDSTESTS GESLAAGD ✅");
