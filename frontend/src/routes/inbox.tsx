import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Inbox as InboxIcon,
  Loader2,
  MessageSquare,
  Search,
  Send,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { CategoryBadge, ChannelBadge, StatusBadge } from "@/components/crm/badges";
import { ComposeEmailDialog } from "@/components/crm/ComposeEmailDialog";
import { EmptyState, ErrorState, RowSkeleton } from "@/components/crm/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useConversation, useConversations, useMarkRead, useSendMessage } from "@/lib/api/queries";
import { CHANNELS, CHANNEL_LABELS, type ChannelType, type Message } from "@/lib/api/types";
import { formatDate, formatRelative, formatTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface InboxSearch {
  conversationId?: string | undefined;
  channel?: string | undefined;
  unreadOnly?: boolean | undefined;
}

export const Route = createFileRoute("/inbox")({
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    conversationId:
      typeof search["conversationId"] === "string" ? search["conversationId"] : undefined,
    channel: typeof search["channel"] === "string" ? search["channel"] : undefined,
    unreadOnly: search["unreadOnly"] === true || search["unreadOnly"] === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Unified Inbox — FranklyEdu Global CRM" },
      {
        name: "description",
        content:
          "Multi-channel communications across WhatsApp, Instagram, Email, and Website forms.",
      },
    ],
  }),
  component: InboxPage,
});

