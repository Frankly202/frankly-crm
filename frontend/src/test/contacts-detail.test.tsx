import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContactDetail } from "@/lib/api/types";

// Mock TanStack Router
const mockUseParams = vi.fn().mockReturnValue({ contactId: "ct-001" });
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => mockUseParams(),
    useSearch: () => ({}),
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
  useNavigate: () => vi.fn(),
  useRouterState: () => "/contacts/ct-001",
}));

// Mock auth
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

const mockContact: ContactDetail = {
  id: "ct-001",
  name: "Alexander Christodoulou",
  primaryEmail: "a.christodoulou@example.com",
  primaryPhone: "+35799123456",
  instagramHandle: "alex_ch",
  metadata: { country: "Cyprus", budget: "€2M" },
  createdAt: "2026-08-01T10:00:00Z",
  updatedAt: "2026-08-05T14:00:00Z",
  leads: [
    {
      id: "ld-101",
      title: "Limassol Luxury Villa Purchase",
      category: "PROPERTY_BUYER_INVESTOR",
      status: "QUALIFIED",
      sourceChannel: "WEBSITE_FORM",
      contactId: "ct-001",
      assignedToUserId: "usr-001",
      notes: "High net-worth buyer interested in beachfront property.",
      nextActionRequired: "Send property brochures",
      nextActionDueDate: "2026-09-10T12:00:00Z",
      createdAt: "2026-08-02T10:00:00Z",
      updatedAt: "2026-08-03T10:00:00Z",
    },
  ],
  conversations: [
    {
      id: "cv-201",
      contactId: "ct-001",
      leadId: "ld-101",
      channel: "WHATSAPP",
      channelThreadId: "+35799123456",
      lastMessageAt: "2026-08-05T12:00:00Z",
      lastReadAt: "2026-08-05T12:05:00Z",
      isUnread: false,
    },
  ],
};

// Mock the query hook
vi.mock("@/lib/api/queries", () => ({
  useContact: (id: string) => ({
    data: id === "ct-001" ? mockContact : undefined,
    isLoading: false,
    isError: id !== "ct-001",
    error: id !== "ct-001" ? new Error("Contact not found") : null,
    refetch: vi.fn(),
  }),
  useContacts: () => ({ data: { data: [mockContact] }, isLoading: false }),
  useLeads: () => ({ data: { data: [] }, isLoading: false }),
  useCreateLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { Route } from "@/routes/contacts.$contactId";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Contact Detail Route Component", () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ contactId: "ct-001" });
  });

  it("should render contact identity details including email, phone, and Instagram", async () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getAllByText("Alexander Christodoulou").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("a.christodoulou@example.com")).toBeDefined();
    expect(screen.getAllByText("+35799123456").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("@alex_ch")).toBeDefined();
    expect(screen.getByText("country:")).toBeDefined();
    expect(screen.getByText("Cyprus")).toBeDefined();
  });

  it("should render linked leads with category, status, and next action", async () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByText("Leads (1)")).toBeDefined();
    expect(screen.getByText("Limassol Luxury Villa Purchase")).toBeDefined();
    expect(screen.getByText("Send property brochures")).toBeDefined();
  });

  it("should render linked conversations and deep link to inbox", async () => {
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByText("Conversations (1)")).toBeDefined();
    expect(screen.getAllByText("+35799123456").length).toBeGreaterThanOrEqual(1);
  });

  it("should render error state when contact is not found", async () => {
    mockUseParams.mockReturnValue({ contactId: "ct-invalid" });
    const Component = (Route as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByText("Contact not found")).toBeDefined();
    expect(screen.getByText("Back to contacts")).toBeDefined();
  });
});
