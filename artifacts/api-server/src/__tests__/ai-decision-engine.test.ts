import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AiDecisionEngine,
  type BeslissingStore,
  type BeslissingRij,
} from "../lib/aiDecisionEngine";
import { AiProcessStatus } from "../lib/aiOrchestrator";
import type { ChatResultaat, LogContext, ModelSlot, ChatParams } from "../lib/aiGateway";

// ── In-memory store (vervangt de DB in de test) ────────────────────────────────

function maakGeheugenStore() {
  const rijen = new Map<string, BeslissingRij>();
  const store: BeslissingStore = {
    async bewaar(r) {
      const rij: BeslissingRij = {
        token: r.token,
        taaknaam: r.taaknaam,
        module: r.module,
        procesNaam: r.procesNaam,
        aanvragerId: r.aanvragerId,
        status: AiProcessStatus.wacht_op_gebruiker,
        voorstel: r.voorstel,
        betrouwbaarheid: r.betrouwbaarheid,
        controleNodig: r.controleNodig,
        modelSlot: r.modelSlot,
        promptNaam: r.promptNaam,
        promptVersie: r.promptVersie,
        beslistDoorId: null,
        beslistOp: null,
        opmerking: null,
        verlooptOp: r.verlooptOp,
        aangemaaktOp: new Date(),
      };
      rijen.set(r.token, rij);
      return rij;
    },
    async haalOpViaToken(token) {
      return rijen.get(token) ?? null;
    },
    async werkStatusBij(token, patch) {
      const bestaand = rijen.get(token);
      if (!bestaand) return null;
      const bijgewerkt: BeslissingRij = { ...bestaand, ...patch };
      rijen.set(token, bijgewerkt);
      return bijgewerkt;
    },
    async lijst() {
      return [...rijen.values()];
    },
  };
  return { store, rijen };
}

// ── Mock gateway ───────────────────────────────────────────────────────────────
// Registreert de aanroepargumenten zodat we kunnen bewijzen dat de engine
// UITSLUITEND via aiGateway.chat() loopt (governance blijft de eerste poort).

function maakMockGateway(antwoord: ChatResultaat) {
  const aanroepen: Array<{ slot: ModelSlot; params: ChatParams; logCtx?: LogContext }> = [];
  const gateway = {
    async chat(
      slot: ModelSlot,
      params: ChatParams,
      _timeoutMs?: number,
      logCtx?: LogContext,
    ): Promise<ChatResultaat> {
      aanroepen.push({ slot, params, logCtx });
      return antwoord;
    },
  };
  return { gateway, aanroepen };
}

