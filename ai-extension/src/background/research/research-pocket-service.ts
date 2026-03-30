import { indexedDBManager, type Pocket } from "../indexeddb-manager.js";
import { PocketArtifactService } from "../agent-runtime/pocket-artifact-service.js";
import type { AgentRun, DeepResearchRunMetadata } from "../../shared/agent-runtime/contracts.js";

export interface ResearchPocketProvisionResult {
  pocketId: string;
  pocket: Pocket;
  reused: boolean;
}

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildPocketName(topic: string): string {
  return `Research: ${topic.trim()}`;
}

function buildPocketTags(metadata: Partial<DeepResearchRunMetadata>): string[] {
  const tags = [
    "research",
    "research-pocket",
    slugifyTopic(metadata.topic ?? "research"),
  ].filter(Boolean);

  return [...new Set(tags)];
}

export class ResearchPocketService {
  constructor(private readonly artifacts: PocketArtifactService) {}

  async ensurePocketForRun(run: AgentRun): Promise<ResearchPocketProvisionResult> {
    const metadata = run.metadata as Partial<DeepResearchRunMetadata>;
    const topic = metadata.topic?.trim();

    if (!topic) {
      throw new Error("Deep-research run is missing topic metadata");
    }

    await indexedDBManager.init();

    const linkedPocketId =
      typeof metadata.pocketId === "string" && metadata.pocketId.length > 0
        ? metadata.pocketId
        : undefined;

    if (linkedPocketId) {
      const existingPocket = await indexedDBManager.getPocket(linkedPocketId);
      if (existingPocket) {
        await this.artifacts.ensureResearchPocket(
          run.runId,
          existingPocket.id,
          buildPocketName(topic),
        );
        return {
          pocketId: existingPocket.id,
          pocket: existingPocket,
          reused: true,
        };
      }
    }

    const pockets = await indexedDBManager.listPockets();
    const inferredPocket = pockets.find((pocket) =>
      pocket.tags.includes(`run:${run.runId}`),
    );

    if (inferredPocket) {
      await this.artifacts.ensureResearchPocket(
        run.runId,
        inferredPocket.id,
        buildPocketName(topic),
      );
      return {
        pocketId: inferredPocket.id,
        pocket: inferredPocket,
        reused: true,
      };
    }

    const pocketId = await indexedDBManager.createPocket({
      name: buildPocketName(topic),
      description: `Evidence workspace for ${topic}`,
      contentIds: [],
      tags: [...buildPocketTags(metadata), `run:${run.runId}`],
      color: "#2563eb",
      icon: "search",
    });
    const pocket = await indexedDBManager.getPocket(pocketId);

    if (!pocket) {
      throw new Error(`Failed to load provisioned research pocket ${pocketId}`);
    }

    await this.artifacts.ensureResearchPocket(
      run.runId,
      pocket.id,
      buildPocketName(topic),
    );

    return {
      pocketId: pocket.id,
      pocket,
      reused: false,
    };
  }
}
