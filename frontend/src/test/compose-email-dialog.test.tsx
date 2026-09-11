import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ComposeEmailDialog } from "@/components/crm/ComposeEmailDialog";

const mockStartEmailMutate = vi.fn();

vi.mock("@/lib/api/queries", () => ({
  useStartEmailConversation: () => ({
    mutateAsync: mockStartEmailMutate,
    isPending: false,
  }),
}));

const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ComposeEmailDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should open dialog when trigger button is clicked", () => {
    renderWithClient(<ComposeEmailDialog />);
    expect(screen.getByRole("button", { name: /new email/i })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /new email/i }));
    expect(screen.getByRole("heading", { name: /start new email conversation/i })).toBeDefined();
    expect(screen.getByLabelText(/to \(recipient email\)/i)).toBeDefined();
    expect(screen.getByLabelText(/subject/i)).toBeDefined();
  });

  it("should validate required fields and call useStartEmailConversation on valid submit", async () => {
    mockStartEmailMutate.mockResolvedValueOnce({
      conversationId: "conv-created-123",
      messageId: "msg-created-456",
      status: "SENT",
    });

    renderWithClient(<ComposeEmailDialog />);
    fireEvent.click(screen.getByRole("button", { name: /new email/i }));

    fireEvent.change(screen.getByLabelText(/to \(recipient email\)/i), {
      target: { value: "prospect@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/subject/i), {
      target: { value: "Cyprus Investment Opportunity" },
    });
    fireEvent.change(screen.getByLabelText(/message body/i), {
      target: { value: "Hello, please find our investment presentation attached." },
    });

    fireEvent.click(screen.getByRole("button", { name: /send email/i }));

    await waitFor(() => {
      expect(mockStartEmailMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "prospect@example.com",
          subject: "Cyprus Investment Opportunity",
          body: "Hello, please find our investment presentation attached.",
        }),
      );
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/inbox",
        search: { conversationId: "conv-created-123" },
      });
    });
  });
});
