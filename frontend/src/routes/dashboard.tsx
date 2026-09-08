import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Contact2, Target, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryBadge, StatusBadge } from "@/components/crm/badges";
import { ErrorState, RowSkeleton } from "@/components/crm/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardMetrics, useLeads } from "@/lib/api/queries";
import {
  LEAD_CATEGORY_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type LeadCategory,
  type LeadStatus,
} from "@/lib/api/types";
import { dueLabel, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FranklyEdu Global CRM" },
      {
        name: "description",
        content: "Pipeline overview, next actions and recent leads across all channels.",
      },
      { property: "og:title", content: "Dashboard — FranklyEdu Global CRM" },
      {
        property: "og:description",
        content: "Pipeline overview, next actions and recent leads across all channels.",
      },
    ],
  }),
  component: DashboardPage,
});

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ElementType;
  tone?: "default" | "warning";
}) {
  return (
    <div className="panel p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold sm:text-3xl">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
            tone === "warning" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  const metrics = useDashboardMetrics();
  const recent = useLeads({ limit: 6 });

  return (
    <AppShell title="Dashboard" description="Pipeline health across all channels">
      {metrics.isError ? (
        <div className="panel">
          <ErrorState
            message={(metrics.error as Error).message}
            onRetry={() => void metrics.refetch()}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.isLoading || !metrics.data
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))
              : [
                  {
                    label: "Total leads",
                    value: metrics.data.totals.totalLeads,
                    hint: `${metrics.data.recentActivity.leadsCreatedThisWeek} created this week`,
                    icon: Target,
                  },
                  {
                    label: "Contacts",
                    value: metrics.data.totals.totalContacts,
                    hint: "Unique people and organisations",
                    icon: Contact2,
                  },
                  {
                    label: "Pending next actions",
                    value: metrics.data.nextActions.totalPending,
                    hint: `${metrics.data.nextActions.dueToday} due today`,
                    icon: CalendarClock,
                  },
                  {
                    label: "Overdue actions",
                    value: metrics.data.nextActions.overdue,
                    hint: "Require immediate follow-up",
                    icon: AlertTriangle,
                    tone: "warning" as const,
                  },
                ].map((m) => <MetricCard key={m.label} {...m} />)}
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <div className="panel p-4 xl:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Pipeline by status</h2>
                <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-4 space-y-3">
                {metrics.isLoading || !metrics.data
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-7 w-full" />
                    ))
                  : LEAD_STATUSES.map((status) => {
                      const count = metrics.data.byStatus[status as LeadStatus] ?? 0;
                      const total = Math.max(1, metrics.data.totals.totalLeads);
                      return (
                        <Link
                          key={status}
                          to="/leads"
                          search={{ status }}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-secondary/60"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="truncate text-muted-foreground">
                                {LEAD_STATUS_LABELS[status as LeadStatus]}
                              </span>
                            </div>
                            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                              <div
                                className="h-full rounded-full bg-primary transition-[width] duration-500"
                                style={{ width: `${Math.round((count / total) * 100)}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-8 shrink-0 text-right text-sm font-semibold">
                            {count}
                          </span>
                        </Link>
                      );
                    })}
              </div>
            </div>

            <div className="panel p-4">
              <h2 className="text-sm font-semibold">Leads by category</h2>
              <div className="mt-4 space-y-2.5">
                {metrics.isLoading || !metrics.data
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))
                  : (Object.keys(LEAD_CATEGORY_LABELS) as LeadCategory[]).map((cat) => (
                      <Link
                        key={cat}
                        to="/leads"
                        search={{ category: cat }}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-secondary/60"
                      >
                        <span className="min-w-0 truncate text-muted-foreground">
                          {LEAD_CATEGORY_LABELS[cat]}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {metrics.data.byCategory[cat] ?? 0}
                        </span>
                      </Link>
                    ))}
              </div>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Recent leads</h2>
              <Link
                to="/leads"
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {recent.isLoading ? (
              <RowSkeleton rows={4} />
            ) : recent.isError ? (
              <ErrorState
                message={(recent.error as Error).message}
                onRetry={() => void recent.refetch()}
              />
            ) : (
              <ul className="divide-y divide-border">
                {(recent.data?.data ?? []).map((lead) => {
                  const due = dueLabel(lead.nextActionDueDate);
                  return (
                    <li key={lead.id}>
                      <Link
                        to="/leads/$leadId"
                        params={{ leadId: lead.id }}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{lead.title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {lead.contact?.name} · {formatRelative(lead.createdAt)}
                            {lead.nextActionRequired ? ` · ${due.label}` : ""}
                          </p>
                        </div>
                        <div className="hidden shrink-0 items-center gap-2 sm:flex">
                          <CategoryBadge category={lead.category} />
                          <StatusBadge status={lead.status} />
                        </div>
                        <div className="shrink-0 sm:hidden">
                          <StatusBadge status={lead.status} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
