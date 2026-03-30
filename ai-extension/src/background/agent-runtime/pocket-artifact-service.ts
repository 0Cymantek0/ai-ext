/**
 * Pocket Artifact Service
 *
 * Projects agent runtime artifacts into the Pocket content system so that
 * deep-research runs persist real, browsable content items that survive
 * browser closure and service-worker restarts.
 *
 * This service creates and manages:
 *  - Research pockets (one per deep-research run).
 *  - Todo artifact entries (research checklist items as NOTE content).
 *  - State artifact entries (serialized run state as DOCUMENT content).
 *
 * @module background/agent-runtime/pocket-artifact-service
 */

import { AgentRuntimeStore } from "./store.js";
import type { AgentArtifactRecord } from "../../storage/schema.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Input for creating a todo artifact entry. */
export interface TodoArtifactInput {
  runId: string;
  pocketId: string;
  items: Array<{ id: string; label: string; done: boolean }>;
}

/** Input for creating a state artifact entry. */
export interface StateArtifactInput {
  runId: string;
  pocketId: string;
  stateSnapshot: Record<string, unknown>;
}

/** Result of an artifact projection operation. */
export interface ArtifactProjectionResult {
  artifactId: string;
  artifactType: string;
  targetKind: string;
  targetId: string;
}

export interface EvidenceArtifactInput {
  runId: string;
  pocketId: string;
  contentId: string;
  evidenceId: string;
  fingerprint: string;
  label: string;
  sourceUrl?: string;
}

