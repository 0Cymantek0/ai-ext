/**
 * Context Bundle
 *
 * Builds a compact ContextBundle from multiple signals to personalize prompts
 * across chat and enhancement flows while preserving privacy and performance.
 *
 * Requirements: 36, 37, 38
 */

import { logger } from "./monitoring.js";
import {
  vectorSearchService,
  type SearchResult,
} from "./vector-search-service.js";
import type { CapturedContent } from "./indexeddb-manager.js";
import { conversationContextLoader } from "./conversation-context-loader.js";
import { 
  extractLLMContent, 
  extractLLMContentFromChunk,
  estimateChunkTokens 
} from "./content-extractor.js";
import type { VectorChunk, ChunkSearchResult } from "./vector-chunk-types.js";

/**
 * Context signal types
 */
export interface SelectionContext {
  text: string;
  surroundingText?: string;
}

export interface InputContext {
  tagName: string;
  type: string;
  role?: string;
  placeholder?: string;
  intent?: string;
}

export interface PageContext {
  title: string;
  url: string;
  domain: string;
  contextType: "general" | "sensitive" | "work" | "social";
  metaDescription?: string;
  metaKeywords?: string[];
}

export interface TabContext {
  title: string;
  url: string;
  domain: string;
  contextType: "general" | "sensitive" | "work" | "social";
}

export interface PocketContext {
  content: CapturedContent;
  relevanceScore: number;
}

export interface ChunkContext {
  chunk: VectorChunk;
  relevanceScore: number;
}

export interface HistoryContext {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

/**
 * Context Bundle - aggregated context from multiple signals
 */
export interface ContextBundle {
  // Signal data
  selection?: SelectionContext;
  input?: InputContext;
  page?: PageContext;
  tabs?: TabContext[];
  pockets?: PocketContext[];
  chunks?: ChunkContext[];  // Chunk-level RAG results
  history?: HistoryContext[];

  // Metadata
  totalTokens: number;
  truncated: boolean;
  signals: string[]; // List of included signal types
  timestamp: number;
}

/**
 * Context preferences - per-signal toggles
 */
export interface ContextPreferences {
  selection: boolean;
  page: boolean;
  tabs: boolean;
  input: boolean;
  pockets: boolean;
  history: boolean;

