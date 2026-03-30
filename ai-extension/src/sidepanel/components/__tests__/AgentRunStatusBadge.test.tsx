import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AgentRunStatusBadge } from "../AgentRunStatusBadge";
import type { AgentRunStatus } from "@/shared/agent-runtime/contracts";
import { vi } from "vitest";

// Mock lucide-react icons as simple spans with the icon name
vi.mock("lucide-react", () => ({
  ShieldAlert: ({ className }: any) => <span data-icon="ShieldAlert" className={className} />,
  Play: ({ className }: any) => <span data-icon="Play" className={className} />,
  Pause: ({ className }: any) => <span data-icon="Pause" className={className} />,
  Loader: ({ className }: any) => <span data-icon="Loader" className={className} />,
  CheckCircle: ({ className }: any) => <span data-icon="CheckCircle" className={className} />,
  XCircle: ({ className }: any) => <span data-icon="XCircle" className={className} />,
  Ban: ({ className }: any) => <span data-icon="Ban" className={className} />,
}));

describe("AgentRunStatusBadge", () => {
  it("renders label from STATUS_DISPLAY for status running", () => {
    render(<AgentRunStatusBadge status="running" />);
    expect(screen.getByText("Working")).toBeInTheDocument();
  });

  it("renders label from STATUS_DISPLAY for status waiting_approval", () => {
    render(<AgentRunStatusBadge status="waiting_approval" />);
    expect(screen.getByText("Needs Your Approval")).toBeInTheDocument();
  });

  it("renders label from STATUS_DISPLAY for status paused", () => {
    render(<AgentRunStatusBadge status="paused" />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("renders label from STATUS_DISPLAY for status completed", () => {
    render(<AgentRunStatusBadge status="completed" />);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders label from STATUS_DISPLAY for status failed", () => {
    render(<AgentRunStatusBadge status="failed" />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("renders label from STATUS_DISPLAY for status cancelled", () => {
    render(<AgentRunStatusBadge status="cancelled" />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
  });

  it("applies orange color class for waiting_approval status", () => {
    const { container } = render(<AgentRunStatusBadge status="waiting_approval" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("text-orange-500");
  });

  it("applies pulse animation class for waiting_approval status", () => {
    const { container } = render(<AgentRunStatusBadge status="waiting_approval" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("animate-pulse");
  });
});
