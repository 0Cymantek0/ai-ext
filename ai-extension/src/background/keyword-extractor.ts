/**
 * Keyword Extractor
 * 
 * Extracts meaningful keywords from user queries for tab search
 */

// Common stop words to filter out
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "will", "with", "what", "when", "where", "who", "why",
  "how", "can", "could", "should", "would", "do", "does", "did",
  "i", "you", "me", "my", "your", "this", "these", "those",
]);

/**
 * Extract keywords from a query string
 * Returns array of meaningful keywords for search
 */
export function extractKeywords(query: string): string[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  // Clean and normalize query
  const normalized = query
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ") // Remove punctuation except hyphens
    .replace(/\s+/g, " ")
    .trim();

  // Split into words
  const words = normalized.split(" ");

  // Filter out stop words and short words
  const keywords = words.filter(
    (word) =>
      word.length >= 3 && // Minimum 3 characters
      !STOP_WORDS.has(word) &&
      !/^\d+$/.test(word) // Filter out pure numbers
  );

  // Remove duplicates while preserving order
  const uniqueKeywords = Array.from(new Set(keywords));

  // Limit to top 10 keywords to avoid overwhelming search
  return uniqueKeywords.slice(0, 10);
}