  // Per-site sensitive gating
  sensitiveSites: string[]; // Domains where context is disabled by default
  siteOverrides: Record<string, boolean>; // Per-site enable/disable
}

/**
 * Context Bundle Builder Options
 */
export interface ContextBundleOptions {
  mode: "ask" | "ai-pocket";
  query?: string | undefined;
  pocketId?: string | undefined;
  conversationId?: string | undefined;
  maxTokens?: number | undefined; // Default 4-8KB
  preferences?: Partial<ContextPreferences> | undefined;
}

/**
 * Default context preferences
 */
const DEFAULT_PREFERENCES: ContextPreferences = {
  selection: true,
  page: true,
  tabs: false, // Requires first-use consent
  input: true,
  pockets: true,
  history: true,
  sensitiveSites: [
    "bank",
    "banking",
    "healthcare",
    "health",
    "medical",
    "gov",
    "government",
    "password",
    "credit",
  ],
  siteOverrides: {},
};

/**
 * Context Bundle Builder
 * Aggregates context from multiple sources and enforces size budgets
 */
export class ContextBundleBuilder {
  private preferences: ContextPreferences;
  private cache = new Map<
    string,
    { bundle: ContextBundle; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(preferences?: Partial<ContextPreferences>) {
    this.preferences = { ...DEFAULT_PREFERENCES, ...preferences };
  }

  /**
   * Build a context bundle from available signals
   *
   * @param options Bundle building options
   * @returns Context bundle
   */
  async buildContextBundle(
    options: ContextBundleOptions,
  ): Promise<ContextBundle> {
    const startTime = performance.now();
    const maxTokens = options.maxTokens ?? this.determineBudget(options);

    logger.info("ContextBundleBuilder", "Building context bundle", {
      mode: options.mode,
      maxTokens,
    });

    // Check cache
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info("ContextBundleBuilder", "Returning cached bundle", {
        cacheKey,
      });
      return cached.bundle;
    }

    const bundle: ContextBundle = {
      totalTokens: 0,
      truncated: false,
      signals: [],
      timestamp: Date.now(),
    };

    let remainingTokens = maxTokens;

    // Priority order based on mode
    if (options.mode === "ai-pocket") {
      // AI Pocket mode: prioritize pockets, then history, then page context
      remainingTokens = await this.addPocketsContext(
        bundle,
        options,
        remainingTokens,
      );
      remainingTokens = await this.addHistoryContext(
        bundle,
        options,
        remainingTokens,
      );
      remainingTokens = await this.addPageContext(
        bundle,
        options,
        remainingTokens,
      );
    } else {
      // Ask mode: prioritize history, then pockets (if provided), then page, then other signals
      remainingTokens = await this.addHistoryContext(
        bundle,
        options,
        remainingTokens,
      );

      // Support RAG in Ask mode when pocketId is provided
      if (options.pocketId) {
        remainingTokens = await this.addPocketsContext(
          bundle,
          options,
          remainingTokens,
        );
      }

      remainingTokens = await this.addPageContext(
        bundle,
        options,
        remainingTokens,
      );
      remainingTokens = await this.addSelectionContext(
        bundle,
        options,
        remainingTokens,
      );
      remainingTokens = await this.addInputContext(
        bundle,
        options,
        remainingTokens,
      );
    }

    // Add tabs context if enabled and consented
    if (this.preferences.tabs) {
      remainingTokens = await this.addTabsContext(
        bundle,
        options,
        remainingTokens,
      );
    }

    // Mark as truncated if we ran out of budget
    if (remainingTokens < maxTokens * 0.1) {
      bundle.truncated = true;
    }

    const buildTime = performance.now() - startTime;
    logger.info("ContextBundleBuilder", "Context bundle built", {
      signals: bundle.signals,
      totalTokens: bundle.totalTokens,
      truncated: bundle.truncated,
      buildTime: `${buildTime.toFixed(2)}ms`,
    });

    // Cache the bundle
    this.cache.set(cacheKey, { bundle, timestamp: Date.now() });

    // Cleanup old cache entries
    this.cleanupCache();

    return bundle;
  }

  /**
   * Add pockets context (RAG retrieval)
   * Supports chunk-level semantic search with pocket scoping
   * Aggregates up to 5 chunks while respecting 1k-1.5k token reserve
   */
  private async addPocketsContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.pockets || !options.query) {
      logger.info("ContextBundleBuilder", "Skipping pockets context", {
        preferencesEnabled: this.preferences.pockets,
        hasQuery: !!options.query,
      });
      return remainingTokens;
    }

