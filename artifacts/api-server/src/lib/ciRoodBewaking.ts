const DAG_MS = 24 * 60 * 60 * 1000;

export type CiRoodMailBesluit = {
  actief: boolean;
  duurUren: number;
  mailen: boolean;
};

/**
 * Pure beleidsgrens voor de dagelijkse CI-waarschuwing.
 * De databasezoektocht bepaalt eerst het begin van de onafgebroken rode
 * periode; deze functie beslist uitsluitend over 24 uur rood en dag-dedup.
 */
export function bepaalCiRoodMailBesluit(input: {
  laatsteConclusie: string | null;
  roodSinds: Date | null;
  laatstGemaildOp: Date | null;
  nu: Date;
}): CiRoodMailBesluit {
  if (input.laatsteConclusie !== "failure" || !input.roodSinds) {
    return { actief: false, duurUren: 0, mailen: false };
  }

  const duurMs = Math.max(0, input.nu.getTime() - input.roodSinds.getTime());
  const langGenoegRood = duurMs >= DAG_MS;
  const vandaagNogNietGemaild =
    !input.laatstGemaildOp ||
    input.nu.getTime() - input.laatstGemaildOp.getTime() >= DAG_MS;

  return {
    actief: true,
    duurUren: Math.floor(duurMs / (60 * 60 * 1000)),
    mailen: langGenoegRood && vandaagNogNietGemaild,
  };
}