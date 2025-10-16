/**
 * Semantic Search Service
 * 
 * Provides intelligent conversation search using AI-generated metadata
 * and semantic understanding of search queries.
 * 
 * Features:
 * - Fuzzy matching for typos
 * - Synonym and related term expansion
 * - Multi-factor scoring with recency boost
 * - Content-based search as fallback
 * - Comprehensive search that doesn't miss results
 */

import { AIManager } from "./ai-manager.js";
import { logger } from "./monitoring.js";
import type { Conversation, ConversationMetadata } from "./indexeddb-manager.js";

export interface SearchResult {
  conversation: Conversation;
  relevanceScore: number;
  matchedFields: string[];
  matchDetails?: {
    exactMatches: number;
    fuzzyMatches: number;
    synonymMatches: number;
    contentMatches: number;
  };
}

export class SemanticSearchService {
  private aiManager: AIManager;
  private searchCache: Map<string, { keywords: string[]; topics: string[]; intent: string; timestamp: number }> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes

  constructor(aiManager: AIManager) {
    this.aiManager = aiManager;
  }

  /**
   * Calculate Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = Array(len1 + 1).fill(0).map(() => Array(len2 + 1).fill(0));

    for (let i = 0; i <= len1; i++) {
      matrix[i]![0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j - 1]! + cost
        );
      }
    }

    return matrix[len1]![len2]!;
  }

  /**
   * Check if two strings are similar (fuzzy match)
   */
  private isFuzzyMatch(str1: string, str2: string, threshold: number = 0.8): boolean {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return true;
    if (shorter.length === 0) return false;

    const distance = this.levenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
    const similarity = (longer.length - distance) / longer.length;

    return similarity >= threshold;
  }

  /**
   * Check if string contains partial match
   */
  private hasPartialMatch(text: string, query: string): boolean {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();

    // Exact substring match
    if (textLower.includes(queryLower)) return true;

    // Check if all query words appear in text
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    return queryWords.every(word => textLower.includes(word));
  }

  /**
   * Search conversations using semantic understanding with robust matching
   */
  async searchConversations(
    query: string,
    conversations: Conversation[]
  ): Promise<SearchResult[]> {
    try {
      if (!query.trim()) {
        return [];
      }

      // Use AI to understand the search intent and extract key concepts
      const searchIntent = await this.analyzeSearchQuery(query);

      // Score each conversation comprehensively
      const results: SearchResult[] = [];

      for (const conversation of conversations) {
        const result = await this.scoreConversationComprehensive(
          conversation,
          query,
          searchIntent
        );

        if (result.relevanceScore > 0) {
          results.push(result);
        }
      }

      // Sort by relevance score (highest first), with recency as tiebreaker
      results.sort((a, b) => {
        if (Math.abs(a.relevanceScore - b.relevanceScore) < 1) {
          // If scores are very close, prefer more recent conversations
          return b.conversation.updatedAt - a.conversation.updatedAt;
        }
        return b.relevanceScore - a.relevanceScore;
      });

      logger.info("SemanticSearch", "Search completed", {
        query,
        resultsCount: results.length,
        topScore: results[0]?.relevanceScore || 0,
      });

      return results;
    } catch (error) {
      logger.error("SemanticSearch", "Search failed", { error });
      // Fallback to basic search
      return this.fallbackSearch(query, conversations);
    }
  }

