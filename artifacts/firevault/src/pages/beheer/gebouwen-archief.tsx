import { useState } from "react";
import {
  useListGebouwen,
  useArchiveerGebouw,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArchiveRestore, Building2, Loader2, ShieldAlert } from "lucide-react";

export default function GebouwenArchiefBeheer() {
  const { gebruiker } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [terugplaatsenId, setTerugplaatsenId] = useState<number | null>(null);
  const [bezig, setBezig] = useState(false);

  const isHoofdBeheerder = gebruiker?.rol === "hoofdbeheerder";

  const { data: alleGebouwen, isLoading } = useListGebouwen({
    inclusief_gearchiveerd: true,
  });

  const archiveerMutatie = useArchiveerGebouw();

  const gearchiveerd = (alleGebouwen ?? []).filter((g: any) => g.gearchiveerd);

  const terugplaatsenGebouw = gearchiveerd.find(
    (g: any) => g.id === terugplaatsenId,
  );

  async function terugplaatsen() {
    if (terugplaatsenId === null) return;
    setBezig(true);
    try {
      await archiveerMutatie.mutateAsync({
        id: terugplaatsenId,
        data: { gearchiveerd: false },
      });
      queryClient.invalidateQueries();
      toast({ description: "Gebouw teruggezet naar het actieve overzicht." });
      setTerugplaatsenId(null);
    } catch {
      toast({
        variant: "destructive",
        description: "Terugplaatsen mislukt. Probeer het opnieuw.",
      });
    } finally {
      setBezig(false);
    }
  }

  if (!isHoofdBeheerder) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">
          Alleen beschikbaar voor hoofdbeheerders.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 data-paginatitel className="text-3xl font-bold tracking-tight">Gebouwenarchief</h1>
        <p className="text-muted-foreground mt-1">
          Verwijderde gebouwen worden hier bewaard en zijn alleen zichtbaar voor
          hoofdbeheerders.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gearchiveerde gebouwen</CardTitle>
          <CardDescription>
            Gebouwen die zijn verwijderd verschijnen niet meer in het actieve
            overzicht. Gebruik "Terugplaatsen" om een gebouw weer actief te
            maken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laden...
            </div>
          ) : gearchiveerd.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Geen gearchiveerde gebouwen gevonden.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Gebouw</TableHead>
                  <TableHead>Adres</TableHead>
                  <TableHead>Verwijderd op</TableHead>
                  <TableHead className="w-[160px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {gearchiveerd.map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium">{g.naam}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[g.adres, g.stad].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {g.gearchiveerd_op
                        ? new Date(g.gearchiveerd_op).toLocaleDateString(
                            "nl-NL",
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTerugplaatsenId(g.id)}
                        className="gap-1.5"
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Terugplaatsen
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={terugplaatsenId !== null}
        onOpenChange={(o) => {
          if (!o && !bezig) setTerugplaatsenId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gebouw terugplaatsen</AlertDialogTitle>
            <AlertDialogDescription>
              {terugplaatsenGebouw ? (
                <>
                  <span className="font-medium">{terugplaatsenGebouw.naam}</span>{" "}
                  wordt teruggeplaatst naar het actieve overzicht en is weer
                  zichtbaar voor alle gebruikers met toegang.
                </>
              ) : (
                "Het gebouw wordt teruggeplaatst naar het actieve overzicht."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bezig}>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={terugplaatsen} disabled={bezig}>
              {bezig ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  Bezig...
                </>
              ) : (
                "Terugplaatsen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
