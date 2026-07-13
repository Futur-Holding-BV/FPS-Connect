import { useState } from "react";
import { LifeBuoy, MessageSquarePlus, Send, Star, X } from "lucide-react";
import {
  useCreateHelpdeskTicket,
  useCreateFeedback,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Modus = null | "menu" | "helpdesk" | "feedback";

export function OndersteuningWidget() {
  const { toast } = useToast();
  const [modus, setModus] = useState<Modus>(null);

  const [onderwerp, setOnderwerp] = useState("");
  const [helpdeskBericht, setHelpdeskBericht] = useState("");

  const [feedbackType, setFeedbackType] = useState("algemeen");
  const [waardering, setWaardering] = useState(0);
  const [feedbackBericht, setFeedbackBericht] = useState("");

  const helpdesk = useCreateHelpdeskTicket();
  const feedback = useCreateFeedback();

  function sluit() {
    setModus(null);
    setOnderwerp("");
    setHelpdeskBericht("");
    setFeedbackType("algemeen");
    setWaardering(0);
    setFeedbackBericht("");
  }

  function verstuurHelpdesk(e: React.FormEvent) {
    e.preventDefault();
    if (!onderwerp.trim() || !helpdeskBericht.trim()) return;
    helpdesk.mutate(
      { data: { onderwerp: onderwerp.trim(), bericht: helpdeskBericht.trim() } },
      {
        onSuccess: () => {
          toast({ title: "Vraag verstuurd", description: "We nemen zo snel mogelijk contact met je op." });
          sluit();
        },
        onError: () => toast({ title: "Versturen mislukt", description: "Probeer het later opnieuw." }),
      },
    );
  }

  function verstuurFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackBericht.trim()) return;
    feedback.mutate(
      {
        data: {
          type: feedbackType,
          waardering: waardering > 0 ? waardering : undefined,
          bericht: feedbackBericht.trim(),
          pagina: window.location.pathname,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Bedankt voor je feedback", description: "We waarderen je input." });
          sluit();
        },
        onError: () => toast({ title: "Versturen mislukt", description: "Probeer het later opnieuw." }),
      },
    );
  }

  return (
    <>
      <div className="fixed bottom-20 right-5 z-50 flex flex-col items-end gap-2">
        {modus === "menu" && (
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-2 shadow-lg">
            <Button
              variant="ghost"
              className="justify-start gap-2"
              onClick={() => setModus("helpdesk")}
            >
              <LifeBuoy className="h-4 w-4 text-primary" />
              Hulp nodig
            </Button>
            <Button
              variant="ghost"
              className="justify-start gap-2"
              onClick={() => setModus("feedback")}
            >
              <MessageSquarePlus className="h-4 w-4 text-primary" />
              Feedback geven
            </Button>
          </div>
        )}
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setModus(modus === "menu" ? null : "menu")}
          aria-label="Ondersteuning"
        >
          {modus === "menu" ? <X className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
        </Button>
      </div>

      <Dialog open={modus === "helpdesk"} onOpenChange={(o) => !o && sluit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stel een vraag aan de helpdesk</DialogTitle>
            <DialogDescription>Beschrijf je vraag of probleem. We helpen je graag verder.</DialogDescription>
          </DialogHeader>
          <form onSubmit={verstuurHelpdesk} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="helpdesk-onderwerp">Onderwerp</Label>
              <Input
                id="helpdesk-onderwerp"
                value={onderwerp}
                onChange={(e) => setOnderwerp(e.target.value)}
                placeholder="Waar gaat je vraag over?"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="helpdesk-bericht">Bericht</Label>
              <Textarea
                id="helpdesk-bericht"
                value={helpdeskBericht}
                onChange={(e) => setHelpdeskBericht(e.target.value)}
                placeholder="Beschrijf je vraag zo volledig mogelijk"
                rows={5}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={sluit}>
                Annuleren
              </Button>
              <Button type="submit" disabled={helpdesk.isPending} className="gap-1.5">
                <Send className="h-4 w-4" />
                Versturen
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={modus === "feedback"} onOpenChange={(o) => !o && sluit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deel je feedback</DialogTitle>
            <DialogDescription>Laat ons weten wat goed gaat of wat beter kan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={verstuurFeedback} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "algemeen", l: "Algemeen" },
                  { v: "idee", l: "Idee" },
                  { v: "probleem", l: "Probleem" },
                  { v: "compliment", l: "Compliment" },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setFeedbackType(opt.v)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      feedbackType === opt.v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Waardering</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setWaardering(n === waardering ? 0 : n)}
                    aria-label={`${n} sterren`}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        n <= waardering ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-bericht">Bericht</Label>
              <Textarea
                id="feedback-bericht"
                value={feedbackBericht}
                onChange={(e) => setFeedbackBericht(e.target.value)}
                placeholder="Vertel ons meer"
                rows={4}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={sluit}>
                Annuleren
              </Button>
              <Button type="submit" disabled={feedback.isPending} className="gap-1.5">
                <Send className="h-4 w-4" />
                Versturen
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
