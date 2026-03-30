import { describe, it, expect } from "vitest";
import type {
  AgentPendingApproval,
  ApprovalTargetContext,
} from "../contracts.js";

describe("AgentPendingApproval", () => {
  it("accepts minimal fields", () => {
    const approval: AgentPendingApproval = {
      approvalId: "apr-1",
      reason: "Sensitive action requires approval",
      requestedAt: Date.now(),
    };

    expect(approval.approvalId).toBe("apr-1");
    expect(approval.reason).toBe("Sensitive action requires approval");
    expect(approval.resolvedAt).toBeUndefined();
    expect(approval.resolution).toBeUndefined();
  });

  it("accepts enriched CTRL-02 fields", () => {
    const targetContext: ApprovalTargetContext = {
      tabId: 42,
      tabUrl: "https://example.com/form",
      tabTitle: "Example Form",
      selector: "#submit-btn",
      textPreview: "Click me",
    };

    const approval: AgentPendingApproval = {
      approvalId: "apr-2",
      reason: "Agent wants to click submit button",
      requestedAt: Date.now(),
      toolName: "click_element",
      toolArgs: { selector: "#submit-btn" },
      targetContext,
    };

    expect(approval.toolName).toBe("click_element");
    expect(approval.toolArgs).toEqual({ selector: "#submit-btn" });
    expect(approval.targetContext).toBeDefined();
    expect(approval.targetContext?.tabId).toBe(42);
    expect(approval.targetContext?.selector).toBe("#submit-btn");
    expect(approval.targetContext?.textPreview).toBe("Click me");
  });

  it("ApprovalTargetContext requires tabId", () => {
    // This test verifies at the TypeScript level that tabId is required.
    // The runtime validation is tested in schemas.test.ts via Zod parse.
    const ctx: ApprovalTargetContext = {
      tabId: 1,
    };
    expect(ctx.tabId).toBe(1);
    expect(ctx.tabUrl).toBeUndefined();
    expect(ctx.selector).toBeUndefined();
    expect(ctx.textPreview).toBeUndefined();
  });
});
