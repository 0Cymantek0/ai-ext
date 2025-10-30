import { describe, it, expect } from "vitest";

import { routeQuery, type RouteQueryInput } from "./query-router";

describe("query-router", () => {
  it("honors explicit model overrides", async () => {
    const input: RouteQueryInput = {
      prompt: "Run with Gemini Pro",
      mode: "ask",
      overrides: {
        model: "pro",
        preferLocal: false,
      },
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("pro");
    expect(decision.confidence).toBe(1);
    expect(decision.reason).toContain("override");
    expect(decision.preferLocal).toBe(false);
    expect(decision.metadata?.origin).toBe("override");
  });

  it("defaults to Gemini Nano for lightweight queries", async () => {
    const input: RouteQueryInput = {
      prompt: "Quick question",
      mode: "ask",
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("nano");
    expect(decision.reason).toContain("Default to Gemini Nano");
    expect(decision.confidence).toBeCloseTo(0.65, 2);
    expect(decision.preferLocal).toBe(true);
    expect(decision.metadata?.decisionPath).toEqual([]);
  });

  it("escalates pocket-context requests to Gemini Flash", async () => {
    const input: RouteQueryInput = {
      prompt: "Summarize the attached pocket",
      mode: "ask",
      context: {
        pocketId: "pocket-123",
      },
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("flash");
    expect(decision.reason).toContain("Pocket context");
    expect(decision.confidence).toBeGreaterThanOrEqual(0.75);
    expect(decision.preferLocal).toBe(false);
    expect(decision.metadata?.decisionPath).toContain("pocket-context");
    expect(decision.metadata?.heuristics?.hasPocketContext).toBe(true);
  });

  it("escalates long-running conversations to Gemini Flash", async () => {
    const input: RouteQueryInput = {
      prompt: "Continue the discussion",
      mode: "ask",
      conversation: {
        metadata: {
          messageCount: 14,
          totalTokens: 6500,
        },
      },
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("flash");
    expect(decision.reason).toContain("Conversation length");
    expect(decision.confidence).toBeGreaterThanOrEqual(0.78);
    expect(decision.metadata?.decisionPath).toContain("long-context");
    expect(decision.metadata?.heuristics?.messageCount).toBe(14);
    expect(decision.metadata?.heuristics?.totalTokens).toBe(6500);
  });

  it("routes complex queries to Gemini Pro", async () => {
    const complexPrompt =
      "Please analyze this architecture plan and synthesize a strategy";
    const input: RouteQueryInput = {
      prompt: complexPrompt,
      mode: "ask",
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("pro");
    expect(decision.reason).toContain("Complex query");
    expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
    expect(decision.preferLocal).toBe(false);
    expect(decision.metadata?.decisionPath).toContain("complex-query");
  });

  it("combines heuristics and tracks decision path metadata", async () => {
    const input: RouteQueryInput = {
      prompt: `${"a".repeat(2100)} analyze and compare these approaches`,
      mode: "ai-pocket",
      conversation: {
        metadata: {
          messageCount: 18,
          totalTokens: 7200,
        },
      },
      context: {
        pocketId: "pocket-xyz",
      },
    };

    const decision = await routeQuery(input);

    expect(decision.targetModel).toBe("pro");
    expect(decision.confidence).toBeGreaterThanOrEqual(0.85);
    expect(decision.metadata?.decisionPath).toEqual(
      expect.arrayContaining(["pocket-context", "long-context", "complex-query"]),
    );
    expect(decision.metadata?.heuristics).toMatchObject({
      promptLength: expect.any(Number),
      hasPocketContext: true,
      messageCount: 18,
      totalTokens: 7200,
    });
  });
});