describe("AiDecisionEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passthrough: geeft de ruwe gateway-uitvoer ongewijzigd terug (geen gedragswijziging)", async () => {
    const gatewayInhoud = "Dit is de samenvatting van het rapport.";
    const { gateway, aanroepen } = maakMockGateway({ ok: true, inhoud: gatewayInhoud });
    const { store } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const res = await engine.verwerk(
      "rapport-samenvatting",
      { invoer: "Vat dit rapport samen." },
      42,
    );

    // Het resultaat is functioneel identiek aan een directe gateway-aanroep.
    expect(res.status).toBe(AiProcessStatus.voorstel);
    expect(res.resultaat).toBe(gatewayInhoud);
    expect(res.humanApprovalToken).toBeUndefined();

    // Bewijs: precies één gateway-aanroep, met de gebruikersinvoer als user-message.
    expect(aanroepen).toHaveLength(1);
    const userMsg = aanroepen[0].params.messages.find((m) => m.role === "user");
    expect(userMsg?.content).toBe("Vat dit rapport samen.");
  });

  it("human-in-the-loop: wacht op goedkeuring, dan akkoord geeft het voorstel vrij", async () => {
    const voorstelJson = JSON.stringify({
      bevindingen: [{ ernst: "ok", mutatie_naam: "Jan", bericht: "Correct." }],
      compleet: true,
      aanbeveling: "Geen actie nodig.",
      betrouwbaarheid: "hoog",
    });
    const { gateway } = maakMockGateway({ ok: true, inhoud: voorstelJson });
    const { store, rijen } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const start = await engine.verwerk(
      "salaris-mutaties-controle",
      { invoer: "Controleer deze mutaties." },
      7,
    );

    // Fase 1: het proces pauzeert en levert een token.
    expect(start.status).toBe(AiProcessStatus.wacht_op_gebruiker);
    expect(start.resultaat).toBeNull();
    expect(typeof start.humanApprovalToken).toBe("string");
    const token = start.humanApprovalToken as string;
    expect(rijen.get(token)?.status).toBe(AiProcessStatus.wacht_op_gebruiker);

    // Fase 2: een mens keurt goed.
    const akkoord = await engine.beoordeel(token, 99, true, "Akkoord bevonden.");
    expect(akkoord.status).toBe(AiProcessStatus.akkoord);
    expect(akkoord.resultaat).toBe(voorstelJson);
    expect(rijen.get(token)?.status).toBe(AiProcessStatus.akkoord);
    expect(rijen.get(token)?.beslistDoorId).toBe(99);
  });

  it("human-in-the-loop: afwijzing geeft geen resultaat vrij", async () => {
    const { gateway } = maakMockGateway({ ok: true, inhoud: "{}" });
    const { store, rijen } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const start = await engine.verwerk("salaris-mutaties-controle", { invoer: "x" }, 1);
    const token = start.humanApprovalToken as string;

    const afwijzing = await engine.beoordeel(token, 5, false);
    expect(afwijzing.status).toBe(AiProcessStatus.afgewezen);
    expect(afwijzing.resultaat).toBeNull();
    expect(rijen.get(token)?.status).toBe(AiProcessStatus.afgewezen);
  });

  it("een reeds afgehandeld token kan niet nogmaals worden beoordeeld", async () => {
    const { gateway } = maakMockGateway({ ok: true, inhoud: "{}" });
    const { store } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const start = await engine.verwerk("salaris-mutaties-controle", { invoer: "x" }, 1);
    const token = start.humanApprovalToken as string;

    await engine.beoordeel(token, 5, true);
    const tweede = await engine.beoordeel(token, 5, true);
    expect(tweede.status).toBe(AiProcessStatus.fout);
    expect(tweede.foutmelding).toContain("al afgehandeld");
  });

  it("fail-closed: als de statusupdate geen rij teruggeeft, komt er geen resultaat vrij", async () => {
    const { gateway } = maakMockGateway({ ok: true, inhoud: "geheim voorstel" });
    const { store } = maakGeheugenStore();
    // Forceer de anomalie: werkStatusBij geeft null terug (race/store-anomalie).
    store.werkStatusBij = async () => null;
    const engine = new AiDecisionEngine({ store, gateway });

    const start = await engine.verwerk("salaris-mutaties-controle", { invoer: "x" }, 1);
    const token = start.humanApprovalToken as string;

    const res = await engine.beoordeel(token, 5, true);
    expect(res.status).toBe(AiProcessStatus.fout);
    expect(res.resultaat).toBeNull();
  });

  it("onbekende taak geeft een nette fout", async () => {
    const { gateway } = maakMockGateway({ ok: true, inhoud: "x" });
    const { store } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const res = await engine.verwerk("bestaat-niet", { invoer: "x" }, 1);
    expect(res.status).toBe(AiProcessStatus.fout);
    expect(res.foutmelding).toContain("Onbekende AI-taak");
  });

  it("een gateway-fout wordt doorgegeven als status fout", async () => {
    const { gateway } = maakMockGateway({ ok: false, fout: "Provider onbereikbaar." });
    const { store } = maakGeheugenStore();
    const engine = new AiDecisionEngine({ store, gateway });

    const res = await engine.verwerk("rapport-samenvatting", { invoer: "x" }, 1);
    expect(res.status).toBe(AiProcessStatus.fout);
    expect(res.foutmelding).toBe("Provider onbereikbaar.");
  });
});
