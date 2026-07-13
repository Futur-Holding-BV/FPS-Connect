// BIAE-job — centrale deadline-bewaking.
//
// De BIAE bundelt de terugkerende deadline-/termijnbewaking op één plek. In deze
// eerste stap delegeert de job naar de bestaande, bewezen uurlijkse
// goedkeuringsbewaking (goedkeuringBewaking.ts) i.p.v. die te dupliceren of te
// vervangen — stabiliteit boven functionaliteit. Toekomstige deadline-bronnen
// (reactietermijnen, planning) kunnen hier centraal bijgeplugd worden.
import { planUurlijkseGoedkeuringBewaking } from "../../../lib/goedkeuringBewaking";
import { logger } from "../../../lib/logger";

let _gepland = false;

export function planCentraleDeadlineBewaking(): void {
  if (_gepland) return;
  _gepland = true;

  // Delegatie: de goedkeuringsbewaking plant zichzelf uurlijks in en voert
  // 10s na start een eerste controle uit. De BIAE-job is de centrale ingang.
  planUurlijkseGoedkeuringBewaking();
  logger.info("BIAE: centrale deadline-bewaking gestart (delegeert naar goedkeuringsbewaking)");
}
