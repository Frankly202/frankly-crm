import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Contact2,
  Instagram,
  Mail,
  MessageSquare,
  Phone,
  Plus,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryBadge, ChannelBadge, StatusBadge } from "@/components/crm/badges";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
import { useContact } from "@/lib/api/queries";
import { dueLabel, formatDate, formatRelative, initials } from "@/lib/format";

export const Route = createFileRoute("/contacts/$contactId")({
  head: () => ({
    meta: [
      { title: "Contact detail — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Contact identity, linked leads, and communication channels.",
      },
    ],
  }),
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const query = useContact(contactId);
  const contact = query.data;

  if (query.isLoading) {
    return (
      <AppShell title="Contact details">
        <div className="space-y-4">
          <Link
            to="/contacts"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to contacts
          </Link>
          <div className="panel p-6">
            <RowSkeleton rows={4} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (query.isError || !contact) {
    return (
      <AppShell title="Contact details">
        <div className="space-y-4">
          <Link
            to="/contacts"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to contacts
          </Link>
          <div className="panel">
            <ErrorState
              message={(query.error as Error)?.message ?? "Contact not found"}
              onRetry={() => void query.refetch()}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const leads = contact.leads ?? [];
  const conversations = contact.conversations ?? [];

  return (
    <AppShell
      title={contact.name}
      description={`Contact added ${formatDate(contact.createdAt)}`}
      actions={<NewLeadDialog initialContactId={contact.id} />}
    >
      <div className="space-y-5">
        <Link
          to="/contacts"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to contacts
        </Link>

        {/* Profile Card */}
        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-lg font-bold text-primary">
                {initials(contact.name)}
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {contact.name}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ID: <span className="font-mono">{contact.id}</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                Added {formatDate(contact.createdAt)}
              </span>
            </div>
          </div>

          <hr className="my-5 border-border" />

          {/* Contact Methods */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Mail className="h-3.5 w-3.5" aria-hidden /> Email
              </span>
              {contact.primaryEmail ? (
                <a
                  href={`mailto:${contact.primaryEmail}`}
                  className="mt-1.5 block truncate text-sm font-medium text-foreground hover:underline"
                >
                  {contact.primaryEmail}
                </a>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">—</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Phone className="h-3.5 w-3.5" aria-hidden /> Phone
              </span>
              {contact.primaryPhone ? (
                <a
                  href={`tel:${contact.primaryPhone}`}
                  className="mt-1.5 block truncate text-sm font-medium text-foreground hover:underline"
                >
                  {contact.primaryPhone}
                </a>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">—</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Instagram className="h-3.5 w-3.5" aria-hidden /> Instagram
              </span>
              {contact.instagramHandle ? (
                <p className="mt-1.5 truncate text-sm font-medium text-foreground">
                  @{contact.instagramHandle}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>

          {contact.metadata && Object.keys(contact.metadata).length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-3.5">
              <p className="text-xs font-medium text-muted-foreground">Additional metadata</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(contact.metadata).map(([key, val]) => (
                  <span
                    key={key}
                    className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    <span className="font-semibold text-foreground">{key}:</span>&nbsp;
                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Linked Leads & Conversations Grid */}
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Linked Leads */}
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight">Leads ({leads.length})</h2>
              <NewLeadDialog
                initialContactId={contact.id}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus className="h-3.5 w-3.5" /> New lead
                  </Button>
                }
              />
            </div>

            {leads.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No leads for this contact"
                  description="Create the first lead to begin tracking proposals or inquiries."
                  icon={<Contact2 className="h-5 w-5" aria-hidden />}
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {leads.map((lead) => {
                  const due = dueLabel(lead.nextActionDueDate);
                  return (
                    <li key={lead.id}>
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="block rounded-xl border border-border p-3.5 transition-colors hover:border-primary/40 hover:bg-secondary/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {lead.title}
                          </p>
                          <StatusBadge status={lead.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <CategoryBadge category={lead.category} />
                          <ChannelBadge channel={lead.sourceChannel} />
                        </div>
                        {lead.nextActionRequired && (
                          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                            <span className="truncate text-muted-foreground">
                              {lead.nextActionRequired}
                            </span>
                            <span
                              className={`shrink-0 font-medium ${
                                due.tone === "danger"
                                  ? "text-destructive"
                                  : due.tone === "warning"
                                    ? "text-warning"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {due.label}
                            </span>
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Linked Conversations */}
          <section className="panel p-5">
            <h2 className="text-base font-semibold tracking-tight">
              Conversations ({conversations.length})
            </h2>

            {conversations.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No conversation threads"
                  description="When this contact reaches out via WhatsApp, Instagram, email or website form, threads appear here."
                  icon={<MessageSquare className="h-5 w-5" aria-hidden />}
                />
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link
                      to="/inbox"
                      search={{ conversationId: conv.id }}
                      className="block rounded-xl border border-border p-3.5 transition-colors hover:border-primary/40 hover:bg-secondary/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <ChannelBadge channel={conv.channel} />
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(conv.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        Thread ID: <span className="font-mono">{conv.channelThreadId}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
