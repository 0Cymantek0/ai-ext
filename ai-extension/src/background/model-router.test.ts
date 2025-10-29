import { describe, it, expect } from "vitest";

import { routeQuery } from "./model-router";

describe("model-router", () => {
  it("routes research-oriented prompts to Gemini Pro", () => {
    const decision = routeQuery({
      prompt:
        "Please ANALYZE the latest experiment results and provide a summary of findings.",
    });

    expect(decision.targetModel).toBe("pro");
    expect(decision.reason.toLowerCase()).toContain("research intent");
    expect(decision.matchedRules).toContain("research-keyword");
    expect(decision.confidence).toBeGreaterThan(0.9);
  });

  it("routes short contextual prompts to Gemini Nano", () => {
    const decision = routeQuery({
      prompt: "Summarize this snippet for quick recall.",
      activeContext: {
        pocketCount: 2,
      },
    });

    expect(decision.targetModel).toBe("nano");
    expect(decision.matchedRules).toContain("short-contextual-query");
    expect(decision.confidence).toBeGreaterThan(0.8);
  });

  it("respects explicit snippet signals when provided", () => {
    const decision = routeQuery({
      prompt: "Summarize quickly.",
      activeContext: {
        hasExplicitSnippet: true,
      },
    });

    expect(decision.targetModel).toBe("nano");
    expect(decision.matchedRules).toEqual(["short-contextual-query"]);
  });

  it("treats ai-pocket mode as contextual cue for Nano routing", () => {
    const decision = routeQuery({
      prompt: "Need quick pocket recap.",
      activeContext: {
        conversationMode: "ai-pocket",
      },
    });

    expect(decision.targetModel).toBe("nano");
    expect(decision.matchedRules).toEqual(["short-contextual-query"]);
  });

  it("defaults to Gemini Flash when no heuristics match", () => {
    const decision = routeQuery({
      prompt: "Explain the history of artificial intelligence across major milestones.",
    });

    expect(decision.targetModel).toBe("flash");
    expect(decision.matchedRules).toHaveLength(0);
    expect(decision.confidence).toBeGreaterThan(0.5);
    expect(decision.confidence).toBeLessThan(0.9);
  });

  it("treats research keywords case-insensitively", () => {
    const decision = routeQuery({
      prompt: "Could you provide a Literature Review of recent advances in robotics?",
    });

    expect(decision.targetModel).toBe("pro");
    expect(decision.matchedRules).toEqual(["research-keyword"]);
  });

  it("does not downgrade long contextual prompts to Nano", () => {
    const longPrompt = `${Array(70).fill("contextual").join(" ")} snippet reference`;
    const decision = routeQuery({
      prompt: longPrompt,
      activeContext: {
        pocketCount: 1,
        hasExplicitSnippet: true,
      },
    });

    expect(decision.targetModel).toBe("flash");
    expect(decision.matchedRules).toHaveLength(0);
  });

  it("handles empty prompts by defaulting to Gemini Flash", () => {
    const decision = routeQuery({
      prompt: "   ",
    });

    expect(decision.targetModel).toBe("flash");
    expect(decision.matchedRules).toHaveLength(0);
    expect(decision.confidence).toBeGreaterThan(0);
  });
});
