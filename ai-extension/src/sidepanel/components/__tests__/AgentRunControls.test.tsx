import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AgentRunControls } from "../AgentRunControls";
import type { AgentRunStatus } from "@/shared/agent-runtime/contracts";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Pause: () => <span data-icon="Pause" />,
  Play: () => <span data-icon="Play" />,
  X: () => <span data-icon="X" />,
}));

// Mock Button component
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

describe("AgentRunControls", () => {
  const noop = vi.fn();

  it("shows Pause button when status is running", () => {
    render(<AgentRunControls status="running" onPause={noop} onResume={noop} onCancel={noop} />);
    expect(screen.getByText("Pause")).toBeInTheDocument();
  });

  it("shows Resume button when status is paused", () => {
    render(<AgentRunControls status="paused" onPause={noop} onResume={noop} onCancel={noop} />);
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("shows Resume button when status is waiting_approval", () => {
    render(<AgentRunControls status="waiting_approval" onPause={noop} onResume={noop} onCancel={noop} />);
    expect(screen.getByText("Resume")).toBeInTheDocument();
  });

  it("shows Cancel button when status is running", () => {
    render(<AgentRunControls status="running" onPause={noop} onResume={noop} onCancel={noop} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows Cancel button when status is paused", () => {
    render(<AgentRunControls status="paused" onPause={noop} onResume={noop} onCancel={noop} />);
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("shows no buttons when status is completed", () => {
    const { container } = render(
      <AgentRunControls status="completed" onPause={noop} onResume={noop} onCancel={noop} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows no buttons when status is failed", () => {
    const { container } = render(
      <AgentRunControls status="failed" onPause={noop} onResume={noop} onCancel={noop} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows no buttons when status is cancelled", () => {
    const { container } = render(
      <AgentRunControls status="cancelled" onPause={noop} onResume={noop} onCancel={noop} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("calls onPause when Pause clicked", async () => {
    const onPause = vi.fn();
    render(<AgentRunControls status="running" onPause={onPause} onResume={noop} onCancel={noop} />);
    await userEvent.click(screen.getByText("Pause"));
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it("calls onResume when Resume clicked", async () => {
    const onResume = vi.fn();
    render(<AgentRunControls status="paused" onPause={noop} onResume={onResume} onCancel={noop} />);
    await userEvent.click(screen.getByText("Resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel clicked", async () => {
    const onCancel = vi.fn();
    render(<AgentRunControls status="running" onPause={noop} onResume={noop} onCancel={onCancel} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
