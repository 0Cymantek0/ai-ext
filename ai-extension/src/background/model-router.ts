export type GeminiModelTarget = "nano" | "flash" | "pro";

export interface RouterInput {
  /**
   * Raw prompt text provided by the user prior to server-side normalization.
   */
  prompt: string;
  /**
   * Signals about the currently active retrieval context.
   * Future heuristics can incorporate these without breaking the signature.
   */
  activeContext?: {
    /** Number of pockets explicitly attached to the query. */
    pocketCount?: number;
    /** Optional caller-provided hint that snippets/selections are present. */
    hasExplicitSnippet?: boolean;
    /** Conversation or UI mode (e.g. "ai-pocket", "ask", "write"). */
    conversationMode?: string;
  };
  /**
   * Historic usage signals that may influence routing decisions later on.
   */
  history?: {
    /** The last model used in this conversation, if any. */
    priorModel?: GeminiModelTarget;
    /** Total number of turns in the conversation. */
    turnCount?: number;
  };
}

export interface RouteDecision {
  targetModel: GeminiModelTarget;
  confidence: number;
  reason: string;
  matchedRules: string[];
  /** Optional diagnostic metadata reserved for future observability hooks. */
  metadata?: {
    wordCount: number;
    researchKeyword?: string;
  };
}

const SHORT_QUERY_WORD_THRESHOLD = 60;
const RESEARCH_CONFIDENCE = 0.92;
const SHORT_CONTEXT_CONFIDENCE = 0.82;
const DEFAULT_CONFIDENCE = 0.6;

const RESEARCH_KEYWORDS = [
  "analyze",
  "analysis",
  "summary of findings",
  "study",
  "studies",
  "experiment",
  "experiments",
  "systematic review",
  "meta-analysis",
  "literature review",
];

const SNIPPET_CUES = [
  "snippet",
  "snippets",
  "selection",
  "selected text",
  "highlighted",
  "attached context",
  "attached snippet",
  "this text",
];

interface KeywordMatcher {
  keyword: string;
  regex: RegExp;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordMatchers(keywords: string[]): KeywordMatcher[] {
  return keywords.map((keyword) => ({
    keyword,
    regex: new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i"),
  }));
}

const RESEARCH_KEYWORD_MATCHERS = buildKeywordMatchers(RESEARCH_KEYWORDS);
const SNIPPET_CUE_MATCHERS = buildKeywordMatchers(SNIPPET_CUES);

function countWords(input: string): number {
  if (!input.trim()) {
    return 0;
  }

  const words = input.trim().match(/[^\s]+/g);
  return words ? words.length : 0;
}

function findKeywordMatch(
  prompt: string,
  matchers: KeywordMatcher[],
): string | undefined {
  if (!prompt.trim()) {
    return undefined;
  }

  const found = matchers.find(({ regex }) => regex.test(prompt));
  return found?.keyword;
}

function hasSnippetCue(prompt: string, explicitSignal = false): boolean {
  if (explicitSignal) {
    return true;
  }

  return Boolean(findKeywordMatch(prompt, SNIPPET_CUE_MATCHERS));
}

function hasPocketContext(
  activeContext: RouterInput["activeContext"],
): boolean {
  if (!activeContext) {
    return false;
  }

  if ((activeContext.pocketCount ?? 0) > 0) {
    return true;
  }

  const mode = activeContext.conversationMode?.toLowerCase();
  return mode === "ai-pocket" || mode === "pocket";
}

/**
 * Heuristic rule order:
 * 1. Research intent keywords immediately escalate to Gemini Pro.
 * 2. Short queries combined with contextual/snippet cues stay on-device with Gemini Nano.
 * 3. All other traffic defaults to Gemini Flash as the balanced baseline.
 *
 * The matchedRules array captures triggered heuristics in evaluation order so UI and telemetry
 * can surface routing rationales alongside the confidence score without replicating this logic.
 */
export function routeQuery(input: RouterInput): RouteDecision {
  const prompt = input.prompt ?? "";
  const wordCount = countWords(prompt);
  const matchedRules: string[] = [];

  const researchKeyword = findKeywordMatch(prompt, RESEARCH_KEYWORD_MATCHERS);
  if (researchKeyword) {
    matchedRules.push("research-keyword");
    return {
      targetModel: "pro",
      confidence: RESEARCH_CONFIDENCE,
      reason: `Research intent detected via keyword: "${researchKeyword}"`,
      matchedRules,
      metadata: {
        wordCount,
        researchKeyword,
      },
    };
  }

  const context = input.activeContext;
  const hasContextualCue =
    hasPocketContext(context) ||
    hasSnippetCue(prompt, context?.hasExplicitSnippet === true);

  if (
    wordCount > 0 &&
    wordCount <= SHORT_QUERY_WORD_THRESHOLD &&
    hasContextualCue
  ) {
    matchedRules.push("short-contextual-query");
    return {
      targetModel: "nano",
      confidence: SHORT_CONTEXT_CONFIDENCE,
      reason:
        "Short contextual query detected; routing to Gemini Nano for low-latency retrieval",
      matchedRules,
      metadata: {
        wordCount,
      },
    };
  }

  return {
    targetModel: "flash",
    confidence: DEFAULT_CONFIDENCE,
    reason: "No routing heuristics matched; defaulting to Gemini Flash",
    matchedRules,
    metadata: {
      wordCount,
    },
  };
}
