import { describe, expect, it } from "vitest";
import {
  AgentRunEventSchema,
  AgentRunSchema,
} from "../src/shared/agent-runtime/schemas.js";
import type {
  AgentRun,
  BrowserActionRunMetadata,
  BrowserActionCheckpointBoundary,
} from "../src/shared/agent-runtime/contracts.js";
import type { AgentRunStartPayload } from "../src/shared/types/index.d";

describe("browser action runtime contracts", () => {
  it("accepts canonical browser-action launch payload fields", () => {
    const payload: AgentRunStartPayload = {
      mode: "browser-action",
      task: "Summarize the visible pricing table",
      providerId: "provider-openai",
      providerType: "openai",
      modelId: "gpt-4.1",
      conversationId: "conv-123",
      tabId: 42,
      tabUrl: "https://example.com/pricing",
      tabTitle: "Pricing",
      metadata: {
        origin: "sidepanel",
      },
    };

    expect(payload.mode).toBe("browser-action");
    expect(payload.providerId).toBe("provider-openai");
    expect(payload.modelId).toBe("gpt-4.1");
    expect(payload.conversationId).toBe("conv-123");
    expect(payload.tabId).toBe(42);
  });

  it("persists browser-action metadata on the canonical AgentRun shape", () => {
    const metadata: BrowserActionRunMetadata = {
      task: "Inspect the login form",
      providerId: "provider-google",
      providerType: "google",
      modelId: "gemini-2.5-flash",
      conversationId: "conv-456",
      tabId: 7,
      tabUrl: "https://example.com/login",
      tabTitle: "Login",
    };

    const run: AgentRun = {
      runId: "run-browser-action",
      mode: "browser-action",
      status: "running",
      phase: "planning",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      todoItems: [],
      pendingApproval: null,
      artifactRefs: [],
      latestCheckpointId: null,
      terminalOutcome: null,
      metadata,
    };

    const parsed = AgentRunSchema.parse(run);
    expect(parsed.mode).toBe("browser-action");
    expect(parsed.metadata).toMatchObject({
      providerId: "provider-google",
      modelId: "gemini-2.5-flash",
      conversationId: "conv-456",
      tabId: 7,
    });
  });

  it("supports named browser-action checkpoint boundaries", () => {
    const boundary: BrowserActionCheckpointBoundary = "tool-result";
    const event = AgentRunEventSchema.parse({
      eventId: "evt-browser-checkpoint",
      runId: "run-browser-action",
      timestamp: Date.now(),
      type: "checkpoint.created",
      checkpointId: "cp-browser-action",
      boundary,
    });

    expect(event.type).toBe("checkpoint.created");
    expect(event.boundary).toBe("tool-result");
  });
});
