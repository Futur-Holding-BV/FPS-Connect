// NAV_01 — welke route hoort bij welk sidebar-hoofdstuk? Gebruikt voor de
// dunne accentlijn boven de pagina (merkteken in de hoofdstukkleur). De
// prefixen zijn afgeleid van de menu-onderdelen in beheerder-layout.tsx;
// langste prefix wint. Routes buiten elk hoofdstuk (dashboard, instellingen,
// One-omgeving) geven null → geen accentlijn.
import type { HoofdstukSleutel } from "@workspace/ontwerp";

const PREFIXEN: ReadonlyArray<[string, HoofdstukSleutel]> = [
  ["/gebouwen", "projectaanpak"],
  ["/opname", "projectaanpak"],
  ["/modules/calculatie", "projectaanpak"],
  ["/offertes", "projectaanpak"],
  ["/werkvoorbereiding", "projectaanpak"],
  ["/opdrachten", "projectaanpak"],
  ["/inkoop", "projectaanpak"],
  ["/uitvoering", "projectaanpak"],
  ["/regie", "projectaanpak"],
  ["/modules/planning", "projectaanpak"],
  ["/rapporten", "projectaanpak"],
  ["/onderhoud", "projectaanpak"],
  ["/dossiers", "projectaanpak"],
  ["/documenten", "projectaanpak"],
  ["/snagstream", "projectaanpak"],
  ["/voorzieningen", "projectaanpak"],
  // /algemene-inkoop is bewust een losse menupost (geen hoofdstuk) → geen accentlijn.
  ["/magazijn", "magazijn"],
  ["/crm", "commercie"],
  ["/berichten", "communicatie"],
  ["/werk-inbox", "communicatie"],
  ["/workflow-designer", "organisatie"], // vóór /workflow (langste prefix wint sowieso)
  ["/workflow", "communicatie"],
  ["/team-overleg", "communicatie"],
  ["/veiligheid", "veiligheid"],
  ["/directie", "financieel"],
  ["/financieel", "financieel"],
  ["/beheer/bedrijfskompas", "financieel"],
  ["/beheer/boekhouding", "financieel"],
  ["/beheer/prijsafspraken", "financieel"],
  ["/facturen", "financieel"],
  ["/sepa-bestanden", "financieel"],
  ["/beheer/goedkeuringen-dashboard", "goedkeuring"],
  ["/beheer/goedkeuringsbeleid", "goedkeuring"],
  ["/declaraties", "declaraties"],
  ["/gereedschappen", "organisatie"],
  ["/wagenpark", "organisatie"],
  ["/organisatie", "organisatie"],
  ["/personeel/jaarafsluiting", "loon"],
  ["/personeel", "personeel"],
  ["/uren", "personeel"],
  ["/weekstaten", "personeel"],
  ["/hall-of-fame", "personeel"],
  ["/salaris-mutaties", "loon"],
  ["/scab-mail", "loon"],
  ["/loon-output", "loon"],
  ["/boekhouder", "loon"],
  ["/salarisarchief", "loon"],
];

/** Hoofdstuk bij een pad, of null als het pad buiten de elf hoofdstukken valt. */
export function hoofdstukVanRoute(pad: string): HoofdstukSleutel | null {
  let beste: [string, HoofdstukSleutel] | null = null;
  for (const kandidaat of PREFIXEN) {
    if (pad === kandidaat[0] || pad.startsWith(kandidaat[0] + "/")) {
      if (!beste || kandidaat[0].length > beste[0].length) beste = kandidaat;
    }
  }
  return beste ? beste[1] : null;
}
