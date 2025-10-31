/**
 * Browser Agent State Manager
 * State machine for orchestrating multi-step workflows with 
 * checkpoint persistence, retry logic, and pause/resume/cancel support.
 * Requirements: Task 9 - LangGraph State Manager (Phase 2)
 */

import { z } from "zod";
import type { BrowserToolRegistry } from "./tool-registry.js";
import type { Logger } from "../background/monitoring.js";

/**
 * Workflow step enumeration defining state machine nodes
 */
export enum WorkflowStep {
  START = "START",
  NAVIGATE = "NAVIGATE",
  EXTRACT_DOM = "EXTRACT_DOM",
  INTERACT = "INTERACT",
  VALIDATE = "VALIDATE",
  END = "END",
}

/**
 * Workflow error with categorization and retry metadata
 */
export interface WorkflowError {
  code: string;
  message: string;
  step: WorkflowStep;
  timestamp: number;
  retryable: boolean;
  retryCount?: number;
  details?: unknown;
}

/**
 * State checkpoint for persistence and recovery
 */
export interface StateCheckpoint {
  checkpointId: string;
  workflowId: string;
  step: WorkflowStep;
  state: BrowserAgentState;
  timestamp: number;
  success: boolean;
  duration?: number;
}

/**
 * Browser Agent State definition for state machine
 */
export interface BrowserAgentState {
  workflowId: string;
  currentStep: WorkflowStep;
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  tabId?: number;
  userId?: string;
  
  // Workflow execution data
  startTime: number;
  lastUpdate: number;
  completedSteps: WorkflowStep[];
  errors: WorkflowError[];
  
  // Step-specific data
  variables: Record<string, unknown>;
  
  // Navigation state
  currentUrl?: string;
  targetUrl?: string;
  
  // DOM extraction state
  extractedData?: unknown;
  
  // Interaction state
  interactionResults?: unknown[];
  
  // Validation state
  validationResult?: {
    success: boolean;
    message: string;
    data?: unknown;
  };
  
  // Pause/resume state
  paused: boolean;
  pauseReason?: string;
  pauseTimestamp?: number;
  
  // Retry state
  retryCount: number;
  maxRetries: number;
  backoffMs: number;
  
  // Workflow configuration
  config?: {
    maxSteps?: number;
    timeoutMs?: number;
    requireValidation?: boolean;
    branchingLogic?: Record<string, WorkflowStep>;
  };
}

/**
 * Workflow definition schema
 */
