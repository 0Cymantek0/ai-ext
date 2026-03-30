import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AgentApprovalCard } from "../AgentApprovalCard";
import type { AgentPendingApproval } from "@/shared/agent-runtime/contracts";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ShieldAlert: () => <span data-icon="ShieldAlert" />,
  ExternalLink: () => <span data-icon="ExternalLink" />,
}));

// Mock Button component
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

describe("AgentApprovalCard", () => {
  const baseApproval: AgentPendingApproval = {
    approvalId: "apr-1",
    reason: "Click submit button",
    requestedAt: Date.now(),
  };

  it("renders approval reason text", () => {
    render(<AgentApprovalCard approval={baseApproval} onResolve={vi.fn()} />);
    expect(screen.getByText("Click submit button")).toBeInTheDocument();
  });

  it("renders tool name when present", () => {
    const approval: AgentPendingApproval = {
      ...baseApproval,
      toolName: "click_element",
    };
    render(<AgentApprovalCard approval={approval} onResolve={vi.fn()} />);
    expect(screen.getByText("click_element")).toBeInTheDocument();
  });

  it("renders target URL when present", () => {
    const approval: AgentPendingApproval = {
      ...baseApproval,
      targetContext: {
        tabId: 1,
        tabUrl: "https://example.com/form",
      },
    };
    render(<AgentApprovalCard approval={approval} onResolve={vi.fn()} />);
    expect(screen.getByText(/example\.com/)).toBeInTheDocument();
  });

  it("renders selector when present", () => {
    const approval: AgentPendingApproval = {
      ...baseApproval,
      targetContext: {
        tabId: 1,
        tabUrl: "https://example.com/form",
        selector: "#submit-btn",
      },
    };
    render(<AgentApprovalCard approval={approval} onResolve={vi.fn()} />);
    expect(screen.getByText("#submit-btn")).toBeInTheDocument();
  });

  it("renders text preview for type_text tool", () => {
    const approval: AgentPendingApproval = {
      ...baseApproval,
      targetContext: {
        tabId: 1,
        textPreview: "Hello world",
      },
    };
    render(<AgentApprovalCard approval={approval} onResolve={vi.fn()} />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders Approve button", () => {
    render(<AgentApprovalCard approval={baseApproval} onResolve={vi.fn()} />);
    expect(screen.getByText("Approve")).toBeInTheDocument();
  });

  it("renders Reject button", () => {
    render(<AgentApprovalCard approval={baseApproval} onResolve={vi.fn()} />);
    expect(screen.getByText("Reject")).toBeInTheDocument();
  });

  it("calls onResolve with approved when Approve clicked", async () => {
    const onResolve = vi.fn();
    render(<AgentApprovalCard approval={baseApproval} onResolve={onResolve} />);
    await userEvent.click(screen.getByText("Approve"));
    expect(onResolve).toHaveBeenCalledWith("approved");
  });

  it("calls onResolve with rejected when Reject clicked", async () => {
    const onResolve = vi.fn();
    render(<AgentApprovalCard approval={baseApproval} onResolve={onResolve} />);
    await userEvent.click(screen.getByText("Reject"));
    expect(onResolve).toHaveBeenCalledWith("rejected");
  });

  it("does not render tool section when toolName is absent", () => {
    render(<AgentApprovalCard approval={baseApproval} onResolve={vi.fn()} />);
    expect(screen.queryByText(/Tool:/)).not.toBeInTheDocument();
  });
});
