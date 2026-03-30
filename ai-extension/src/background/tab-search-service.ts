/**
 * Tab Search Service
 *
 * Performs distributed real-time search across all open tabs
 * without heavy indexing. Uses parallel execution for speed.
 */

import { logger } from "./monitoring.js";
import { extractKeywords } from "./keyword-extractor.js";
import { rankSearchResults, type TabSearchResult } from "./search-ranker.js";

export interface TabSearchOptions {
  query: string;
  maxResults?: number;
  timeout?: number;
  maxTextPerTab?: number;
  conversationId?: string | undefined; // For progress tracking
}

export interface TabSearchResponse {
  results: TabSearchResult[];
  totalTabs: number;
  searchedTabs: number;
  duration: number;
}

/**
 * Search across all open tabs in parallel
 */
export async function searchAllTabs(
  options: TabSearchOptions,
): Promise<TabSearchResponse> {
  const startTime = performance.now();
  const maxResults = options.maxResults ?? 10;
  const timeout = options.timeout ?? 200;
  const maxTextPerTab = options.maxTextPerTab ?? 100000; // 100KB

  logger.info("TabSearchService", "Starting distributed tab search", {
    query: options.query,
    maxResults,
    timeout,
  });

  // Extract keywords from query
  const keywords = extractKeywords(options.query);

  if (keywords.length === 0) {
    logger.warn("TabSearchService", "No keywords extracted from query");
    return {
      results: [],
      totalTabs: 0,
      searchedTabs: 0,
      duration: performance.now() - startTime,
    };
  }

  logger.info("TabSearchService", "Extracted keywords", { keywords });

  // Get all tabs
  const tabs = await chrome.tabs.query({});
  const searchableTabs = tabs.filter(
    (tab) =>
      tab.id &&
      tab.url &&
      !tab.url.startsWith("chrome://") &&
      !tab.url.startsWith("chrome-extension://") &&
      !tab.url.startsWith("about:") &&
      !tab.url.startsWith("file://"),
  );

  logger.info("TabSearchService", "Found searchable tabs", {
    total: tabs.length,
    searchable: searchableTabs.length,
  });

  // Emit search started event
  if (options.conversationId) {
    try {
      chrome.runtime
        .sendMessage({
          kind: "CONTEXT_PROGRESS",
          requestId: crypto.randomUUID(),
          payload: {
            type: "TAB_SEARCH_STARTED",
            conversationId: options.conversationId,
            data: {
              totalTabs: searchableTabs.length,
            },
          },
        })
        .catch(() => {
          // Ignore errors - progress updates are non-critical
        });
    } catch (error) {
      // Ignore errors
    }
  }

  if (searchableTabs.length === 0) {
    return {
      results: [],
      totalTabs: tabs.length,
      searchedTabs: 0,
      duration: performance.now() - startTime,
    };
  }

  // Execute search in parallel across all tabs
  const searchPromises = searchableTabs.map((tab) =>
    searchTabContent(
      tab.id!,
      tab.url!,
      tab.title || "",
      keywords,
      maxTextPerTab,
      timeout,
    ),
  );

  // Wait for all searches with timeout
  const searchResults = await Promise.allSettled(searchPromises);

  // Collect successful results
  const allMatches: TabSearchResult[] = [];
  let searchedCount = 0;

  for (const result of searchResults) {
    if (result.status === "fulfilled" && result.value) {
      allMatches.push(...result.value);
      searchedCount++;
    } else if (result.status === "rejected") {
      logger.warn("TabSearchService", "Tab search failed", {
        error: result.reason,
      });
    }
  }

  logger.info("TabSearchService", "Search completed", {
    totalMatches: allMatches.length,
    searchedTabs: searchedCount,
  });

  // Rank and limit results
  const rankedResults = rankSearchResults(allMatches, keywords).slice(
    0,
    maxResults,
  );

  const duration = performance.now() - startTime;

  logger.info("TabSearchService", "Search finished", {
    duration: `${duration.toFixed(2)}ms`,
    topResults: rankedResults.length,
  });

  // Emit search complete event
  if (options.conversationId) {
    try {
      chrome.runtime
        .sendMessage({
          kind: "CONTEXT_PROGRESS",
          requestId: crypto.randomUUID(),
          payload: {
            type: "TAB_SEARCH_COMPLETE",
            conversationId: options.conversationId,
            data: {
              searchedTabs: searchedCount,
              resultsCount: rankedResults.length,
              duration,
            },
          },
        })
        .catch(() => {
          // Ignore errors
        });
    } catch (error) {
      // Ignore errors
    }
  }

  return {
    results: rankedResults,
    totalTabs: tabs.length,
    searchedTabs: searchedCount,
    duration,
  };
}

/**
 * Search content in a single tab
 */
async function searchTabContent(
  tabId: number,
  url: string,
  title: string,
  keywords: string[],
  maxTextLength: number,
  timeout: number,
): Promise<TabSearchResult[]> {
  try {
    // Execute search script in tab with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Search timeout")), timeout),
    );

    const searchPromise = chrome.scripting.executeScript({
      target: { tabId },
      func: searchInPage,
      args: [keywords, maxTextLength],
    });

    const results = await Promise.race([searchPromise, timeoutPromise]);

    if (!results || !results[0] || !results[0].result) {
      return [];
    }

    const matches = results[0].result;

    // Add tab metadata to each match
    return matches.map((match: any) => ({
      ...match,
      tabId,
      url,
      title,
    }));
  } catch (error) {
    logger.warn("TabSearchService", "Failed to search tab", {
      tabId,
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * This function runs in the page context to search for keywords
 * IMPORTANT: This function is serialized and injected, so it cannot reference external variables
 */
function searchInPage(keywords: string[], maxTextLength: number) {
  try {
    // Extract clean text from page
    const bodyClone = document.body.cloneNode(true) as HTMLElement;

    // Remove unwanted elements
    bodyClone
      .querySelectorAll(
        'script, style, nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]',
      )
      .forEach((el) => el.remove());

    let fullText = bodyClone.textContent || "";

    // Clean whitespace
    fullText = fullText.replace(/\s+/g, " ").trim();

    // Limit text length
    if (fullText.length > maxTextLength) {
      fullText = fullText.substring(0, maxTextLength);
    }

    if (fullText.length < 50) {
      return []; // Not enough content
    }

    // Search for keywords (case-insensitive)
    const matches: any[] = [];
    const lowerText = fullText.toLowerCase();

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      let index = 0;

      while (index < lowerText.length) {
        index = lowerText.indexOf(lowerKeyword, index);

        if (index === -1) break;

        // Extract snippet with context (±200 chars)
        const contextRadius = 200;
        const start = Math.max(0, index - contextRadius);
        const end = Math.min(
          fullText.length,
          index + keyword.length + contextRadius,
        );
        const snippet = fullText.substring(start, end);

        // Calculate position percentage
        const positionPercent = (index / fullText.length) * 100;

        matches.push({
          keyword,
          snippet,
          position: index,
          positionPercent,
        });

        // Move to next occurrence
        index += keyword.length;

        // Limit matches per keyword to avoid overwhelming results
        if (matches.filter((m) => m.keyword === keyword).length >= 3) {
          break;
        }
      }
    }

    return matches;
  } catch (error) {
    console.error("Tab search error:", error);
    return [];
  }
}
