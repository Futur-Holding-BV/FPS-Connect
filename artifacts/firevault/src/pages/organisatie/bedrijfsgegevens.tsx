// ADMINISTRATIE_01 fase 1 — Bedrijfsgegevens is samengevoegd met
// Werkmaatschappijen (zelfde bron: werkgevers-tabel). Deze route blijft
// bestaan als doorverwijzing zodat oude links en bladwijzers blijven werken.
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BedrijfsgegevensPagina() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/organisatie/werkmaatschappijen", { replace: true });
  }, [navigate]);
  return null;
}
