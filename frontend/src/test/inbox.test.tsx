import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Conversation, ConversationDetail, Message } from "@/lib/api/types";

const mockNavigate = vi.fn();
let mockSearch: Record<string, unknown> = {};

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useSearch: () => mockSearch,
  }),
  Link: ({
    children,
    to,
    search,
    params,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to?: string;
    search?: unknown;
    params?: unknown;
  }) => (
    <a
      href={to}
      data-search={JSON.stringify(search)}
      data-params={JSON.stringify(params)}
      {...props}
    >
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
  useRouterState: () => "/inbox",
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "usr-001",
      name: "Frankly Admin",
      email: "admin@frankedu-global.com",
      role: "ADMIN",
    },
    ready: true,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const mockMessages: Message[] = [
  {
    id: "msg-001",
    conversationId: "cv-001",
    direction: "INBOUND",
    status: "RECEIVED",
    body: "Hello, I am inquiring about European University Cyprus programs.",
    senderName: "Elena Georgiou",
    createdAt: "2026-08-01T10:00:00Z",
  },
  {
    id: "msg-002",
    conversationId: "cv-001",
    direction: "OUTBOUND",
    status: "DELIVERED",
    body: "Hi Elena, we offer full guidance on enrollment and visas. When are you looking to start?",
    createdAt: "2026-08-01T10:15:00Z",
  },
];

const mockConversations: Conversation[] = [
  {
    id: "cv-001",
    contactId: "ct-001",
    leadId: "ld-001",
    channel: "WHATSAPP",
    channelThreadId: "+35799123456",
    lastMessageAt: "2026-08-01T10:15:00Z",
    lastReadAt: "2026-08-01T10:15:00Z",
    isUnread: false,
    contact: {
      id: "ct-001",
      name: "Elena Georgiou",
      primaryEmail: null,
      primaryPhone: "+35799123456",
      instagramHandle: null,
      createdAt: "2026-08-01T09:00:00Z",
      updatedAt: "2026-08-01T09:00:00Z",
    },
    latestMessage: mockMessages[1]!,
  },
  {
    id: "cv-002",
    contactId: "ct-002",
    leadId: null,
    channel: "INSTAGRAM",
    channelThreadId: "ig_direct_dimitris",
    lastMessageAt: "2026-08-02T14:00:00Z",
    lastReadAt: null,
    isUnread: true,
    contact: {
      id: "ct-002",
      name: "Dimitris Ioannou",
      primaryEmail: null,
      primaryPhone: null,
      instagramHandle: "dimitris_io",
      createdAt: "2026-08-02T13:00:00Z",
      updatedAt: "2026-08-02T13:00:00Z",
    },
    latestMessage: {
      id: "msg-003",
      direction: "INBOUND",
      status: "RECEIVED",
      body: "Can I get pricing for Paphos apartments?",
      createdAt: "2026-08-02T14:00:00Z",
    },
  },
];

const mockDetail: ConversationDetail = {
  ...mockConversations[0]!,
  messages: mockMessages,
};

const mockMutateSendMessage = vi.fn().mockResolvedValue({ id: "msg-new" });
const mockMutateMarkRead = vi.fn();

vi.mock("@/lib/api/queries", () => ({
  useConversations: (filters: { channel?: string; unreadOnly?: boolean }) => {
    let filtered = [...mockConversations];
    if (filters.channel) {
      filtered = filtered.filter((c) => c.channel === filters.channel);
    }
    if (filters.unreadOnly) {
      filtered = filtered.filter((c) => c.isUnread);
    }
    return {
      data: { data: filtered },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useConversation: (id: string | null) => ({
    data:
      id === "cv-001"
        ? mockDetail
        : id === "cv-002"
          ? { ...mockConversations[1], messages: [] }
          : undefined,
    isLoading: false,
    isError: false,
  }),
  useSendMessage: () => ({
    mutateAsync: mockMutateSendMessage,
    isPending: false,
  }),
  useMarkRead: () => ({
    mutate: mockMutateMarkRead,
    isPending: false,
  }),
  useStartEmailConversation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUnreadCount: (channel?: string) => {
    let count = mockConversations.filter((c) => c.isUnread);
    if (channel) {
      count = count.filter((c) => c.channel === channel);
    }
    return {
      data: { unreadCount: count.length },
      isLoading: false,
      isError: false,
    };
  },
}));

import { Route } from "@/routes/inbox";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Unified Inbox Route Component", () => {
  beforeEach(() => {
    mockSearch = { conversationId: "cv-001" };
    mockNavigate.mockClear();
    mockMutateSendMessage.mockClear();
    mockMutateMarkRead.mockClear();
  });

  it("should render channel filter pills and unread toggle", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByRole("button", { name: "All" })).toBeDefined();
    expect(screen.getByRole("button", { name: "WhatsApp" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Instagram" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Email" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Website Form" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Unread/i })).toBeDefined();
  });

  it("should render list of conversations with contact names and snippets", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getAllByText("Elena Georgiou").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Dimitris Ioannou").length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Can I get pricing for Paphos apartments/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("should render message thread bubbles with inbound and outbound styling", () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    // Inbound message
    expect(
      screen.getAllByText(/Hello, I am inquiring about European University Cyprus/i).length,
    ).toBeGreaterThanOrEqual(1);
    // Inbound message sender name
    expect(screen.getAllByText("Elena Georgiou").length).toBeGreaterThanOrEqual(2);
    // Outbound message
    expect(
      screen.getAllByText(/Hi Elena, we offer full guidance on enrollment/i).length,
    ).toBeGreaterThanOrEqual(1);
    // Delivery status
    expect(screen.getAllByText(/delivered/i).length).toBeGreaterThanOrEqual(1);
  });

  it("should submit quick reply via useSendMessage when form is submitted", async () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    const textarea = screen.getByPlaceholderText(/Reply via WhatsApp/i);
    await React.act(async () => {
      fireEvent.change(textarea, {
        target: { value: "We can schedule a consultation call tomorrow." },
      });
      const sendBtn = screen.getByRole("button", { name: "Send reply" });
      fireEvent.click(sendBtn);
    });

    expect(mockMutateSendMessage).toHaveBeenCalledWith(
      "We can schedule a consultation call tomorrow.",
    );
  });

  it("should automatically mark unread conversation as read when loaded", () => {
    mockSearch = { conversationId: "cv-002" };
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(mockMutateMarkRead).toHaveBeenCalledWith("cv-002");
  });

  it("should maintain stable active conversation selection when conversationId is unprovided in search params", () => {
    mockSearch = {};
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    // Default selected is cv-001 (Elena Georgiou)
    expect(screen.getAllByText("Elena Georgiou").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Thread: \+35799123456/i)).toBeDefined();
  });
});
