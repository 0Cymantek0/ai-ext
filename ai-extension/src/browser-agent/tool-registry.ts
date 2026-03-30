/**
 * Browser Agent Tool Registry
 * Manages registration, validation, and execution of browser automation tools
 * Requirements: Tool Registry Integration (Phase 3)
 */

import { z } from "zod";
import type { Logger, PerformanceMonitor } from "../background/monitoring.js";

/**
 * Tool execution categories for organization and filtering
 */
export enum ToolCategory {
  DOM_EXTRACTION = "dom_extraction",
  NAVIGATION = "navigation",
  INTERACTION = "interaction",
  CONTENT_EXTRACTION = "content_extraction",
  FILE_HANDLING = "file_handling",
  API_TESTING = "api_testing",
  VISION = "vision",
  SEARCH = "search",
}

/**
 * Tool complexity levels for rate limiting and resource management
 */
export enum ToolComplexity {
  LOW = "low", // Fast operations (< 100ms)
  MEDIUM = "medium", // Moderate operations (100ms - 1s)
  HIGH = "high", // Complex operations (> 1s)
}

/**
 * Tool execution context with metadata
 */
export interface ToolExecutionContext {
  workflowId: string;
  stepNumber: number;
  timestamp: number;
  tabId?: number;
  userId?: string;
}

/**
 * Tool execution result with metadata
 */
export interface ToolExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    executionTimeMs: number;
    complexity: ToolComplexity;
    requiresHumanApproval: boolean;
    cost?: {
      tokens?: number;
      apiCalls?: number;
    };
  };
}

/**
 * Tool execution handler function
 */
export type ToolHandler<TInput = any, TOutput = any> = (
  input: TInput,
  context: ToolExecutionContext,
) => Promise<TOutput>;

/**
 * Browser tool definition with metadata for LLM consumption
 */
export interface BrowserToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  category: ToolCategory;
  complexity: ToolComplexity;
  requiresHumanApproval: boolean;
  parametersSchema: z.ZodSchema<TInput>;
  handler: ToolHandler<TInput, TOutput>;
  examples?: string[];
  metadata?: {
    version?: string;
    author?: string;
    tags?: string[];
  };
}

/**
 * Rate limiter for tool execution
 */
class RateLimiter {
  private requestCounts = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requestCounts.get(key) || [];

    // Remove old requests outside the time window
    const validRequests = requests.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requestCounts.set(key, validRequests);
    return true;
  }

  reset(key: string): void {
    this.requestCounts.delete(key);
  }

  getUsage(key: string): { current: number; limit: number } {
    const now = Date.now();
    const requests = this.requestCounts.get(key) || [];
    const validRequests = requests.filter(
      (timestamp) => now - timestamp < this.windowMs,
    );

    return {
      current: validRequests.length,
      limit: this.maxRequests,
    };
  }
}

/**
 * Workflow execution state tracker
 */
interface WorkflowState {
  id: string;
  startTime: number;
  toolCallCount: number;
  totalCost: {
    tokens: number;
    apiCalls: number;
  };
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
}

/**
 * Browser Tool Registry
 * Central registry for managing and executing browser automation tools
 */
export class BrowserToolRegistry {
  private tools = new Map<string, BrowserToolDefinition>();
  private rateLimiter: RateLimiter;
  private workflowStates = new Map<string, WorkflowState>();
  private logger: Logger;
  private performanceMonitor: PerformanceMonitor;

  // Configuration
  private maxRequestsPerMinute = 100;
  private maxToolCallsPerWorkflow = 50;
  private defaultWorkflowTimeoutMs = 5 * 60 * 1000; // 5 minutes

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

    this.maxRequestsPerMinute =
      config?.maxRequestsPerMinute ?? this.maxRequestsPerMinute;
    this.maxToolCallsPerWorkflow =
      config?.maxToolCallsPerWorkflow ?? this.maxToolCallsPerWorkflow;
    this.defaultWorkflowTimeoutMs =
      config?.defaultWorkflowTimeoutMs ?? this.defaultWorkflowTimeoutMs;

    this.rateLimiter = new RateLimiter(this.maxRequestsPerMinute, 60000);

