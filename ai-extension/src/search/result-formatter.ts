import type {
  CapturedContent,
  ContentMetadata,
  Pocket,
} from "../background/indexeddb-manager.js";

export interface HighlightSegment {
  text: string;
  highlight: boolean;
}

export interface HighlightedField {
  /** Original raw text value (before truncation). */
  raw: string;
  /** Text presented to the UI (after truncation/ellipsis). */
  text: string;
  /** Segments describing which portions should be emphasized. */
  segments: HighlightSegment[];
  /** True when the text was truncated or ellipsised. */
  truncated: boolean;
  /** Helper text suitable for screen readers. */
  ariaLabel: string;
}

export interface ScoreNormalizationOptions {
  /**
   * Explicit lower-bound for incoming scores. When omitted a bound is inferred
   * from the raw data.
   */
  minScore?: number;
  /**
   * Explicit upper-bound for incoming scores. When omitted a bound is inferred
   * from the raw data.
   */
  maxScore?: number;
  /** When true (default) the formatter clamps normalized scores to [0, 1]. */
  clamp?: boolean;
  /** Number of fractional digits to retain when rounding the normalized score. */
  precision?: number;
  /**
   * When false the formatter will not infer a min/max range from the supplied
   * results. This is useful when working with fixed scoring models.
   */
  dynamic?: boolean;
}

export interface ResultFormatterOptions<T> {
  /** Search query used to generate the results (used for highlighting). */
  query?: string;
  /** Maximum length for highlighted snippets. Defaults to 180 characters. */
  snippetLength?: number;
  /** Maximum length for titles before truncation. Defaults to 96 characters. */
  titleLength?: number;
  /** Optional override for trimming descriptions/subtitles. */
  subtitleLength?: number;
  /** Controls case sensitivity for highlight detection. Defaults to false. */
  highlightCaseSensitive?: boolean;
  /** Custom scoring behaviour. */
  score?: ScoreNormalizationOptions;
  /** Provide custom id extraction. */
  getId?: (item: T, index: number) => string | number | undefined;
  /** Provide custom title extraction. */
  getTitle?: (item: T) => string | undefined;
  /** Provide custom subtitle/description extraction. */
  getSubtitle?: (item: T) => string | undefined;
  /** Provide custom snippet extraction. */
  getSnippet?: (item: T) => string | undefined;
  /** Provide custom thumbnail extraction. */
  getThumbnail?: (item: T) => string | undefined;
  /** Provide custom accent color extraction. */
  getAccentColor?: (item: T) => string | undefined;
  /** Provide custom timestamp extraction. */
  getTimestamp?: (item: T) => number | undefined;
  /** Allow attaching arbitrary metadata. */
  getMetadata?: (item: T) => Record<string, unknown> | undefined;
}