  /**
   * Comprehensive scoring that combines metadata and content search
   */
  private async scoreConversationComprehensive(
    conversation: Conversation,
    query: string,
    searchIntent: { keywords: string[]; topics: string[]; intent: string }
  ): Promise<SearchResult> {
    let totalScore = 0;
    const matchedFields: string[] = [];
    const matchDetails = {
      exactMatches: 0,
      fuzzyMatches: 0,
      synonymMatches: 0,
      contentMatches: 0,
    };

    // 1. Metadata-based scoring (if available)
    if (conversation.metadata) {
      const metadataResult = this.scoreMetadata(
        conversation.metadata,
        query,
        searchIntent
      );
      totalScore += metadataResult.score;
      matchedFields.push(...metadataResult.matchedFields);
      matchDetails.exactMatches += metadataResult.exactMatches;
      matchDetails.fuzzyMatches += metadataResult.fuzzyMatches;
      matchDetails.synonymMatches += metadataResult.synonymMatches;
    }

    // 2. Content-based scoring (ALWAYS search content for robustness)
    const contentResult = this.scoreContent(conversation, query, searchIntent);
    totalScore += contentResult.score;
    if (contentResult.score > 0) {
      matchedFields.push("content");
      matchDetails.contentMatches = contentResult.matches;
    }

    // 3. Recency boost (prefer recent conversations)
    const ageInDays = (Date.now() - conversation.updatedAt) / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(0, 20 - ageInDays * 2); // Up to 20 points for very recent
    totalScore += recencyBoost;

    // 4. Conversation depth boost (longer conversations might be more valuable)
    const depthBoost = Math.min(10, conversation.messages.length * 0.5);
    totalScore += depthBoost;

    return {
      conversation,
      relevanceScore: totalScore,
      matchedFields: [...new Set(matchedFields)],
      matchDetails,
    };
  }

  /**
   * Analyze search query to understand intent with caching
   */
  private async analyzeSearchQuery(query: string): Promise<{
    keywords: string[];
    topics: string[];
    intent: string;
  }> {
    // Check cache first
    const cached = this.searchCache.get(query);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.debug("SemanticSearch", "Using cached query analysis", { query });
      return cached;
    }

    try {
      const prompt = `Analyze this search query and extract key information in JSON format:

Query: "${query}"

Extract:
- keywords: Array of important keywords and related terms (lowercase)
- topics: Array of topics the user is looking for
- intent: Brief description of what the user wants to find
- synonyms: Array of synonyms or related terms for the main keywords

Respond ONLY with valid JSON:`;

      const sessionId = await this.aiManager.createSession({
        temperature: 0.2,
      });

      const response = await this.aiManager.processPrompt(sessionId, prompt);

      if (!response) {
        return this.fallbackQueryAnalysis(query);
      }

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.fallbackQueryAnalysis(query);
      }

      const analysis = JSON.parse(jsonMatch[0]);
      const result = {
        keywords: Array.isArray(analysis.keywords)
          ? analysis.keywords.map((k: string) => k.toLowerCase())
          : [],
        topics: Array.isArray(analysis.topics) ? analysis.topics : [],
        intent: analysis.intent || query,
      };

      // Add synonyms to keywords if provided
      if (Array.isArray(analysis.synonyms)) {
        result.keywords.push(...analysis.synonyms.map((s: string) => s.toLowerCase()));
      }

      // Cache the result
      this.searchCache.set(query, { ...result, timestamp: Date.now() });

