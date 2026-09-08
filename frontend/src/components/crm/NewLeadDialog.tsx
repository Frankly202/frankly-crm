import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { useContacts, useCreateLead } from "@/lib/api/queries";
import { useTeamMembers } from "@/lib/api/team";
import {
  CHANNELS,
  CHANNEL_LABELS,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  type ChannelType,
  type LeadCategory,
} from "@/lib/api/types";

export function NewLeadDialog({
  defaultContactId,
  initialContactId,
  trigger,
}: {
  defaultContactId?: string;
  initialContactId?: string;
  trigger?: React.ReactNode;
}) {
  const contactDefault = defaultContactId ?? initialContactId;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LeadCategory>("PROPERTY_BUYER_INVESTOR");
  const [sourceChannel, setSourceChannel] = useState<ChannelType>("WEBSITE_FORM");
  const [contactId, setContactId] = useState(contactDefault ?? "");
  const [assignee, setAssignee] = useState("unassigned");
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [error, setError] = useState<string | null>(null);

  const contacts = useContacts({ limit: 100 });
  const team = useTeamMembers();
  const createLead = useCreateLead();

  function reset() {
    setTitle("");
    setNotes("");
    setNextAction("");
    setError(null);
    if (!contactDefault) setContactId("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("A lead title is required.");
    if (!contactId) return setError("Select the contact this lead belongs to.");
    setError(null);
    try {
      await createLead.mutateAsync({
        title: title.trim(),
        category,
        sourceChannel,
        contactId,
        status: "NEW",
        assignedToUserId: assignee === "unassigned" ? null : assignee,
        notes: notes.trim() || undefined,
        nextActionRequired: nextAction.trim() || undefined,
      });
      toast.success("Lead created", { description: title.trim() });
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the lead.");
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
          <Button size="sm">
            <Plus className="h-4 w-4" /> New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create lead</DialogTitle>
          <DialogDescription>Log a new enquiry against an existing contact.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="lead-title">Title</Label>
            <Input
              id="lead-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Limassol seafront villa enquiry"
            />
          </div>

          <div className="space-y-2">
            <Label>Contact</Label>
            <Select
              value={contactId}
              onValueChange={setContactId}
              disabled={Boolean(defaultContactId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a contact" />
              </SelectTrigger>
              <SelectContent>
                {(contacts.data?.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as LeadCategory)}>
                <SelectTrigger>
                  <SelectValue />
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
            <div className="space-y-2">
              <Label>Source channel</Label>
              <Select
                value={sourceChannel}
                onValueChange={(v) => setSourceChannel(v as ChannelType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign to</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-next">Next action</Label>
            <Input
              id="lead-next"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="Send property brochures"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea
              id="lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Budget, timeline, requirements…"
              rows={3}
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createLead.isPending}>
              {createLead.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
