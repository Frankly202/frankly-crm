import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SafeMessageBody } from "@/components/crm/SafeMessageBody";

describe("SafeMessageBody Component", () => {
  it("renders plain text without URLs as normal text with 0 anchor tags", () => {
    const { container } = render(
      <SafeMessageBody body="Hello, I am interested in student accommodation in Nicosia." />,
    );

    expect(
      screen.getByText("Hello, I am interested in student accommodation in Nicosia."),
    ).toBeDefined();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("safely linkifies a valid HTTPS URL with target=_blank and rel=noopener noreferrer", () => {
    render(
      <SafeMessageBody body="Please review the brochure at https://frankedu-global.com/brochure for details." />,
    );

    const link = screen.getByRole("link", { name: "https://frankedu-global.com/brochure" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("https://frankedu-global.com/brochure");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("safely linkifies a valid HTTP URL", () => {
    render(<SafeMessageBody body="Visit http://example.com for more info." />);

    const link = screen.getByRole("link", { name: "http://example.com" });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("http://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("rejects malicious javascript: URIs and renders them as plain text without anchor tags", () => {
    const { container } = render(
      <SafeMessageBody body="Click here: javascript:alert(document.cookie)" />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(/javascript:alert\(document\.cookie\)/)).toBeDefined();
  });

  it("rejects data: URIs and renders them as plain text without anchor tags", () => {
    const { container } = render(
      <SafeMessageBody body="Payload: data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(/data:text\/html;base64/)).toBeDefined();
  });

  it("rejects vbscript: and file: URIs and renders them as plain text without anchor tags", () => {
    const { container } = render(
      <SafeMessageBody body="Check vbscript:msgbox(1) and file:///etc/passwd" />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(/vbscript:msgbox\(1\)/)).toBeDefined();
    expect(screen.getByText(/file:\/\/\/etc\/passwd/)).toBeDefined();
  });

  it("rejects protocol-relative URLs (//attacker.com) and renders them as plain text", () => {
    const { container } = render(
      <SafeMessageBody body="Check out //evil-phishing-site.com/login" />,
    );

    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(/\/\/evil-phishing-site\.com\/login/)).toBeDefined();
  });

  it("safely escapes HTML tags without executing or rendering them as DOM elements", () => {
    const { container } = render(
      <SafeMessageBody body='<script>alert("XSS")</script> <img src="x" onerror="alert(1)" />' />,
    );

    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText(/<script>alert\("XSS"\)<\/script>/)).toBeDefined();
  });

  it("trims trailing prose punctuation from URLs (period, comma, exclamation mark, question mark)", () => {
    const { container } = render(
      <SafeMessageBody body="Visit https://example.com/page. Also check https://example.com/terms, or https://example.com/help!" />,
    );

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(3);

    expect(links[0]?.getAttribute("href")).toBe("https://example.com/page");
    expect(links[0]?.textContent).toBe("https://example.com/page");

    expect(links[1]?.getAttribute("href")).toBe("https://example.com/terms");
    expect(links[1]?.textContent).toBe("https://example.com/terms");

    expect(links[2]?.getAttribute("href")).toBe("https://example.com/help");
    expect(links[2]?.textContent).toBe("https://example.com/help");

    // Trailing punctuation is present in rendered text
    expect(container.textContent).toContain("https://example.com/page.");
    expect(container.textContent).toContain("https://example.com/terms,");
    expect(container.textContent).toContain("https://example.com/help!");
  });

  it("handles enclosing parentheses around URLs correctly", () => {
    const { container } = render(
      <SafeMessageBody body="Here is the documentation (https://example.com/docs)." />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/docs" });
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
    expect(container.textContent).toBe("Here is the documentation (https://example.com/docs).");
  });

  it("preserves valid parentheses that are part of the URL itself (e.g. Wikipedia)", () => {
    render(
      <SafeMessageBody body="Read more at https://en.wikipedia.org/wiki/Frankly_(company) for company history." />,
    );

    const link = screen.getByRole("link", {
      name: "https://en.wikipedia.org/wiki/Frankly_(company)",
    });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("https://en.wikipedia.org/wiki/Frankly_(company)");
  });

  it("linkifies multiple URLs across multiline text while preserving whitespace", () => {
    const multilineBody = `Hello!
Line 1: https://example.com/first
Line 2: https://example.com/second
End of message.`;

    const { container } = render(<SafeMessageBody body={multilineBody} />);

    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("https://example.com/first");
    expect(links[1]?.getAttribute("href")).toBe("https://example.com/second");

    expect(container.textContent).toContain("Line 1:");
    expect(container.textContent).toContain("Line 2:");
  });

  it("stops click event propagation when an anchor tag is clicked", () => {
    const parentClickHandler = vi.fn();

    render(
      <div onClick={parentClickHandler}>
        <SafeMessageBody body="Click here: https://example.com" />
      </div>,
    );

    const link = screen.getByRole("link", { name: "https://example.com" });
    fireEvent.click(link);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it("applies inbound styling with text-primary and break-all", () => {
    render(<SafeMessageBody body="https://example.com" isInbound={true} />);

    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link.className).toContain("text-primary");
    expect(link.className).toContain("break-all");
  });

  it("applies outbound styling with text-primary-foreground and break-all", () => {
    render(<SafeMessageBody body="https://example.com" isInbound={false} />);

    const link = screen.getByRole("link", { name: "https://example.com" });
    expect(link.className).toContain("text-primary-foreground");
    expect(link.className).toContain("break-all");
  });

  it("handles empty or null body gracefully", () => {
    const { container } = render(<SafeMessageBody body="" />);
    expect(container.firstChild).toBeNull();
  });
});
