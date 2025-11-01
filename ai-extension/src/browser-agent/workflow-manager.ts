/**
 * Workflow Manager
 * Integrates LangGraph State Manager with service worker messaging
 * Requirements: Task 9 - LangGraph State Manager (Phase 2)
 */

import { WorkflowStateMachine, type BrowserAgentState, type WorkflowDefinition } from "./agent-state.js";
import { IndexedDBCheckpointManager } from "./checkpoint-manager.js";
import type { BrowserToolRegistry } from "./tool-registry.js";
import type { DatabaseManager } from "../storage/schema.js";
import type { Logger } from "../background/monitoring.js";

/**
 * Workflow start request
 */
export interface StartWorkflowRequest {
  workflowId: string;
  variables: Record<string, unknown>;
  config?: WorkflowDefinition;
  tabId?: number;
  userId?: string;
}

/**
 * Workflow status response
 */
export interface WorkflowStatusResponse {
  workflowId: string;
  state: BrowserAgentState;
  checkpoints: number;
}

/**
 * Workflow Manager
 * Manages workflow lifecycle and integrates with messaging system
 */
export class WorkflowManager {
  private stateManager: WorkflowStateMachine;
  private checkpointManager: IndexedDBCheckpointManager;
  private logger: Logger;
  
  constructor(
    toolRegistry: BrowserToolRegistry,
    database: DatabaseManager,
    logger: Logger,
  ) {
    this.logger = logger;
    this.checkpointManager = new IndexedDBCheckpointManager(database, logger);
    this.stateManager = new WorkflowStateMachine(
      toolRegistry,
      logger,
      this.checkpointManager,
    );
  }
  
  /**
   * Start a new workflow
   */
  async startWorkflow(request: StartWorkflowRequest): Promise<BrowserAgentState> {
    try {
      this.logger.info("WorkflowManager", "Starting workflow", {
        workflowId: request.workflowId,
      });
      
      const state = await this.stateManager.startWorkflow(
        request.workflowId,
        request.variables,
        request.config,
      );
      
      // Set tab ID and user ID if provided
      if (request.tabId !== undefined) {
        state.tabId = request.tabId;
      }
      if (request.userId !== undefined) {
        state.userId = request.userId;
      }
      
      // Save initial state
      await this.checkpointManager.saveWorkflowState(state);
      
      // Execute workflow asynchronously
      void this.executeWorkflowAsync(request.workflowId);
      
      return state;
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to start workflow", {
        workflowId: request.workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Execute workflow asynchronously
   */
  private async executeWorkflowAsync(workflowId: string): Promise<void> {
    // Keep service worker alive during workflow execution
    const heartbeatInterval = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => {});
    }, 20000); // Every 20 seconds
    
    try {
      await this.stateManager.executeWorkflow(workflowId);
    } catch (error) {
      this.logger.error("WorkflowManager", "Workflow execution failed", {
        workflowId,
        error,
      });
      
      // Propagate error via message to UI
      try {
        await chrome.runtime.sendMessage({
          kind: "BROWSER_AGENT_WORKFLOW_ERROR",
          payload: {
            workflowId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          },
        });
      } catch (msgError) {
        this.logger.warn("WorkflowManager", "Failed to send error message", msgError);
      }
      
      // Update workflow state to failed
      const state = this.stateManager.getWorkflowStatus(workflowId);
      if (state) {
        state.status = "failed";
        await this.checkpointManager.saveWorkflowState(state);
      }
    } finally {
      // Always clear heartbeat when workflow completes/fails
      clearInterval(heartbeatInterval);
    }
  }
  
  /**
   * Pause a workflow
   */
  async pauseWorkflow(
    workflowId: string,
    reason?: string,
  ): Promise<void> {
    try {
      await this.stateManager.pauseWorkflow(workflowId, reason);
      
      this.logger.info("WorkflowManager", "Workflow paused", {
        workflowId,
        reason,
      });
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to pause workflow", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Resume a paused workflow
   */
  async resumeWorkflow(
    workflowId: string,
    userInput?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.stateManager.resumeWorkflow(workflowId, userInput);
      
      // Continue execution
      void this.executeWorkflowAsync(workflowId);
      
      this.logger.info("WorkflowManager", "Workflow resumed", {
        workflowId,
        hasUserInput: !!userInput,
      });
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to resume workflow", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Cancel a workflow
   */
  async cancelWorkflow(
    workflowId: string,
    options?: { cleanupResources?: boolean; closeTabs?: boolean },
  ): Promise<void> {
    try {
      await this.stateManager.cancelWorkflow(workflowId, options);
      
      this.logger.info("WorkflowManager", "Workflow cancelled", {
        workflowId,
        options,
      });
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to cancel workflow", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse | null> {
    try {
      let state = this.stateManager.getWorkflowStatus(workflowId);
      
      // If not in memory, try to load from database
      if (!state) {
        const storedState = await this.checkpointManager.loadWorkflowState(workflowId);
        state = storedState ?? undefined;
      }
      
      if (!state) {
        return null;
      }
      
      const checkpoints = await this.checkpointManager.listWorkflowCheckpoints(workflowId);
      
      return {
        workflowId,
        state,
        checkpoints: checkpoints.length,
      };
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to get workflow status", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Resume incomplete workflows on service worker start
   */
  async resumeIncompleteWorkflows(): Promise<void> {
    try {
      this.logger.info("WorkflowManager", "Resuming incomplete workflows");
      
      const incompleteWorkflows = await this.checkpointManager.getIncompleteWorkflows();
      
      this.logger.info("WorkflowManager", "Found incomplete workflows", {
        count: incompleteWorkflows.length,
      });
      
      // Resume each incomplete workflow
      for (const workflow of incompleteWorkflows) {
        // Hydrate workflow state into memory
        this.stateManager.hydrateWorkflowState(workflow);
        
        if (workflow.status === "paused") {
          this.logger.info("WorkflowManager", "Workflow paused, awaiting resume", {
            workflowId: workflow.workflowId,
          });
        } else if (workflow.status === "running") {
          this.logger.info("WorkflowManager", "Resuming running workflow", {
            workflowId: workflow.workflowId,
          });
          // Continue execution
          void this.executeWorkflowAsync(workflow.workflowId);
        }
      }
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to resume incomplete workflows", {
        error,
      });
      throw error;
    }
  }
  
  /**
   * Cleanup stale checkpoints (> 1 hour old)
   */
  async cleanupStaleCheckpoints(): Promise<number> {
    try {
      const oneHourMs = 60 * 60 * 1000;
      const deleted = await this.checkpointManager.cleanupStaleCheckpoints(oneHourMs);
      
      this.logger.info("WorkflowManager", "Cleaned up stale checkpoints", {
        deleted,
      });
      
      return deleted;
    } catch (error) {
      this.logger.error("WorkflowManager", "Failed to cleanup stale checkpoints", {
        error,
      });
      throw error;
    }
  }
  
  /**
   * Get all active workflows
   */
  getAllWorkflows(): BrowserAgentState[] {
    return this.stateManager.getAllWorkflows();
  }
  
  /**
   * Get the state manager for advanced operations
   */
  getStateManager(): WorkflowStateMachine {
    return this.stateManager;
  }
  
  /**
   * Get the checkpoint manager for advanced operations
   */
  getCheckpointManager(): IndexedDBCheckpointManager {
    return this.checkpointManager;
  }
}
