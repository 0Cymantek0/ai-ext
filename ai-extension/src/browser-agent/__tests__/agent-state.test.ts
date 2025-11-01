/**
 * Agent State Tests
 * Unit tests for LangGraph State Manager
 * Requirements: Task 9 - LangGraph State Manager (Phase 2)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  WorkflowStateMachine,
  WorkflowStep,
  type BrowserAgentState,
  type CheckpointManager,
  type StateCheckpoint,
} from "../agent-state.js";
import { BrowserToolRegistry, ToolCategory, ToolComplexity } from "../tool-registry.js";

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

// Mock checkpoint manager
class MockCheckpointManager implements CheckpointManager {
  private checkpoints = new Map<string, StateCheckpoint>();
  private workflowCheckpoints = new Map<string, StateCheckpoint[]>();
  
  async saveCheckpoint(checkpoint: StateCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.checkpointId, checkpoint);
    
    const workflowId = checkpoint.workflowId;
    if (!this.workflowCheckpoints.has(workflowId)) {
      this.workflowCheckpoints.set(workflowId, []);
    }
    this.workflowCheckpoints.get(workflowId)!.push(checkpoint);
  }
  
  async loadCheckpoint(checkpointId: string): Promise<StateCheckpoint | null> {
    return this.checkpoints.get(checkpointId) ?? null;
  }
  
  async loadLatestCheckpoint(workflowId: string): Promise<StateCheckpoint | null> {
    const checkpoints = this.workflowCheckpoints.get(workflowId) || [];
    if (checkpoints.length === 0) return null;
    return checkpoints[checkpoints.length - 1];
  }
  
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    this.checkpoints.delete(checkpointId);
  }
  
  async deleteWorkflowCheckpoints(workflowId: string): Promise<void> {
    this.workflowCheckpoints.delete(workflowId);
    for (const [key, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.workflowId === workflowId) {
        this.checkpoints.delete(key);
      }
    }
  }
  
  async cleanupStaleCheckpoints(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    let deleted = 0;
    
    for (const [key, checkpoint] of this.checkpoints.entries()) {
      if (checkpoint.timestamp < cutoff) {
        this.checkpoints.delete(key);
        deleted++;
      }
    }
    
    return deleted;
  }
  
  async listWorkflowCheckpoints(workflowId: string): Promise<StateCheckpoint[]> {
    return this.workflowCheckpoints.get(workflowId) || [];
  }
}

describe("WorkflowStateMachine", () => {
  let stateManager: WorkflowStateMachine;
  let toolRegistry: BrowserToolRegistry;
  let checkpointManager: MockCheckpointManager;
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    toolRegistry = new BrowserToolRegistry(mockLogger as any, mockPerformanceMonitor as any);
    checkpointManager = new MockCheckpointManager();
    stateManager = new WorkflowStateMachine(
      toolRegistry,
      mockLogger as any,
      checkpointManager,
    );
    
    // Register mock tools
    toolRegistry.register({
      name: "navigate",
      description: "Navigate to URL",
      category: ToolCategory.NAVIGATION,
      complexity: ToolComplexity.LOW,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => ({ url: input.url, success: true }),
    });
    
    toolRegistry.register({
      name: "extractDOM",
      description: "Extract DOM content",
      category: ToolCategory.DOM_EXTRACTION,
      complexity: ToolComplexity.MEDIUM,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => ({ selector: input.selector, content: "mock content" }),
    });
    
    toolRegistry.register({
      name: "interact",
      description: "Interact with page",
      category: ToolCategory.INTERACTION,
      complexity: ToolComplexity.MEDIUM,
      requiresHumanApproval: false,
      parametersSchema: { parse: (input: any) => input } as any,
      handler: async (input: any) => ({ action: input.action, success: true }),
    });
  });
  
  describe("State Creation", () => {
    it("should create initial state with default values", () => {
      const workflowId = "test-workflow-1";
      const state = stateManager.createInitialState(workflowId);
      
      expect(state.workflowId).toBe(workflowId);
      expect(state.currentStep).toBe(WorkflowStep.START);
      expect(state.status).toBe("pending");
      expect(state.completedSteps).toEqual([]);
      expect(state.errors).toEqual([]);
      expect(state.variables).toEqual({});
      expect(state.paused).toBe(false);
      expect(state.retryCount).toBe(0);
      expect(state.maxRetries).toBe(3);
    });
    
    it("should create initial state with custom config", () => {
      const workflowId = "test-workflow-2";
      const config = {
        workflowId,
        steps: [WorkflowStep.NAVIGATE, WorkflowStep.EXTRACT_DOM],
        maxRetries: 5,
        timeoutMs: 10000,
        requireValidation: true,
      };
      
      const state = stateManager.createInitialState(workflowId, config);
      
      expect(state.maxRetries).toBe(5);
      expect(state.config?.timeoutMs).toBe(10000);
      expect(state.config?.requireValidation).toBe(true);
      expect(state.config?.maxSteps).toBe(2);
    });
  });
  
  describe("Workflow Lifecycle", () => {
    it("should start a new workflow", async () => {
      const workflowId = "test-workflow-3";
      const variables = { targetUrl: "https://example.com" };
      
      const state = await stateManager.startWorkflow(workflowId, variables);
      
      expect(state.workflowId).toBe(workflowId);
      expect(state.status).toBe("running");
      expect(state.variables).toEqual(variables);
    });
    
    it("should pause a workflow", async () => {
      const workflowId = "test-workflow-4";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      await stateManager.pauseWorkflow(workflowId, "User requested pause");
      
      const state = stateManager.getWorkflowStatus(workflowId);
      
      expect(state?.paused).toBe(true);
      expect(state?.status).toBe("paused");
      expect(state?.pauseReason).toBe("User requested pause");
    });
    
    it("should resume a paused workflow", async () => {
      const workflowId = "test-workflow-5";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      await stateManager.pauseWorkflow(workflowId, "Test pause");
      await stateManager.resumeWorkflow(workflowId);
      
      const state = stateManager.getWorkflowStatus(workflowId);
      
      expect(state?.paused).toBe(false);
      expect(state?.status).toBe("running");
      expect(state?.pauseReason).toBeUndefined();
    });
    
    it("should cancel a workflow", async () => {
      const workflowId = "test-workflow-6";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      await stateManager.cancelWorkflow(workflowId);
      
      const state = stateManager.getWorkflowStatus(workflowId);
      
      expect(state).toBeUndefined();
    });
    
    it("should merge user input on resume", async () => {
      const workflowId = "test-workflow-7";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      await stateManager.pauseWorkflow(workflowId);
      await stateManager.resumeWorkflow(workflowId, { additionalData: "new value" });
      
      const state = stateManager.getWorkflowStatus(workflowId);
      
      expect(state?.variables.targetUrl).toBe("https://example.com");
      expect(state?.variables.additionalData).toBe("new value");
    });
  });
  
  describe("Checkpoint Persistence", () => {
    it("should save checkpoints during workflow execution", async () => {
      const workflowId = "test-workflow-8";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      
      const checkpoints = await checkpointManager.listWorkflowCheckpoints(workflowId);
      
      expect(checkpoints.length).toBeGreaterThan(0);
      expect(checkpoints[0].workflowId).toBe(workflowId);
    });
    
    it("should load latest checkpoint for a workflow", async () => {
      const workflowId = "test-workflow-9";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      
      const checkpoint = await checkpointManager.loadLatestCheckpoint(workflowId);
      
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.workflowId).toBe(workflowId);
      expect(checkpoint?.state.workflowId).toBe(workflowId);
    });
    
    it("should resume from checkpoint after pause", async () => {
      const workflowId = "test-workflow-10";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      await stateManager.pauseWorkflow(workflowId, "Test");
      
      // Simulate service worker restart by loading from checkpoint
      const checkpoint = await checkpointManager.loadLatestCheckpoint(workflowId);
      expect(checkpoint).not.toBeNull();
      expect(checkpoint?.state.paused).toBe(true);
    });
    
    it("should cleanup stale checkpoints", async () => {
      const workflowId = "test-workflow-11";
      const variables = { targetUrl: "https://example.com" };
      
      await stateManager.startWorkflow(workflowId, variables);
      
      // Cleanup should not delete recent checkpoints
      await stateManager.cleanupStaleCheckpoints();
      
      const checkpoints = await checkpointManager.listWorkflowCheckpoints(workflowId);
      expect(checkpoints.length).toBeGreaterThan(0);
    });
  });
  
  describe("Concurrent Workflows", () => {
    it("should handle multiple workflows concurrently", async () => {
      const workflow1 = "concurrent-1";
      const workflow2 = "concurrent-2";
      const workflow3 = "concurrent-3";
      
      await Promise.all([
        stateManager.startWorkflow(workflow1, { targetUrl: "https://example1.com" }),
        stateManager.startWorkflow(workflow2, { targetUrl: "https://example2.com" }),
        stateManager.startWorkflow(workflow3, { targetUrl: "https://example3.com" }),
      ]);
      
      const workflows = stateManager.getAllWorkflows();
      
      expect(workflows.length).toBe(3);
      expect(workflows.map((w) => w.workflowId)).toContain(workflow1);
      expect(workflows.map((w) => w.workflowId)).toContain(workflow2);
      expect(workflows.map((w) => w.workflowId)).toContain(workflow3);
    });
    
    it("should maintain isolation between workflows", async () => {
      const workflow1 = "isolation-1";
      const workflow2 = "isolation-2";
      
      const state1 = await stateManager.startWorkflow(workflow1, {
        targetUrl: "https://example1.com",
      });
      const state2 = await stateManager.startWorkflow(workflow2, {
        targetUrl: "https://example2.com",
      });
      
      expect(state1.variables.targetUrl).toBe("https://example1.com");
      expect(state2.variables.targetUrl).toBe("https://example2.com");
      
      // Modify one workflow
      await stateManager.pauseWorkflow(workflow1);
      
      // Check other workflow is unaffected
      const workflow2State = stateManager.getWorkflowStatus(workflow2);
      expect(workflow2State?.paused).toBe(false);
      expect(workflow2State?.status).toBe("running");
    });
  });
  
  describe("Error Handling", () => {
    it("should track errors in workflow state", async () => {
      const workflowId = "error-workflow-1";
      
      // Create state without required variable
      const state = await stateManager.startWorkflow(workflowId, {});
      
      // Errors would be captured during execution
      expect(state.errors).toEqual([]);
    });
    
    it("should handle missing workflow gracefully", async () => {
      await expect(async () => {
        await stateManager.pauseWorkflow("non-existent-workflow");
      }).rejects.toThrow();
    });
    
    it("should handle resume of non-paused workflow", async () => {
      const workflowId = "resume-error-1";
      
      await stateManager.startWorkflow(workflowId, { targetUrl: "https://example.com" });
      
      // Try to resume without pausing first
      await expect(async () => {
        await stateManager.resumeWorkflow(workflowId);
      }).rejects.toThrow();
    });
  });
  
  describe("State Hydration", () => {
    it("should hydrate workflow state from persistence", () => {
      const workflowId = "hydrate-1";
      const state: BrowserAgentState = {
        workflowId,
        currentStep: WorkflowStep.NAVIGATE,
        status: "paused",
        startTime: Date.now(),
        lastUpdate: Date.now(),
        completedSteps: [WorkflowStep.START],
        errors: [],
        variables: { targetUrl: "https://example.com" },
        paused: true,
        retryCount: 0,
        maxRetries: 3,
        backoffMs: 1000,
      };
      
      stateManager.hydrateWorkflowState(state);
      
      const hydratedState = stateManager.getWorkflowStatus(workflowId);
      expect(hydratedState).toEqual(state);
    });
  });
  
  describe("Custom Node Functions", () => {
    it("should register custom node functions", () => {
      const customFn = vi.fn(async (state: BrowserAgentState) => ({
        variables: { ...state.variables, custom: true },
      }));
      
      stateManager.registerNodeFunction(WorkflowStep.VALIDATE, customFn);
      
      // Verify function is registered (would be called during execution)
      expect(mockLogger.info).toHaveBeenCalledWith(
        "LangGraphStateManager",
        expect.stringContaining("Registered custom node function"),
      );
    });
  });
});
