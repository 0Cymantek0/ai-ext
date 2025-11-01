/**
 * Checkpoint Manager Implementation
 * Handles persistence and recovery of workflow checkpoints using IndexedDB
 * Requirements: Task 9 - LangGraph State Manager (Phase 2)
 */

import type { DatabaseManager } from "../storage/schema.js";
import { STORE_NAMES } from "../storage/schema.js";
import type {
  StateCheckpoint,
  BrowserAgentState,
  CheckpointManager,
} from "./agent-state.js";
import type { Logger } from "../background/monitoring.js";

/**
 * IndexedDB-based checkpoint manager implementation
 */
export class IndexedDBCheckpointManager implements CheckpointManager {
  private db: DatabaseManager;
  private logger: Logger;
  
  constructor(db: DatabaseManager, logger: Logger) {
    this.db = db;
    this.logger = logger;
  }
  
  /**
   * Save a checkpoint to IndexedDB
   */
  async saveCheckpoint(checkpoint: StateCheckpoint): Promise<void> {
    try {
      const db = await this.db.open();
      const tx = db.transaction(
        [STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, STORE_NAMES.BROWSER_AGENT_WORKFLOWS],
        "readwrite",
      );
      
      // Save checkpoint
      await tx.objectStore(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS).put(checkpoint);
      
      // Update workflow state
      await tx.objectStore(STORE_NAMES.BROWSER_AGENT_WORKFLOWS).put(checkpoint.state);
      
      await tx.done;
      
      this.logger.debug("CheckpointManager", "Checkpoint saved", {
        checkpointId: checkpoint.checkpointId,
        workflowId: checkpoint.workflowId,
      });
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to save checkpoint", {
        checkpointId: checkpoint.checkpointId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Load a checkpoint by ID
   */
  async loadCheckpoint(checkpointId: string): Promise<StateCheckpoint | null> {
    try {
      const db = await this.db.open();
      const checkpoint = await db.get(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, checkpointId);
      
      return checkpoint ?? null;
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to load checkpoint", {
        checkpointId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Load the latest checkpoint for a workflow
   */
  async loadLatestCheckpoint(workflowId: string): Promise<StateCheckpoint | null> {
    try {
      const db = await this.db.open();
      const tx = db.transaction(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, "readonly");
      const index = tx.objectStore(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS).index("workflowId");
      
      // Get all checkpoints for this workflow
      const checkpoints = (await index.getAll(workflowId)).filter(
        (entry): entry is StateCheckpoint => entry !== undefined && entry !== null,
      );
      
      if (checkpoints.length === 0) {
        return null;
      }
      
      // Return the most recent checkpoint
      checkpoints.sort((a, b) => b.timestamp - a.timestamp);
      return checkpoints[0] ?? null;
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to load latest checkpoint", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Delete a checkpoint by ID
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    try {
      const db = await this.db.open();
      await db.delete(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, checkpointId);
      
      this.logger.debug("CheckpointManager", "Checkpoint deleted", {
        checkpointId,
      });
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to delete checkpoint", {
        checkpointId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Delete all checkpoints for a workflow
   */
  async deleteWorkflowCheckpoints(workflowId: string): Promise<void> {
    try {
      const db = await this.db.open();
      const tx = db.transaction(
        [STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, STORE_NAMES.BROWSER_AGENT_WORKFLOWS],
        "readwrite",
      );
      
      // Delete checkpoints
      const checkpointIndex = tx.objectStore(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS).index("workflowId");
      let cursor = await checkpointIndex.openCursor(workflowId);
      
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      
      // Delete workflow state
      await tx.objectStore(STORE_NAMES.BROWSER_AGENT_WORKFLOWS).delete(workflowId);
      
      await tx.done;
      
      this.logger.info("CheckpointManager", "Workflow checkpoints deleted", {
        workflowId,
      });
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to delete workflow checkpoints", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Cleanup stale checkpoints older than specified age
   */
  async cleanupStaleCheckpoints(olderThanMs: number): Promise<number> {
    try {
      const cutoffTime = Date.now() - olderThanMs;
      const db = await this.db.open();
      const tx = db.transaction(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, "readwrite");
      const store = tx.objectStore(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS);
      const index = store.index("timestamp");
      
      let deletedCount = 0;
      let cursor = await index.openCursor();
      
      while (cursor) {
        if (cursor.value.timestamp < cutoffTime) {
          await cursor.delete();
          deletedCount++;
        }
        cursor = await cursor.continue();
      }
      
      await tx.done;
      
      this.logger.info("CheckpointManager", "Stale checkpoints cleaned up", {
        deletedCount,
        cutoffTime,
      });
      
      return deletedCount;
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to cleanup stale checkpoints", {
        error,
      });
      throw error;
    }
  }
  
  /**
   * List all checkpoints for a workflow
   */
  async listWorkflowCheckpoints(workflowId: string): Promise<StateCheckpoint[]> {
    try {
      const db = await this.db.open();
      const tx = db.transaction(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS, "readonly");
      const index = tx.objectStore(STORE_NAMES.BROWSER_AGENT_CHECKPOINTS).index("workflowId");
      
      const checkpoints = await index.getAll(workflowId);
      
      // Sort by timestamp descending
      checkpoints.sort((a, b) => b.timestamp - a.timestamp);
      
      return checkpoints;
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to list workflow checkpoints", {
        workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Get all incomplete workflows (status is running or paused)
   */
  async getIncompleteWorkflows(): Promise<BrowserAgentState[]> {
    try {
      const db = await this.db.open();
      const tx = db.transaction(STORE_NAMES.BROWSER_AGENT_WORKFLOWS, "readonly");
      const store = tx.objectStore(STORE_NAMES.BROWSER_AGENT_WORKFLOWS);
      
      const allWorkflows = await store.getAll();
      
      // Filter for incomplete workflows
      return allWorkflows.filter(
        (workflow) =>
          workflow.status === "running" ||
          workflow.status === "paused" ||
          workflow.status === "pending",
      );
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to get incomplete workflows", {
        error,
      });
      throw error;
    }
  }
  
  /**
   * Save workflow state without creating a checkpoint
   */
  async saveWorkflowState(state: BrowserAgentState): Promise<void> {
    try {
      const db = await this.db.open();
      await db.put(STORE_NAMES.BROWSER_AGENT_WORKFLOWS, state);
      
      this.logger.debug("CheckpointManager", "Workflow state saved", {
        workflowId: state.workflowId,
      });
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to save workflow state", {
        workflowId: state.workflowId,
        error,
      });
      throw error;
    }
  }
  
  /**
   * Load workflow state
   */
  async loadWorkflowState(workflowId: string): Promise<BrowserAgentState | null> {
    try {
      const db = await this.db.open();
      const state = await db.get(STORE_NAMES.BROWSER_AGENT_WORKFLOWS, workflowId);
      
      return state ?? null;
    } catch (error) {
      this.logger.error("CheckpointManager", "Failed to load workflow state", {
        workflowId,
        error,
      });
      throw error;
    }
  }
}
