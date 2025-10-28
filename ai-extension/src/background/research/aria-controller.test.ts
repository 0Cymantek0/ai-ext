import { describe, expect, it, vi } from "vitest";

vi.mock("../monitoring.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  AriaController,
  type AriaControllerEventDetail,
} from "./aria-controller.js";

describe("AriaController", () => {
  it("starts a run and returns status snapshots", () => {
    const controller = new AriaController();
    const events: AriaControllerEventDetail[] = [];

    controller.onEvent((detail) => {
      events.push(detail);
    });

    const startResult = controller.startRun({ mode: "assist" });
    if (!startResult.success) {
      throw new Error("Expected startRun to succeed");
    }

    expect(startResult.run.status).toBe("running");
    expect(startResult.run.mode).toBe("assist");
    expect(events[0]?.type).toBe("started");

    const statusResult = controller.getStatus(startResult.run.runId);
    if (!statusResult.success) {
      throw new Error("Expected getStatus to succeed");
    }

    expect(statusResult.run.runId).toBe(startResult.run.runId);
    expect(statusResult.run.metrics.progress).toBeGreaterThan(0);
  });

  it("pauses, resumes, and cancels runs with lifecycle events", () => {
    const controller = new AriaController();
    const events: AriaControllerEventDetail[] = [];
    controller.onEvent((detail) => {
      events.push(detail);
    });

    const startResult = controller.startRun({ mode: "autonomous" });
    if (!startResult.success) {
      throw new Error("Expected startRun to succeed");
    }

    const runId = startResult.run.runId;

    const pauseResult = controller.pauseRun(runId);
    if (!pauseResult.success) {
      throw new Error("Expected pauseRun to succeed");
    }
    expect(pauseResult.run.status).toBe("paused");

    const resumeResult = controller.resumeRun(runId);
    if (!resumeResult.success) {
      throw new Error("Expected resumeRun to succeed");
    }
    expect(resumeResult.run.status).toBe("running");

    const cancelResult = controller.cancelRun(runId);
    if (!cancelResult.success) {
      throw new Error("Expected cancelRun to succeed");
    }
    expect(cancelResult.run.status).toBe("cancelled");

    const sequence = events.map((event) => event.type);
    expect(sequence).toContain("started");
    expect(sequence).toContain("paused");
    expect(sequence).toContain("resumed");
    expect(sequence).toContain("cancelled");
    expect(sequence).toContain("progress");
  });

  it("returns descriptive errors for unknown runs", () => {
    const controller = new AriaController();

    const pauseResult = controller.pauseRun("missing");
    expect(pauseResult.success).toBe(false);
    if (pauseResult.success) {
      throw new Error("Expected pauseRun to fail for missing run");
    }
    expect(pauseResult.reason).toBe("NOT_FOUND");

    const statusResult = controller.getStatus("missing");
    expect(statusResult.success).toBe(false);
    if (statusResult.success) {
      throw new Error("Expected getStatus to fail for missing run");
    }
    expect(statusResult.error).toContain("No ARIA run found");
  });

  it("prevents invalid lifecycle transitions", () => {
    const controller = new AriaController();
    const startResult = controller.startRun({ mode: "assist" });
    if (!startResult.success) {
      throw new Error("Expected startRun to succeed");
    }

    const runId = startResult.run.runId;

    const cancelResult = controller.cancelRun(runId);
    if (!cancelResult.success) {
      throw new Error("Expected cancelRun to succeed");
    }

    const resumeAfterCancel = controller.resumeRun(runId);
    expect(resumeAfterCancel.success).toBe(false);
    if (resumeAfterCancel.success) {
      throw new Error("Expected resumeRun to fail after cancel");
    }
    expect(resumeAfterCancel.reason).toBe("INVALID_STATE");
  });
});