export const WorkflowDefinitionSchema = z.object({
  workflowId: z.string(),
  steps: z.array(z.nativeEnum(WorkflowStep)),
  branchingLogic: z.record(z.string(), z.nativeEnum(WorkflowStep)).optional(),
  maxRetries: z.number().default(3),
  timeoutMs: z.number().default(5 * 60 * 1000),
  requireValidation: z.boolean().default(false),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/**
 * Workflow execution context
 */
export interface WorkflowExecutionContext {
  workflowId: string;
  state: BrowserAgentState;
  toolRegistry: BrowserToolRegistry;
  logger: Logger;
  checkpointManager: CheckpointManager;
}

/**
 * Checkpoint Manager interface for persistence
 */
export interface CheckpointManager {
  saveCheckpoint(checkpoint: StateCheckpoint): Promise<void>;
  loadCheckpoint(checkpointId: string): Promise<StateCheckpoint | null>;
  loadLatestCheckpoint(workflowId: string): Promise<StateCheckpoint | null>;
  deleteCheckpoint(checkpointId: string): Promise<void>;
  deleteWorkflowCheckpoints(workflowId: string): Promise<void>;
  cleanupStaleCheckpoints(olderThanMs: number): Promise<number>;
  listWorkflowCheckpoints(workflowId: string): Promise<StateCheckpoint[]>;
}

/**
 * LangGraph Node Function type
 */
export type NodeFunction = (
  state: BrowserAgentState,
  context: WorkflowExecutionContext,
) => Promise<Partial<BrowserAgentState>>;

/**
 * State Manager
 * Orchestrates multi-step browser agent workflows
 */
export class LangGraphStateManager {
  private toolRegistry: BrowserToolRegistry;
  private logger: Logger;
  private checkpointManager: CheckpointManager;
  private workflowStates = new Map<string, BrowserAgentState>();
  
  // Node function registry
  private nodeFunctions = new Map<WorkflowStep, NodeFunction>();
  
  constructor(
    toolRegistry: BrowserToolRegistry,
    logger: Logger,
    checkpointManager: CheckpointManager,
  ) {
    this.toolRegistry = toolRegistry;
    this.logger = logger;
    this.checkpointManager = checkpointManager;
    
    // Register default node functions
    this.registerDefaultNodeFunctions();
    
    this.logger.info("LangGraphStateManager", "Initialized");
  }
  
  /**
   * Register default node functions for standard workflow steps
   */
  private registerDefaultNodeFunctions(): void {
    // Navigate node
    this.nodeFunctions.set(WorkflowStep.NAVIGATE, async (state, context) => {
      const { targetUrl } = state.variables;
      
      if (!targetUrl || typeof targetUrl !== "string") {
        throw new Error("Navigate step requires 'targetUrl' variable");
      }
      
      const result = await context.toolRegistry.execute(
        "navigate_to_url",
        { url: targetUrl, waitForLoad: true },
        {
          workflowId: state.workflowId,
          stepNumber: state.completedSteps.length + 1,
          timestamp: Date.now(),
          ...(state.tabId !== undefined && { tabId: state.tabId }),
          ...(state.userId !== undefined && { userId: state.userId }),
        },
      );
      
      if (!result.success) {
        throw new Error(`Navigation failed: ${result.error?.message}`);
      }
      
      return {
        currentUrl: targetUrl,
        targetUrl,
        variables: {
          ...state.variables,
          navigationResult: result.data,
        },
      };
    });
    
    // Extract DOM node
    this.nodeFunctions.set(WorkflowStep.EXTRACT_DOM, async (state, context) => {
      const { selector } = state.variables;
      
      const result = await context.toolRegistry.execute(
        "extract_page_content",
        { selector: selector as string | undefined || undefined, sanitize: true },
        {
          workflowId: state.workflowId,
          stepNumber: state.completedSteps.length + 1,
          timestamp: Date.now(),
          ...(state.tabId !== undefined && { tabId: state.tabId }),
          ...(state.userId !== undefined && { userId: state.userId }),
        },
      );
      
      if (!result.success) {
        throw new Error(`DOM extraction failed: ${result.error?.message}`);
      }
      
      return {
        extractedData: result.data,
        variables: {
          ...state.variables,
          extractionResult: result.data,
        },
      };
    });
    
    // Interact node
    this.nodeFunctions.set(WorkflowStep.INTERACT, async (state, context) => {
      const { interactions } = state.variables;
      
      if (!Array.isArray(interactions)) {
        // If no interactions array, skip this step
        return {
          interactionResults: [],
          variables: {
            ...state.variables,
            interactionResults: [],
          },
        };
      }
      
      const results: unknown[] = [];
      
      for (const interaction of interactions) {
        const { type, ...params } = interaction as any;
        let toolName: string;
        
        // Map interaction type to tool name
        switch (type) {
          case "click":
            toolName = "click_element";
            break;
          case "type":
            toolName = "type_text";
            break;
          case "scroll":
            toolName = "scroll_to_element";
            break;
          default:
            throw new Error(`Unknown interaction type: ${type}`);
        }
        
        const result = await context.toolRegistry.execute(
          toolName,
          params,
          {
            workflowId: state.workflowId,
            stepNumber: state.completedSteps.length + 1,
            timestamp: Date.now(),
            ...(state.tabId !== undefined && { tabId: state.tabId }),
            ...(state.userId !== undefined && { userId: state.userId }),
          },
        );
        
        if (!result.success) {
          throw new Error(`Interaction failed: ${result.error?.message}`);
        }
        
        results.push(result.data);
      }
      
      return {
        interactionResults: results,
        variables: {
          ...state.variables,
          interactionResults: results,
        },
      };
    });
    
    // Validate node
    this.nodeFunctions.set(WorkflowStep.VALIDATE, async (state) => {
      const { validationFn, expectedValue } = state.variables;
      
      let success = true;
      let message = "Validation passed";
      let data: unknown;
      
      if (typeof validationFn === "function") {
        const result = await validationFn(state);
        success = result.success ?? true;
        message = result.message ?? message;
        data = result.data;
      } else if (expectedValue !== undefined) {
        const actualValue = state.variables.actualValue;
        success = actualValue === expectedValue;
        message = success
          ? "Validation passed"
          : `Expected ${expectedValue}, got ${actualValue}`;
        data = { expected: expectedValue, actual: actualValue };
      }
      
      return {
        validationResult: {
          success,
          message,
          data,
        },
        variables: {
          ...state.variables,
          validationPassed: success,
        },
      };
    });
  }
  
  /**
   * Register a custom node function for a specific step
   */
  registerNodeFunction(step: WorkflowStep, fn: NodeFunction): void {
    this.nodeFunctions.set(step, fn);
    this.logger.info("LangGraphStateManager", `Registered custom node function for ${step}`);
  }
  
  /**
   * Execute a node with error handling and checkpointing
   */
  private async executeNode(
    step: WorkflowStep,
    state: BrowserAgentState,
  ): Promise<Partial<BrowserAgentState>> {
    const startTime = Date.now();
    const context: WorkflowExecutionContext = {
      workflowId: state.workflowId,
      state,
      toolRegistry: this.toolRegistry,
      logger: this.logger,
      checkpointManager: this.checkpointManager,
    };
    
    try {
      // Check if paused
      if (state.paused) {
        this.logger.info("LangGraphStateManager", `Workflow ${state.workflowId} is paused at ${step}`);
        return { currentStep: step };
      }
      
      // Validate prerequisites
      await this.validatePrerequisites(step, state);
      
      // Get node function
      const nodeFunction = this.nodeFunctions.get(step);
      if (!nodeFunction) {
        throw new Error(`No node function registered for step: ${step}`);
      }
      
      this.logger.info("LangGraphStateManager", `Executing step ${step}`, {
        workflowId: state.workflowId,
      });
      
      // Execute node with retry logic
      const updates = await this.executeWithRetry(
        async () => await nodeFunction(state, context),
        state,
        step,
      );
      
      // Update state
      const updatedState: Partial<BrowserAgentState> = {
        ...updates,
        currentStep: step,
        lastUpdate: Date.now(),
        completedSteps: [...state.completedSteps, step],
        retryCount: 0,
      };
      
      // Save checkpoint
      await this.saveCheckpoint(state.workflowId, step, {
        ...state,
        ...updatedState,
      } as BrowserAgentState);
      
      this.logger.info("LangGraphStateManager", `Step ${step} completed`, {
        workflowId: state.workflowId,
        duration: Date.now() - startTime,
      });
      
      return updatedState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error("LangGraphStateManager", `Step ${step} failed`, {
        workflowId: state.workflowId,
        error: errorMessage,
      });
      
      const workflowError: WorkflowError = {
        code: "STEP_EXECUTION_FAILED",
        message: errorMessage,
        step,
        timestamp: Date.now(),
        retryable: state.retryCount < state.maxRetries,
        retryCount: state.retryCount,
        details: error,
      };
      
      return {
        currentStep: step,
        status: "failed",
        errors: [...state.errors, workflowError],
        lastUpdate: Date.now(),
      };
    }
  }
  
  /**
   * Execute a function with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    state: BrowserAgentState,
    step: WorkflowStep,
  ): Promise<T> {
    let lastError: Error | unknown;
    
    for (let attempt = 0; attempt <= state.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt < state.maxRetries) {
          const backoff = state.backoffMs * Math.pow(2, attempt);
          
          this.logger.warn("LangGraphStateManager", `Step ${step} failed, retrying in ${backoff}ms`, {
            workflowId: state.workflowId,
            attempt: attempt + 1,
            maxRetries: state.maxRetries,
          });
          
          await new Promise((resolve) => setTimeout(resolve, backoff));
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Validate step prerequisites before execution
   */
  private async validatePrerequisites(
    step: WorkflowStep,
    state: BrowserAgentState,
  ): Promise<void> {
    // Check tab existence
    if (state.tabId !== undefined) {
      try {
        await chrome.tabs.get(state.tabId);
      } catch (error) {
        throw new Error(`Tab ${state.tabId} no longer exists`);
      }
    }
    
    // Check required steps
    const requiredSteps = this.getRequiredSteps(step);
    for (const requiredStep of requiredSteps) {
      if (!state.completedSteps.includes(requiredStep)) {
        throw new Error(`Step ${step} requires ${requiredStep} to be completed first`);
      }
    }
    
    // Check required variables
    const requiredVars = this.getRequiredVariables(step);
    for (const varName of requiredVars) {
      if (!(varName in state.variables)) {
        throw new Error(`Step ${step} requires variable '${varName}'`);
      }
    }
  }
  
  /**
   * Get required steps for a given step
   */
  private getRequiredSteps(step: WorkflowStep): WorkflowStep[] {
    const requirements: Record<WorkflowStep, WorkflowStep[]> = {
      [WorkflowStep.START]: [],
      [WorkflowStep.NAVIGATE]: [],
      [WorkflowStep.EXTRACT_DOM]: [WorkflowStep.NAVIGATE],
      [WorkflowStep.INTERACT]: [WorkflowStep.NAVIGATE],
      [WorkflowStep.VALIDATE]: [],
      [WorkflowStep.END]: [],
    };
    
    return requirements[step] || [];
  }
  
  /**
   * Get required variables for a given step
   */
  private getRequiredVariables(step: WorkflowStep): string[] {
    const requirements: Record<WorkflowStep, string[]> = {
      [WorkflowStep.START]: [],
      [WorkflowStep.NAVIGATE]: ["targetUrl"],
      [WorkflowStep.EXTRACT_DOM]: [],
      [WorkflowStep.INTERACT]: ["interactions"],
      [WorkflowStep.VALIDATE]: [],
      [WorkflowStep.END]: [],
    };
    
    return requirements[step] || [];
  }
  
  /**
   * Determine next step based on state and branching logic
   */
  private determineNextStep(
    state: BrowserAgentState,
    currentStep: WorkflowStep,
  ): WorkflowStep | null {
    // Check for custom branching logic
    const branchingLogic = state.config?.branchingLogic;
    if (branchingLogic) {
      const nextStep = branchingLogic[currentStep];
      if (nextStep) {
        return nextStep;
      }
    }
    
    // Default flow: NAVIGATE → EXTRACT_DOM → INTERACT → VALIDATE → END
    const defaultFlow: Record<WorkflowStep, WorkflowStep | null> = {
      [WorkflowStep.START]: WorkflowStep.NAVIGATE,
      [WorkflowStep.NAVIGATE]: WorkflowStep.EXTRACT_DOM,
      [WorkflowStep.EXTRACT_DOM]: WorkflowStep.INTERACT,
      [WorkflowStep.INTERACT]: WorkflowStep.VALIDATE,
      [WorkflowStep.VALIDATE]: null,
      [WorkflowStep.END]: null,
    };
    
    // Check if validation failed and config requires validation
    if (
      currentStep === WorkflowStep.VALIDATE &&
      state.config?.requireValidation &&
      state.validationResult &&
      !state.validationResult.success
    ) {
      return null; // Stop workflow on validation failure
    }
    
    return defaultFlow[currentStep] ?? null;
  }
  
  /**
   * Save checkpoint to persistence layer
   */
  private async saveCheckpoint(
    workflowId: string,
    step: WorkflowStep,
    state: BrowserAgentState,
  ): Promise<void> {
    const checkpoint: StateCheckpoint = {
      checkpointId: `${workflowId}-${step}-${Date.now()}`,
      workflowId,
      step,
      state,
      timestamp: Date.now(),
      success: true,
    };
    
    try {
      await this.checkpointManager.saveCheckpoint(checkpoint);
      
      this.logger.debug("LangGraphStateManager", "Checkpoint saved", {
        checkpointId: checkpoint.checkpointId,
        workflowId,
        step,
      });
    } catch (error) {
      this.logger.error("LangGraphStateManager", "Failed to save checkpoint", {
        workflowId,
        step,
        error,
      });
      // Don't throw - checkpoint failure shouldn't stop workflow
    }
  }
  
  /**
   * Create initial state for a new workflow
   */
  createInitialState(workflowId: string, config?: WorkflowDefinition): BrowserAgentState {
    const now = Date.now();
    
    const workflowConfig = config
      ? {
          ...(Array.isArray(config.steps) ? { maxSteps: config.steps.length } : {}),
          ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
          ...(config.requireValidation !== undefined
            ? { requireValidation: config.requireValidation }
            : {}),
          ...(config.branchingLogic ? { branchingLogic: config.branchingLogic } : {}),
        }
      : undefined;
    
    return {
      workflowId,
      currentStep: WorkflowStep.START,
      status: "pending",
      startTime: now,
      lastUpdate: now,
      completedSteps: [],
      errors: [],
      variables: {},
      paused: false,
      retryCount: 0,
      maxRetries: config?.maxRetries ?? 3,
      backoffMs: 1000,
      ...(workflowConfig ? { config: workflowConfig } : {}),
    };
  }
  
  /**
   * Start a new workflow
   */
  async startWorkflow(
    workflowId: string,
    initialVariables: Record<string, unknown>,
    config?: WorkflowDefinition,
  ): Promise<BrowserAgentState> {
    const state = this.createInitialState(workflowId, config);
    state.variables = initialVariables;
    state.status = "running";
    
    this.workflowStates.set(workflowId, state);
    
    this.logger.info("LangGraphStateManager", "Workflow started", {
      workflowId,
      config,
    });
    
    // Save initial checkpoint
    await this.saveCheckpoint(workflowId, WorkflowStep.START, state);
    
    return state;
  }
  
  /**
   * Execute workflow steps
   */
  async executeWorkflow(workflowId: string): Promise<BrowserAgentState> {
    let state = this.workflowStates.get(workflowId);
    
    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    let currentStep = this.determineNextStep(state, state.currentStep);
    
    while (currentStep !== null && state.status === "running" && !state.paused) {
      const updates = await this.executeNode(currentStep, state);
      state = { ...state, ...updates };
      this.workflowStates.set(workflowId, state);
      
      if (state.status === "failed") {
        break;
      }
      
      currentStep = this.determineNextStep(state, currentStep);
    }
    
    if (currentStep === null && state.status === "running") {
      state.status = "completed";
      state.lastUpdate = Date.now();
      this.workflowStates.set(workflowId, state);
    }
    
    return state;
  }
  
  /**
   * Pause a workflow
   */
  async pauseWorkflow(
    workflowId: string,
    reason?: string,
  ): Promise<void> {
    const state = this.workflowStates.get(workflowId);
    
    if (!state) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    state.paused = true;
    if (reason !== undefined) {
      state.pauseReason = reason;
    } else {
      delete state.pauseReason;
    }
    state.pauseTimestamp = Date.now();
    state.status = "paused";
    state.lastUpdate = Date.now();
    
    this.workflowStates.set(workflowId, state);
    
    // Save checkpoint
    await this.saveCheckpoint(workflowId, state.currentStep, state);
    
    this.logger.info("LangGraphStateManager", "Workflow paused", {
      workflowId,
      reason,
    });
  }
  
  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(
    workflowId: string,
    userInput?: Record<string, unknown>,
  ): Promise<void> {
    const state = this.workflowStates.get(workflowId);
    
    if (!state) {
      // Try to load from checkpoint
      const checkpoint = await this.checkpointManager.loadLatestCheckpoint(workflowId);
      
      if (!checkpoint) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      
      this.workflowStates.set(workflowId, checkpoint.state);
      return this.resumeWorkflow(workflowId, userInput);
    }
    
    if (!state.paused) {
      throw new Error(`Workflow is not paused: ${workflowId}`);
    }
    
    state.paused = false;
    delete state.pauseReason;
    delete state.pauseTimestamp;
    state.status = "running";
    state.lastUpdate = Date.now();
    
    // Merge user input into variables
    if (userInput) {
      state.variables = {
        ...state.variables,
        ...userInput,
      };
    }
    
    this.workflowStates.set(workflowId, state);
    
    this.logger.info("LangGraphStateManager", "Workflow resumed", {
      workflowId,
      hasUserInput: !!userInput,
    });
  }
  
  /**
   * Cancel a workflow
   */
  async cancelWorkflow(
    workflowId: string,
    options?: { cleanupResources?: boolean; closeTabs?: boolean },
  ): Promise<void> {
    const state = this.workflowStates.get(workflowId);
    
    if (state) {
      state.status = "cancelled";
      state.lastUpdate = Date.now();
      
      // Close tabs created by workflow if requested
      if (options?.closeTabs && state.tabId) {
        try {
          await chrome.tabs.remove(state.tabId);
        } catch (error) {
          this.logger.warn("LangGraphStateManager", "Failed to close tab", {
            workflowId,
            tabId: state.tabId,
            error,
          });
        }
      }
    }
    
    // Cleanup resources
    if (options?.cleanupResources) {
      await this.checkpointManager.deleteWorkflowCheckpoints(workflowId);
    }
    
    this.workflowStates.delete(workflowId);
    
    this.logger.info("LangGraphStateManager", "Workflow cancelled", {
      workflowId,
      options,
    });
  }
  
  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId: string): BrowserAgentState | undefined {
    return this.workflowStates.get(workflowId);
  }
  
  /**
   * Hydrate workflow state from persistence
   */
  hydrateWorkflowState(state: BrowserAgentState): void {
    this.workflowStates.set(state.workflowId, state);
  }
  
  /**
   * Get all active workflows
   */
  getAllWorkflows(): BrowserAgentState[] {
    return Array.from(this.workflowStates.values());
  }
  
  /**
   * Cleanup stale checkpoints (> 1 hour old)
   */
  async cleanupStaleCheckpoints(): Promise<void> {
    const oneHourMs = 60 * 60 * 1000;
    const deleted = await this.checkpointManager.cleanupStaleCheckpoints(oneHourMs);
    
    this.logger.info("LangGraphStateManager", "Cleaned up stale checkpoints", {
      deleted,
    });
  }
}
