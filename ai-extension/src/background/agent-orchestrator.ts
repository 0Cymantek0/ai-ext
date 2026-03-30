/**
 * Agent Orchestrator
 * Manages browser agent workflows using LangChain and LangGraph
 * Requirements: Tool Registry Integration (Phase 3)
 */

import { BrowserToolRegistry } from "../browser-agent/tool-registry.js";
import { ALL_BROWSER_TOOLS } from "../browser-agent/tools/index.js";
import type { Logger } from "./monitoring.js";
import type { PerformanceMonitor } from "./monitoring.js";

/**
 * Workflow status for UI updates
 */
export interface WorkflowStatus {
  workflowId: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  currentStep: number;
  totalSteps: number;
  progress: number; // 0-100
  message: string;
  toolCallCount: number;
  cost: {
    tokens: number;
    apiCalls: number;
  };
  startTime: number;
  lastUpdate: number;
  tabId?: number;
  userId?: string;
  config?: WorkflowConfig;
}

/**
 * Tool execution event for UI streaming
 */
export interface ToolExecutionEvent {
  workflowId: string;
  toolName: string;
  stepNumber: number;
  status: "started" | "completed" | "failed" | "paused";
  input?: any;
  output?: any;
  error?: string;
  executionTimeMs?: number;
  timestamp: number;
}

/**
 * Human approval request
 */
export interface HumanApprovalRequest {
  workflowId: string;
  toolName: string;
  description: string;
  input: any;
  timestamp: number;
}

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  maxToolCalls?: number;
  timeoutMs?: number;
  requireHumanApproval?: boolean;
  tabId?: number;
  userId?: string;
}

/**
 * Agent Orchestrator
 * Manages browser agent workflows with LangChain/LangGraph integration
 */
export class AgentOrchestrator {
  private registry: BrowserToolRegistry;
  private logger: Logger;
  private performanceMonitor: PerformanceMonitor;
  private workflows = new Map<string, WorkflowStatus>();
  private pendingApprovals = new Map<string, HumanApprovalRequest>();

  constructor(
    logger: Logger,
    performanceMonitor: PerformanceMonitor,
    config?: {
      maxRequestsPerMinute?: number;
      maxToolCallsPerWorkflow?: number;
      defaultWorkflowTimeoutMs?: number;
    },
  ) {
    this.logger = logger;
    this.performanceMonitor = performanceMonitor;
    this.registry = new BrowserToolRegistry(logger, performanceMonitor, config);

    // Register all browser agent tools
    this.registerAllTools();

    this.logger.info("AgentOrchestrator", "Initialized", {
      totalTools: this.registry.getAllTools().length,
    });
  }

  /**
   * Register all available browser agent tools
   */
  private registerAllTools(): void {
    let registered = 0;
    let destructive = 0;

    for (const tool of ALL_BROWSER_TOOLS) {
      this.registry.register(tool);
      registered++;

      if (tool.requiresHumanApproval) {
        destructive++;
      }
    }

    this.logger.info("AgentOrchestrator", "Registered all tools", {
      registered,
      destructive,
      summary: this.registry.getToolUsageSummary(),
    });
  }

  /**
   * Get the tool registry for direct access
   */
  getRegistry(): BrowserToolRegistry {
    return this.registry;
  }

  /**
   * Get tool definitions for integration purposes
   */
  getToolDefinitions() {
    return this.registry.toToolDefinitions();
  }

  /**
   * Initialize a new workflow
   */
  initializeWorkflow(
    workflowId: string,
    config?: WorkflowConfig,
  ): WorkflowStatus {
    this.registry.initializeWorkflow(workflowId);

    const status: WorkflowStatus = {
      workflowId,
      status: "running",
      currentStep: 0,
      totalSteps: 0,
      progress: 0,
      message: "Workflow initialized",
      toolCallCount: 0,
      cost: {
        tokens: 0,
        apiCalls: 0,
      },
      startTime: Date.now(),
      lastUpdate: Date.now(),
      ...(config?.tabId !== undefined ? { tabId: config.tabId } : {}),
      ...(config?.userId !== undefined ? { userId: config.userId } : {}),
      ...(config ? { config } : {}),
    };

    this.workflows.set(workflowId, status);

    this.logger.info("AgentOrchestrator", "Workflow initialized", {
      workflowId,
      config,
    });

    void this.sendToUI({
      kind: "BROWSER_AGENT_WORKFLOW_STATUS",
      payload: status,
    });

    return status;
  }

