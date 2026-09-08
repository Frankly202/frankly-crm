import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";

export const formatDateTime = (value?: string | null) =>
  value ? format(new Date(value), "d MMM yyyy, HH:mm") : "—";

export const formatDate = (value?: string | null) =>
  value ? format(new Date(value), "d MMM yyyy") : "—";

export const formatRelative = (value?: string | null) =>
  value ? `${formatDistanceToNowStrict(new Date(value))} ago` : "—";

export const formatTime = (value?: string | null) =>
  value ? format(new Date(value), "HH:mm") : "";

export function dueLabel(value?: string | null) {
  if (!value) return { label: "No due date", tone: "muted" as const };
  const date = new Date(value);
  if (date.getTime() < Date.now())
    return { label: `Overdue · ${formatDate(value)}`, tone: "danger" as const };
  if (isToday(date)) return { label: "Due today", tone: "warning" as const };
  if (isTomorrow(date)) return { label: "Due tomorrow", tone: "warning" as const };
  return { label: `Due ${formatDate(value)}`, tone: "muted" as const };
}

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join("");
