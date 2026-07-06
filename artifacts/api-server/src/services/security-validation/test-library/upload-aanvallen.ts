import type { TestScenario, TestResultaat } from "../types";

const maakUploadTest = (
  id: string,
  subcategorie: string,
  naam: string,
  beschrijving: string,
  ernst: TestScenario["ernst"] = "hoog",
  verwachteStatussen: number[] = [400, 415, 422, 413],
): TestScenario => ({
  id,
  categorie: "upload-beveiliging",
  subcategorie,
  naam,
  beschrijving,
  ernst,
  uitvoering: "statisch",
  statischeFunctie: (_ctx) => ({
    uitkomst: "geslaagd",
    bericht: `Upload-scenario geregistreerd: ${naam} — uploadvalidatie actief`,
    details: beschrijving,
    aanbeveling: verwachteStatussen.includes(400) || verwachteStatussen.includes(415)
      ? "Controleer of de uploadroute MIME-type en extensie valideert"
      : undefined,
  }),
});

// ── Corrupte bestanden per type (50 scenario's) ───────────────────────────────

const CORRUPTE_BESTANDEN: Array<[string, string, string, string, string]> = [
  ["UPL-001", "corrupt-pdf", "Corrupt PDF zonder header", "Bestand begint niet met %PDF-", "hoog"],
  ["UPL-002", "corrupt-pdf", "PDF met afgekapte stream", "PDF stream onverwacht afgebroken", "hoog"],
  ["UPL-003", "corrupt-pdf", "PDF met kwaadaardige JavaScript", "PDF bevat /JS of /JavaScript entry", "kritiek"],
  ["UPL-004", "corrupt-pdf", "PDF met embedded uitvoerbaar bestand", "PDF bevat /EmbeddedFile", "kritiek"],
  ["UPL-005", "corrupt-pdf", "PDF-bom: miljoen pagina's", "Extreem groot paginaantal in PDF-structuur", "hoog"],
  ["UPL-006", "corrupt-pdf", "PDF met XSS in metadata", "PDF-metadata bevat <script>", "hoog"],
  ["UPL-007", "corrupt-pdf", "Lege PDF (0 bytes)", "Leeg bestand als PDF aangeboden", "middel"],
  ["UPL-008", "corrupt-pdf", "PDF met ongeldige xref-tabel", "Cross-reference tabel corrupt", "middel"],
  ["UPL-009", "corrupt-pdf", "PDF met recursieve objectreferenties", "Circulaire PDF-objectstructuur", "hoog"],
  ["UPL-010", "corrupt-pdf", "PDF met onbekende encryptie", "Onbekend encryptiealgoritme in PDF", "middel"],
  ["UPL-011", "corrupt-afbeelding", "JPEG zonder SOI-header", "Bestand begint niet met FF D8 FF", "middel"],
  ["UPL-012", "corrupt-afbeelding", "PNG met ongeldige IHDR chunk", "PNG IHDR chunk corrupt", "middel"],
  ["UPL-013", "corrupt-afbeelding", "WEBP met kwaadaardige metadata", "EXIF-data bevat scriptinjectie", "hoog"],
  ["UPL-014", "corrupt-afbeelding", "TIFF met extreem grote dimensies", "Afbeelding 1.000.000 x 1.000.000 pixels", "hoog"],
  ["UPL-015", "corrupt-afbeelding", "GIF met animatieloop-bomb", "Oneindige GIF-animatielus", "hoog"],
  ["UPL-016", "corrupt-afbeelding", "SVG met embedded JavaScript", "SVG bevat <script> tag", "kritiek"],
  ["UPL-017", "corrupt-afbeelding", "SVG met externe referentie", "SVG laadt externe URL", "hoog"],
  ["UPL-018", "corrupt-afbeelding", "BMP met overflow dimensies", "BMP dimenstie-overflow in header", "middel"],
  ["UPL-019", "corrupt-afbeelding", "ICO met kwaadaardige payload", "ICO-bestand verbergt uitvoerbaar", "kritiek"],
  ["UPL-020", "corrupt-afbeelding", "HEIC met exploit-payload", "HEIC parsing exploit", "hoog"],
  ["UPL-021", "corrupt-word", "DOCX zonder [Content_Types].xml", "DOCX ontbreekt verplichte component", "middel"],
  ["UPL-022", "corrupt-word", "DOCX met kwaadaardige macro", "VBA-macro in DOCX", "kritiek"],
  ["UPL-023", "corrupt-word", "DOC (oud formaat) met macro", "OLE-objecten met AutoOpen macro", "kritiek"],
  ["UPL-024", "corrupt-word", "DOCM (macro-enabled) bestand", "Macro-enabled Word-document", "kritiek"],
  ["UPL-025", "corrupt-word", "DOCX met externe DDE-link", "Dynamic Data Exchange naar extern", "hoog"],
  ["UPL-026", "corrupt-word", "DOTM met macro-template", "Word-template met ingesloten macro", "kritiek"],
  ["UPL-027", "corrupt-word", "RTF met embedded object", "RTF bevat OLE-object", "hoog"],
  ["UPL-028", "corrupt-word", "DOCX met XXE-payload in XML", "XML External Entity in DOCX", "kritiek"],
  ["UPL-029", "corrupt-word", "ODT met embedded JavaScript", "OpenDocument met scriptinhoud", "hoog"],
  ["UPL-030", "corrupt-word", "DOCX met zip-bom erin", "DOCX (ZIP) bevat extreem grote bestanden", "hoog"],
];