    try {
      // Reserve 1k-1.5k tokens for response and other context
      const RESERVED_TOKENS = 1250; // Middle of 1k-1.5k range
      const availableForChunks = Math.max(0, remainingTokens - RESERVED_TOKENS);

      if (availableForChunks < 100) {
        logger.warn("ContextBundleBuilder", "Insufficient tokens for RAG", {
          remainingTokens,
          reserved: RESERVED_TOKENS,
          available: availableForChunks,
        });
        return remainingTokens;
      }

      // Perform chunk-level vector similarity search with pocket scoping
      logger.info("ContextBundleBuilder", "Performing chunk-level RAG search", {
        query: options.query,
        pocketId: options.pocketId || "all",
        mode: options.mode,
        availableTokens: availableForChunks,
      });

      const chunkResults = await vectorSearchService.searchChunks(
        options.query,
        {
          pocketId: options.pocketId || undefined,
          topK: 5, // Request top 5 chunks
          minRelevance: 0.3,
          maxTokens: availableForChunks,
        }
      );

      if (chunkResults.length > 0) {
        bundle.chunks = [];
        bundle.signals.push("chunks");

        // Track tokens before adding chunks
        const tokensBeforeChunks = bundle.totalTokens;
        let chunksAdded = 0;
        let tokensUsed = 0;

        for (const result of chunkResults) {
          // Estimate tokens for this chunk (includes metadata overhead)
          const chunkTokens = estimateChunkTokens(result.chunk);

          // Check if we have budget for this chunk
          if (tokensUsed + chunkTokens > availableForChunks) {
            logger.info(
              "ContextBundleBuilder",
              "Reached token budget for chunks",
              {
                chunksAdded,
                tokensUsed,
                available: availableForChunks,
                skippedChunks: chunkResults.length - chunksAdded,
              },
            );
            bundle.truncated = true;
            break;
          }

          // Add chunk to bundle
          bundle.chunks.push({
            chunk: result.chunk,
            relevanceScore: result.relevanceScore,
          });

          tokensUsed += chunkTokens;
          chunksAdded++;

          // Stop at 5 chunks max
          if (chunksAdded >= 5) {
            break;
          }
        }

        // Update token accounting
        bundle.totalTokens += tokensUsed;
        remainingTokens -= tokensUsed;

        logger.info("ContextBundleBuilder", "Added chunks context via RAG", {
          chunksAdded,
          tokensUsed,
          tokensReserved: RESERVED_TOKENS,
          tokensRemaining: remainingTokens,
          avgRelevance: (
            bundle.chunks.reduce((sum, c) => sum + c.relevanceScore, 0) /
            bundle.chunks.length
          ).toFixed(2),
          pocketScoped: !!options.pocketId,
        });
      } else {
        // No results found - graceful fallback
        logger.warn(
          "ContextBundleBuilder",
          "No relevant chunks found via RAG",
          {
            query: options.query,
            pocketId: options.pocketId || "all",
            mode: options.mode,
          },
        );
      }
    } catch (error) {
      logger.error("ContextBundleBuilder", "Failed to add chunks context", {
        error: error instanceof Error ? error.message : String(error),
        query: options.query,
        pocketId: options.pocketId,
      });
    }

