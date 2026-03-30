import { describe, it, expect } from "vitest";
import { AgentPendingApprovalSchema, ApprovalTargetContextSchema } from "../schemas.js";

describe("AgentPendingApprovalSchema", () => {
  it("validates minimal approval", () => {
    const result = AgentPendingApprovalSchema.safeParse({
      approvalId: "apr-1",
      reason: "test",
      requestedAt: Date.now(),
    });

    expect(result.success).toBe(true);
  });

  it("validates enriched approval with targetContext", () => {
    const result = AgentPendingApprovalSchema.safeParse({
      approvalId: "apr-2",
      reason: "Sensitive action",
      requestedAt: Date.now(),
      toolName: "click_element",
      toolArgs: { selector: "#submit-btn" },
      targetContext: {
        tabId: 42,
        tabUrl: "https://example.com",
        tabTitle: "Example",
        selector: "#submit-btn",
        textPreview: undefined,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toolName).toBe("click_element");
      expect(result.data.targetContext?.tabId).toBe(42);
      expect(result.data.targetContext?.selector).toBe("#submit-btn");
    }
  });

  it("rejects missing approvalId", () => {
    const result = AgentPendingApprovalSchema.safeParse({
      reason: "test",
      requestedAt: Date.now(),
    });

    expect(result.success).toBe(false);
  });

  it("validates approval with resolution fields", () => {
    const result = AgentPendingApprovalSchema.safeParse({
      approvalId: "apr-3",
      reason: "test",
      requestedAt: Date.now(),
      resolvedAt: Date.now(),
      resolution: "approved",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resolution).toBe("approved");
    }
  });
});

describe("ApprovalTargetContextSchema", () => {
  it("validates full context", () => {
    const result = ApprovalTargetContextSchema.safeParse({
      tabId: 10,
      tabUrl: "https://example.com/page",
      tabTitle: "Test Page",
      selector: "button.submit",
      textPreview: "Submit",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tabId).toBe(10);
      expect(result.data.tabUrl).toBe("https://example.com/page");
    }
  });

  it("validates minimal context with only tabId", () => {
    const result = ApprovalTargetContextSchema.safeParse({
      tabId: 5,
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing tabId", () => {
    const result = ApprovalTargetContextSchema.safeParse({
      tabUrl: "https://example.com",
      selector: "#btn",
    });

    expect(result.success).toBe(false);
  });
});
