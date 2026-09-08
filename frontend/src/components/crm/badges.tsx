import { Instagram, Mail, MessageCircle, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHANNEL_LABELS,
  LEAD_CATEGORY_LABELS,
  LEAD_STATUS_LABELS,
  type ChannelType,
  type LeadCategory,
  type LeadStatus,
} from "@/lib/api/types";

const statusStyles: Record<LeadStatus, string> = {
  NEW: "bg-info/15 text-info border-info/30",
  CONTACTED: "bg-primary/15 text-primary border-primary/30",
  REPLIED: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  QUALIFIED: "bg-success/15 text-success border-success/30",
  LOST: "bg-destructive/15 text-destructive border-destructive/30",
  CLOSED_WON: "bg-success/25 text-success border-success/40",
};

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        statusStyles[status],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

export function CategoryBadge({
  category,
  className,
}: {
  category: LeadCategory;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
    >
      {LEAD_CATEGORY_LABELS[category]}
    </span>
  );
}

const channelIcons = {
  WHATSAPP: MessageCircle,
  INSTAGRAM: Instagram,
  RESEND_EMAIL: Mail,
  WEBSITE_FORM: Globe,
} as const;

export function ChannelBadge({
  channel,
  className,
  iconOnly,
}: {
  channel: ChannelType;
  className?: string;
  iconOnly?: boolean;
}) {
  const Icon = channelIcons[channel];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      title={CHANNEL_LABELS[channel]}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {!iconOnly && <span className="truncate">{CHANNEL_LABELS[channel]}</span>}
    </span>
  );
}