    return remainingTokens;
  }

  /**
   * Add conversation history context
   * Requirement 36.5, 36.7, 36.11: Load actual conversation history
   */
  private async addHistoryContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.history || !options.conversationId) {
      return remainingTokens;
    }

    try {
      // Load actual conversation history using ConversationContextLoader
      const conversationContext =
        await conversationContextLoader.buildConversationContext(
          options.conversationId,
        );

      if (conversationContext.messages.length === 0) {
        logger.info(
          "ContextBundleBuilder",
          "No conversation history available",
          {
            conversationId: options.conversationId,
          },
        );
        return remainingTokens;
      }

      // Convert formatted messages to HistoryContext
      const historyContexts: HistoryContext[] =
        conversationContext.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          timestamp: Date.now(), // Actual timestamp would come from Message object
        }));

      // Calculate actual token usage
      const historyTokens = conversationContext.totalTokens;

      // Check if we have enough budget
      if (historyTokens > remainingTokens) {
        // Try to fit what we can by limiting message count
        const maxMessages = Math.floor(
          remainingTokens / (historyTokens / historyContexts.length),
        );

        if (maxMessages > 0) {
          // Take the most recent messages that fit
          bundle.history = historyContexts.slice(-maxMessages);
          const actualTokens = Math.ceil(
            historyTokens * (maxMessages / historyContexts.length),
          );

          bundle.signals.push("history");
          bundle.totalTokens += actualTokens;
          bundle.truncated = true;
          remainingTokens -= actualTokens;

          logger.info(
            "ContextBundleBuilder",
            "Added truncated history context",
            {
              totalMessages: historyContexts.length,
              includedMessages: maxMessages,
              tokensUsed: actualTokens,
              truncated: true,
            },
          );
        } else {
          logger.warn(
            "ContextBundleBuilder",
            "Insufficient tokens for history context",
            {
              required: historyTokens,
              available: remainingTokens,
            },
          );
        }
      } else {
        // We have enough budget for all history
        bundle.history = historyContexts;
        bundle.signals.push("history");
        bundle.totalTokens += historyTokens;
        remainingTokens -= historyTokens;

        logger.info("ContextBundleBuilder", "Added full history context", {
          messageCount: historyContexts.length,
          tokensUsed: historyTokens,
          truncated: conversationContext.truncated,
        });
      }
    } catch (error) {
      logger.error(
        "ContextBundleBuilder",
        "Failed to add history context",
        error,
      );
    }

    return remainingTokens;
  }

  /**
   * Add page context
   */
  private async addPageContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.page) {
      return remainingTokens;
    }

    try {
      // Get current page context from content script
      // For now, we'll create a placeholder
      // In production, this would query the active tab's content script

      const pageContext: PageContext = {
        title: "Current Page",
        url: "https://example.com",
        domain: "example.com",
        contextType: "general",
      };

      const pageTokens = this.estimateTokens(
        `${pageContext.title} ${pageContext.metaDescription || ""}`,
      );

      if (pageTokens <= remainingTokens) {
        bundle.page = pageContext;
        bundle.signals.push("page");
        remainingTokens -= pageTokens;
        bundle.totalTokens += pageTokens;

        logger.info("ContextBundleBuilder", "Added page context", {
          tokensUsed: pageTokens,
        });
      }
    } catch (error) {
      logger.error("ContextBundleBuilder", "Failed to add page context", error);
    }

    return remainingTokens;
  }

  /**
   * Add selection context
   */
  private async addSelectionContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.selection) {
      return remainingTokens;
    }

    // Selection context would be provided by content script
    // For now, this is a placeholder
    return remainingTokens;
  }

  /**
   * Add input context
   */
  private async addInputContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.input) {
      return remainingTokens;
    }

    // Input context would be provided by content script
    // For now, this is a placeholder
    return remainingTokens;
  }

  /**
   * Add tabs context
   */
  private async addTabsContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    try {
      // Get recent tabs (up to 6)
      // For now, this is a placeholder
      // In production, this would query chrome.tabs API

      bundle.signals.push("tabs");
      logger.info("ContextBundleBuilder", "Added tabs context");
    } catch (error) {
      logger.error("ContextBundleBuilder", "Failed to add tabs context", error);
    }

    return remainingTokens;
  }

  /**
   * Determine token budget based on mode and context
   * Centralized logic for token budget allocation
   */
  private determineBudget(options: ContextBundleOptions): number {
    if (options.mode === 'ask' && !options.pocketId) {
      return 4000; // Standard budget for Ask mode without RAG
    }
    // Default for RAG-enabled modes ('ask' with pocketId, 'ai-pocket')
    return 6000;
  }

  /**
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate cache key for bundle options
   * Note: Cache includes conversation ID to ensure history changes invalidate cache
   */
  private getCacheKey(options: ContextBundleOptions): string {
    return `${options.mode}-${options.query || ""}-${options.pocketId || ""}-${options.conversationId || ""}`;
  }

  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info("ContextBundleBuilder", "Cache cleared");
  }

  /**
   * Invalidate cache for a specific URL
   */
  invalidateCacheForUrl(url: string): void {
    for (const [key] of this.cache.entries()) {
      if (key.includes(url)) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Serialize ContextBundle into compact system preamble for chat
 * Requirement 38.1, 38.2: Include history context in serialization
 */
export function serializeContextBundle(
  bundle: ContextBundle,
  mode: "ask" | "ai-pocket",
): string {
  const parts: string[] = [];

  // Add mode-specific preamble
  if (mode === "ai-pocket") {
    parts.push("# AI Pocket Mode - Content-Aware Assistant");
    parts.push(
      "You have access to the user's captured content and can provide contextual responses based on their research.",
    );
  } else {
    parts.push("# Ask Mode - General Assistant");
    parts.push(
      "You are a helpful AI assistant providing general conversational support.",
    );
  }

  // Add conversation history context
  if (bundle.history && bundle.history.length > 0) {
    parts.push(`\n## Conversation History`);
    parts.push(
      `Recent conversation context (${bundle.history.length} messages):`,
    );

    for (const msg of bundle.history) {
      const roleLabel =
        msg.role === "user"
          ? "User"
          : msg.role === "assistant"
            ? "Assistant"
            : "System";
      // Truncate long messages for context preamble
      const content =
        msg.content.length > 200
          ? msg.content.slice(0, 200) + "..."
          : msg.content;
      parts.push(`- ${roleLabel}: ${content}`);
    }
  }

  // Add page context
  if (bundle.page) {
    parts.push(`\n## Current Page Context`);
    parts.push(`- Title: ${bundle.page.title}`);
    parts.push(`- Domain: ${bundle.page.domain}`);
    if (bundle.page.metaDescription) {
      parts.push(`- Description: ${bundle.page.metaDescription}`);
    }
  }

  // Add chunks context (chunk-level RAG results)
  if (bundle.chunks && bundle.chunks.length > 0) {
    parts.push(`\n## Relevant Content Chunks`);
    parts.push(
      `The following ${bundle.chunks.length} chunk(s) from the user's pockets are relevant to this query:`,
    );

    for (let i = 0; i < bundle.chunks.length; i++) {
      const chunkContext = bundle.chunks[i];
      if (!chunkContext) continue;
      
      const { chunk, relevanceScore } = chunkContext;
      const { metadata } = chunk;

      parts.push(
        `\n### Chunk ${i + 1} (Relevance: ${(relevanceScore * 100).toFixed(0)}%)`,
      );
      
      // Add metadata
      if (metadata.title) {
        parts.push(`Title: ${metadata.title}`);
      }
      parts.push(`Source: ${metadata.sourceUrl}`);
      parts.push(`Type: ${metadata.sourceType}`);
      
      // Add chunk position info
      if (metadata.totalChunks > 1) {
        parts.push(`Part: ${metadata.chunkIndex + 1} of ${metadata.totalChunks}`);
      }
      
      // Add timestamp
      const capturedDate = new Date(metadata.capturedAt).toLocaleDateString();
      parts.push(`Captured: ${capturedDate}`);
      
      // Add chunk text
      parts.push(`\nContent:\n${chunk.text}`);
    }
  }

  // Add pockets context (legacy full-content RAG results)
  if (bundle.pockets && bundle.pockets.length > 0) {
    parts.push(`\n## Relevant Captured Content`);
    parts.push(
      `The following content from the user's pockets is relevant to this query:`,
    );

    for (let i = 0; i < bundle.pockets.length; i++) {
      const pocket = bundle.pockets[i];
      if (!pocket) continue;
      const content = pocket.content;
      const contentText =
        typeof content.content === "string"
          ? content.content.slice(0, 500)
          : "";

      parts.push(
        `\n### Content ${i + 1} (Relevance: ${(pocket.relevanceScore * 100).toFixed(0)}%)`,
      );
      parts.push(`Source: ${content.sourceUrl}`);
      parts.push(`Type: ${content.type}`);
      if (content.metadata.title) {
        parts.push(`Title: ${content.metadata.title}`);
      }
      parts.push(
        `Content: ${contentText}${contentText.length >= 500 ? "..." : ""}`,
      );
    }
  }

  // Add tabs context
  if (bundle.tabs && bundle.tabs.length > 0) {
    parts.push(`\n## Open Tabs Context`);
    parts.push(`The user has ${bundle.tabs.length} relevant tabs open:`);
    for (const tab of bundle.tabs) {
      parts.push(`- ${tab.title} (${tab.domain})`);
    }
  }

  // Add metadata
  if (bundle.truncated) {
    parts.push(`\n*Note: Context was truncated to fit token budget*`);
  }

  return parts.join("\n");
}

// Export singleton instance
export const contextBundleBuilder = new ContextBundleBuilder();