export interface FormattedSearchResult<T> {
  id: string;
  item: T;
  title: HighlightedField;
  snippet: HighlightedField | null;
  subtitle?: string | null;
  normalizedScore: number | null;
  scorePercentage: number | null;
  scoreLabel: string | null;
  matchedFields: string[];
  thumbnailUrl?: string;
  accentColor?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

type RawSearchResult<T> = {
  item: T;
  relevanceScore?: number;
  matchedFields?: string[];
};

const DEFAULT_SNIPPET_LENGTH = 180;
const DEFAULT_TITLE_LENGTH = 96;
const DEFAULT_SUBTITLE_LENGTH = 140;

const URL_LIKE_PATTERN = /^(https?:\/\/|data:image\/)/i;
const HTML_TAG_PATTERN = /<[^>]*>/g;

/**
 * Format an array of raw search results so they can be rendered by the side
 * panel components. Highlighting and score normalization are handled in a
 * deterministic, pure fashion to simplify testing and reuse.
 */
export function formatSearchResults<T>(
  results: Array<RawSearchResult<T>> | undefined | null,
  options: ResultFormatterOptions<T> = {},
): FormattedSearchResult<T>[] {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  const normalizedScores = computeNormalizedScores(results, options.score);

  return results.map((result, index) =>
    formatSingleResult(result, index, normalizedScores[index] ?? null, options),
  );
}

function formatSingleResult<T>(
  result: RawSearchResult<T>,
  index: number,
  normalizedScore: number | null,
  options: ResultFormatterOptions<T>,
): FormattedSearchResult<T> {
  const item = result.item;
  const { query, highlightCaseSensitive } = options;
  const terms = getQueryTerms(query);
  const caseSensitive = highlightCaseSensitive ?? false;

  const title = collapseWhitespace(
    options.getTitle?.(item) ?? defaultGetTitle(item) ?? "Untitled",
  );
  const titleField = createHighlightedTitle(
    title,
    terms,
    caseSensitive,
    options.titleLength ?? DEFAULT_TITLE_LENGTH,
  );

  const subtitleRaw = collapseWhitespace(
    options.getSubtitle?.(item) ?? defaultGetSubtitle(item) ?? "",
  );
  const subtitle = subtitleRaw
    ? truncatePreservingWords(
        subtitleRaw,
        options.subtitleLength ?? DEFAULT_SUBTITLE_LENGTH,
      )
    : null;

  const snippetSource = collapseWhitespace(
    options.getSnippet?.(item) ?? defaultGetSnippet(item) ?? "",
  );
  const snippetField = snippetSource
    ? createHighlightedSnippet(
        snippetSource,
        terms,
        caseSensitive,
        options.snippetLength ?? DEFAULT_SNIPPET_LENGTH,
      )
    : null;

  const thumbnailUrl = options.getThumbnail?.(item) ?? defaultGetThumbnail(item);
  const accentColor = options.getAccentColor?.(item) ?? defaultGetAccentColor(item);
  const timestamp = options.getTimestamp?.(item) ?? defaultGetTimestamp(item);
  const metadata = options.getMetadata?.(item) ?? undefined;

  const idCandidate = options.getId?.(item, index) ?? extractId(item);
  const id = typeof idCandidate === "string" || typeof idCandidate === "number"
    ? String(idCandidate)
    : `result-${index}`;

  const normalized = normalizedScore;
  const scorePercentage = normalized != null
    ? Math.round(clamp(normalized, 0, 1) * 100)
    : null;
  const scoreLabel = scorePercentage != null ? `${scorePercentage}%` : null;

  const formatted: FormattedSearchResult<T> = {
    id,
    item,
    title: titleField,
    snippet: snippetField,
    subtitle,
    normalizedScore: normalized,
    scorePercentage,
    scoreLabel,
    matchedFields: Array.isArray(result.matchedFields)
      ? [...result.matchedFields]
      : [],
  };

  if (thumbnailUrl !== undefined) {
    formatted.thumbnailUrl = thumbnailUrl;
  }
  if (accentColor !== undefined) {
    formatted.accentColor = accentColor;
  }
  if (timestamp !== undefined) {
    formatted.timestamp = timestamp;
  }
  if (metadata !== undefined) {
    formatted.metadata = metadata;
  }

  return formatted;
}

function defaultGetTitle(item: unknown): string | undefined {
  if (isCapturedContent(item)) {
    const metadata = item.metadata ?? ({} as ContentMetadata);
    if (isPresent(metadata.title)) {
      return metadata.title;
    }
    const domain = extractDomain(item.sourceUrl);
    if (domain) {
      return domain;
    }
    return "Untitled";
  }

  if (isPocket(item)) {
    return item.name;
  }

  if (typeof (item as { title?: unknown }).title === "string") {
    return (item as { title: string }).title;
  }

  if (typeof (item as { name?: unknown }).name === "string") {
    return (item as { name: string }).name;
  }

  return undefined;
}

function defaultGetSubtitle(item: unknown): string | undefined {
  if (isCapturedContent(item)) {
    const domain = extractDomain(item.sourceUrl);
    const type = isPresent(item.type) ? String(item.type) : "";
    if (domain && type) {
      return `${domain} · ${type}`;
    }
    return domain || type || undefined;
  }

  if (isPocket(item)) {
    if (item.tags.length > 0) {
      return item.tags.slice(0, 3).join(", ");
    }
    return item.description || undefined;
  }

  if (typeof (item as { description?: unknown }).description === "string") {
    return (item as { description: string }).description;
  }

  return undefined;
}

function defaultGetSnippet(item: unknown): string | undefined {
  if (isCapturedContent(item)) {
    const metadata = item.metadata ?? ({} as ContentMetadata);
    const candidate = [
      metadata.summary,
      metadata.excerpt,
      metadata.preview,
      metadata.fallbackPreview,
    ].find((value) => isPresent(value) && isLikelyText(value));

    if (candidate) {
      return stripHtml(candidate);
    }

    if (typeof item.content === "string") {
      return stripHtml(item.content);
    }

    return undefined;
  }

  if (isPocket(item)) {
    if (item.description) {
      return stripHtml(item.description);
    }
    if (item.tags.length > 0) {
      return item.tags.join(", ");
    }
    return undefined;
  }

  const genericCandidate = (item as { summary?: unknown; description?: unknown })
    .summary ?? (item as { summary?: unknown; description?: unknown }).description;
  if (typeof genericCandidate === "string" && genericCandidate.trim().length > 0) {
    return stripHtml(genericCandidate);
  }

  return undefined;
}

function defaultGetThumbnail(item: unknown): string | undefined {
  if (isCapturedContent(item)) {
    const metadata = item.metadata ?? ({} as ContentMetadata);
    const candidate = [
      (metadata as { thumbnailUrl?: unknown }).thumbnailUrl,
      (metadata as { thumbnail?: unknown }).thumbnail,
      (metadata as { previewImage?: unknown }).previewImage,
      metadata.preview,
    ].find((value) => isPresent(value) && isLikelyImageUrl(value));

    if (typeof candidate === "string") {
      return candidate;
    }
  }

  if (
    typeof (item as { thumbnailUrl?: unknown }).thumbnailUrl === "string" &&
    isLikelyImageUrl((item as { thumbnailUrl: string }).thumbnailUrl)
  ) {
    return (item as { thumbnailUrl: string }).thumbnailUrl;
  }

  return undefined;
}

function defaultGetAccentColor(item: unknown): string | undefined {
  if (isPocket(item) && typeof item.color === "string" && item.color.trim()) {
    return item.color;
  }
  return undefined;
}

function defaultGetTimestamp(item: unknown): number | undefined {
  if (isCapturedContent(item)) {
    return item.capturedAt;
  }
  if (isPocket(item)) {
    return item.updatedAt;
  }
  if (typeof (item as { updatedAt?: unknown }).updatedAt === "number") {
    return (item as { updatedAt: number }).updatedAt;
  }
  if (typeof (item as { timestamp?: unknown }).timestamp === "number") {
    return (item as { timestamp: number }).timestamp;
  }
  return undefined;
}

function extractId(item: unknown): string | number | undefined {
  if (isCapturedContent(item) || isPocket(item)) {
    return item.id;
  }
  if (typeof (item as { id?: unknown }).id === "string") {
    return (item as { id: string }).id;
  }
  if (typeof (item as { id?: unknown }).id === "number") {
    return (item as { id: number }).id;
  }
  if (typeof (item as { contentId?: unknown }).contentId === "string") {
    return (item as { contentId: string }).contentId;
  }
  return undefined;
}

function createHighlightedTitle(
  rawTitle: string,
  terms: string[],
  caseSensitive: boolean,
  maxLength: number,
): HighlightedField {
  const truncated = truncatePreservingWords(rawTitle, maxLength);
  const segments = highlightSegments(truncated, terms, caseSensitive);
  const ariaLabel = buildAriaLabel("title", segments);

  return {
    raw: rawTitle,
    text: segments.map((segment) => segment.text).join(""),
    segments,
    truncated: truncated.length < rawTitle.length,
    ariaLabel,
  };
}

function createHighlightedSnippet(
  rawSnippet: string,
  terms: string[],
  caseSensitive: boolean,
  maxLength: number,
): HighlightedField {
  if (!rawSnippet) {
    return {
      raw: "",
      text: "",
      segments: [],
      truncated: false,
      ariaLabel: "",
    };
  }

  const cleanSnippet = rawSnippet;
  const snippetLength = Math.max(40, maxLength);
  const buffer = Math.floor(snippetLength / 4);

  const matchIndex = findFirstMatchIndex(cleanSnippet, terms, caseSensitive);

  let start = matchIndex === -1 ? 0 : Math.max(0, matchIndex - buffer);
  let end = Math.min(cleanSnippet.length, start + snippetLength);

  start = adjustBackwardToBoundary(cleanSnippet, start);
  end = adjustForwardToBoundary(cleanSnippet, end);

  const sliced = cleanSnippet.slice(start, end).trim();
  const needsPrefixEllipsis = start > 0;
  const needsSuffixEllipsis = end < cleanSnippet.length;

  const baseSegments = highlightSegments(sliced, terms, caseSensitive);
  const segments = [
    ...(needsPrefixEllipsis ? [{ text: "…", highlight: false }] : []),
    ...baseSegments,
    ...(needsSuffixEllipsis ? [{ text: "…", highlight: false }] : []),
  ];

  const ariaLabel = buildAriaLabel("snippet", segments);

  return {
    raw: rawSnippet,
    text: segments.map((segment) => segment.text).join(""),
    segments,
    truncated: needsPrefixEllipsis || needsSuffixEllipsis,
    ariaLabel,
  };
}

function highlightSegments(
  text: string,
  terms: string[],
  caseSensitive: boolean,
): HighlightSegment[] {
  if (!text) {
    return [];
  }

  if (terms.length === 0) {
    return [{ text, highlight: false }];
  }

  const uniqueTerms = [...new Set(terms)].sort((a, b) => b.length - a.length);

  const pattern = uniqueTerms
    .map((term) => escapeRegExp(term))
    .filter((term) => term.length > 0)
    .join("|");

  if (!pattern) {
    return [{ text, highlight: false }];
  }

  const regex = new RegExp(`(${pattern})`, caseSensitive ? "g" : "gi");
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), highlight: false });
    }

    const matchedText = match[0] ?? "";
    segments.push({ text: matchedText, highlight: true });
    lastIndex = index + matchedText.length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlight: false });
  }

  if (segments.length === 0) {
    return [{ text, highlight: false }];
  }

  return mergeAdjacentSegments(segments);
}

