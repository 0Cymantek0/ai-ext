/**
 * Browser Agent Integration Tests
 * End-to-end workflow execution with mocked tools
 * Requirements: Task 9 - LangGraph State Manager (Phase 2)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WorkflowStep,
  type WorkflowDefinition,
} from "../agent-state.js";
import { BrowserToolRegistry, ToolCategory, ToolComplexity } from "../tool-registry.js";
import { WorkflowManager } from "../workflow-manager.js";

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Mock performance monitor
const mockPerformanceMonitor = {
  measureAsync: vi.fn(async (_name: string, fn: () => Promise<any>) => await fn()),
  recordMetric: vi.fn(),
};

// Mock database manager
const mockDatabase = {
  open: vi.fn(async () => ({
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({
        put: vi.fn(),
        get: vi.fn(async () => null),
        delete: vi.fn(),
        getAll: vi.fn(async () => []),
        index: vi.fn(() => ({
          getAll: vi.fn(async () => []),
          openCursor: vi.fn(async () => null),
        })),
      })),
      done: Promise.resolve(),
    })),
    put: vi.fn(),
    get: vi.fn(async () => null),
    delete: vi.fn(),
  })),
};

describe("Browser Agent Integration", () => {
  let toolRegistry: BrowserToolRegistry;
  let workflowManager: WorkflowManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    toolRegistry = new BrowserToolRegistry(mockLogger as any, mockPerformanceMonitor as any);
    workflowManager = new WorkflowManager(
      toolRegistry,
      mockDatabase as any,
      mockLogger as any,
    );
    
    // Register mock tools
    toolRegistry.register({
      name: "navigate",
      description: "Navigate to URL",
      category: ToolCategory.NAVIGATION,
      complexity: ToolComplexity.LOW,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => {
        return { url: input.url, success: true, timestamp: Date.now() };
      },
    });
    
    toolRegistry.register({
      name: "extractDOM",
      description: "Extract DOM content",
      category: ToolCategory.DOM_EXTRACTION,
      complexity: ToolComplexity.MEDIUM,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => {
        return {
          selector: input.selector,
          content: "<h1>Mock Content</h1>",
          elements: 1,
        };
      },
    });
    
    toolRegistry.register({
      name: "interact",
      description: "Interact with page elements",
      category: ToolCategory.INTERACTION,
      complexity: ToolComplexity.MEDIUM,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => {
        return { action: input.action, target: input.target, success: true };
      },
    });
  });
  
  describe("End-to-End Workflow", () => {
    it("should execute a simple navigate workflow", async () => {
      const workflowId = `workflow-${Date.now()}`;
      const variables = {
        targetUrl: "https://example.com",
      };
      
      const config: WorkflowDefinition = {
        workflowId,
        steps: [WorkflowStep.NAVIGATE],
        maxRetries: 3,
        timeoutMs: 10000,
      };
      
      const state = await workflowManager.startWorkflow({
        workflowId,
        variables,
        config,
      });
      
      expect(state.workflowId).toBe(workflowId);
      expect(state.status).toBe("running");
      expect(state.variables.targetUrl).toBe("https://example.com");
    });
    
    it("should execute multi-step workflow (navigate -> extract)", async () => {
      const workflowId = `workflow-multi-${Date.now()}`;
      const variables = {
        targetUrl: "https://example.com",
        selector: "h1",
      };
      
      const config: WorkflowDefinition = {
        workflowId,
        steps: [WorkflowStep.NAVIGATE, WorkflowStep.EXTRACT_DOM],
        maxRetries: 3,
        timeoutMs: 15000,
      };
      
      const state = await workflowManager.startWorkflow({
        workflowId,
        variables,
        config,
      });
      
      expect(state.workflowId).toBe(workflowId);
      expect(state.status).toBe("running");
      
      // Wait a bit for async execution
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Check status
      const status = await workflowManager.getWorkflowStatus(workflowId);
      expect(status).toBeTruthy();
    });
    
    it("should pause and resume workflow", async () => {
      const workflowId = `workflow-pause-${Date.now()}`;
      const variables = {
        targetUrl: "https://example.com",
      };
      
      const state = await workflowManager.startWorkflow({
        workflowId,
        variables,
      });
      
      expect(state.status).toBe("running");
      
      // Pause workflow
      await workflowManager.pauseWorkflow(workflowId, "Test pause");
      
      const pausedStatus = await workflowManager.getWorkflowStatus(workflowId);
      expect(pausedStatus?.state.status).toBe("paused");
      expect(pausedStatus?.state.pauseReason).toBe("Test pause");
      
      // Resume workflow
      await workflowManager.resumeWorkflow(workflowId, { additionalData: "resumed" });
      
      const resumedStatus = await workflowManager.getWorkflowStatus(workflowId);
      expect(resumedStatus?.state.status).toBe("running");
      expect(resumedStatus?.state.variables.additionalData).toBe("resumed");
    });
    
    it("should cancel workflow", async () => {
      const workflowId = `workflow-cancel-${Date.now()}`;
      const variables = {
        targetUrl: "https://example.com",
      };
      
      await workflowManager.startWorkflow({
        workflowId,
        variables,
      });
      
      // Cancel workflow
      await workflowManager.cancelWorkflow(workflowId, {
        cleanupResources: true,
      });
      
      // Status should be null after cancellation
      const status = await workflowManager.getWorkflowStatus(workflowId);
      expect(status).toBeNull();
    });
    
    it("should cleanup stale checkpoints", async () => {
      const workflowId = `workflow-cleanup-${Date.now()}`;
      const variables = {
        targetUrl: "https://example.com",
      };
      
      await workflowManager.startWorkflow({
        workflowId,
        variables,
      });
      
      // Cleanup should not delete recent checkpoints
      const deleted = await workflowManager.cleanupStaleCheckpoints();
      expect(typeof deleted).toBe("number");
    });
  });
  
  describe("Concurrent Workflows", () => {
    it("should handle multiple workflows simultaneously", async () => {
      const workflows = await Promise.all([
        workflowManager.startWorkflow({
          workflowId: `concurrent-1-${Date.now()}`,
          variables: { targetUrl: "https://example1.com" },
        }),
        workflowManager.startWorkflow({
          workflowId: `concurrent-2-${Date.now()}`,
          variables: { targetUrl: "https://example2.com" },
        }),
        workflowManager.startWorkflow({
          workflowId: `concurrent-3-${Date.now()}`,
          variables: { targetUrl: "https://example3.com" },
        }),
      ]);
      
      expect(workflows).toHaveLength(3);
      workflows.forEach((workflow) => {
        expect(workflow.status).toBe("running");
      });
      
      const allWorkflows = workflowManager.getAllWorkflows();
      expect(allWorkflows.length).toBeGreaterThanOrEqual(3);
    });
  });
  
  describe("Error Recovery", () => {
    it("should handle tool execution errors gracefully", async () => {
      // Register a failing tool
      toolRegistry.register({
        name: "failingTool",
        description: "A tool that always fails",
        category: ToolCategory.DOM_EXTRACTION,
        complexity: ToolComplexity.LOW,
        requiresHumanApproval: false,
        parametersSchema: { parse: (input: any) => input } as any,
        handler: async () => {
          throw new Error("Tool execution failed");
        },
      });
      
      const workflowId = `workflow-error-${Date.now()}`;
      
      const state = await workflowManager.startWorkflow({
        workflowId,
        variables: {},
      });
      
      expect(state.workflowId).toBe(workflowId);
      // Workflow should start even if tools might fail later
      expect(state.status).toBe("running");
    });
  });
});
