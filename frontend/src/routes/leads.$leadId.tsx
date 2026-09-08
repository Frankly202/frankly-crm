import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail, MessageSquare, Phone, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryBadge, ChannelBadge, StatusBadge } from "@/components/crm/badges";
import { ErrorState, RowSkeleton } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
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
import {
  useAddActivity,
  useAssignLead,
  useLead,
  useUpdateLead,
  useUpdateLeadStatus,
} from "@/lib/api/queries";
import { useTeamMembers } from "@/lib/api/team";
import {
  ACTIVITY_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from "@/lib/api/types";
import { dueLabel, formatDateTime, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/leads/$leadId")({
  head: () => ({
    meta: [
      { title: "Lead detail — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Lead status, ownership, next actions and full activity history.",
      },
      { property: "og:title", content: "Lead detail — FranklyEdu Global CRM" },
      {
        property: "og:description",
        content: "Lead status, ownership, next actions and full activity history.",
      },
    ],
  }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const query = useLead(leadId);
  const team = useTeamMembers();
  const updateLead = useUpdateLead(leadId);
  const updateStatus = useUpdateLeadStatus(leadId);
  const assignLead = useAssignLead(leadId);
  const addActivity = useAddActivity(leadId);

  const lead = query.data;
  const [notes, setNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!lead) return;
    setNotes(lead.notes ?? "");
    setNextAction(lead.nextActionRequired ?? "");
  }, [lead]);

  if (query.isLoading) {
    return (
      <AppShell title="Lead" description="Loading lead…">
        <div className="panel">
          <RowSkeleton rows={7} />
        </div>
      </AppShell>
    );
  }

  if (query.isError || !lead) {
    return (
      <AppShell title="Lead" description="Could not load this lead">
        <div className="panel">
          <ErrorState
            message={query.error instanceof Error ? query.error.message : "Lead not found."}
            onRetry={() => void query.refetch()}
          />
        </div>
      </AppShell>
    );
  }

  const due = dueLabel(lead.nextActionDueDate);
  const dirty = notes !== (lead.notes ?? "") || nextAction !== (lead.nextActionRequired ?? "");

  return (
    <AppShell
      title={lead.title}
      description={`Created ${formatRelative(lead.createdAt)}`}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/leads">
            <ArrowLeft className="h-4 w-4" /> Back to leads
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <section className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status} />
              <CategoryBadge category={lead.category} />
              <ChannelBadge channel={lead.sourceChannel} />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={lead.status}
                  onValueChange={(value) => {
                    updateStatus.mutate(
                      { status: value as LeadStatus },
                      {
                        onSuccess: () =>
                          toast.success("Status updated", {
                            description: LEAD_STATUS_LABELS[value as LeadStatus],
                          }),
                        onError: (e) =>
                          toast.error("Update failed", { description: (e as Error).message }),
                      },
                    );
                  }}
                  disabled={updateStatus.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Owner</Label>
                <Select
                  value={lead.assignedToUserId ?? "unassigned"}
                  onValueChange={(value) => {
                    assignLead.mutate(value === "unassigned" ? null : value, {
                      onSuccess: () => toast.success("Ownership updated"),
                      onError: (e) =>
                        toast.error("Update failed", { description: (e as Error).message }),
                    });
                  }}
                  disabled={assignLead.isPending}
                >
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
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="next-action">Next action</Label>
                <Input
                  id="next-action"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Schedule property viewing"
                />
                {lead.nextActionRequired && (
                  <p
                    className={`text-xs ${
                      due.tone === "danger"
                        ? "text-destructive"
                        : due.tone === "warning"
                          ? "text-warning"
                          : "text-muted-foreground"
                    }`}
                  >
                    {due.label}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-notes">Notes</Label>
                <Textarea
                  id="lead-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Budget, timeline, requirements…"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!dirty || updateLead.isPending}
                  onClick={() =>
                    updateLead.mutate(
                      { notes, nextActionRequired: nextAction },
                      {
                        onSuccess: () => toast.success("Lead saved"),
                        onError: (e) =>
                          toast.error("Save failed", { description: (e as Error).message }),
                      },
                    )
                  }
                >
                  {updateLead.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save changes
                </Button>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Activity</h2>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add an internal note…"
                  aria-label="Add note"
                />
                <Button
                  size="sm"
                  disabled={!note.trim() || addActivity.isPending}
                  onClick={() =>
                    addActivity.mutate(
                      { type: "NOTE_ADDED", description: note.trim() },
                      {
                        onSuccess: () => {
                          setNote("");
                          toast.success("Note added");
                        },
                        onError: (e) =>
                          toast.error("Could not add note", { description: (e as Error).message }),
                      },
                    )
                  }
                >
                  {addActivity.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>

              <ol className="space-y-3 border-l border-border pl-4">
                {lead.activities.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-primary" />
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <p className="min-w-0 text-sm break-words">{a.description}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(a.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ACTIVITY_LABELS[a.type]}
                      {a.user ? ` · ${a.user.name}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Contact</h2>
            {lead.contact ? (
              <div className="mt-3 space-y-2 text-sm">
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: lead.contact.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {lead.contact.name}
                </Link>
                {lead.contact.primaryEmail && (
                  <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{lead.contact.primaryEmail}</span>
                  </p>
                )}
                {lead.contact.primaryPhone && (
                  <p className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{lead.contact.primaryPhone}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No linked contact.</p>
            )}
          </section>

          <section className="panel p-4">
            <h2 className="text-sm font-semibold">Conversations</h2>
            {lead.conversations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No conversations linked to this lead yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {lead.conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/inbox"
                      search={{ conversationId: c.id }}
                      className="block rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-secondary/50"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <ChannelBadge channel={c.channel} />
                        <MessageSquare
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {c.latestMessage?.body ?? "No messages"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-4 text-sm">
            <h2 className="text-sm font-semibold">Details</h2>
            <dl className="mt-3 space-y-2 text-muted-foreground">
              <div className="flex justify-between gap-3">
                <dt>Created</dt>
                <dd className="text-right text-foreground">{formatDateTime(lead.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Updated</dt>
                <dd className="text-right text-foreground">{formatDateTime(lead.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Due date</dt>
                <dd className="text-right text-foreground">
                  {formatDateTime(lead.nextActionDueDate)}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
