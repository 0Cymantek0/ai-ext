import type { AIMode } from "./mode-aware-processor";

export interface RouteQueryInput {
  prompt: string;
  mode: AIMode;
  context?: {
    pocketId?: string;
    autoContext?: boolean;
  };
  conversation?: {
    id?: string;
    metadata?: {
      messageCount?: number;
      totalTokens?: number;
      truncated?: boolean;
    };
  };
  overrides?: {
    model?: "nano" | "flash" | "pro";
    preferLocal?: boolean;
  };
}

export interface RoutingDecision {
  targetModel: "nano" | "flash" | "pro";
  reason: string;
  confidence: number;
  preferLocal?: boolean;
  metadata?: Record<string, unknown>;
}

const COMPLEXITY_KEYWORDS = [
  "analyze",
  "analysis",
  "plan",
  "strategy",
  "architecture",
  "deep dive",
  "research",
  "compare",
  "synthesize",
  "code review",
  "refactor",
];

function prefersCloudFromPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return COMPLEXITY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function mapTargetModelToPreference(model: "nano" | "flash" | "pro"): boolean {
  return model === "nano";
}

export async function routeQuery(
  input: RouteQueryInput,
): Promise<RoutingDecision> {
  const { overrides } = input;

  if (overrides?.model) {
    const targetModel = overrides.model;
    return {
      targetModel,
      reason: "Explicit model override",
      confidence: 1,
      preferLocal:
        overrides.preferLocal ?? mapTargetModelToPreference(targetModel),
      metadata: {
        origin: "override",
      },
    };
  }

  const promptLength = input.prompt.trim().length;
  const messageCount = input.conversation?.metadata?.messageCount ?? 0;
  const totalTokens = input.conversation?.metadata?.totalTokens ?? 0;
  const hasPocketContext = Boolean(input.context?.pocketId);

  const decisionPath: string[] = [];

  let targetModel: "nano" | "flash" | "pro" = "nano";
  let reason = "Default to Gemini Nano for lightweight requests";
  let confidence = 0.65;

  if (input.mode === "ai-pocket" || hasPocketContext) {
    targetModel = "flash";
    reason = "Pocket context requests benefit from cloud retrieval";
    confidence = 0.75;
    decisionPath.push("pocket-context");
  }

  if (promptLength > 1800 || messageCount > 12 || totalTokens > 6000) {
    targetModel = "flash";
    reason =
      "Conversation length suggests using Gemini Flash for larger context";
    confidence = Math.max(confidence, 0.78);
    decisionPath.push("long-context");
  }

  if (promptLength > 4000 || prefersCloudFromPrompt(input.prompt)) {
    targetModel = "pro";
    reason = "Complex query detected; escalating to Gemini Pro";
    confidence = Math.max(confidence, 0.85);
    decisionPath.push("complex-query");
  }

  const preferLocal = mapTargetModelToPreference(targetModel);

  return {
    targetModel,
    reason,
    confidence,
    preferLocal,
    metadata: {
      heuristics: {
        promptLength,
        messageCount,
        totalTokens,
        mode: input.mode,
        hasPocketContext,
      },
      decisionPath,
    },
  };
}