export interface ReportInputArtifactInput {
  runId: string;
  pocketId: string;
  targetId: string;
  label: string;
  uri?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class PocketArtifactService {
  private store: AgentRuntimeStore;

  constructor(store?: AgentRuntimeStore) {
    this.store = store ?? new AgentRuntimeStore();
  }

  /**
   * Ensure a research pocket artifact record exists for a run.
   * If the run already has a pocket artifact of the given type, return it.
   * Otherwise, create a new artifact record linking the run to the pocket.
   *
   * NOTE: This creates the artifact REFERENCE only. The actual Pocket record
   * must be created separately via the pocket storage layer.
   *
   * @param runId - The agent run ID.
   * @param pocketId - The pocket ID to link.
   * @param label - Human-readable label for the pocket artifact.
   * @returns The artifact record (existing or newly created).
   */
  async ensureResearchPocket(
    runId: string,
    pocketId: string,
    label: string,
  ): Promise<AgentArtifactRecord> {
    // Check if we already have a pocket artifact for this run
    const existing = await this.findArtifact(runId, "pocket", "pocket-meta", pocketId);
    if (existing) return existing;

    const now = Date.now();
    const artifactId = `art-pocket-${runId}-${now}`;

    const record: AgentArtifactRecord = {
      artifactId,
      runId,
      artifactType: "pocket",
      targetKind: "pocket-meta",
      targetId: pocketId,
      label,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putArtifact(record);
    return record;
  }

  /**
   * Ensure a todo artifact reference exists for this run and pocket.
   *
   * The todo artifact links a run to a specific content item within a pocket
   * that holds the serialized todo list. The actual content write happens
   * via `writeResearchTodoContent()`.
   */
  async ensureResearchTodoArtifact(
    runId: string,
    pocketId: string,
    contentId: string,
  ): Promise<AgentArtifactRecord> {
    const existing = await this.findArtifact(
      runId,
      "todo",
      "pocket-content",
      contentId,
    );
    if (existing) return existing;

    const now = Date.now();
    const artifactId = `art-todo-${runId}-${now}`;

    const record: AgentArtifactRecord = {
      artifactId,
      runId,
      artifactType: "todo",
      targetKind: "pocket-content",
      targetId: contentId,
      label: `Research todo list`,
      uri: `pocket://${pocketId}/content/${contentId}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putArtifact(record);
    return record;
  }

  /**
   * Ensure a state artifact reference exists for this run and pocket.
   *
   * The state artifact links a run to a content item that holds a JSON
   * snapshot of the run's state, enabling resumption after browser closure.
   */
  async ensureResearchStateArtifact(
    runId: string,
    pocketId: string,
    contentId: string,
  ): Promise<AgentArtifactRecord> {
    const existing = await this.findArtifact(
      runId,
      "state",
      "pocket-content",
      contentId,
    );
    if (existing) return existing;

    const now = Date.now();
    const artifactId = `art-state-${runId}-${now}`;

    const record: AgentArtifactRecord = {
      artifactId,
      runId,
      artifactType: "state",
      targetKind: "pocket-content",
      targetId: contentId,
      label: `Research state snapshot`,
      uri: `pocket://${pocketId}/content/${contentId}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putArtifact(record);
    return record;
  }

  /**
   * Update an existing artifact's timestamp and optional URI.
   */
  async touchArtifact(
    artifactId: string,
    updates?: { uri?: string },
  ): Promise<void> {
    const existing = await this.store.getArtifact(artifactId);
    if (!existing) return;

    existing.updatedAt = Date.now();
    if (updates?.uri !== undefined) {
      existing.uri = updates.uri;
    }
    await this.store.putArtifact(existing);
  }

  /**
   * List all artifact records for a given run.
   */
  async listArtifactsForRun(runId: string): Promise<AgentArtifactRecord[]> {
    return this.store.getArtifactsByRun(runId);
  }

  async listEvidenceArtifactsForRun(runId: string): Promise<AgentArtifactRecord[]> {
    return this.store.getArtifactsByRunAndType(runId, "evidence");
  }

  async findEvidenceArtifactForTarget(
    runId: string,
    contentId: string,
  ): Promise<AgentArtifactRecord | undefined> {
    const records = await this.store.getArtifactsByRunAndTarget(runId, contentId);
    return records.find((record) => record.artifactType === "evidence");
  }

  async ensureEvidenceArtifact(
    input: EvidenceArtifactInput,
  ): Promise<AgentArtifactRecord> {
    const existing = await this.findEvidenceArtifactForTarget(
      input.runId,
      input.contentId,
    );

    if (existing) {
      const nextUri = input.sourceUrl || existing.uri;
      await this.touchArtifact(
        existing.artifactId,
        nextUri ? { uri: nextUri } : {},
      );
      const refreshed = await this.store.getArtifact(existing.artifactId);
      return refreshed ?? existing;
    }

    const now = Date.now();
    const record: AgentArtifactRecord = {
      artifactId: `art-evidence-${input.runId}-${input.evidenceId}`,
      runId: input.runId,
      artifactType: "evidence",
      targetKind: "pocket-content",
      targetId: input.contentId,
      label: input.label,
      uri:
        input.sourceUrl || `pocket://${input.pocketId}/content/${input.contentId}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putArtifact(record);
    return record;
  }

  async ensureReportInputArtifact(
    input: ReportInputArtifactInput,
  ): Promise<AgentArtifactRecord> {
    const existing = await this.findArtifact(
      input.runId,
      "report-input",
      "report-input",
      input.targetId,
    );

    if (existing) {
      await this.touchArtifact(
        existing.artifactId,
        input.uri ? { uri: input.uri } : {},
      );
      return (await this.store.getArtifact(existing.artifactId)) ?? existing;
    }

    const now = Date.now();
    const record: AgentArtifactRecord = {
      artifactId: `art-report-input-${input.runId}-${input.targetId}`,
      runId: input.runId,
      artifactType: "report-input",
      targetKind: "report-input",
      targetId: input.targetId,
      label: input.label,
      uri: input.uri ?? `pocket://${input.pocketId}/report-input/${input.targetId}`,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.putArtifact(record);
    return record;
  }

  /**
   * Retrieve a specific artifact by its ID.
   */
  async getArtifact(
    artifactId: string,
  ): Promise<AgentArtifactRecord | undefined> {
    return this.store.getArtifact(artifactId);
  }

  // ── Internal Helpers ──────────────────────────────────────────────────

  /**
   * Find an existing artifact matching the given criteria.
   */
  private async findArtifact(
    runId: string,
    artifactType: string,
    targetKind: string,
    targetId: string,
  ): Promise<AgentArtifactRecord | undefined> {
    const artifacts = await this.store.getArtifactsByRun(runId);
    return artifacts.find(
      (a) =>
        a.artifactType === artifactType &&
        a.targetKind === targetKind &&
        a.targetId === targetId,
    );
  }
}
