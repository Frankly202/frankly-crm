import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Instagram, Loader2, Mail, Phone, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/crm/states";
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
import { useContacts, useCreateContact } from "@/lib/api/queries";
import { formatDate, initials } from "@/lib/format";

interface ContactSearch {
  page?: number | undefined;
  search?: string | undefined;
}

export const Route = createFileRoute("/contacts")({
  validateSearch: (search: Record<string, unknown>): ContactSearch => ({
    page: search["page"] ? Number(search["page"]) || 1 : undefined,
    search: typeof search["search"] === "string" ? search["search"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contacts — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Every person and organisation tracked in the FranklyEdu CRM.",
      },
      { property: "og:title", content: "Contacts — FranklyEdu Global CRM" },
      {
        property: "og:description",
        content: "Every person and organisation tracked in the FranklyEdu CRM.",
      },
    ],
  }),
  component: ContactsPage,
});

function NewContactDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    primaryEmail: "",
    primaryPhone: "",
    instagramHandle: "",
  });
  const [error, setError] = useState<string | null>(null);
  const createContact = useCreateContact();

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setError("A contact name is required.");
    if (!form.primaryEmail.trim() && !form.primaryPhone.trim() && !form.instagramHandle.trim())
      return setError("Provide at least an email, phone number or Instagram handle.");
    setError(null);
    try {
      await createContact.mutateAsync({
        name: form.name.trim(),
        primaryEmail: form.primaryEmail.trim() || undefined,
        primaryPhone: form.primaryPhone.trim() || undefined,
        instagramHandle: form.instagramHandle.trim() || undefined,
      });
      toast.success("Contact created", { description: form.name.trim() });
      setOpen(false);
      setForm({ name: "", primaryEmail: "", primaryPhone: "", instagramHandle: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the contact.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New contact
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create contact</DialogTitle>
          <DialogDescription>At least one identifier is required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="c-name">Full name</Label>
            <Input
              id="c-name"
              value={form.name}
              onChange={set("name")}
              placeholder="Elena Constantinou"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">Email</Label>
            <Input
              id="c-email"
              type="email"
              value={form.primaryEmail}
              onChange={set("primaryEmail")}
              placeholder="elena@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">Phone</Label>
            <Input
              id="c-phone"
              value={form.primaryPhone}
              onChange={set("primaryPhone")}
              placeholder="+35799123456"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-ig">Instagram handle</Label>
            <Input
              id="c-ig"
              value={form.instagramHandle}
              onChange={set("instagramHandle")}
              placeholder="elena.living"
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
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create
              contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactsPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [searchInput, setSearchInput] = useState(searchParams.search ?? "");

  useEffect(() => {
    const id = setTimeout(() => {
      if ((searchParams.search ?? "") === searchInput) return;
      void navigate({
        search: (prev: ContactSearch) => ({
          ...prev,
          search: searchInput || undefined,
          page: undefined,
        }),
        replace: true,
      });
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput, searchParams.search, navigate]);

  const page = searchParams.page ?? 1;
  const query = useContacts({ page, limit: 10, search: searchParams.search });
  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <AppShell
      title="Contacts"
      description={meta ? `${meta.total} contacts` : "Directory"}
      actions={<NewContactDialog />}
    >
      <div className="space-y-4">
        <div className="panel p-3 sm:p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, phone or Instagram…"
              className="pl-9"
              aria-label="Search contacts"
            />
          </div>
        </div>

        <div className="panel overflow-hidden">
          {query.isLoading ? (
            <RowSkeleton rows={6} />
          ) : query.isError ? (
            <ErrorState
              message={(query.error as Error).message}
              onRetry={() => void query.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title="No contacts found"
              description="Try another search term, or create a new contact."
            />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: c.id }}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {c.primaryEmail && (
                          <span className="flex min-w-0 items-center gap-1">
                            <Mail className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate">{c.primaryEmail}</span>
                          </span>
                        )}
                        {c.primaryPhone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" aria-hidden />
                            {c.primaryPhone}
                          </span>
                        )}
                        {c.instagramHandle && (
                          <span className="flex items-center gap-1">
                            <Instagram className="h-3 w-3 shrink-0" aria-hidden />
                            {c.instagramHandle}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      Added {formatDate(c.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {meta.page} of {meta.totalPages} · {meta.total} contacts
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!meta.hasPreviousPage}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!meta.hasNextPage}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
