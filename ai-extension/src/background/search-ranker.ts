/**
 * Search Ranker
 *
 * Ranks tab search results by relevance
 */

export interface TabSearchResult {
  tabId: number;
  url: string;
  title: string;
  keyword: string;
  snippet: string;
  position: number;
  positionPercent: number;
  score?: number; // Added by ranker
}

/**
 * Rank search results by relevance
 */
export function rankSearchResults(
  results: TabSearchResult[],
  keywords: string[],
): TabSearchResult[] {
  if (results.length === 0) {
    return [];
  }

  // Group results by tab
  const resultsByTab = new Map<number, TabSearchResult[]>();

  for (const result of results) {
    if (!resultsByTab.has(result.tabId)) {
      resultsByTab.set(result.tabId, []);
    }
    resultsByTab.get(result.tabId)!.push(result);
  }

  // Calculate scores for each result
  const scoredResults: TabSearchResult[] = [];

  for (const [tabId, tabResults] of resultsByTab.entries()) {
    // Calculate tab-level metrics
    const uniqueKeywords = new Set(tabResults.map((r) => r.keyword)).size;
    const totalMatches = tabResults.length;
    const avgPosition =
      tabResults.reduce((sum, r) => sum + r.positionPercent, 0) /
      tabResults.length;

    // Score each result
    for (const result of tabResults) {
      let score = 0;

      // Factor 1: Number of unique keywords matched (0-40 points)
      score += (uniqueKeywords / keywords.length) * 40;

      // Factor 2: Match density - more matches = higher relevance (0-30 points)
      score += Math.min(totalMatches / 5, 1) * 30;

      // Factor 3: Position in page - earlier = more important (0-20 points)
      score += (1 - result.positionPercent / 100) * 20;

      // Factor 4: Title match bonus (0-10 points)
      if (result.title.toLowerCase().includes(result.keyword.toLowerCase())) {
        score += 10;
      }

      scoredResults.push({
        ...result,
        score,
      });
    }
  }

  // Sort by score descending
  scoredResults.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Deduplicate - keep best result per tab
  const seenTabs = new Set<number>();
  const deduplicatedResults: TabSearchResult[] = [];

  for (const result of scoredResults) {
    if (!seenTabs.has(result.tabId)) {
      seenTabs.add(result.tabId);
      deduplicatedResults.push(result);
    }
  }

  return deduplicatedResults;
}