function mergeAdjacentSegments(segments: HighlightSegment[]): HighlightSegment[] {
  if (segments.length <= 1) {
    return segments;
  }

  const merged: HighlightSegment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.highlight === segment.highlight) {
      last.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function getQueryTerms(query: string | undefined | null): string[] {
  if (!query || !query.trim()) {
    return [];
  }

  return query
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function computeNormalizedScores<T>(
  results: Array<RawSearchResult<T>>,
  options: ScoreNormalizationOptions | undefined,
): Array<number | null> {
  const scores = results
    .map((result) => result.relevanceScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (scores.length === 0) {
    return results.map(() => null);
  }

  const precision = Math.max(0, Math.min(8, options?.precision ?? 4));
  const clampScores = options?.clamp ?? true;
  const dynamic = options?.dynamic ?? true;

  const providedMin = options?.minScore;
  const providedMax = options?.maxScore;

  let min =
    typeof providedMin === "number" && Number.isFinite(providedMin)
      ? providedMin
      : dynamic
        ? Math.min(...scores)
        : 0;
  let max =
    typeof providedMax === "number" && Number.isFinite(providedMax)
      ? providedMax
      : dynamic
        ? Math.max(...scores)
        : 1;

  if (min === max) {
    // Special case: single result - keep original score if already in 0-1 range
    if (results.length === 1 && min >= 0 && max <= 1) {
      return results.map((result) => {
        const score = result.relevanceScore;
        if (typeof score !== "number" || !Number.isFinite(score)) {
          return null;
        }
        const normalized = clampScores ? clamp(score, 0, 1) : score;
        return roundTo(normalized, precision);
      });
    }
    // For multiple identical scores, normalize to 0 or 1
    if (min === 0) {
      return results.map(() => 0);
    }
    return results.map((result) =>
      typeof result.relevanceScore === "number" && Number.isFinite(result.relevanceScore)
        ? 1
        : null,
    );
  }

  if (
    providedMin === undefined &&
    providedMax === undefined &&
    min >= 0 &&
    max <= 1
  ) {
    return results.map((result) => {
      const score = result.relevanceScore;
      if (typeof score !== "number" || !Number.isFinite(score)) {
        return null;
      }
      const normalized = clampScores ? clamp(score, 0, 1) : score;
      return roundTo(normalized, precision);
    });
  }

  const range = max - min;
  if (range === 0) {
    // If all scores are the same, they should all be considered a "perfect"
    // match relative to the dataset, unless they are 0.
    const normalizedValue = min === 0 ? 0 : 1;
    return results.map((result) =>
      typeof result.relevanceScore === "number" && Number.isFinite(result.relevanceScore)
        ? normalizedValue
        : null,
    );
  }

  return results.map((result) => {
    const score = result.relevanceScore;
    if (typeof score !== "number" || !Number.isFinite(score)) {
      return null;
    }
    const normalized = (score - min) / range;
    const bounded = clampScores ? clamp(normalized, 0, 1) : normalized;
    return roundTo(bounded, precision);
  });
}

function findFirstMatchIndex(
  text: string,
  terms: string[],
  caseSensitive: boolean,
): number {
  if (terms.length === 0) {
    return -1;
  }

  let earliestIndex = -1;
  for (const term of terms) {
    if (!term) continue;
    const regex = new RegExp(escapeRegExp(term), caseSensitive ? "g" : "gi");
    const match = regex.exec(text);
    if (match && match.index !== undefined) {
      const index = match.index;
      if (earliestIndex === -1 || index < earliestIndex) {
        earliestIndex = index;
      }
    }
  }
  return earliestIndex;
}

function adjustBackwardToBoundary(text: string, start: number): number {
  if (start <= 0) {
    return 0;
  }
  let index = start;
  while (index > 0 && !/\s/.test(text[index - 1]!)) {
    index -= 1;
  }
  return index;
}

function adjustForwardToBoundary(text: string, end: number): number {
  if (end >= text.length) {
    return text.length;
  }
  let index = end;
  while (index < text.length && !/\s/.test(text[index]!)) {
    index += 1;
  }
  return index;
}

function buildAriaLabel(kind: "title" | "snippet", segments: HighlightSegment[]): string {
  const text = segments.map((segment) => segment.text).join("").trim();
  if (!text) {
    return "";
  }
  const highlights = segments
    .filter((segment) => segment.highlight)
    .map((segment) => segment.text.toLowerCase());
  const uniqueHighlights = [...new Set(highlights)].filter((value) => value.trim().length > 0);
  if (uniqueHighlights.length === 0) {
    return `${capitalize(kind)}: ${text}`;
  }
  return `${capitalize(kind)} with matches for ${uniqueHighlights.join(", ")}: ${text}`;
}

function capitalize(input: string): string {
  if (!input) {
    return "";
  }
  return input.charAt(0).toUpperCase() + input.slice(1);
}

function truncatePreservingWords(text: string, maxLength: number): string {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }

  let truncated = text.slice(0, Math.max(0, maxLength - 1));
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6) {
    truncated = truncated.slice(0, lastSpace);
  }
  truncated = truncated.trimEnd();
  return `${truncated}…`;
}

function collapseWhitespace(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function extractDomain(url: string | undefined | null): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function isPresent(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLikelyText(value: unknown): value is string {
  return typeof value === "string" && !URL_LIKE_PATTERN.test(value);
}

function isLikelyImageUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  return URL_LIKE_PATTERN.test(value.trim());
}

function stripHtml(value: string): string {
  if (!value) {
    return "";
  }
  return value.replace(HTML_TAG_PATTERN, " ").replace(/\s+/g, " ").trim();
}

function isPocket(item: unknown): item is Pocket {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { id?: unknown }).id === "string" &&
    Array.isArray((item as { contentIds?: unknown }).contentIds)
  );
}

function isCapturedContent(item: unknown): item is CapturedContent {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as { id?: unknown }).id === "string" &&
    "metadata" in item &&
    "content" in item
  );
}
