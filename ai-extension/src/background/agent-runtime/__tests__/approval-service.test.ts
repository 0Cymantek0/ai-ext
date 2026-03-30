import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalService } from "../approval-service.js";
import type { AgentRuntimeStore } from "../store.js";
import type { AgentRuntimeService } from "../agent-runtime-service.js";
import type { AgentRun } from "../../../shared/agent-runtime/contracts.js";

function makeMockRun(overrides?: Partial<AgentRun>): AgentRun {
  return {
    runId: "run-test-1",
    mode: "browser-action",
    status: "running",
    phase: "executing",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    todoItems: [],
    pendingApproval: null,
    artifactRefs: [],
    latestCheckpointId: null,
    terminalOutcome: null,
    metadata: { tabId: 42, tabUrl: "https://example.com/form" },
    ...overrides,
  };
}

describe("ApprovalService", () => {
  let service: ApprovalService;
  let mockRuntimeService: { applyEvent: ReturnType<typeof vi.fn>; getRun: ReturnType<typeof vi.fn> };
  let mockStore: { putApproval: ReturnType<typeof vi.fn>; getApproval: ReturnType<typeof vi.fn>; getPendingApprovals: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRuntimeService = {
      applyEvent: vi.fn().mockResolvedValue(makeMockRun({ status: "waiting_approval" })),
      getRun: vi.fn().mockResolvedValue(makeMockRun()),
    };
    mockStore = {
      putApproval: vi.fn().mockResolvedValue(undefined),
      getApproval: vi.fn().mockResolvedValue(undefined),
      getPendingApprovals: vi.fn().mockResolvedValue([]),
    };

    service = new ApprovalService(
      mockRuntimeService as unknown as AgentRuntimeService,
      mockStore as unknown as AgentRuntimeStore,
    );
  });

  describe("requestApproval", () => {
    it("persists approval record and emits approval.requested event", async () => {
      const targetContext = {
        tabId: 42,
        tabUrl: "https://example.com/form",
        selector: "#submit-btn",
      };

      await service.requestApproval(
        "run-test-1",
        "click_element",
        { selector: "#submit-btn" },
        "Agent wants to click a button",
        targetContext,
      );

      // Verify persistence call
      expect(mockStore.putApproval).toHaveBeenCalledOnce();
      const putCall = mockStore.putApproval.mock.calls[0][0];
      expect(putCall.runId).toBe("run-test-1");
      expect(putCall.status).toBe("pending");
      expect(putCall.approvalId).toMatch(/^apr-run-test-1-/);

      // Verify event emission
      expect(mockRuntimeService.applyEvent).toHaveBeenCalledOnce();
      const event = mockRuntimeService.applyEvent.mock.calls[0][0];
      expect(event.type).toBe("approval.requested");
      expect(event.runId).toBe("run-test-1");
      expect(event.approval.toolName).toBe("click_element");
      expect(event.approval.targetContext).toEqual(targetContext);
    });

    it("includes CTRL-02 context fields in approval payload", async () => {
      await service.requestApproval(
        "run-test-1",
        "type_text",
        { selector: "#input", text: "Hello world" },
        "Agent wants to type text",
        { tabId: 42, selector: "#input", textPreview: "Hello world" },
      );

      const event = mockRuntimeService.applyEvent.mock.calls[0][0];
      expect(event.approval.toolName).toBe("type_text");
      expect(event.approval.toolArgs).toEqual({ selector: "#input", text: "Hello world" });
      expect(event.approval.targetContext?.selector).toBe("#input");
      expect(event.approval.targetContext?.textPreview).toBe("Hello world");
    });
  });

  describe("resolveApproval", () => {
    it("updates record and emits approval.resolved with approved", async () => {
      mockStore.getApproval.mockResolvedValue({
        approvalId: "apr-1",
        runId: "run-test-1",
        status: "pending",
        reason: "test",
        createdAt: Date.now(),
      });

      mockRuntimeService.applyEvent.mockResolvedValue(
        makeMockRun({ status: "running" }),
      );

      await service.resolveApproval("run-test-1", "apr-1", "approved");

      // Verify persistence update
      expect(mockStore.putApproval).toHaveBeenCalledOnce();
      const putCall = mockStore.putApproval.mock.calls[0][0];
      expect(putCall.status).toBe("approved");
      expect(putCall.resolvedAt).toBeDefined();

      // Verify event emission
      expect(mockRuntimeService.applyEvent).toHaveBeenCalledOnce();
      const event = mockRuntimeService.applyEvent.mock.calls[0][0];
      expect(event.type).toBe("approval.resolved");
      expect(event.approvalId).toBe("apr-1");
      expect(event.resolution).toBe("approved");
    });

    it("with rejected still transitions to running (not cancelled)", async () => {
      mockStore.getApproval.mockResolvedValue({
        approvalId: "apr-2",
        runId: "run-test-1",
        status: "pending",
        reason: "test",
        createdAt: Date.now(),
      });

      mockRuntimeService.applyEvent.mockResolvedValue(
        makeMockRun({ status: "running" }),
      );

      const result = await service.resolveApproval("run-test-1", "apr-2", "rejected");

      // The reducer transitions BOTH approved AND rejected to "running"
      expect(result.status).toBe("running");

      const event = mockRuntimeService.applyEvent.mock.calls[0][0];
      expect(event.resolution).toBe("rejected");
    });

    it("handles missing approval record gracefully", async () => {
      mockStore.getApproval.mockResolvedValue(undefined);

      mockRuntimeService.applyEvent.mockResolvedValue(
        makeMockRun({ status: "running" }),
      );

      // Should not throw even if record is missing
      const result = await service.resolveApproval("run-test-1", "apr-missing", "approved");
      expect(result).toBeDefined();

      // Still emits the event
      expect(mockRuntimeService.applyEvent).toHaveBeenCalledOnce();
    });
  });

  describe("recoverPendingApprovals", () => {
    it("returns pending records mapped to AgentPendingApproval shape", async () => {
      mockStore.getPendingApprovals.mockResolvedValue([
        {
          approvalId: "apr-1",
          runId: "run-test-1",
          status: "pending",
          reason: "Click submit button",
          createdAt: 1000,
        },
        {
          approvalId: "apr-2",
          runId: "run-test-2",
          status: "pending",
          reason: "Type into field",
          createdAt: 2000,
        },
      ]);

      const result = await service.recoverPendingApprovals();

      expect(result).toHaveLength(2);
      expect(result[0].approvalId).toBe("apr-1");
      expect(result[0].reason).toBe("Click submit button");
      expect(result[0].requestedAt).toBe(1000);
      expect(result[1].approvalId).toBe("apr-2");
    });

    it("returns empty array when no pending approvals", async () => {
      mockStore.getPendingApprovals.mockResolvedValue([]);

      const result = await service.recoverPendingApprovals();
      expect(result).toHaveLength(0);
    });
  });
});
