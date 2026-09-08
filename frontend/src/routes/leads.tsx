import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryBadge, ChannelBadge, StatusBadge } from "@/components/crm/badges";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/crm/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLeads } from "@/lib/api/queries";
import { useTeamMembers } from "@/lib/api/team";
import {
  CHANNELS,
  CHANNEL_LABELS,
  LEAD_CATEGORIES,
  LEAD_CATEGORY_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
} from "@/lib/api/types";
import { dueLabel, formatRelative } from "@/lib/format";

interface LeadSearch {
  page?: number | undefined;
  search?: string | undefined;
  status?: string | undefined;
  category?: string | undefined;
  sourceChannel?: string | undefined;
  assignedToUserId?: string | undefined;
  pending?: boolean | undefined;
}

export const Route = createFileRoute("/leads")({
  validateSearch: (search: Record<string, unknown>): LeadSearch => ({
    page: search["page"] ? Number(search["page"]) || 1 : undefined,
    search: typeof search["search"] === "string" ? search["search"] : undefined,
    status: typeof search["status"] === "string" ? search["status"] : undefined,
    category: typeof search["category"] === "string" ? search["category"] : undefined,
    sourceChannel:
      typeof search["sourceChannel"] === "string" ? search["sourceChannel"] : undefined,
    assignedToUserId:
      typeof search["assignedToUserId"] === "string" ? search["assignedToUserId"] : undefined,
    pending: search["pending"] === true || search["pending"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Leads — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Filter, search and manage every lead in the FranklyEdu pipeline.",
      },
      { property: "og:title", content: "Leads — FranklyEdu Global CRM" },
      {
        property: "og:description",
        content: "Filter, search and manage every lead in the FranklyEdu pipeline.",
      },
    ],
  }),
  component: LeadsPage,
});

const ALL = "ALL";

function LeadsPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const team = useTeamMembers();
  const [searchInput, setSearchInput] = useState(searchParams.search ?? "");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      if ((searchParams.search ?? "") === searchInput) return;
      void navigate({
        search: (prev: LeadSearch) => ({
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
  const query = useLeads({
    page,
    limit: 10,
    search: searchParams.search,
    status: searchParams.status,
    category: searchParams.category,
    sourceChannel: searchParams.sourceChannel,
    assignedToUserId: searchParams.assignedToUserId,
    hasPendingNextAction: searchParams.pending,
  });

  const setFilter = (key: keyof LeadSearch, value: string | boolean | undefined) =>
    navigate({
      search: (prev: LeadSearch) => ({
        ...prev,
        [key]: value === ALL ? undefined : value || undefined,
        page: undefined,
      }),
    });

  const activeFilters = [
    searchParams.status,
    searchParams.category,
    searchParams.sourceChannel,
    searchParams.assignedToUserId,
    searchParams.pending ? "pending" : undefined,
  ].filter(Boolean).length;

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <AppShell
      title="Leads"
      description={meta ? `${meta.total} leads in pipeline` : "Pipeline"}
      actions={<NewLeadDialog />}
    >
      <div className="space-y-4">
        <div className="panel p-3 sm:p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="relative min-w-0">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search leads, contacts, notes…"
                className="pl-9"
                aria-label="Search leads"
              />
            </div>
            <Button
              variant={activeFilters ? "default" : "outline"}
              onClick={() => setShowFilters((v) => !v)}
              className="shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilters > 0 && <span className="text-xs">({activeFilters})</span>}
            </Button>
          </div>

          {showFilters && (
            <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4">
              <Select
                value={searchParams.status ?? ALL}
                onValueChange={(v) => setFilter("status", v)}
              >
                <SelectTrigger aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {LEAD_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={searchParams.category ?? ALL}
                onValueChange={(v) => setFilter("category", v)}
              >
                <SelectTrigger aria-label="Filter by category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {LEAD_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {LEAD_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={searchParams.sourceChannel ?? ALL}
                onValueChange={(v) => setFilter("sourceChannel", v)}
              >
                <SelectTrigger aria-label="Filter by channel">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All channels</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CHANNEL_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={searchParams.assignedToUserId ?? ALL}
                onValueChange={(v) => setFilter("assignedToUserId", v)}
              >
                <SelectTrigger aria-label="Filter by owner">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All owners</SelectItem>
                  {team.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4">
                <Button
                  size="sm"
                  variant={searchParams.pending ? "default" : "outline"}
                  onClick={() => setFilter("pending", searchParams.pending ? undefined : true)}
                >
                  Pending next action
                </Button>
                {activeFilters > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      navigate({ search: (prev: LeadSearch) => ({ search: prev.search }) })
                    }
                  >
                    <X className="h-4 w-4" /> Clear filters
                  </Button>
                )}
              </div>
            </div>
          )}
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
              title="No leads match your filters"
              description="Try a different search term or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={() => navigate({ search: {} })}>
                  Clear all
                </Button>
              }
            />
          ) : (
            <>
              {/* Desktop table */}
              <table className="hidden w-full table-fixed border-collapse lg:table">
                <thead>
                  <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
                    <th className="w-[34%] px-4 py-3 font-medium">Lead</th>
                    <th className="w-[16%] px-4 py-3 font-medium">Status</th>
                    <th className="w-[20%] px-4 py-3 font-medium">Category</th>
                    <th className="w-[16%] px-4 py-3 font-medium">Owner</th>
                    <th className="w-[14%] px-4 py-3 font-medium">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((lead) => {
                    const due = dueLabel(lead.nextActionDueDate);
                    return (
                      <tr key={lead.id} className="group transition-colors hover:bg-secondary/50">
                        <td className="px-4 py-3 align-middle">
                          <Link
                            to="/leads/$leadId"
                            params={{ leadId: lead.id }}
                            className="block min-w-0"
                          >
                            <p className="truncate text-sm font-medium group-hover:text-primary">
                              {lead.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {lead.contact?.name} · {formatRelative(lead.createdAt)}
                            </p>
                          </Link>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <StatusBadge status={lead.status} />
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="min-w-0 space-y-1">
                            <CategoryBadge
                              category={lead.category}
                              className="max-w-full truncate"
                            />
                            <ChannelBadge channel={lead.sourceChannel} />
                          </div>
                        </td>
                        <td className="truncate px-4 py-3 align-middle text-sm text-muted-foreground">
                          {lead.assignedTo?.name ?? "Unassigned"}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span
                            className={`text-xs ${
                              due.tone === "danger"
                                ? "text-destructive"
                                : due.tone === "warning"
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {lead.nextActionRequired ? due.label : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile / tablet cards */}
              <ul className="divide-y divide-border lg:hidden">
                {rows.map((lead) => {
                  const due = dueLabel(lead.nextActionDueDate);
                  return (
                    <li key={lead.id}>
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="block px-4 py-3 transition-colors hover:bg-secondary/50"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                          <p className="truncate text-sm font-medium">{lead.title}</p>
                          <StatusBadge status={lead.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {lead.contact?.name} · {lead.assignedTo?.name ?? "Unassigned"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <CategoryBadge category={lead.category} />
                          <ChannelBadge channel={lead.sourceChannel} />
                          {lead.nextActionRequired && (
                            <span
                              className={`text-xs ${
                                due.tone === "danger"
                                  ? "text-destructive"
                                  : due.tone === "warning"
                                    ? "text-warning"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {due.label}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Page {meta.page} of {meta.totalPages} · {meta.total} leads
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
