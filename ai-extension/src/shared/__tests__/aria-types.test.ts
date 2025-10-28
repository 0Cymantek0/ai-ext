/**
 * ARIA Types Tests
 *
 * Tests for ARIA messaging type contracts to ensure payload interfaces
 * behave as expected at runtime and compile without TypeScript errors.
 */

import { describe, it, expect } from "vitest";
import { AriaPhase } from "../types/index.d";
import type {
  ResearchMode,
  AriaPhaseValue,
  AriaStartPayload,
  AriaStatusPayload,
  AriaEventPayload,
  AriaErrorPayload,
  AriaProgressMetrics,
  AriaQuotaLimits,
  AriaRunStatus,
  AriaRunPhase,
  AriaControllerEventType,
} from "../types/index.d";

describe("ARIA Type Definitions", () => {
  describe("ResearchMode", () => {
    it("should accept all valid research modes", () => {
      const quickMode: ResearchMode = "quick";
      const standardMode: ResearchMode = "standard";
      const deepMode: ResearchMode = "deep";

      expect(quickMode).toBe("quick");
      expect(standardMode).toBe("standard");
      expect(deepMode).toBe("deep");
    });
  });

  describe("AriaPhase", () => {
    it("should have enum values for all phases", () => {
      // Test that enum values exist and can be used
      expect(AriaPhase.Initializing).toBe("initializing");
      expect(AriaPhase.Planning).toBe("planning");
      expect(AriaPhase.Researching).toBe("researching");
      expect(AriaPhase.Synthesizing).toBe("synthesizing");
      expect(AriaPhase.Paused).toBe("paused");
      expect(AriaPhase.Cancelled).toBe("cancelled");
      expect(AriaPhase.Completed).toBe("completed");
    });

    it("should be compatible with AriaPhaseValue string literals", () => {
      const phase1: AriaPhaseValue = "initializing";
      const phase2: AriaPhaseValue = "planning";
      const phase3: AriaPhaseValue = "researching";
      const phase4: AriaPhaseValue = "synthesizing";
      const phase5: AriaPhaseValue = "paused";
      const phase6: AriaPhaseValue = "cancelled";
      const phase7: AriaPhaseValue = "completed";

      expect(phase1).toBe("initializing");
      expect(phase2).toBe("planning");
      expect(phase3).toBe("researching");
      expect(phase4).toBe("synthesizing");
      expect(phase5).toBe("paused");
      expect(phase6).toBe("cancelled");
      expect(phase7).toBe("completed");
    });

    it("should be assignable to AriaRunPhase", () => {
      const phaseValue: AriaPhaseValue = "planning";
      const runPhase: AriaRunPhase = phaseValue;

      expect(runPhase).toBe("planning");
    });
  });

  describe("AriaProgressMetrics", () => {
    it("should create valid progress metrics with required fields", () => {
      const metrics: AriaProgressMetrics = {
        interactionsUsed: 5,
        sourcesCollected: 10,
        elapsedMs: 2500,
      };

      expect(metrics.interactionsUsed).toBe(5);
      expect(metrics.sourcesCollected).toBe(10);
      expect(metrics.elapsedMs).toBe(2500);
    });

    it("should support optional fields", () => {
      const metrics: AriaProgressMetrics = {
        interactionsUsed: 3,
        sourcesCollected: 7,
        elapsedMs: 1500,
        estimatedRemainingMs: 3000,
        throughput: 4.5,
      };

      expect(metrics.estimatedRemainingMs).toBe(3000);
      expect(metrics.throughput).toBe(4.5);
    });
  });

  describe("AriaQuotaLimits", () => {
    it("should create valid quota limits with optional fields", () => {
      const quotas: AriaQuotaLimits = {
        maxInteractions: 100,
        maxSources: 50,
        maxDurationMs: 60000,
      };

      expect(quotas.maxInteractions).toBe(100);
      expect(quotas.maxSources).toBe(50);
      expect(quotas.maxDurationMs).toBe(60000);
    });

    it("should allow empty quota limits object", () => {
      const quotas: AriaQuotaLimits = {};

      expect(quotas).toEqual({});
    });
  });

  describe("AriaStartPayload", () => {
    it("should create minimal valid payload with required fields", () => {
      const payload: AriaStartPayload = {
        mode: "standard",
      };

      expect(payload.mode).toBe("standard");
    });

    it("should support all optional fields", () => {
      const payload: AriaStartPayload = {
        mode: "deep",
        quotas: {
          maxInteractions: 200,
          maxSources: 100,
          maxDurationMs: 300000,
        },
        topics: ["machine learning", "AI research"],
        resumeToken: "resume-token-123",
        query: "What are the latest developments in AI?",
        context: {
          userId: "user-123",
          sessionId: "session-456",
        },
      };

      expect(payload.mode).toBe("deep");
      expect(payload.quotas?.maxInteractions).toBe(200);
      expect(payload.topics).toHaveLength(2);
      expect(payload.resumeToken).toBe("resume-token-123");
      expect(payload.query).toBeDefined();
      expect(payload.context?.userId).toBe("user-123");
    });

    it("should support quick research mode", () => {
      const payload: AriaStartPayload = {
        mode: "quick",
        query: "Quick search query",
      };

      expect(payload.mode).toBe("quick");
    });
  });

  describe("AriaStatusPayload", () => {
    it("should create valid status payload with all required fields", () => {
      const payload: AriaStatusPayload = {
        runId: "run-123",
        status: "running",
        phase: "researching",
        mode: "standard",
        metrics: {
          interactionsUsed: 10,
          sourcesCollected: 25,
          elapsedMs: 5000,
        },
        updatedAt: Date.now(),
      };

      expect(payload.runId).toBe("run-123");
      expect(payload.status).toBe("running");
      expect(payload.phase).toBe("researching");
      expect(payload.mode).toBe("standard");
      expect(payload.metrics.interactionsUsed).toBe(10);
      expect(payload.updatedAt).toBeGreaterThan(0);
    });

    it("should support optional fields", () => {
      const payload: AriaStatusPayload = {
        runId: "run-456",
        status: "paused",
        phase: "paused",
        mode: "deep",
        metrics: {
          interactionsUsed: 50,
          sourcesCollected: 100,
          elapsedMs: 30000,
          estimatedRemainingMs: 20000,
        },
        updatedAt: Date.now(),
        message: "Research paused by user",
        context: {
          pausedBy: "user-action",
        },
      };

      expect(payload.message).toBe("Research paused by user");
      expect(payload.context?.pausedBy).toBe("user-action");
    });

    it("should support all status values", () => {
      const statuses: AriaRunStatus[] = ["running", "paused", "cancelled", "completed"];

      statuses.forEach((status) => {
        const payload: AriaStatusPayload = {
          runId: `run-${status}`,
          status,
          phase: "completed",
          mode: "standard",
          metrics: {
            interactionsUsed: 0,
            sourcesCollected: 0,
            elapsedMs: 0,
          },
          updatedAt: Date.now(),
        };

        expect(payload.status).toBe(status);
      });
    });
  });

  describe("AriaEventPayload", () => {
    it("should create valid event payload with required fields", () => {
      const payload: AriaEventPayload = {
        runId: "run-789",
        eventType: "progress",
        phase: "researching",
        summary: "Completed 50% of research",
        metrics: {
          interactionsUsed: 15,
          sourcesCollected: 30,
          elapsedMs: 7500,
        },
        timestamp: Date.now(),
      };

      expect(payload.runId).toBe("run-789");
      expect(payload.eventType).toBe("progress");
      expect(payload.phase).toBe("researching");
      expect(payload.summary).toBe("Completed 50% of research");
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it("should support all event types", () => {
      const eventTypes: AriaControllerEventType[] = [
        "started",
        "paused",
        "resumed",
        "cancelled",
        "progress",
      ];

      eventTypes.forEach((eventType) => {
        const payload: AriaEventPayload = {
          runId: "run-event",
          eventType,
          phase: "planning",
          summary: `Event: ${eventType}`,
          metrics: {
            interactionsUsed: 1,
            sourcesCollected: 2,
            elapsedMs: 100,
          },
          timestamp: Date.now(),
        };

        expect(payload.eventType).toBe(eventType);
      });
    });

    it("should support optional fields including fork transcripts", () => {
      const payload: AriaEventPayload = {
        runId: "run-fork",
        eventType: "progress",
        phase: "synthesizing",
        summary: "Synthesizing results from multiple sources",
        metrics: {
          interactionsUsed: 20,
          sourcesCollected: 45,
          elapsedMs: 12000,
        },
        timestamp: Date.now(),
        forkTranscript: {
          forkId: "fork-123",
          label: "Deep dive into AI research",
          summary: "Explored multiple AI research papers",
          messages: [
            {
              role: "agent",
              content: "Analyzing research paper",
              timestamp: Date.now(),
            },
          ],
        },
        context: {
          branchPoint: "analysis-complete",
        },
      };

      expect(payload.forkTranscript).toBeDefined();
      expect(payload.forkTranscript?.forkId).toBe("fork-123");
      expect(payload.context?.branchPoint).toBe("analysis-complete");
    });
  });

  describe("AriaErrorPayload", () => {
    it("should create valid error payload with required fields", () => {
      const payload: AriaErrorPayload = {
        error: "Failed to connect to research API",
        timestamp: Date.now(),
      };

      expect(payload.error).toBe("Failed to connect to research API");
      expect(payload.timestamp).toBeGreaterThan(0);
    });

    it("should support all optional fields", () => {
      const payload: AriaErrorPayload = {
        runId: "run-error-123",
        error: "Quota exceeded",
        errorCode: "QUOTA_EXCEEDED",
        phase: "researching",
        timestamp: Date.now(),
        recoverable: true,
        details: "Stack trace or additional debug information",
        suggestedAction: "Increase quota limits or wait for reset",
      };

      expect(payload.runId).toBe("run-error-123");
      expect(payload.errorCode).toBe("QUOTA_EXCEEDED");
      expect(payload.phase).toBe("researching");
      expect(payload.recoverable).toBe(true);
      expect(payload.details).toBeDefined();
      expect(payload.suggestedAction).toBeDefined();
    });

    it("should support error without runId for initialization failures", () => {
      const payload: AriaErrorPayload = {
        error: "Failed to initialize ARIA controller",
        errorCode: "INIT_FAILED",
        timestamp: Date.now(),
        recoverable: false,
      };

      expect(payload.runId).toBeUndefined();
      expect(payload.error).toBe("Failed to initialize ARIA controller");
      expect(payload.recoverable).toBe(false);
    });
  });

  describe("Integration: Payload Type Compatibility", () => {
    it("should create a complete ARIA workflow with all payload types", () => {
      // Start payload
      const startPayload: AriaStartPayload = {
        mode: "standard",
        quotas: {
          maxInteractions: 50,
          maxSources: 25,
        },
        query: "Test research query",
      };

      // Status payload
      const statusPayload: AriaStatusPayload = {
        runId: "test-run-id",
        status: "running",
        phase: "planning",
        mode: startPayload.mode,
        metrics: {
          interactionsUsed: 0,
          sourcesCollected: 0,
          elapsedMs: 0,
        },
        updatedAt: Date.now(),
      };

      // Event payload
      const eventPayload: AriaEventPayload = {
        runId: statusPayload.runId,
        eventType: "started",
        phase: statusPayload.phase,
        summary: "Research started",
        metrics: statusPayload.metrics,
        timestamp: Date.now(),
      };

      // Error payload (if something goes wrong)
      const errorPayload: AriaErrorPayload = {
        runId: statusPayload.runId,
        error: "Test error",
        phase: statusPayload.phase,
        timestamp: Date.now(),
        recoverable: true,
      };

      expect(startPayload.mode).toBe("standard");
      expect(statusPayload.runId).toBe("test-run-id");
      expect(eventPayload.eventType).toBe("started");
      expect(errorPayload.recoverable).toBe(true);
    });

    it("should transition through all research phases", () => {
      const phases: AriaRunPhase[] = [
        "initializing",
        "planning",
        "researching",
        "synthesizing",
        "completed",
      ];

      phases.forEach((phase, index) => {
        const payload: AriaStatusPayload = {
          runId: "phase-test",
          status: index === phases.length - 1 ? "completed" : "running",
          phase,
          mode: "standard",
          metrics: {
            interactionsUsed: index * 10,
            sourcesCollected: index * 20,
            elapsedMs: index * 1000,
          },
          updatedAt: Date.now(),
        };

        expect(payload.phase).toBe(phase);
      });
    });
  });
});
