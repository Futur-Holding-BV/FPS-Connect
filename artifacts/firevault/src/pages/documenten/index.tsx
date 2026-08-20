import { TabDocumenten } from "@/pages/beheer/documenten-tab";

// Zelfstandige productrapportenpagina. Contextdocumenten blijven op hun eigen
// offerte-, opdracht-, project-, dossier-, organisatie- of HRM-bestemming.
export default function DocumentenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 data-paginatitel className="text-2xl font-semibold tracking-tight">Productrapporten</h1>
        <p className="text-sm text-muted-foreground">
          Technische productbladen, certificaten en rapporten met een geldige toepassing.
        </p>
      </div>
      <TabDocumenten />
    </div>
  );
}