    this.logger.info("BrowserToolRegistry", "Initialized", {
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      maxToolCallsPerWorkflow: this.maxToolCallsPerWorkflow,
      defaultWorkflowTimeoutMs: this.defaultWorkflowTimeoutMs,
    });
  }

  /**
   * Register a tool in the registry
   */
  register<TInput = any, TOutput = any>(
    definition: BrowserToolDefinition<TInput, TOutput>,
  ): void {
    if (this.tools.has(definition.name)) {
      this.logger.warn(
        "BrowserToolRegistry",
        `Overwriting tool: ${definition.name}`,
      );
    }

    // Validate the tool definition
    this.validateToolDefinition(definition);

    this.tools.set(definition.name, definition);
    this.logger.info(
      "BrowserToolRegistry",
      `Registered tool: ${definition.name}`,
      {
        category: definition.category,
        complexity: definition.complexity,
        requiresHumanApproval: definition.requiresHumanApproval,
      },
    );
  }

  /**
   * Validate tool definition
   */
  private validateToolDefinition(definition: BrowserToolDefinition): void {
    if (!definition.name || typeof definition.name !== "string") {
      throw new Error("Tool name must be a non-empty string");
    }

    if (!definition.description || typeof definition.description !== "string") {
      throw new Error("Tool description must be a non-empty string");
    }

    if (!definition.parametersSchema) {
      throw new Error("Tool must have a parameters schema");
    }

    if (typeof definition.handler !== "function") {
      throw new Error("Tool handler must be a function");
    }
  }

  /**
   * Retrieve a tool by name
   */
  getTool(name: string): BrowserToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): BrowserToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): BrowserToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category,
    );
  }

  /**
   * Execute a tool with full validation, logging, and guardrails
   */
  async execute<TInput = any, TOutput = any>(
    toolName: string,
    input: TInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<TOutput>> {
    const startTime = Date.now();

    try {
      // Retrieve tool
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Check workflow state
      this.checkWorkflowState(context.workflowId);

      // Rate limiting
      if (!this.rateLimiter.isAllowed(context.workflowId)) {
        const usage = this.rateLimiter.getUsage(context.workflowId);
        throw new Error(
          `Rate limit exceeded: ${usage.current}/${usage.limit} requests per minute`,
        );
      }

      // Validate input against schema
      const validatedInput = tool.parametersSchema.parse(input);

      // Log execution start
      this.logger.info("BrowserToolRegistry", `Executing tool: ${toolName}`, {
        workflowId: context.workflowId,
        stepNumber: context.stepNumber,
        category: tool.category,
        complexity: tool.complexity,
        requiresHumanApproval: tool.requiresHumanApproval,
      });

      // Execute tool with performance monitoring
      const result = await this.performanceMonitor.measureAsync(
        `tool-execution-${toolName}`,
        () => tool.handler(validatedInput, context),
        {
          workflowId: context.workflowId,
          category: tool.category,
          complexity: tool.complexity,
        },
      );

      const executionTimeMs = Date.now() - startTime;

      // Update workflow state
      this.updateWorkflowState(context.workflowId, {
        toolCallCount: 1,
        cost: {
          tokens: 0,
          apiCalls: 1,
        },
      });

      // Log success
      this.logger.info(
        "BrowserToolRegistry",
        `Tool executed successfully: ${toolName}`,
        {
          workflowId: context.workflowId,
          executionTimeMs,
        },
      );

      // Record metrics
      this.recordToolMetrics(toolName, true, executionTimeMs, tool.complexity);

      return {
        success: true,
        data: result as TOutput,
        metadata: {
          executionTimeMs,
          complexity: tool.complexity,
          requiresHumanApproval: tool.requiresHumanApproval,
          cost: {
            apiCalls: 1,
          },
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        "BrowserToolRegistry",
        `Tool execution failed: ${toolName}`,
        {
          workflowId: context.workflowId,
          error: errorMessage,
          executionTimeMs,
        },
      );

      // Record failure metrics
      this.recordToolMetrics(toolName, false, executionTimeMs);

      return {
        success: false,
        error: {
          code:
            error instanceof z.ZodError
              ? "VALIDATION_ERROR"
              : "EXECUTION_ERROR",
          message: errorMessage,
          details: error instanceof z.ZodError ? error.errors : error,
        },
        metadata: {
          executionTimeMs,
          complexity: ToolComplexity.LOW,
          requiresHumanApproval: false,
        },
      };
    }
  }

  /**
   * Initialize workflow state
   */
  initializeWorkflow(workflowId: string): void {
    this.workflowStates.set(workflowId, {
      id: workflowId,
      startTime: Date.now(),
      toolCallCount: 0,
      totalCost: {
        tokens: 0,
        apiCalls: 0,
      },
      status: "running",
    });

    this.logger.info(
      "BrowserToolRegistry",
      `Workflow initialized: ${workflowId}`,
    );
  }

  /**
   * Check workflow state and enforce limits
   */
  private checkWorkflowState(workflowId: string): void {
    const state = this.workflowStates.get(workflowId);

    if (!state) {
      // Auto-initialize if not exists
      this.initializeWorkflow(workflowId);
      return;
    }

    // Check timeout
    const elapsed = Date.now() - state.startTime;
    if (elapsed > this.defaultWorkflowTimeoutMs) {
      this.updateWorkflowState(workflowId, { status: "failed" });
      throw new Error(
        `Workflow timeout: ${workflowId} exceeded ${this.defaultWorkflowTimeoutMs}ms`,
      );
    }

    // Check tool call limit
    if (state.toolCallCount >= this.maxToolCallsPerWorkflow) {
      this.updateWorkflowState(workflowId, { status: "failed" });
      throw new Error(
        `Workflow tool call limit exceeded: ${state.toolCallCount}/${this.maxToolCallsPerWorkflow}`,
      );
    }

    // Check status
    if (state.status === "paused") {
      throw new Error(`Workflow is paused: ${workflowId}`);
    }

    if (state.status === "cancelled") {
      throw new Error(`Workflow is cancelled: ${workflowId}`);
    }

    if (state.status === "failed") {
      throw new Error(`Workflow has failed: ${workflowId}`);
    }
  }

  /**
   * Update workflow state
   */
  private updateWorkflowState(
    workflowId: string,
    updates: {
      toolCallCount?: number;
      cost?: { tokens?: number; apiCalls?: number };
      status?: WorkflowState["status"];
    },
  ): void {
    const state = this.workflowStates.get(workflowId);
    if (!state) return;

    if (updates.toolCallCount !== undefined) {
      state.toolCallCount += updates.toolCallCount;
    }

    if (updates.cost) {
      state.totalCost.tokens += updates.cost.tokens || 0;
      state.totalCost.apiCalls += updates.cost.apiCalls || 0;
    }

    if (updates.status) {
      state.status = updates.status;
    }

    this.workflowStates.set(workflowId, state);
  }

  /**
   * Get workflow state
   */
  getWorkflowState(workflowId: string): WorkflowState | undefined {
    return this.workflowStates.get(workflowId);
  }

  /**
   * Pause workflow (for human approval)
   */
  pauseWorkflow(workflowId: string): void {
    this.updateWorkflowState(workflowId, { status: "paused" });
    this.logger.info("BrowserToolRegistry", `Workflow paused: ${workflowId}`);
  }

  /**
   * Resume workflow
   */
  resumeWorkflow(workflowId: string): void {
    this.updateWorkflowState(workflowId, { status: "running" });
    this.logger.info("BrowserToolRegistry", `Workflow resumed: ${workflowId}`);
  }

  /**
   * Cancel workflow
   */
  cancelWorkflow(workflowId: string): void {
    this.updateWorkflowState(workflowId, { status: "cancelled" });
    this.rateLimiter.reset(workflowId);
    this.logger.info(
      "BrowserToolRegistry",
      `Workflow cancelled: ${workflowId}`,
    );
  }

  /**
   * Complete workflow
   */
  completeWorkflow(workflowId: string): void {
    this.updateWorkflowState(workflowId, { status: "completed" });
    this.rateLimiter.reset(workflowId);
    this.logger.info(
      "BrowserToolRegistry",
      `Workflow completed: ${workflowId}`,
    );
  }

  /**
   * Record tool execution metrics
   */
  private recordToolMetrics(
    toolName: string,
    success: boolean,
    executionTimeMs: number,
    complexity?: ToolComplexity,
  ): void {
    this.performanceMonitor.recordMetric(
      `tool-${toolName}-${success ? "success" : "failure"}`,
      1,
      "count",
      { complexity },
    );

    this.performanceMonitor.recordMetric(
      `tool-${toolName}-duration`,
      executionTimeMs,
      "ms",
      { success, complexity },
    );
  }

  /**
   * Get tool usage summary for observability
   */
  getToolUsageSummary(): {
    totalTools: number;
    byCategory: Record<ToolCategory, number>;
    byComplexity: Record<ToolComplexity, number>;
  } {
    const tools = this.getAllTools();

    const byCategory: Record<ToolCategory, number> = {} as any;
    const byComplexity: Record<ToolComplexity, number> = {} as any;

    for (const tool of tools) {
      byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
      byComplexity[tool.complexity] = (byComplexity[tool.complexity] || 0) + 1;
    }

    return {
      totalTools: tools.length,
      byCategory,
      byComplexity,
    };
  }

  /**
   * Convert tool definitions to a format compatible with LLM tool calling
   * Returns tool definitions with name, description, and schema
   */
  toToolDefinitions(): Array<{
    name: string;
    description: string;
    parameters: any;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parametersSchema,
    }));
  }

  /**
   * Get tools that require human approval
   */
  getDestructiveTools(): BrowserToolDefinition[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.requiresHumanApproval,
    );
  }
}
