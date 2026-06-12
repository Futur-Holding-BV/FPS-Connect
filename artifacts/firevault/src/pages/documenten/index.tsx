import { TabDocumenten } from "@/pages/beheer/documenten-tab";

// Zelfstandige documentenpagina (DMS). Hergebruikt het volledige documentenpaneel
// uit de bibliotheek (signaleringen, filters, lijst, detail, goedkeuring) zodat
// het documentbeheer als eigen menu-item bereikbaar is naast de bibliotheek.
export default function DocumentenPagina() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documenten</h1>
        <p className="text-sm text-muted-foreground">
          Centrale documentbibliotheek met signaleringen, revisies en goedkeuring.
        </p>
      </div>
      <TabDocumenten />
    </div>
  );
}
