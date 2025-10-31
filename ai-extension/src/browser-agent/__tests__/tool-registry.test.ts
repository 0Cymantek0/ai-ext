/**
 * Tool Registry Tests
 * Tests for browser agent tool registry functionality
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  BrowserToolRegistry,
  ToolCategory,
  ToolComplexity,
  type BrowserToolDefinition,
  type ToolExecutionContext,
} from "../tool-registry.js";

// Mock logger
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getLogs: vi.fn(() => []),
};

// Mock performance monitor
const mockPerformanceMonitor = {
  recordMetric: vi.fn(),
  measureAsync: vi.fn(async (name, fn) => await fn()),
  getSummary: vi.fn(() => ({ totalMetrics: 0 })),
  startMonitoring: vi.fn(),
  stopMonitoring: vi.fn(),
};

describe("BrowserToolRegistry", () => {
  let registry: BrowserToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new BrowserToolRegistry(
      mockLogger as any,
      mockPerformanceMonitor as any,
      {
        maxRequestsPerMinute: 10,
        maxToolCallsPerWorkflow: 5,
        defaultWorkflowTimeoutMs: 1000,
      },
    );
  });

  describe("Tool Registration", () => {
    it("should register a valid tool", () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({ value: z.string() }),
        handler: vi.fn(async (input) => ({ result: input.value })),
      };

      registry.register(tool);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "BrowserToolRegistry",
        "Registered tool: test_tool",
        expect.objectContaining({
          category: ToolCategory.DOM_EXTRACTION,
          complexity: ToolComplexity.LOW,
          requiresHumanApproval: false,
        }),
      );

      const retrieved = registry.getTool("test_tool");
      expect(retrieved).toBe(tool);
    });

    it("should throw error for invalid tool definition (no name)", () => {
      const invalidTool: any = {
        description: "Missing name",
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      expect(() => registry.register(invalidTool)).toThrow(
        "Tool name must be a non-empty string",
      );
    });

    it("should throw error for invalid tool definition (no handler)", () => {
      const invalidTool: any = {
        name: "test",
        description: "Missing handler",
        parametersSchema: z.object({}),
      };

      expect(() => registry.register(invalidTool)).toThrow(
        "Tool handler must be a function",
      );
    });

    it("should warn when overwriting existing tool", () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(tool);
      registry.register(tool);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "BrowserToolRegistry",
        "Overwriting tool: test_tool",
      );
    });
  });

  describe("Tool Retrieval", () => {
    it("should retrieve registered tool by name", () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(tool);
      const retrieved = registry.getTool("test_tool");

      expect(retrieved).toBe(tool);
    });

    it("should return undefined for non-existent tool", () => {
      const retrieved = registry.getTool("non_existent");
      expect(retrieved).toBeUndefined();
    });

    it("should get all tools", () => {
      const tool1: BrowserToolDefinition = {
        name: "tool1",
        description: "Tool 1",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      const tool2: BrowserToolDefinition = {
        name: "tool2",
        description: "Tool 2",
        category: ToolCategory.NAVIGATION,
        complexity: ToolComplexity.MEDIUM,
        requiresHumanApproval: true,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(tool1);
      registry.register(tool2);

      const tools = registry.getAllTools();
      expect(tools).toHaveLength(2);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
    });

    it("should get tools by category", () => {
      const domTool: BrowserToolDefinition = {
        name: "dom_tool",
        description: "DOM tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      const navTool: BrowserToolDefinition = {
        name: "nav_tool",
        description: "Nav tool",
        category: ToolCategory.NAVIGATION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(domTool);
      registry.register(navTool);

      const domTools = registry.getToolsByCategory(ToolCategory.DOM_EXTRACTION);
      expect(domTools).toHaveLength(1);
      expect(domTools[0]).toBe(domTool);

      const navTools = registry.getToolsByCategory(ToolCategory.NAVIGATION);
      expect(navTools).toHaveLength(1);
      expect(navTools[0]).toBe(navTool);
    });
  });

  describe("Tool Execution", () => {
    it("should execute tool successfully", async () => {
      const handler = vi.fn(async (input: { value: string }) => ({
        result: input.value.toUpperCase(),
      }));

      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({ value: z.string() }),
        handler,
      };

      registry.register(tool);
      registry.initializeWorkflow("workflow1");

      const context: ToolExecutionContext = {
        workflowId: "workflow1",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      const result = await registry.execute(
        "test_tool",
        { value: "hello" },
        context,
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: "HELLO" });
      expect(handler).toHaveBeenCalledWith({ value: "hello" }, context);
      expect(mockPerformanceMonitor.measureAsync).toHaveBeenCalled();
    });

    it("should validate input against schema", async () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({
          value: z.string(),
          count: z.number(),
        }),
        handler: vi.fn(),
      };

      registry.register(tool);
      registry.initializeWorkflow("workflow1");

      const context: ToolExecutionContext = {
        workflowId: "workflow1",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      // Invalid input (missing count)
      const result = await registry.execute(
        "test_tool",
        { value: "hello" },
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should handle tool execution errors", async () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(async () => {
          throw new Error("Tool execution failed");
        }),
      };

      registry.register(tool);
      registry.initializeWorkflow("workflow1");

      const context: ToolExecutionContext = {
        workflowId: "workflow1",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      const result = await registry.execute("test_tool", {}, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Tool execution failed");
    });

    it("should fail if tool not found", async () => {
      registry.initializeWorkflow("workflow1");

      const context: ToolExecutionContext = {
        workflowId: "workflow1",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      const result = await registry.execute(
        "non_existent",
        {},
        context,
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Tool not found: non_existent");
    });
  });

  describe("Rate Limiting", () => {
    it("should enforce rate limiting", async () => {
      const rateRegistry = new BrowserToolRegistry(
        mockLogger as any,
        mockPerformanceMonitor as any,
        {
          maxRequestsPerMinute: 10,
          maxToolCallsPerWorkflow: 100,
          defaultWorkflowTimeoutMs: 1000,
        },
      );

      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(async () => ({ success: true })),
      };

      rateRegistry.register(tool);
      rateRegistry.initializeWorkflow("workflow-rate");

      const context: ToolExecutionContext = {
        workflowId: "workflow-rate",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      // Execute up to the limit (10 requests per minute in our test config)
      for (let i = 0; i < 10; i++) {
        const result = await rateRegistry.execute("test_tool", {}, context);
        expect(result.success).toBe(true);
      }

      // This should fail due to rate limiting
      const result = await rateRegistry.execute("test_tool", {}, context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Rate limit exceeded");
    });
  });

  describe("Workflow Management", () => {
    it("should initialize workflow", () => {
      registry.initializeWorkflow("workflow1");

      const state = registry.getWorkflowState("workflow1");
      expect(state).toBeDefined();
      expect(state?.id).toBe("workflow1");
      expect(state?.status).toBe("running");
      expect(state?.toolCallCount).toBe(0);
    });

    it("should enforce tool call limit per workflow", async () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(async () => ({ success: true })),
      };

      registry.register(tool);
      registry.initializeWorkflow("workflow1");

      const context: ToolExecutionContext = {
        workflowId: "workflow1",
        stepNumber: 1,
        timestamp: Date.now(),
      };

      // Execute up to limit (5 in our test config)
      for (let i = 0; i < 5; i++) {
        const result = await registry.execute("test_tool", {}, context);
        expect(result.success).toBe(true);
      }

      // This should fail due to tool call limit
      const result = await registry.execute("test_tool", {}, context);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("tool call limit exceeded");
    });

    it("should pause and resume workflow", async () => {
      registry.initializeWorkflow("workflow1");

      registry.pauseWorkflow("workflow1");
      let state = registry.getWorkflowState("workflow1");
      expect(state?.status).toBe("paused");

      registry.resumeWorkflow("workflow1");
      state = registry.getWorkflowState("workflow1");
      expect(state?.status).toBe("running");
    });

    it("should cancel workflow", () => {
      registry.initializeWorkflow("workflow1");

      registry.cancelWorkflow("workflow1");
      const state = registry.getWorkflowState("workflow1");
      expect(state?.status).toBe("cancelled");
    });

    it("should complete workflow", () => {
      registry.initializeWorkflow("workflow1");

      registry.completeWorkflow("workflow1");
      const state = registry.getWorkflowState("workflow1");
      expect(state?.status).toBe("completed");
    });
  });

  describe("Tool Usage Summary", () => {
    it("should generate usage summary", () => {
      const tool1: BrowserToolDefinition = {
        name: "tool1",
        description: "Tool 1",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      const tool2: BrowserToolDefinition = {
        name: "tool2",
        description: "Tool 2",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.MEDIUM,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      const tool3: BrowserToolDefinition = {
        name: "tool3",
        description: "Tool 3",
        category: ToolCategory.NAVIGATION,
        complexity: ToolComplexity.HIGH,
        requiresHumanApproval: true,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const summary = registry.getToolUsageSummary();

      expect(summary.totalTools).toBe(3);
      expect(summary.byCategory[ToolCategory.DOM_EXTRACTION]).toBe(2);
      expect(summary.byCategory[ToolCategory.NAVIGATION]).toBe(1);
      expect(summary.byComplexity[ToolComplexity.LOW]).toBe(1);
      expect(summary.byComplexity[ToolComplexity.MEDIUM]).toBe(1);
      expect(summary.byComplexity[ToolComplexity.HIGH]).toBe(1);
    });
  });

  describe("Destructive Tools", () => {
    it("should identify tools requiring human approval", () => {
      const safeTool: BrowserToolDefinition = {
        name: "safe_tool",
        description: "Safe tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      const destructiveTool: BrowserToolDefinition = {
        name: "destructive_tool",
        description: "Destructive tool",
        category: ToolCategory.NAVIGATION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: true,
        parametersSchema: z.object({}),
        handler: vi.fn(),
      };

      registry.register(safeTool);
      registry.register(destructiveTool);

      const destructive = registry.getDestructiveTools();
      expect(destructive).toHaveLength(1);
      expect(destructive[0]).toBe(destructiveTool);
    });
  });

  describe("LangChain Integration", () => {
    it("should convert tools to LangChain format", () => {
      const tool: BrowserToolDefinition = {
        name: "test_tool",
        description: "A test tool",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: z.object({ value: z.string() }),
        handler: vi.fn(async (input) => ({ result: input.value })),
      };

      registry.register(tool);

      const langChainTools = registry.toLangChainTools();
      expect(langChainTools).toHaveLength(1);
      expect(langChainTools[0].name).toBe("test_tool");
      expect(langChainTools[0].description).toBe("A test tool");
    });
  });
});
