export interface ContractOvernameKandidaat {
  id: number;
  ingebrachtDocumentId: number | null;
}

export type ContractOvernameSelectie<T extends ContractOvernameKandidaat> =
  | { conflict: true; contract: null }
  | { conflict: false; contract: T | null };

export function kiesContractOvernameDoel<T extends ContractOvernameKandidaat>(input: {
  documentId: number | null;
  opBrondocument: T[];
  opStartdatum: T[];
  onboardingContracten: T[];
}): ContractOvernameSelectie<T> {
  if (input.opBrondocument.length > 1) return { conflict: true, contract: null };
  if (input.opBrondocument.length === 1) {
    return { conflict: false, contract: input.opBrondocument[0] };
  }

  if (
    input.opStartdatum.length > 1 ||
    input.opStartdatum.some((rij) => rij.ingebrachtDocumentId != null)
  ) {
    return { conflict: true, contract: null };
  }
  if (input.opStartdatum.length === 1) {
    return { conflict: false, contract: input.opStartdatum[0] };
  }

  if (input.onboardingContracten.length > 1) return { conflict: true, contract: null };
  return { conflict: false, contract: input.onboardingContracten[0] ?? null };
}