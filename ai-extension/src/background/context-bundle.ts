/**
 * Context Bundle
 * 
 * Builds a compact ContextBundle from multiple signals to personalize prompts
 * across chat and enhancement flows while preserving privacy and performance.
 * 
 * Requirements: 36, 37, 38
 */

import { logger } from "./monitoring.js";
import { vectorSearchService, type SearchResult } from "./vector-search-service.js";
import type { CapturedContent } from "./indexeddb-manager.js";

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

export interface HistoryContext {
  role: "user" | "assistant";
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
  private cache = new Map<string, { bundle: ContextBundle; timestamp: number }>();
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
  async buildContextBundle(options: ContextBundleOptions): Promise<ContextBundle> {
    const startTime = performance.now();
    const maxTokens = options.maxTokens || 6000; // Default 6KB target
    
    logger.info("ContextBundleBuilder", "Building context bundle", {
      mode: options.mode,
      maxTokens,
    });

    // Check cache
    const cacheKey = this.getCacheKey(options);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.info("ContextBundleBuilder", "Returning cached bundle", { cacheKey });
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
      remainingTokens = await this.addPocketsContext(bundle, options, remainingTokens);
      remainingTokens = await this.addHistoryContext(bundle, options, remainingTokens);
      remainingTokens = await this.addPageContext(bundle, options, remainingTokens);
    } else {
      // Ask mode: prioritize history, then page, then other signals
      remainingTokens = await this.addHistoryContext(bundle, options, remainingTokens);
      remainingTokens = await this.addPageContext(bundle, options, remainingTokens);
      remainingTokens = await this.addSelectionContext(bundle, options, remainingTokens);
      remainingTokens = await this.addInputContext(bundle, options, remainingTokens);
    }

    // Add tabs context if enabled and consented
    if (this.preferences.tabs) {
      remainingTokens = await this.addTabsContext(bundle, options, remainingTokens);
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
   */
  private async addPocketsContext(
    bundle: ContextBundle,
    options: ContextBundleOptions,
    remainingTokens: number,
  ): Promise<number> {
    if (!this.preferences.pockets || !options.query) {
      return remainingTokens;
    }

    try {
      // Perform vector similarity search
      const results = await vectorSearchService.searchContent(
        options.query,
        options.pocketId,
        5, // Top 5 results
      );

      if (results.length > 0) {
        bundle.pockets = [];
        bundle.signals.push("pockets");

        for (const result of results) {
          const contentTokens = this.estimateTokens(
            typeof result.item.content === "string" ? result.item.content : ""
          );

          if (contentTokens > remainingTokens) {
            bundle.truncated = true;
            break;
          }

          bundle.pockets.push({
            content: result.item,
            relevanceScore: result.relevanceScore,
          });

          remainingTokens -= contentTokens;
          bundle.totalTokens += contentTokens;
        }

        logger.info("ContextBundleBuilder", "Added pockets context", {
          count: bundle.pockets.length,
          tokensUsed: bundle.totalTokens,
        });
      }
    } catch (error) {
      logger.error("ContextBundleBuilder", "Failed to add pockets context", error);
    }

    return remainingTokens;
  }

  /**
   * Add conversation history context
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
      // Load recent conversation history (handled by conversation-context-loader)
      // For now, we'll just reserve space and mark the signal as included
      // The actual history loading is done separately in streaming-handler
      bundle.signals.push("history");
      
      // Reserve ~2000 tokens for history
      const historyTokens = Math.min(2000, remainingTokens * 0.3);
      remainingTokens -= historyTokens;
      bundle.totalTokens += historyTokens;

      logger.info("ContextBundleBuilder", "Reserved history context", {
        tokensReserved: historyTokens,
      });
    } catch (error) {
      logger.error("ContextBundleBuilder", "Failed to add history context", error);
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
        `${pageContext.title} ${pageContext.metaDescription || ""}`
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
   * Estimate token count from text
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate cache key for bundle options
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
 */
export function serializeContextBundle(
  bundle: ContextBundle,
  mode: "ask" | "ai-pocket"
): string {
  const parts: string[] = [];

  // Add mode-specific preamble
  if (mode === "ai-pocket") {
    parts.push("# AI Pocket Mode - Content-Aware Assistant");
    parts.push("You have access to the user's captured content and can provide contextual responses based on their research.");
  } else {
    parts.push("# Ask Mode - General Assistant");
    parts.push("You are a helpful AI assistant providing general conversational support.");
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

  // Add pockets context (RAG results)
  if (bundle.pockets && bundle.pockets.length > 0) {
    parts.push(`\n## Relevant Captured Content`);
    parts.push(`The following content from the user's pockets is relevant to this query:`);
    
    for (let i = 0; i < bundle.pockets.length; i++) {
      const pocket = bundle.pockets[i];
      if (!pocket) continue;
      const content = pocket.content;
      const contentText = typeof content.content === "string" 
        ? content.content.slice(0, 500) 
        : "";
      
      parts.push(`\n### Content ${i + 1} (Relevance: ${(pocket.relevanceScore * 100).toFixed(0)}%)`);
      parts.push(`Source: ${content.sourceUrl}`);
      parts.push(`Type: ${content.type}`);
      if (content.metadata.title) {
        parts.push(`Title: ${content.metadata.title}`);
      }
      parts.push(`Content: ${contentText}${contentText.length >= 500 ? "..." : ""}`);
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
