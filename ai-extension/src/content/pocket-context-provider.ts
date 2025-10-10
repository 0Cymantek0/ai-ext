/**
 * Pocket Context Provider
 * Fetches relevant pocket content to provide context for text enhancement
 * Requirements: 9.5, 9.6
 */

import { sendMessage } from '../shared/message-client';
import type { PageContext } from './page-context-detector';

export interface PocketContent {
  id: string;
  pocketId: string;
  title: string;
  snippet: string;
  url: string;
  relevanceScore: number;
}

export interface PocketContextResult {
  relevantContent: PocketContent[];
  totalFound: number;
  contextSummary: string;
}

/**
 * Pocket Context Provider
 * Queries pockets for relevant content based on page context
 */
export class PocketContextProvider {
  private static readonly MAX_CONTEXT_ITEMS = 5;
  private static readonly MIN_RELEVANCE_SCORE = 0.3;
  private static readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  private static cache: Map<string, { result: PocketContextResult; timestamp: number }> = new Map();

  /**
   * Get relevant pocket content for the current page context
   */
  public static async getRelevantContent(
    pageContext: PageContext,
    query?: string
  ): Promise<PocketContextResult> {
    // Check cache
    const cacheKey = this.getCacheKey(pageContext, query);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION_MS) {
      console.debug('[PocketContextProvider] Using cached result');
      return cached.result;
    }

