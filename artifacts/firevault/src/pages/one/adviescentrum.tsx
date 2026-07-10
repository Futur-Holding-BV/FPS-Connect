import { useState } from "react";
import { Link } from "wouter";
import { Sparkles, ArrowRight, ShieldCheck, FileUp, X, FileText, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMaakAanvraag } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { toast } from "@/hooks/use-toast";

interface GeuploadBestand {
  id: string;
  naam: string;
  type: string;
  size: number;
  objectPath: string;
}

export default function OneAdviescentrum() {
  const [submitted, setSubmitted] = useState(false);
  const [titel, setTitel] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [bestanden, setBestanden] = useState<GeuploadBestand[]>([]);

  const { mutate: maakAanvraag, isPending: isIndienen } = useMaakAanvraag({
    mutation: {
      onSuccess: () => {
        setSubmitted(true);
      },
      onError: (err) => {
        toast({
          title: "Fout bij indienen",
          description: "Er is een probleem opgetreden bij het indienen van uw aanvraag.",
          variant: "destructive",
        });
      },
    },
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: (response: any) => {
      const nieuwBestand: GeuploadBestand = {
        id: Math.random().toString(36).substring(7),
        naam: response.objectPath.split("/").pop() || "Bestand",
        type: "application/octet-stream", 
        size: 0,
        objectPath: response.objectPath,
      };
      setBestanden((prev) => [...prev, nieuwBestand]);
    },
    onError: (err: any) => {
      toast({
        title: "Upload mislukt",
        description: (err as any).message || "Het bestand kon niet worden geüpload.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validatie
    const toegestaneTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!toegestaneTypes.includes(file.type)) {
      toast({
        title: "Ongeldig bestandstype",
        description: "Alleen PDF's en afbeeldingen (JPG, PNG, WebP) zijn toegestaan.",
        variant: "destructive",
      });
      return;
    }

    const maxGrootte = 20 * 1024 * 1024; // 20MB
    if (file.size > maxGrootte) {
      toast({
        title: "Bestand te groot",
        description: "De maximale bestandsgrootte is 20MB.",
        variant: "destructive",
      });
      return;
    }

    uploadFile(file);
    // Reset input zodat hetzelfde bestand opnieuw gekozen kan worden indien nodig
    e.target.value = "";
  };

  const verwijderBestand = (id: string) => {
    setBestanden((prev) => prev.filter((b) => b.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    maakAanvraag({
      data: {
        titel,
        omschrijving,
        aanvraag_via_one: true,
        aanvraag_context: {
          vrije_tekst: omschrijving,
          bijlagen: bestanden.map((b) => ({
            naam: b.naam,
            object_path: b.objectPath,
            type: b.type,
            grootte: b.size,
          })),
        },
      },
    });
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-8">
          <ShieldCheck className="w-12 h-12 text-emerald-500" />
        </div>
        <h1 className="text-4xl font-semibold text-zinc-900 mb-4">Aanvraag ontvangen</h1>
        <p className="text-xl text-zinc-500 font-light mb-12">
          Onze brandpreventie experts en AI analyseren uw verzoek. U ontvangt spoedig een reactie.
        </p>
        <Link href="/one/dashboard">
          <button className="bg-zinc-900 hover:bg-zinc-800 text-white px-8 py-4 rounded-full font-medium transition-colors">
            Terug naar dashboard
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-12">
      <div className="mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0EA5E9]/10 text-[#0EA5E9] text-xs font-bold tracking-wider uppercase mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Project aanvraag
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900 mb-6">
          Adviescentrum
        </h1>
        <p className="text-xl text-zinc-500 font-light leading-relaxed">
          Start een nieuwe brandpreventie workflow. Beschrijf uw behoefte en laat onze systemen de voorbereiding automatiseren.
        </p>
      </div>

      <div className="bg-white rounded-[32px] p-8 md:p-12 border border-zinc-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-900">Project omschrijving</label>
            <input 
              required
              type="text" 
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="Bijv. Vervangen brandwerende deuren vleugel B"
              className="w-full h-14 px-4 bg-zinc-50 border-0 rounded-2xl focus:ring-2 focus:ring-[#0EA5E9]/20 focus:bg-white transition-all text-[15px]"
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium text-zinc-900">Toelichting & Context</label>
            <textarea 
              required
              rows={6}
              value={omschrijving}
              onChange={(e) => setOmschrijving(e.target.value)}
              placeholder="Beschrijf de huidige situatie, specifieke eisen of locatiedetails..."
              className="w-full p-4 bg-zinc-50 border-0 rounded-2xl focus:ring-2 focus:ring-[#0EA5E9]/20 focus:bg-white transition-all resize-none text-[15px]"
            ></textarea>
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-zinc-900">Documenten & Afbeeldingen</label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bestanden.map((bestand) => (
                <div key={bestand.id} className="flex items-center gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100 group relative">
                  <div className="w-10 h-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center text-[#0EA5E9]">
                    {bestand.type.includes("pdf") ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{bestand.naam}</p>
                    <p className="text-xs text-zinc-400">{(bestand.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => verwijderBestand(bestand.id)}
                    className="p-1 hover:bg-zinc-200 rounded-lg transition-colors text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <label className={`
                flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed transition-all cursor-pointer
                ${isUploading ? "bg-zinc-50 border-zinc-200 opacity-60 pointer-events-none" : "border-zinc-100 hover:border-[#0EA5E9]/30 hover:bg-[#0EA5E9]/5"}
              `}>
                <input 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileChange}
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  disabled={isUploading}
                />
                {isUploading ? (
                  <Loader2 className="w-6 h-6 text-[#0EA5E9] animate-spin" />
                ) : (
                  <FileUp className="w-6 h-6 text-[#0EA5E9]" />
                )}
                <span className="text-sm font-medium text-zinc-600">
                  {isUploading ? "Bezig met uploaden..." : "Bestand toevoegen"}
                </span>
                <span className="text-[11px] text-zinc-400">PDF of afbeelding, max 20MB</span>
              </label>
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-zinc-100">
            <p className="text-sm text-zinc-500 hidden md:block">
              AI analyseert uw aanvraag for de snelste opvolging.
            </p>
            <button 
              type="submit"
              disabled={isIndienen || isUploading}
              className="group bg-[#0EA5E9] hover:bg-[#0284c7] disabled:opacity-50 disabled:pointer-events-none text-white px-8 py-4 rounded-full font-medium transition-all flex items-center gap-2 shadow-[0_8px_20px_rgba(14,165,233,0.25)] hover:shadow-[0_12px_24px_rgba(14,165,233,0.35)] hover:-translate-y-0.5"
            >
              {isIndienen ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Bezig met indienen...
                </>
              ) : (
                <>
                  Aanvraag indienen
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