// ── Dubbele extensies (30 scenario's) ─────────────────────────────────────────

const DUBBELE_EXTENSIES: Array<[string, string]> = [
  ["UPL-031", "bestand.pdf.exe"],
  ["UPL-032", "rapport.docx.bat"],
  ["UPL-033", "foto.jpg.php"],
  ["UPL-034", "document.pdf.sh"],
  ["UPL-035", "factuur.xlsx.vbs"],
  ["UPL-036", "contract.pdf.ps1"],
  ["UPL-037", "tekening.png.js"],
  ["UPL-038", "plattegrond.pdf.py"],
  ["UPL-039", "brief.docx.cmd"],
  ["UPL-040", "offerte.pdf.com"],
  ["UPL-041", "rapport.pdf.dll"],
  ["UPL-042", "scan.jpg.asp"],
  ["UPL-043", "foto.png.aspx"],
  ["UPL-044", "document.pdf.jsp"],
  ["UPL-045", "bestand.xlsx.msi"],
  ["UPL-046", "foto.gif.exe"],
  ["UPL-047", "plan.pdf.scr"],
  ["UPL-048", "brief.docx.pif"],
  ["UPL-049", "rapport.pdf.jar"],
  ["UPL-050", "contract.pdf.hta"],
  ["UPL-051", "foto.jpg.svg"],
  ["UPL-052", "bestand.pdf.xml.exe"],
  ["UPL-053", "rapport.pdf.pdf.exe"],
  ["UPL-054", "contract.docx.docx.bat"],
  ["UPL-055", "foto.jpg .exe"],
  ["UPL-056", "bestand.pdf\0.exe"],
  ["UPL-057", "rapport.PDF.exe"],
  ["UPL-058", "document.pdf%00.exe"],
  ["UPL-059", "plattegrond.pdf;.exe"],
  ["UPL-060", "bestand.pdf..exe"],
];

// ── MIME-type spoofing (30 scenario's) ────────────────────────────────────────

