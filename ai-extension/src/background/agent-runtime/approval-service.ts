import type { AgentRun, AgentPendingApproval, ApprovalTargetContext } from "../../shared/agent-runtime/contracts.js";
import type { AgentRuntimeService } from "./agent-runtime-service.js";
import type { AgentRuntimeStore } from "./store.js";

export class ApprovalService {
  constructor(
    private runtimeService: AgentRuntimeService,
    private store: AgentRuntimeStore,
  ) {}

  async requestApproval(
    runId: string,
    toolName: string,
    toolArgs: Record<string, unknown>,
    reason: string,
    targetContext: ApprovalTargetContext,
  ): Promise<AgentRun> {
    const approvalId = `apr-${runId}-${Date.now()}`;

    await this.store.putApproval({
      approvalId,
      runId,
      status: "pending",
      reason,
      createdAt: Date.now(),
    });

    const approval: AgentPendingApproval = {
      approvalId,
      reason,
      requestedAt: Date.now(),
      toolName,
      toolArgs,
      targetContext,
    };

    return this.runtimeService.applyEvent({
      eventId: `evt-${runId}-approval-req-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "approval.requested",
      approval,
    });
  }

  async resolveApproval(
    runId: string,
    approvalId: string,
    resolution: "approved" | "rejected",
  ): Promise<AgentRun> {
    const record = await this.store.getApproval(approvalId);
    if (record) {
      await this.store.putApproval({
        ...record,
        status: resolution,
        resolvedAt: Date.now(),
      });
    }

    return this.runtimeService.applyEvent({
      eventId: `evt-${runId}-approval-res-${Date.now()}`,
      runId,
      timestamp: Date.now(),
      type: "approval.resolved",
      approvalId,
      resolution,
    });
  }

  async recoverPendingApprovals(): Promise<AgentPendingApproval[]> {
    const pendingRecords = await this.store.getPendingApprovals();
    return pendingRecords.map(record => ({
      approvalId: record.approvalId,
      reason: record.reason,
      requestedAt: record.createdAt,
    }));
  }
}