  /**
   * Execute a tool within a workflow context
   */
  async executeTool(
    workflowId: string,
    toolName: string,
    input: any,
    stepNumber: number,
    options: { skipApprovalCheck?: boolean } = {},
  ): Promise<ToolExecutionEvent> {
    const startTime = Date.now();

    try {
      // Get workflow status
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      // Check if tool requires human approval (unless skipping approval check)
      const tool = this.registry.getTool(toolName);
      if (tool?.requiresHumanApproval && !options.skipApprovalCheck) {
        // Pause workflow and request approval
        this.registry.pauseWorkflow(workflowId);
        workflow.status = "paused";
        workflow.message = `Waiting for approval to execute: ${toolName}`;
        workflow.lastUpdate = Date.now();

        const approvalRequest: HumanApprovalRequest = {
          workflowId,
          toolName,
          description: tool.description,
          input,
          timestamp: Date.now(),
        };

        this.pendingApprovals.set(workflowId, approvalRequest);

        this.logger.info("AgentOrchestrator", "Human approval requested", {
          workflowId,
          toolName,
        });

        // Send approval request to UI
        await this.sendToUI({
          kind: "BROWSER_AGENT_APPROVAL_REQUEST",
          payload: approvalRequest,
        });
        await this.sendWorkflowStatus(workflowId);

        return {
          workflowId,
          toolName,
          stepNumber,
          status: "paused",
          timestamp: Date.now(),
        };
      }

      // Update workflow status
      workflow.currentStep = stepNumber;
      workflow.message = `Executing: ${toolName}`;
      workflow.lastUpdate = Date.now();
      workflow.totalSteps = Math.max(workflow.totalSteps, stepNumber);

      await this.sendWorkflowStatus(workflowId);

      // Send started event
      const startedEvent: ToolExecutionEvent = {
        workflowId,
        toolName,
        stepNumber,
        status: "started",
        input,
        timestamp: Date.now(),
      };

      await this.sendToUI({
        kind: "BROWSER_AGENT_TOOL_EXECUTION",
        payload: startedEvent,
      });

      // Execute tool
      const result = await this.registry.execute(toolName, input, {
        workflowId,
        stepNumber,
        timestamp: Date.now(),
        ...(workflow.tabId !== undefined ? { tabId: workflow.tabId } : {}),
        ...(workflow.userId !== undefined ? { userId: workflow.userId } : {}),
      });

      const executionTimeMs = Date.now() - startTime;

      // Update workflow status
      workflow.toolCallCount++;
      workflow.cost.apiCalls += result.metadata.cost?.apiCalls || 0;
      workflow.cost.tokens += result.metadata.cost?.tokens || 0;
      workflow.lastUpdate = Date.now();
      workflow.progress = Math.min(
        100,
        Math.floor(
          (workflow.toolCallCount / Math.max(workflow.totalSteps, 1)) * 100,
        ),
      );

      if (result.success) {
        workflow.message = `Completed: ${toolName}`;

        const completedEvent: ToolExecutionEvent = {
          workflowId,
          toolName,
          stepNumber,
          status: "completed",
          input,
          output: result.data,
          executionTimeMs,
          timestamp: Date.now(),
        };

        // Send completed event
        await this.sendToUI({
          kind: "BROWSER_AGENT_TOOL_EXECUTION",
          payload: completedEvent,
        });
        await this.sendWorkflowStatus(workflowId);

        return completedEvent;
      } else {
        workflow.status = "failed";
        workflow.message = `Failed: ${toolName} - ${result.error?.message}`;
        await this.sendWorkflowStatus(workflowId);

        const failedEvent: ToolExecutionEvent = {
          workflowId,
          toolName,
          stepNumber,
          status: "failed",
          input,
          error: result.error?.message ?? "Tool execution failed",
          executionTimeMs,
          timestamp: Date.now(),
        };

        // Send failed event
        await this.sendToUI({
          kind: "BROWSER_AGENT_TOOL_EXECUTION",
          payload: failedEvent,
        });

        return failedEvent;
      }
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      const workflow = this.workflows.get(workflowId);
      if (workflow) {
        workflow.status = "failed";
        workflow.message = `Error: ${errorMessage}`;
        workflow.lastUpdate = Date.now();
        await this.sendWorkflowStatus(workflowId);
      }

      this.logger.error("AgentOrchestrator", "Tool execution failed", {
        workflowId,
        toolName,
        error: errorMessage,
      });

      const failedEvent: ToolExecutionEvent = {
        workflowId,
        toolName,
        stepNumber,
        status: "failed",
        error: errorMessage,
        executionTimeMs,
        timestamp: Date.now(),
      };

      await this.sendToUI({
        kind: "BROWSER_AGENT_TOOL_EXECUTION",
        payload: failedEvent,
      });

      return failedEvent;
    }
  }

