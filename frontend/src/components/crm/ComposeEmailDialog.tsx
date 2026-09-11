import { Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStartEmailConversation } from "@/lib/api/queries";
import { LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadCategory } from "@/lib/api/types";

export function ComposeEmailDialog({
  trigger,
  defaultRecipient,
  defaultName,
  onSent,
}: {
  trigger?: React.ReactNode;
  defaultRecipient?: string;
  defaultName?: string;
  onSent?: (conversationId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultRecipient ?? "");
  const [recipientName, setRecipientName] = useState(defaultName ?? "");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<LeadCategory>("OTHER_BUSINESS");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startEmail = useStartEmailConversation();
  const navigate = useNavigate();

  function reset() {
    if (!defaultRecipient) setTo("");
    if (!defaultName) setRecipientName("");
    setSubject("");
    setCategory("OTHER_BUSINESS");
    setBody("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const emailTrimmed = to.trim();
    const subjectTrimmed = subject.trim();
    const bodyTrimmed = body.trim();

    if (!emailTrimmed) {
      setError("Recipient email address is required.");
      return;
    }
    if (!subjectTrimmed) {
      setError("Email subject is required.");
      return;
    }
    if (!bodyTrimmed) {
      setError("Email body is required.");
      return;
    }

    const idempotencyKey = `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    try {
      const result = await startEmail.mutateAsync({
        to: emailTrimmed,
        recipientName: recipientName.trim() || undefined,
        subject: subjectTrimmed,
        body: bodyTrimmed,
        leadCategory: category,
        idempotencyKey,
      });

      toast.success("Outbound email sent", {
        description: `Delivered to ${emailTrimmed}`,
      });

      setOpen(false);
      reset();

      if (onSent) {
        onSent(result.conversationId);
      } else {
        void navigate({
          to: "/inbox",
          search: { conversationId: result.conversationId },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send outbound email";
      setError(msg);
      toast.error("Failed to send email", { description: msg });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-2">
            <Mail className="h-4 w-4" />
            <span>New Email</span>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[580px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <span>Start New Email Conversation</span>
          </DialogTitle>
          <DialogDescription>
            Compose and dispatch an outbound email to a customer or prospect. This creates the
            contact and lead automatically if needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="compose-to" className="text-xs">
                To (Recipient Email) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="compose-to"
                type="email"
                placeholder="client@example.com"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                required
                disabled={startEmail.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compose-name" className="text-xs">
                Recipient Name (Optional)
              </Label>
              <Input
                id="compose-name"
                type="text"
                placeholder="Dr. Jane Smith"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                disabled={startEmail.isPending}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="compose-subject" className="text-xs">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="compose-subject"
                type="text"
                placeholder="Limassol Portfolio Consultation"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                required
                disabled={startEmail.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="compose-category" className="text-xs">
                Lead Category
              </Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as LeadCategory)}
                disabled={startEmail.isPending}
              >
                <SelectTrigger id="compose-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {LEAD_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compose-body" className="text-xs">
              Message Body <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="compose-body"
              placeholder="Dear client, Thank you for your interest in FranklyEdu Global..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              required
              disabled={startEmail.isPending}
              className="resize-y"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={startEmail.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={startEmail.isPending} className="gap-2">
              {startEmail.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Sending…</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Send Email</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
