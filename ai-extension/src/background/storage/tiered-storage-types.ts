const KIBIBYTE = 1024;

/**
 * Enumeration describing the different research assets that participate in
 * tiered storage. These values are shared between background persistence and
 * UI quota reporting.
 */
export enum ResearchAssetKind {
  TextExcerpt = "text-excerpt",
  Embedding = "embedding",
  ThumbnailImage = "thumbnail-image",
  ScreenshotImage = "screenshot-image",
  FullArticle = "full-article",
  LongFormArchive = "long-form-archive",
}

export type ArchiveCompression = "none" | "gzip" | "brotli" | "zip";

export interface IndexedDbFootprint {
  kind: ResearchAssetKind;
  /** Estimated bytes required within IndexedDB for this asset. */
  estimatedBytes: number;
  /** Optional number of logical chunks contributing to the footprint. */
  chunkCount?: number;
  /** Additional metadata stored alongside the asset (JSON, annotations, etc.) */
  metadataBytes?: number;
  /** Identifier to correlate with IndexedDB keys when necessary. */
  key?: string;
}

export interface FileArchiveDescriptor {
  /** Identifier linking to a persisted FileSystemDirectoryHandle. */
  archiveHandleId: string;
  /** Relative path within the granted directory for this asset. */
  relativePath: string;
  /** Estimated on-disk footprint in bytes for the archived asset. */
  estimatedBytes: number;
  /** Optional MIME type for downstream consumers. */
  mimeType?: string;
  /** Compression applied when writing the archive contents. */
  compression?: ArchiveCompression;
  /** Timestamp (ms) indicating when the archive was last refreshed. */
  lastModified?: number;
}

export interface TieredStorageItem {
  kind: ResearchAssetKind;
  indexedDb: IndexedDbFootprint;
  archive?: FileArchiveDescriptor;
  /**
   * Optional unique identifier associated with the logical item. Keeping this
   * optional allows callers to adopt existing IDs without forcing migrations.
   */
  id?: string;
  /** Optional source URL or note used by UI surfaces. */
  sourceUrl?: string;
}

export interface IndexedDbEstimateConfig {
  kind: ResearchAssetKind;
  /** Explicit number of chunks represented (defaults to 1). */
  chunkCount?: number;
  /** Override bytes per chunk when the defaults are insufficient. */
  bytesPerChunk?: number;
  /**
   * Provide explicit byte estimates for each chunk. When specified this takes
   * precedence over {@link chunkCount} and {@link bytesPerChunk}.
   */
  chunkBytes?: number[];
  /** Additional bytes to include for metadata or derived structures. */
  extraBytes?: number;
}

export const DEFAULT_INDEXED_DB_ITEM_BYTES: Readonly<
  Record<ResearchAssetKind, number>
> = Object.freeze({
  [ResearchAssetKind.TextExcerpt]: 5 * KIBIBYTE,
  [ResearchAssetKind.Embedding]: 6 * KIBIBYTE,
  [ResearchAssetKind.ThumbnailImage]: 12 * KIBIBYTE,
  [ResearchAssetKind.ScreenshotImage]: 0,
  [ResearchAssetKind.FullArticle]: 80 * KIBIBYTE,
  [ResearchAssetKind.LongFormArchive]: 120 * KIBIBYTE,
});

export const INDEXED_DB_CAPACITY_BYTES = 50 * 1024 * 1024; // ~50 MiB
export const INDEXED_DB_SOFT_LIMIT_BYTES = Math.floor(
  INDEXED_DB_CAPACITY_BYTES * 0.9,
);

export function estimateIndexedDbBytes(
  config: IndexedDbEstimateConfig,
): number {
  const { kind, chunkCount, bytesPerChunk, chunkBytes, extraBytes } = config;

  if (Array.isArray(chunkBytes) && chunkBytes.length > 0) {
    const chunkTotal = chunkBytes
      .map(sanitizeByteValue)
      .reduce((total, value) => total + value, 0);
    return chunkTotal + sanitizeByteValue(extraBytes);
  }

  const count = sanitizeCount(chunkCount);
  const perChunk = sanitizeByteValue(
    bytesPerChunk ?? DEFAULT_INDEXED_DB_ITEM_BYTES[kind] ?? 0,
  );

  const base = count * perChunk;
  return base + sanitizeByteValue(extraBytes);
}

function sanitizeByteValue(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return 0;
  }
  return Math.floor(input);
}

function sanitizeCount(input?: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input <= 0) {
    return 1;
  }
  return Math.floor(input);
}