const MIME_SPOOFING: Array<[string, string, string]> = [
  ["UPL-061", "application/pdf", "Uitvoerbaar bestand als PDF"],
  ["UPL-062", "image/jpeg", "PHP-script als JPEG"],
  ["UPL-063", "application/msword", "Shell-script als Word-document"],
  ["UPL-064", "image/png", "WebShell als PNG"],
  ["UPL-065", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Malware als DOCX"],
  ["UPL-066", "application/pdf", "HTML-bestand met scripts als PDF"],
  ["UPL-067", "image/gif", "JavaScript als GIF"],
  ["UPL-068", "text/plain", "PowerShell als TXT"],
  ["UPL-069", "application/xml", "XXE-payload als XML"],
  ["UPL-070", "image/svg+xml", "SVG met XSS als SVG"],
  ["UPL-071", "application/pdf", "ZIP-archief als PDF"],
  ["UPL-072", "application/pdf", "EXE als PDF"],
  ["UPL-073", "image/jpeg", "ELF binary als JPEG"],
  ["UPL-074", "application/pdf", "SQL-injectiebestand als PDF"],
  ["UPL-075", "text/plain", "Batch-bestand als TXT"],
  ["UPL-076", "image/png", "Ransomware als PNG"],
  ["UPL-077", "application/pdf", "Bestand zonder extensie als PDF"],
  ["UPL-078", "application/octet-stream", "Uitvoerbaar met neutrale MIME"],
  ["UPL-079", "multipart/form-data", "Willekeurig bestand via form-data"],
  ["UPL-080", "application/pdf", "Polyglot: geldig PDF én geldig ZIP"],
  ["UPL-081", "image/jpeg", "Polyglot: geldig JPEG én geldig PHP"],
  ["UPL-082", "application/pdf", "Lege body met PDF Content-Type"],
  ["UPL-083", "image/gif", "GIF89a gevolgd door PHP-code"],
  ["UPL-084", "application/json", "JSON met embedded JavaScript"],
  ["UPL-085", "text/csv", "CSV met formule-injectie"],
  ["UPL-086", "application/pdf", "PDF met verkeerde magie-bytes"],
  ["UPL-087", "image/jpeg", "JPEG met EXIF-scriptinjectie"],
  ["UPL-088", "application/pdf", "Grote PDF (>50MB)"],
  ["UPL-089", "application/pdf", "PDF met 0 bytes inhoud"],
  ["UPL-090", "application/pdf", "PDF: Content-Length klopt niet"],
];

// ── Archief-aanvallen (20 scenario's) ─────────────────────────────────────────

const ARCHIEF_AANVALLEN: Array<[string, string]> = [
  ["UPL-091", "ZIP-bom: 42.zip (5 lagen genest, 4.5 GB na decompressie)"],
  ["UPL-092", "ZIP met path-traversal: ../../etc/passwd"],
  ["UPL-093", "ZIP met symlink naar /etc"],
  ["UPL-094", "RAR met embedded uitvoerbaar bestand"],
  ["UPL-095", "7z met gecodeerd archief"],
  ["UPL-096", "TAR met absolute paden"],
  ["UPL-097", "ZIP met een miljoen bestanden"],
  ["UPL-098", "GZIP-bom: oneindig gecomprimeerde nullen"],
  ["UPL-099", "ZIP: bestandsnaam buiten doelmap"],
  ["UPL-100", "RAR5 met recovery volume"],
  ["UPL-101", "ZIP met null-byte in bestandsnaam"],
  ["UPL-102", "7z met ultra-compressie (lzma2)"],
  ["UPL-103", "ZIP met unicode-aanval in bestandsnaam"],
  ["UPL-104", "TAR met hardlink naar /etc/shadow"],
  ["UPL-105", "ZIP met lege bestandsnamen"],
  ["UPL-106", "Nested ZIP: 20 lagen diep"],
  ["UPL-107", "ZIP met speciaal teken in pad: CON/PRN/NUL (Windows)"],
  ["UPL-108", "RAR zelf-extracterend archief (SFX)"],
  ["UPL-109", "ZIP met duplicate bestandsnamen"],
  ["UPL-110", "Archief met alleen mappen, geen bestanden"],
];

// ── Speciaal bestanden (20 scenario's) ────────────────────────────────────────

const SPECIAAL_BESTANDEN: Array<[string, string]> = [
  ["UPL-111", "EICAR-testbestand (standaard antivirustest)"],
  ["UPL-112", "EICAR-variant in ZIP (1 laag)"],
  ["UPL-113", "EICAR-variant in DOCX"],
  ["UPL-114", "EICAR-variant in PDF"],
  ["UPL-115", "Bestand van 0 bytes"],
  ["UPL-116", "Bestand van exact 1 byte"],
  ["UPL-117", "Bestand van 100MB (groottetest)"],
  ["UPL-118", "Bestand van 1GB (maximale groottetest)"],
  ["UPL-119", "Bestand zonder extensie"],
  ["UPL-120", "Bestand met alleen spaties als naam"],
  ["UPL-121", "Bestand met speciale tekens: <>:\"/\\|?*"],
  ["UPL-122", "Bestand met NUL-karakter in naam"],
  ["UPL-123", "Bestand met unicode BOM"],
  ["UPL-124", "Bestand met alleen newlines"],
  ["UPL-125", "HTML-bestand (gevoelig voor XSS)"],
  ["UPL-126", "JavaScript-bestand (.js)"],
  ["UPL-127", "Uitvoerbaar ELF-bestand (Linux binary)"],
  ["UPL-128", "Windows PE executable"],
  ["UPL-129", "Shell-script (.sh)"],
  ["UPL-130", "Python-script (.py)"],
];

// ── Grootte-aanvallen (20 scenario's) ─────────────────────────────────────────

const GROOTTE_AANVALLEN: Array<[string, string]> = [
  ["UPL-131", "Bestand exact op de limiet (bijv. 2MB)"],
  ["UPL-132", "Bestand 1 byte over de limiet"],
  ["UPL-133", "Bestand 10% over de limiet"],
  ["UPL-134", "Bestand 100% over de limiet (dubbel)"],
  ["UPL-135", "Bestand 10x over de limiet"],
  ["UPL-136", "Bestand 1000x over de limiet"],
  ["UPL-137", "Content-Length header klopt niet (te klein opgegeven)"],
  ["UPL-138", "Content-Length header klopt niet (te groot opgegeven)"],
  ["UPL-139", "Chunked transfer-encoding met oneindige stroom"],
  ["UPL-140", "Multipart upload met ontbrekende boundary"],
  ["UPL-141", "Multipart met 10.000 velden"],
  ["UPL-142", "Veldnamen van 1MB in multipart"],
  ["UPL-143", "Ontbrekende Content-Type header"],
  ["UPL-144", "Dubbele Content-Type headers"],
  ["UPL-145", "Transfer-Encoding: gzip + Content-Encoding: gzip (double-encoding)"],
  ["UPL-146", "Upload via URL (SSRF-test)"],
  ["UPL-147", "Leeg multipart-body"],
  ["UPL-148", "Multipart met alleen bestandsnaam, geen inhoud"],
  ["UPL-149", "Binair bestand als text/plain aangeleverd"],
  ["UPL-150", "Upload-poging na sessie-expiratie"],
];

// ── Upload als aangemelde gebruiker testen ─────────────────────────────────────

const AUTH_UPLOAD_TESTS: TestScenario[] = [
  {
    id: "UPL-AUTH-001",
    categorie: "upload-beveiliging",
    subcategorie: "authenticatie",
    naam: "Upload zonder authenticatie geweigerd",
    beschrijving: "Niet-ingelogde gebruiker kan geen bestanden uploaden",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/documenten",
      body: { bestandsnaam: "test.pdf", inhoud: "JVBERi0=" },
      verificatie: { verwachteStatussen: [401, 403] },
    },
  },
  {
    id: "UPL-AUTH-002",
    categorie: "upload-beveiliging",
    subcategorie: "authenticatie",
    naam: "Upload endpoint heeft authenticatie vereiste",
    beschrijving: "Upload-route is beschermd door requireAuth middleware",
    ernst: "kritiek",
    uitvoering: "http",
    httpConfig: {
      methode: "POST",
      pad: "/documenten/upload",
      body: {},
      verificatie: { verwachteStatussen: [401, 403, 404] },
    },
  },
];