  /**
   * Approve a tool execution
   */
  async approveToolExecution(
    workflowId: string,
    approved: boolean,
  ): Promise<void> {
    const approval = this.pendingApprovals.get(workflowId);
    if (!approval) {
      throw new Error(`No pending approval for workflow: ${workflowId}`);
    }

    this.pendingApprovals.delete(workflowId);

    const workflow = this.workflows.get(workflowId);

    if (approved) {
      // Resume workflow
      this.registry.resumeWorkflow(workflowId);

      if (workflow) {
        workflow.status = "running";
        workflow.message = "Approval granted, resuming...";
        workflow.lastUpdate = Date.now();
      }

      this.logger.info("AgentOrchestrator", "Tool execution approved", {
        workflowId,
        toolName: approval.toolName,
      });

      await this.sendWorkflowStatus(workflowId);

      // Continue execution, skipping approval check this time
      await this.executeTool(
        workflowId,
        approval.toolName,
        approval.input,
        workflow?.currentStep ?? 0,
        { skipApprovalCheck: true },
      );

      return;
    }

    // Cancel workflow
    this.registry.cancelWorkflow(workflowId);

    if (workflow) {
      workflow.status = "cancelled";
      workflow.message = "User rejected approval";
      workflow.lastUpdate = Date.now();
    }

    this.logger.info("AgentOrchestrator", "Tool execution rejected", {
      workflowId,
      toolName: approval.toolName,
    });

    await this.sendWorkflowStatus(workflowId);
  }

  /**
   * Pause workflow
   */
  pauseWorkflow(workflowId: string): void {
    this.registry.pauseWorkflow(workflowId);

    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = "paused";
      workflow.message = "Workflow paused";
      workflow.lastUpdate = Date.now();
      void this.sendWorkflowStatus(workflowId);
    }

    this.logger.info("AgentOrchestrator", "Workflow paused", { workflowId });
  }

  /**
   * Resume workflow
   */
  resumeWorkflow(workflowId: string): void {
    this.registry.resumeWorkflow(workflowId);

    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = "running";
      workflow.message = "Workflow resumed";
      workflow.lastUpdate = Date.now();
      void this.sendWorkflowStatus(workflowId);
    }

    this.logger.info("AgentOrchestrator", "Workflow resumed", { workflowId });
  }

  /**
   * Cancel workflow
   */
  cancelWorkflow(workflowId: string): void {
    this.registry.cancelWorkflow(workflowId);

    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = "cancelled";
      workflow.message = "Workflow cancelled";
      workflow.lastUpdate = Date.now();
      void this.sendWorkflowStatus(workflowId);
    }

    this.pendingApprovals.delete(workflowId);

    this.logger.info("AgentOrchestrator", "Workflow cancelled", { workflowId });
  }

  /**
   * Complete workflow
   */
  completeWorkflow(workflowId: string): void {
    this.registry.completeWorkflow(workflowId);

    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.status = "completed";
      workflow.progress = 100;
      workflow.message = "Workflow completed successfully";
      workflow.lastUpdate = Date.now();
      void this.sendWorkflowStatus(workflowId);
    }

    this.logger.info("AgentOrchestrator", "Workflow completed", {
      workflowId,
      workflow,
    });
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): WorkflowStatus | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all workflow statuses
   */
  getAllWorkflows(): WorkflowStatus[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Send workflow status update to UI
   */
  private async sendWorkflowStatus(workflowId: string): Promise<void> {
    const status = this.workflows.get(workflowId);
    if (!status) return;

    await this.sendToUI({
      kind: "BROWSER_AGENT_WORKFLOW_STATUS",
      payload: status,
    });
  }

  /**
   * Send message to UI (side panel)
   */
  private async sendToUI(message: {
    kind: string;
    payload: any;
  }): Promise<void> {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      this.logger.warn(
        "AgentOrchestrator",
        "Failed to send message to UI",
        error,
      );
    }
  }

  /**
   * Get observability summary
   */
  getObservabilitySummary(): {
    registry: ReturnType<BrowserToolRegistry["getToolUsageSummary"]>;
    workflows: {
      total: number;
      running: number;
      paused: number;
      completed: number;
      failed: number;
      cancelled: number;
    };
    pendingApprovals: number;
  } {
    const workflowsByStatus = {
      total: this.workflows.size,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const workflow of this.workflows.values()) {
      workflowsByStatus[workflow.status]++;
    }

    return {
      registry: this.registry.getToolUsageSummary(),
      workflows: workflowsByStatus,
      pendingApprovals: this.pendingApprovals.size,
    };
  }
}

// Export singleton instance (initialized in service worker)
let orchestratorInstance: AgentOrchestrator | null = null;

export function initializeOrchestrator(
  logger: Logger,
  performanceMonitor: PerformanceMonitor,
  config?: {
    maxRequestsPerMinute?: number;
    maxToolCallsPerWorkflow?: number;
    defaultWorkflowTimeoutMs?: number;
  },
): AgentOrchestrator {
  if (orchestratorInstance) {
    logger.warn(
      "AgentOrchestrator",
      "Already initialized, returning existing instance",
    );
    return orchestratorInstance;
  }

  orchestratorInstance = new AgentOrchestrator(
    logger,
    performanceMonitor,
    config,
  );
  return orchestratorInstance;
}

export function getOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    throw new Error("AgentOrchestrator not initialized");
  }
  return orchestratorInstance;
}