    try {
      // Query service worker for relevant pockets
      const searchQuery = this.buildSearchQuery(pageContext, query);
      
      console.debug('[PocketContextProvider] Searching for relevant content', {
        query: searchQuery,
        domain: pageContext.domain
      });

      // Search by domain first
      const domainResults = await this.searchByDomain(pageContext.domain);
      
      // Search by keywords
      const keywordResults = await this.searchByKeywords(pageContext.keywords || []);
      
      // Search by query if provided
      const queryResults = query ? await this.searchByQuery(query) : [];

      // Combine and rank results
      const allResults = this.combineAndRankResults(
        domainResults,
        keywordResults,
        queryResults,
        pageContext
      );

      // Filter by relevance score
      const relevantContent = allResults
        .filter(item => item.relevanceScore >= this.MIN_RELEVANCE_SCORE)
        .slice(0, this.MAX_CONTEXT_ITEMS);

      // Generate context summary
      const contextSummary = this.generateContextSummary(relevantContent, pageContext);

      const result: PocketContextResult = {
        relevantContent,
        totalFound: allResults.length,
        contextSummary
      };

      // Cache result
      this.cache.set(cacheKey, { result, timestamp: Date.now() });

      // Clean old cache entries
      this.cleanCache();

      return result;
    } catch (error) {
      console.error('[PocketContextProvider] Failed to get relevant content', error);
      
      // Return empty result on error
      return {
        relevantContent: [],
        totalFound: 0,
        contextSummary: ''
      };
    }
  }

  /**
   * Search pockets by domain
   */
  private static async searchByDomain(domain: string): Promise<PocketContent[]> {
    try {
      const response = await sendMessage('POCKET_LIST', {
        filter: { domain }
      });

      if (response.success && response.data) {
        return this.convertToPocketContent(response.data);
      }
    } catch (error) {
      console.error('[PocketContextProvider] Domain search failed', error);
    }

    return [];
  }

  /**
   * Search pockets by keywords
   */
  private static async searchByKeywords(keywords: string[]): Promise<PocketContent[]> {
    if (keywords.length === 0) return [];

    try {
      const response = await sendMessage('POCKET_LIST', {
        filter: { keywords }
      });

      if (response.success && response.data) {
        return this.convertToPocketContent(response.data);
      }
    } catch (error) {
      console.error('[PocketContextProvider] Keyword search failed', error);
    }

    return [];
  }

  /**
   * Search pockets by query string
   */
  private static async searchByQuery(query: string): Promise<PocketContent[]> {
    try {
      const response = await sendMessage('POCKET_LIST', {
        filter: { query }
      });

      if (response.success && response.data) {
        return this.convertToPocketContent(response.data);
      }
    } catch (error) {
      console.error('[PocketContextProvider] Query search failed', error);
    }

    return [];
  }

  /**
   * Convert raw pocket data to PocketContent
   */
  private static convertToPocketContent(data: any[]): PocketContent[] {
    return data.map(item => ({
      id: item.id || '',
      pocketId: item.pocketId || '',
      title: item.title || item.name || 'Untitled',
      snippet: this.extractSnippet(item.content || ''),
      url: item.url || item.sourceUrl || '',
      relevanceScore: 0 // Will be calculated later
    }));
  }

  /**
   * Extract snippet from content
   */
  private static extractSnippet(content: string, maxLength: number = 200): string {
    if (!content) return '';
    
    const text = content.replace(/<[^>]*>/g, '').trim();
    if (text.length <= maxLength) return text;
    
    return text.substring(0, maxLength).trim() + '...';
  }

  /**
   * Combine and rank results from different sources
   */
  private static combineAndRankResults(
    domainResults: PocketContent[],
    keywordResults: PocketContent[],
    queryResults: PocketContent[],
    pageContext: PageContext
  ): PocketContent[] {
    // Create a map to deduplicate
    const resultMap = new Map<string, PocketContent>();

    // Add domain results with high score
    domainResults.forEach(item => {
      item.relevanceScore = 0.8;
      resultMap.set(item.id, item);
    });

    // Add keyword results with medium score
    keywordResults.forEach(item => {
      if (resultMap.has(item.id)) {
        // Boost score if already found
        const existing = resultMap.get(item.id)!;
        existing.relevanceScore = Math.min(1.0, existing.relevanceScore + 0.3);
      } else {
        item.relevanceScore = 0.5;
        resultMap.set(item.id, item);
      }
    });

    // Add query results with variable score
    queryResults.forEach(item => {
      if (resultMap.has(item.id)) {
        // Boost score if already found
        const existing = resultMap.get(item.id)!;
        existing.relevanceScore = Math.min(1.0, existing.relevanceScore + 0.4);
      } else {
        item.relevanceScore = 0.6;
        resultMap.set(item.id, item);
      }
    });

    // Convert to array and sort by relevance
    return Array.from(resultMap.values())
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Generate context summary from relevant content
   */
  private static generateContextSummary(
    content: PocketContent[],
    pageContext: PageContext
  ): string {
    if (content.length === 0) {
      return '';
    }

    const parts: string[] = [];

    // Add page context
    parts.push(`Current page: ${pageContext.title} (${pageContext.type})`);

    // Add relevant content summary
    if (content.length > 0) {
      parts.push(`\nRelevant saved content (${content.length} items):`);
      
      content.forEach((item, index) => {
        parts.push(`${index + 1}. ${item.title}`);
        if (item.snippet) {
          parts.push(`   ${item.snippet}`);
        }
      });
    }

    return parts.join('\n');
  }

  /**
   * Build search query from page context
   */
  private static buildSearchQuery(pageContext: PageContext, userQuery?: string): string {
    const parts: string[] = [];

    if (userQuery) {
      parts.push(userQuery);
    }

    if (pageContext.keywords && pageContext.keywords.length > 0) {
      parts.push(...pageContext.keywords.slice(0, 3));
    }

    if (pageContext.metadata.category) {
      parts.push(pageContext.metadata.category);
    }

    return parts.join(' ');
  }

  /**
   * Get cache key
   */
  private static getCacheKey(pageContext: PageContext, query?: string): string {
    return `${pageContext.domain}:${pageContext.url}:${query || ''}`;
  }

  /**
   * Clean old cache entries
   */
  private static cleanCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((value, key) => {
      if (now - value.timestamp > this.CACHE_DURATION_MS) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Clear all cache
   */
  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Check if context is available
   */
  public static async hasRelevantContext(pageContext: PageContext): Promise<boolean> {
    const result = await this.getRelevantContent(pageContext);
    return result.relevantContent.length > 0;
  }
}
