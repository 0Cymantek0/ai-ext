/**
 * Agent Runtime — Background Service Layer
 *
 * Barrel export for the canonical agent runtime persistence services.
 * These services are the authoritative write surface for all agent run data.
 *
 * @module background/agent-runtime
 */

export { AgentRuntimeStore } from "./store.js";
export { CheckpointService } from "./checkpoint-service.js";
export type { ResumeContext } from "./checkpoint-service.js";
export { PocketArtifactService } from "./pocket-artifact-service.js";
export type {
  TodoArtifactInput,
  StateArtifactInput,
  ArtifactProjectionResult,
} from "./pocket-artifact-service.js";
export {
  runAgentRuntimeMigration,
  isMigrationApplied,
} from "./migration.js";
export type { MigrationResult } from "./migration.js";
