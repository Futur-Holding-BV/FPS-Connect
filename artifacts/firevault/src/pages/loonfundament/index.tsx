import { ScrollText, Building2, Users, FileText, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InhoudingsplichtigenTab } from "./components/inhoudingsplichtigen-tab";
import { InkomstenverhoudingenTab } from "./components/inkomstenverhoudingen-tab";
import { LoonafsprakenTab } from "./components/loonafspraken-tab";
import { JaarparametersTab } from "./components/jaarparameters-tab";
import { LoonstatenTab } from "./components/loonstaten-tab";

export default function LoonfundamentPagina() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ScrollText className="text-primary" size={24} />
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold">
            Loonfundament
          </h1>
          <p className="text-sm text-muted-foreground">
            Beheer van fiscale werkgevers, inkomstenverhoudingen, loonafspraken,
            jaarparameters en loonstaten
          </p>
        </div>
      </div>

      <Tabs defaultValue="inhoudingsplichtigen">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="inhoudingsplichtigen" className="flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            <span>Inhoudingsplichtigen</span>
          </TabsTrigger>
          <TabsTrigger value="inkomstenverhoudingen" className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>Inkomstenverhoudingen</span>
          </TabsTrigger>
          <TabsTrigger value="loonafspraken" className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <span>Loonafspraken</span>
          </TabsTrigger>
          <TabsTrigger value="jaarparameters" className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Jaarparameters</span>
          </TabsTrigger>
          <TabsTrigger value="loonstaten" className="flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            <span>Loonstaten</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inhoudingsplichtigen" className="mt-4">
          <InhoudingsplichtigenTab />
        </TabsContent>
        <TabsContent value="inkomstenverhoudingen" className="mt-4">
          <InkomstenverhoudingenTab />
        </TabsContent>
        <TabsContent value="loonafspraken" className="mt-4">
          <LoonafsprakenTab />
        </TabsContent>
        <TabsContent value="jaarparameters" className="mt-4">
          <JaarparametersTab />
        </TabsContent>
        <TabsContent value="loonstaten" className="mt-4">
          <LoonstatenTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
