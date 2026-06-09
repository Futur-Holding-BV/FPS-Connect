import { useEffect, useState } from "react";
import { useUpdateVoorzieningStatus } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

const STATUS_OPTIES = [
  { value: "concept", label: "Concept" },
  { value: "in_uitvoering", label: "In uitvoering" },
  { value: "goedgekeurd", label: "Gereed" },
  { value: "afgekeurd", label: "Afgekeurd" },
  { value: "in_onderhoud", label: "In onderhoud" },
];

interface Props {
  voorzieningId: number;
  huidigeStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoorzieningStatusDialog({ voorzieningId, huidigeStatus, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const wijzigStatus = useUpdateVoorzieningStatus();

  const [status, setStatus] = useState(huidigeStatus);
  const [opmerkingen, setOpmerkingen] = useState("");
  const [foutmelding, setFoutmelding] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(huidigeStatus);
      setOpmerkingen("");
      setFoutmelding(null);
    }
  }, [open, huidigeStatus]);

  async function verstuur() {
    setFoutmelding(null);
    try {
      await wijzigStatus.mutateAsync({
        id: voorzieningId,
        data: { status, opmerkingen: opmerkingen.trim() || undefined },
      });
      await queryClient.invalidateQueries();
      onOpenChange(false);
    } catch {
      setFoutmelding("De status kon niet worden bijgewerkt. Probeer het opnieuw.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Status bijwerken</DialogTitle>
          <DialogDescription>
            Wijzig de status van deze spot en voeg eventueel een toelichting toe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="status-opmerkingen">Toelichting</Label>
            <Textarea
              id="status-opmerkingen"
              value={opmerkingen}
              onChange={(e) => setOpmerkingen(e.target.value)}
              placeholder="Optionele toelichting bij de statuswijziging..."
              rows={3}
            />
          </div>

          {foutmelding && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{foutmelding}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={verstuur} disabled={wijzigStatus.isPending}>
            {wijzigStatus.isPending ? "Opslaan..." : "Status opslaan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
