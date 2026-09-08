import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockPath = "/dashboard";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ leadId: "ld-001" }),
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
  useRouterState: () => mockPath,
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

const mockLead = {
  id: "ld-001",
  title: "Limassol Luxury Villa Purchase",
  category: "PROPERTY_BUYER_INVESTOR",
  status: "NEW",
  sourceChannel: "WEBSITE_FORM",
  contactId: "ct-001",
  assignedToUserId: "usr-001",
  notes: "Interested in Cyprus residency by investment.",
  nextActionRequired: "Send property brochures",
  nextActionDueDate: "2026-09-10T12:00:00Z",
  createdAt: "2026-08-01T10:00:00Z",
  updatedAt: "2026-08-01T10:00:00Z",
  contact: { id: "ct-001", name: "Alexander Christodoulou", primaryEmail: "alex@example.com" },
  conversations: [],
  activities: [],
};

vi.mock("@/lib/api/queries", () => ({
  useDashboardMetrics: () => ({
    data: {
      totals: { totalLeads: 42, totalContacts: 30 },
      byStatus: { NEW: 12, CONTACTED: 8, REPLIED: 10, QUALIFIED: 6, LOST: 2, CLOSED_WON: 4 },
      byCategory: {
        PROPERTY_BUYER_INVESTOR: 15,
        STUDENT_APPLICANT: 12,
        UNIVERSITY_PARTNER: 5,
        AGENT_REPRESENTATIVE: 6,
        GENERAL_ENQUIRY: 4,
      },
      nextActions: { totalPending: 8, overdue: 1, dueToday: 2, upcoming: 5 },
      recentActivity: { leadsCreatedToday: 2, leadsCreatedThisWeek: 9 },
    },
    isLoading: false,
    isError: false,
  }),
  useLeads: () => ({
    data: { data: [mockLead], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } },
    isLoading: false,
    isError: false,
  }),
  useLead: () => ({
    data: mockLead,
    isLoading: false,
    isError: false,
  }),
  useContacts: () => ({
    data: {
      data: [{ id: "ct-001", name: "Alexander Christodoulou", primaryEmail: "alex@example.com" }],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }),
  useUpdateLeadStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddActivity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateContact: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { Route as DashboardRoute } from "@/routes/dashboard";
import { Route as LeadsRoute } from "@/routes/leads";
import { Route as LeadDetailRoute } from "@/routes/leads.$leadId";
import { Route as ContactsRoute } from "@/routes/contacts";
import { Route as LoginRoute } from "@/routes/login";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Existing CRM Routes Regression Verification", () => {
  beforeEach(() => {
    mockPath = "/dashboard";
  });

  it("should render Dashboard route with summary metrics counters", () => {
    mockPath = "/dashboard";
    const Component = (DashboardRoute as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByText(/Pipeline health across all channels/i)).toBeDefined();
    expect(screen.getByText("Total leads")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });

  it("should render Leads directory route with leads table and filters", () => {
    mockPath = "/leads";
    const Component = (LeadsRoute as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getAllByText(/Limassol Luxury Villa Purchase/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByPlaceholderText(/Search leads, contacts, notes…/i)).toBeDefined();
  });

  it("should render Lead Detail route with lifecycle actions and metadata", () => {
    mockPath = "/leads/ld-001";
    const Component = (LeadDetailRoute as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getAllByText("Limassol Luxury Villa Purchase").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Alexander Christodoulou/i)).toBeDefined();
    expect(screen.getByDisplayValue("Send property brochures")).toBeDefined();
  });

  it("should render Contacts directory route with contacts table", () => {
    mockPath = "/contacts";
    const Component = (ContactsRoute as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByText("Alexander Christodoulou")).toBeDefined();
    expect(screen.getByText("alex@example.com")).toBeDefined();
  });

  it("should render Login route with credentials form and allow toggling password visibility", () => {
    mockPath = "/login";
    const Component = (LoginRoute as unknown as { component: React.ComponentType }).component;
    renderWithClient(<Component />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeDefined();
    expect(screen.getByLabelText("Work email")).toBeDefined();

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput).toBeDefined();
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByRole("button", { name: "Show password" });
    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.type).toBe("password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeDefined();
  });
});