      return result;
    } catch (error) {
      logger.warn("SemanticSearch", "Query analysis failed, using fallback", { error });
      return this.fallbackQueryAnalysis(query);
    }
  }

  /**
   * Fallback query analysis when AI fails
   */
  private fallbackQueryAnalysis(query: string): {
    keywords: string[];
    topics: string[];
    intent: string;
  } {
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    return {
      keywords,
      topics: keywords,
      intent: query,
    };
  }

  /**
   * Score metadata with exact, fuzzy, and partial matching
   */
  private scoreMetadata(
    metadata: ConversationMetadata,
    query: string,
    searchIntent: { keywords: string[]; topics: string[]; intent: string }
  ): { score: number; matchedFields: string[]; exactMatches: number; fuzzyMatches: number; synonymMatches: number } {
    let score = 0;
    const matchedFields: string[] = [];
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let synonymMatches = 0;
    const queryLower = query.toLowerCase();

    // 1. Check summary (highest weight)
    if (metadata.summary.toLowerCase().includes(queryLower)) {
      score += 100;
      exactMatches++;
      matchedFields.push("summary");
    } else if (this.hasPartialMatch(metadata.summary, query)) {
      score += 60;
      fuzzyMatches++;
      matchedFields.push("summary");
    }

    // 2. Check keywords with exact, fuzzy, and synonym matching
    for (const kw of searchIntent.keywords) {
      for (const mk of metadata.keywords) {
        if (mk === kw) {
          score += 40;
          exactMatches++;
          matchedFields.push("keywords");
        } else if (mk.includes(kw) || kw.includes(mk)) {
          score += 30;
          synonymMatches++;
          matchedFields.push("keywords");
        } else if (this.isFuzzyMatch(mk, kw, 0.75)) {
          score += 20;
          fuzzyMatches++;
          matchedFields.push("keywords");
        }
      }
    }

    // 3. Check topics with flexible matching
    for (const topic of searchIntent.topics) {
      for (const mt of metadata.topics) {
        const mtLower = mt.toLowerCase();
        const topicLower = topic.toLowerCase();

        if (mtLower === topicLower) {
          score += 50;
          exactMatches++;
          matchedFields.push("topics");
        } else if (mtLower.includes(topicLower) || topicLower.includes(mtLower)) {
          score += 35;
          synonymMatches++;
          matchedFields.push("topics");
        } else if (this.isFuzzyMatch(mtLower, topicLower, 0.8)) {
          score += 25;
          fuzzyMatches++;
          matchedFields.push("topics");
        }
      }
    }

    // 4. Check entities
    for (const kw of searchIntent.keywords) {
      for (const entity of metadata.entities) {
        const entityLower = entity.toLowerCase();

        if (entityLower === kw) {
          score += 35;
          exactMatches++;
          matchedFields.push("entities");
        } else if (entityLower.includes(kw) || kw.includes(entityLower)) {
          score += 25;
          synonymMatches++;
          matchedFields.push("entities");
        } else if (this.isFuzzyMatch(entityLower, kw, 0.8)) {
          score += 15;
          fuzzyMatches++;
          matchedFields.push("entities");
        }
      }
    }

    // 5. Check main questions
    for (const question of metadata.mainQuestions) {
      const questionLower = question.toLowerCase();

      if (questionLower.includes(queryLower)) {
        score += 45;
        exactMatches++;
        matchedFields.push("questions");
      } else if (this.hasPartialMatch(question, query)) {
        score += 30;
        fuzzyMatches++;
        matchedFields.push("questions");
      }
    }

    return { score, matchedFields, exactMatches, fuzzyMatches, synonymMatches };
  }

  /**
   * Score conversation content directly (always search for robustness)
   */
  private scoreContent(
    conversation: Conversation,
    query: string,
    searchIntent: { keywords: string[]; topics: string[]; intent: string }
  ): { score: number; matches: number } {
    let score = 0;
    let matches = 0;
    const queryLower = query.toLowerCase();

    for (const message of conversation.messages) {
      const contentLower = message.content.toLowerCase();

      // Exact query match in content
      if (contentLower.includes(queryLower)) {
        score += message.role === "user" ? 25 : 15;
        matches++;
      }

      // Keyword matches in content
      for (const keyword of searchIntent.keywords) {
        if (contentLower.includes(keyword)) {
          score += message.role === "user" ? 10 : 5;
          matches++;
        }
      }

      // Partial matches
      if (this.hasPartialMatch(message.content, query)) {
        score += message.role === "user" ? 8 : 4;
        matches++;
      }
    }

    return { score: Math.min(score, 150), matches }; // Cap content score
  }

  /**
   * Enhanced basic text matching with fuzzy support
   */
  private basicTextMatch(query: string, conversation: Conversation): number {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    let score = 0;

    for (const message of conversation.messages) {
      const contentLower = message.content.toLowerCase();

      // Exact match
      if (contentLower.includes(queryLower)) {
        score += message.role === "user" ? 30 : 20;
      }

      // Word-by-word matching
      let wordMatches = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          wordMatches++;
        }
      }

      if (wordMatches > 0) {
        const matchRatio = wordMatches / queryWords.length;
        score += (message.role === "user" ? 15 : 10) * matchRatio;
      }
    }

    return Math.min(score, 100); // Increased cap for better basic matching
  }

  /**
   * Fallback search when semantic search fails
   */
  private fallbackSearch(query: string, conversations: Conversation[]): SearchResult[] {
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const conversation of conversations) {
      const score = this.basicTextMatch(query, conversation);
      if (score > 0) {
        results.push({
          conversation,
          relevanceScore: score,
          matchedFields: ["content"],
        });
      }
    }

    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results;
  }
}