function InboxPage() {
  const { conversationId, channel, unreadOnly } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [searchQuery, setSearchQuery] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(Boolean(conversationId));

  // Query conversations list
  const listQuery = useConversations({
    channel: channel ?? undefined,
    unreadOnly: unreadOnly ?? undefined,
    search: searchQuery.trim() || undefined,
    limit: 50,
  });

  const conversations = useMemo(() => listQuery.data?.data ?? [], [listQuery.data?.data]);

  // Selected conversation detail
  const selectedConvId: string | null =
    conversationId ?? (conversations.length > 0 ? (conversations[0]?.id ?? null) : null);

  const detailQuery = useConversation(selectedConvId);
  const convDetail = detailQuery.data;

  const markReadMutation = useMarkRead();
  const sendMessageMutation = useSendMessage(selectedConvId ?? "");

  // Auto-mark as read when opened if unread
  const isUnread = convDetail?.isUnread;
  const activeId = convDetail?.id;
  const isPending = markReadMutation.isPending;
  useEffect(() => {
    if (activeId && isUnread && !isPending) {
      markReadMutation.mutate(activeId);
    }
  }, [activeId, isUnread, isPending, markReadMutation]);

  // Sync mobile view with conversationId
  useEffect(() => {
    if (conversationId) {
      setMobileThreadOpen(true);
    }
  }, [conversationId]);

  function handleSelectConversation(id: string) {
    void navigate({
      search: (prev: InboxSearch) => ({
        ...prev,
        conversationId: id,
      }),
    });
    setMobileThreadOpen(true);
  }

  function handleChannelFilter(ch: string | null) {
    void navigate({
      search: (prev: InboxSearch) => ({
        ...prev,
        channel: ch ?? undefined,
      }),
    });
  }

  function handleUnreadToggle() {
    void navigate({
      search: (prev: InboxSearch) => ({
        ...prev,
        unreadOnly: !unreadOnly ? true : undefined,
      }),
    });
  }

  // Reply Composer State
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convDetail?.messages?.length, selectedConvId]);

  async function handleSendReply(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = replyText.trim();
    if (!text || !selectedConvId || sendMessageMutation.isPending) return;

    try {
      await sendMessageMutation.mutateAsync(text);
      setReplyText("");
      toast.success("Reply sent", {
        description: `Delivered to thread ${convDetail?.channelThreadId ?? ""}`,
      });
    } catch (err) {
      toast.error("Failed to send message", {
        description: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendReply();
    }
  }

  const unreadCount = useMemo(
    () => conversations.filter((c) => c.isUnread).length,
    [conversations],
  );

  return (
    <AppShell
      title="Unified Inbox"
      description="Omnichannel inbound & outbound messaging across WhatsApp, Instagram, Email, and Website forms."
      actions={
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="gap-1 px-2.5 py-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {unreadCount} unread thread{unreadCount === 1 ? "" : "s"}
            </Badge>
          )}
          <ComposeEmailDialog />
        </div>
      }
    >
      <div className="flex h-[calc(100vh-10rem)] min-h-[580px] w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {/* Left Column: Conversation List */}
        <aside
          className={cn(
            "flex w-full flex-col border-r border-border bg-card transition-all lg:w-[380px] lg:shrink-0",
            mobileThreadOpen ? "hidden lg:flex" : "flex",
          )}
        >
          {/* Channel Filter Pills & Search */}
          <div className="space-y-3 border-b border-border p-3.5 sm:p-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search conversations…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleChannelFilter(null)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                  !channel
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                )}
              >
                All
              </button>
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => handleChannelFilter(ch === channel ? null : ch)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    channel === ch
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                  )}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}

              <button
                type="button"
                onClick={handleUnreadToggle}
                className={cn(
                  "ml-auto inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                  unreadOnly
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary/50",
                )}
              >
                <Eye className="h-3 w-3" />
                Unread
              </button>
            </div>
          </div>

          {/* Conversation List Scroll Area */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {listQuery.isLoading ? (
              <div className="p-4">
                <RowSkeleton rows={5} />
              </div>
            ) : listQuery.isError ? (
              <div className="p-4">
                <ErrorState
                  message={(listQuery.error as Error)?.message ?? "Failed to load conversations"}
                  onRetry={() => void listQuery.refetch()}
                />
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-6 text-center">
                <EmptyState
                  title="No conversations"
                  description={
                    channel || unreadOnly || searchQuery
                      ? "No threads match your active filters."
                      : "Incoming inquiries via WhatsApp, Instagram, email or website form will arrive here."
                  }
                  icon={<MessageSquare className="h-5 w-5" />}
                />
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {conversations.map((conv) => {
                  const isSelected = conv.id === selectedConvId;
                  const contactName = conv.contact?.name ?? "Unknown Contact";
                  const snippet =
                    conv.latestMessage?.body ?? `Thread on ${CHANNEL_LABELS[conv.channel]}`;

                  return (
                    <li key={conv.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectConversation(conv.id)}
                        className={cn(
                          "group relative flex w-full flex-col gap-1.5 p-3.5 text-left transition-colors hover:bg-secondary/40",
                          isSelected && "bg-secondary/60 font-medium",
                        )}
                      >
                        <div className="flex w-full items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {conv.isUnread && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-primary"
                                title="Unread conversation"
                              />
                            )}
                            <span
                              className={cn(
                                "truncate text-sm",
                                conv.isUnread
                                  ? "font-bold text-foreground"
                                  : "font-semibold text-foreground/90",
                              )}
                            >
                              {contactName}
                            </span>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatRelative(conv.lastMessageAt)}
                          </span>
                        </div>

                        <p
                          className={cn(
                            "line-clamp-2 text-xs",
                            conv.isUnread ? "font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {snippet}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ChannelBadge channel={conv.channel} />
                          {conv.lead && (
                            <span className="truncate rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {conv.lead.title}
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Right Column: Active Conversation Thread & Composer */}
        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col bg-background",
            !mobileThreadOpen ? "hidden lg:flex" : "flex",
          )}
        >
          {selectedConvId && convDetail ? (
            <>
              {/* Conversation Header */}
              <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  {/* Mobile Back Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 lg:hidden"
                    onClick={() => setMobileThreadOpen(false)}
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>

                  {/* Contact Avatar */}
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {initials(convDetail.contact?.name ?? "C")}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">
                        {convDetail.contact?.name ?? "Unknown Contact"}
                      </h2>
                      <ChannelBadge channel={convDetail.channel} />
                    </div>
                    {convDetail.channel === "RESEND_EMAIL" &&
                      convDetail.messages?.find((m) => m.subject)?.subject && (
                        <div className="truncate text-xs font-semibold text-foreground/80">
                          Subject: {convDetail.messages.find((m) => m.subject)?.subject}
                        </div>
                      )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Thread: {convDetail.channelThreadId}</span>
                      {convDetail.contactId && (
                        <Link
                          to="/contacts/$contactId"
                          params={{ contactId: convDetail.contactId }}
                          className="font-medium text-primary hover:underline"
                        >
                          View Contact &rarr;
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2">
                  {convDetail.lead && (
                    <Link
                      to="/leads/$leadId"
                      params={{ leadId: convDetail.lead.id }}
                      className="hidden sm:inline-flex"
                    >
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                        Lead: {convDetail.lead.title}
                      </Button>
                    </Link>
                  )}

                  {convDetail.isUnread && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markReadMutation.mutate(convDetail.id)}
                      disabled={markReadMutation.isPending}
                      className="gap-1 text-xs"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Mark read
                    </Button>
                  )}
                </div>
              </div>

              {/* Message Timeline */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {detailQuery.isLoading ? (
                  <div className="space-y-4">
                    <RowSkeleton rows={4} />
                  </div>
                ) : convDetail.messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center p-8">
                    <EmptyState
                      title="No messages in this thread yet"
                      description="Send a message below to start the conversation."
                      icon={<MessageSquare className="h-5 w-5" />}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {convDetail.messages.map((msg: Message) => {
                      const isInbound = msg.direction === "INBOUND";
                      return (
                        <div
                          key={msg.id}
                          className={cn(
                            "flex w-full flex-col",
                            isInbound ? "items-start" : "items-end",
                          )}
                        >
                          <div className="flex max-w-[85%] items-end gap-2 sm:max-w-[75%]">
                            {isInbound && (
                              <div className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                                {initials(convDetail.contact?.name ?? "C")}
                              </div>
                            )}

                            <div
                              className={cn(
                                "rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                                isInbound
                                  ? "rounded-bl-none border border-border bg-card text-foreground"
                                  : "rounded-br-none bg-primary text-primary-foreground",
                              )}
                            >
                              {msg.subject && (
                                <div
                                  className={cn(
                                    "mb-1.5 border-b pb-1 text-xs font-semibold",
                                    isInbound
                                      ? "border-border/60 text-foreground/80"
                                      : "border-primary-foreground/20 text-primary-foreground/90",
                                  )}
                                >
                                  {msg.subject}
                                </div>
                              )}
                              <p className="whitespace-pre-wrap break-words leading-relaxed">
                                {msg.body}
                              </p>
                            </div>
                          </div>

                          {/* Message metadata */}
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground",
                              isInbound ? "pl-9" : "pr-1",
                            )}
                          >
                            <span>{formatTime(msg.createdAt)}</span>
                            <span>&middot;</span>
                            <span>{formatDate(msg.createdAt)}</span>
                            {!isInbound && (
                              <span className="inline-flex items-center gap-0.5 font-medium">
                                &middot;
                                {msg.status === "PENDING" && (
                                  <Clock className="h-3 w-3 animate-pulse text-amber-500" />
                                )}
                                {msg.status === "SENT" && <Check className="h-3 w-3" />}
                                {msg.status === "DELIVERED" && <CheckCheck className="h-3 w-3" />}
                                {msg.status === "FAILED" && (
                                  <span className="text-destructive">Failed</span>
                                )}
                                {msg.status !== "FAILED" && (
                                  <span className="capitalize">{msg.status.toLowerCase()}</span>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Reply Composer */}
              <div className="border-t border-border bg-card p-3 sm:p-4">
                <form onSubmit={handleSendReply} className="space-y-2">
                  <div className="relative">
                    <Textarea
                      placeholder={`Reply via ${CHANNEL_LABELS[convDetail.channel]}… (Press Enter to send, Shift+Enter for new line)`}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={3}
                      className="min-h-[70px] resize-none pr-14 text-sm"
                    />
                    <Button
                      type="submit"
                      size="icon"
                      disabled={!replyText.trim() || sendMessageMutation.isPending}
                      className="absolute bottom-2.5 right-2.5 h-8 w-8 rounded-lg"
                      aria-label="Send reply"
                    >
                      {sendMessageMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                    <span>
                      Channel:{" "}
                      <span className="font-medium text-foreground">
                        {CHANNEL_LABELS[convDetail.channel]}
                      </span>
                    </span>
                    <span>Enter to send &middot; Shift + Enter for newline</span>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                <InboxIcon className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                No conversation selected
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground sm:text-sm">
                Select an inbound thread from the left to view customer communication history and
                respond directly.
              </p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