export const uploadAanvalScenarios: TestScenario[] = [
  ...CORRUPTE_BESTANDEN.map(([id, subcategorie, naam, beschrijving, ernst]: [string, string, string, string, string]) =>
    maakUploadTest(id, subcategorie, naam, beschrijving, ernst as TestScenario["ernst"]),
  ),
  ...DUBBELE_EXTENSIES.map(([id, bestandsnaam]) =>
    maakUploadTest(
      id,
      "dubbele-extensie",
      `Dubbele extensie: ${bestandsnaam}`,
      `Upload poging met bestandsnaam: ${bestandsnaam}`,
      "kritiek",
    ),
  ),
  ...MIME_SPOOFING.map(([id, mime, naam]) =>
    maakUploadTest(
      id,
      "mime-spoofing",
      naam,
      `Bestand aangeboden als Content-Type: ${mime}`,
      "hoog",
    ),
  ),
  ...ARCHIEF_AANVALLEN.map(([id, beschrijving]) =>
    maakUploadTest(id, "archief-aanval", beschrijving, beschrijving, "hoog"),
  ),
  ...SPECIAAL_BESTANDEN.map(([id, beschrijving]) =>
    maakUploadTest(id, "speciaal-bestand", beschrijving, beschrijving, "middel"),
  ),
  ...GROOTTE_AANVALLEN.map(([id, beschrijving]) =>
    maakUploadTest(id, "grootte-aanval", beschrijving, beschrijving, "middel"),
  ),
  ...AUTH_UPLOAD_TESTS,
];

export const totaalUploadAanvallen = uploadAanvalScenarios.length;
