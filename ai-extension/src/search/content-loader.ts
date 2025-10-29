/**
 * Full content loader responsible for retrieving captured items from IndexedDB or
 * the filesystem archive tier on demand. The loader centralizes tier-detection,
 * error handling, and an in-memory LRU cache so that downstream UI surfaces can
 * request rich content without duplicating storage logic.
 */

import type {
  CapturedContent,
  ContentMetadata,
  ContentStorageReference,
} from "../background/indexeddb-manager.js";
import type { FileArchiveDescriptor } from "../background/storage/tiered-storage-types.js";

export type StorageTier = "indexeddb" | "filesystem";

export type FullContentAvailability = "full" | "partial" | "unavailable";

export interface FullContentStorage {
  tier: StorageTier;
  archive?: FileArchiveDescriptor;
  fallbackPreview?: string;
  reason?: string;
}

export interface FullContent {
  id: string;
  pocketId: string;
  type: CapturedContent["type"];
  metadata: CapturedContent["metadata"];
  capturedAt: number;
  sourceUrl: string;
  processingStatus: CapturedContent["processingStatus"];
  pdfMetadata?: CapturedContent["pdfMetadata"];
  content: string | ArrayBuffer | Blob | null;
  storage: FullContentStorage;
  availability: FullContentAvailability;
  error?: FullContentError;
}

export interface StorageManagerLike {
  getContent(contentId: string): Promise<CapturedContent | null>;
}

export interface TieredFilesystemService {
  hasAccess(descriptor: FileArchiveDescriptor): Promise<boolean>;
  read(descriptor: FileArchiveDescriptor): Promise<string | ArrayBuffer | Blob>;
}

export interface ContentLoaderDependencies {
  storageManager: StorageManagerLike;
  filesystem?: TieredFilesystemService;
}

export interface FullContentLoaderOptions {
  /** Maximum number of cached entries kept in-memory. Defaults to 32. */
  maxCacheEntries?: number;
}

export interface LoadFullContentOptions {
  /** When true, bypasses the cache and fetches fresh data. */
  forceRefresh?: boolean;
  /** Synonym for {@link forceRefresh}; retained for semantic clarity. */
  bypassCache?: boolean;
}

export interface FullContentErrorDetails {
  contentId?: string;
  storageTier?: StorageTier;
  descriptor?: FileArchiveDescriptor;
  reason?: string;
  cause?: unknown;
}

export const enum FullContentErrorCode {
  NotFound = "NOT_FOUND",
  PermissionRequired = "PERMISSION_REQUIRED",
  FilesystemUnavailable = "FILESYSTEM_UNAVAILABLE",
  FilesystemReadFailed = "FILESYSTEM_READ_FAILED",
  AccessCheckFailed = "ACCESS_CHECK_FAILED",
  InvalidDescriptor = "INVALID_DESCRIPTOR",
}

export class FullContentError extends Error {
  readonly code: FullContentErrorCode;
  readonly details?: FullContentErrorDetails;

  constructor(
    code: FullContentErrorCode,
    message: string,
    details?: FullContentErrorDetails,
  ) {
    super(message);
    this.name = "FullContentError";
    this.code = code;
    this.details = details;

    if (details?.cause !== undefined) {
      (this as { cause?: unknown }).cause = details.cause;
    }
  }
}

/**
 * Loader that resolves {@link FullContent} instances using tier-aware strategy
 * and maintains a small LRU cache for repeat lookups.
 */
export class FullContentLoader {
  private readonly storageManager: StorageManagerLike;
  private readonly filesystem?: TieredFilesystemService;
  private readonly maxCacheEntries: number;
  private readonly cache: Map<string, FullContent> = new Map();

  constructor(
    dependencies: ContentLoaderDependencies,
    options: FullContentLoaderOptions = {},
  ) {
    if (!dependencies || !dependencies.storageManager) {
      throw new Error(
        "FullContentLoader requires a storageManager dependency.",
      );
    }

    this.storageManager = dependencies.storageManager;
    this.filesystem = dependencies.filesystem;
    this.maxCacheEntries = Math.max(0, options.maxCacheEntries ?? 32);
    this.loadFullContent = this.loadFullContent.bind(this);
  }

  /**
   * Retrieve full content details for the provided identifier.
   */
  async loadFullContent(
    contentId: string,
    options: LoadFullContentOptions = {},
  ): Promise<FullContent> {
    if (!contentId) {
      throw new FullContentError(
        FullContentErrorCode.NotFound,
        "A content identifier is required to load full content.",
      );
    }

    const shouldBypassCache = options.forceRefresh || options.bypassCache;

    if (!shouldBypassCache) {
      const cached = this.getFromCache(contentId);
      if (cached) {
        return cached;
      }
    } else {
      this.evict(contentId);
    }

    const captured = await this.storageManager.getContent(contentId);
    if (!captured) {
      throw new FullContentError(
        FullContentErrorCode.NotFound,
        `Content ${contentId} was not found in storage.`,
        { contentId },
      );
    }

    const storage = normalizeStorageReference(captured.metadata);

    if (storage.tier === "filesystem") {
      const resolved = await this.loadFromFilesystem(contentId, captured, storage);
      this.setCache(contentId, resolved);
      return resolved;
    }

    const payload = captured.content ?? null;
    const availability = hasContentPayload(captured.content)
      ? "full"
      : "unavailable";
    const result = this.createFullContent(captured, storage, payload, availability);
    this.setCache(contentId, result);
    return result;
  }

  /**
   * Clear the internal cache entirely.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove a single cached entry if present.
   */
  evict(contentId: string): void {
    this.cache.delete(contentId);
  }

  private getFromCache(contentId: string): FullContent | undefined {
    const cached = this.cache.get(contentId);
    if (!cached) {
      return undefined;
    }

    // Maintain insertion order for LRU eviction.
    this.cache.delete(contentId);
    this.cache.set(contentId, cached);
    return cached;
  }

  private setCache(contentId: string, value: FullContent): void {
    if (this.maxCacheEntries === 0) {
      return;
    }

    if (this.cache.has(contentId)) {
      this.cache.delete(contentId);
    }

    this.cache.set(contentId, value);

    if (this.cache.size > this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
  }

  private async loadFromFilesystem(
    contentId: string,
    captured: CapturedContent,
    storage: FullContentStorage,
  ): Promise<FullContent> {
    const descriptor = storage.archive;
    if (!descriptor) {
      const error = new FullContentError(
        FullContentErrorCode.InvalidDescriptor,
        `Content ${contentId} is marked as filesystem-backed but lacks an archive descriptor.`,
        {
          contentId,
          storageTier: "filesystem",
        },
      );
      const fallback = this.extractFallback(captured, storage);
      const availability = fallback != null ? "partial" : "unavailable";
      return this.createFullContent(captured, storage, fallback, availability, error);
    }

    if (!this.filesystem) {
      const error = new FullContentError(
        FullContentErrorCode.FilesystemUnavailable,
        "No filesystem service is available to resolve archived content.",
        {
          contentId,
          storageTier: "filesystem",
          descriptor,
          reason: "service-unavailable",
        },
      );
      const fallback = this.extractFallback(captured, storage);
      const availability = fallback != null ? "partial" : "unavailable";
      return this.createFullContent(captured, storage, fallback, availability, error);
    }

    let hasAccess: boolean;
    try {
      hasAccess = await this.filesystem.hasAccess(descriptor);
    } catch (cause) {
      throw new FullContentError(
        FullContentErrorCode.AccessCheckFailed,
        "Failed to verify filesystem access for archived content.",
        {
          contentId,
          storageTier: "filesystem",
          descriptor,
          cause,
        },
      );
    }

    if (!hasAccess) {
      const error = new FullContentError(
        FullContentErrorCode.PermissionRequired,
        "Filesystem access is required to load this content.",
        {
          contentId,
          storageTier: "filesystem",
          descriptor,
          reason: "permission-required",
        },
      );
      const fallback = this.extractFallback(captured, storage);
      const availability = fallback != null ? "partial" : "unavailable";
      return this.createFullContent(captured, storage, fallback, availability, error);
    }

    try {
      const data = await this.filesystem.read(descriptor);
      return this.createFullContent(captured, storage, data, "full");
    } catch (cause) {
      const error = new FullContentError(
        FullContentErrorCode.FilesystemReadFailed,
        "Failed to read archived content from the filesystem.",
        {
          contentId,
          storageTier: "filesystem",
          descriptor,
          cause,
        },
      );
      const fallback = this.extractFallback(captured, storage);
      const availability = fallback != null ? "partial" : "unavailable";
      return this.createFullContent(captured, storage, fallback, availability, error);
    }
  }

  private createFullContent(
    captured: CapturedContent,
    storage: FullContentStorage,
    payload: string | ArrayBuffer | Blob | null,
    availability: FullContentAvailability,
    error?: FullContentError,
  ): FullContent {
    const storageCopy: FullContentStorage = {
      tier: storage.tier,
      ...(storage.archive ? { archive: cloneArchiveDescriptor(storage.archive) } : {}),
      ...(storage.fallbackPreview
        ? { fallbackPreview: storage.fallbackPreview }
        : {}),
      ...(storage.reason ? { reason: storage.reason } : {}),
    };

    if (error && !storageCopy.reason) {
      storageCopy.reason = error.code;
    }

    const result: FullContent = {
      id: captured.id,
      pocketId: captured.pocketId,
      type: captured.type,
      metadata: captured.metadata,
      capturedAt: captured.capturedAt,
      sourceUrl: captured.sourceUrl,
      processingStatus: captured.processingStatus,
      pdfMetadata: captured.pdfMetadata,
      content: payload,
      storage: storageCopy,
      availability,
    };

    if (error) {
      result.error = error;
    }

    return result;
  }

  private extractFallback(
    captured: CapturedContent,
    storage: FullContentStorage,
  ): string | ArrayBuffer | Blob | null {
    if (storage.fallbackPreview && storage.fallbackPreview.length > 0) {
      return storage.fallbackPreview;
    }

    const metadata = captured.metadata as ContentMetadata & Record<string, unknown>;

    const fallbackCandidate = [
      metadata.fallbackPreview,
      metadata.excerpt,
      metadata.preview,
      metadata.summary,
    ].find((value) => typeof value === "string" && value.length > 0) as
      | string
      | undefined;

    if (fallbackCandidate) {
      return fallbackCandidate;
    }

    if (typeof captured.content === "string" && captured.content.length > 0) {
      return captured.content;
    }

    if (captured.content instanceof ArrayBuffer && captured.content.byteLength > 0) {
      return captured.content;
    }

    return null;
  }
}

/**
 * Convenience helper that creates a new {@link FullContentLoader} instance.
 */
export function createFullContentLoader(
  dependencies: ContentLoaderDependencies,
  options?: FullContentLoaderOptions,
): FullContentLoader {
  return new FullContentLoader(dependencies, options);
}

let sharedLoader: FullContentLoader | null = null;
let sharedLoaderPromise: Promise<FullContentLoader> | null = null;

async function resolveSharedLoader(): Promise<FullContentLoader> {
  if (sharedLoader) {
    return sharedLoader;
  }

  if (!sharedLoaderPromise) {
    sharedLoaderPromise = import("../background/indexeddb-manager.js").then(
      ({ indexedDBManager }) => {
        const loader = new FullContentLoader({
          storageManager: indexedDBManager,
        });
        sharedLoader = loader;
        return loader;
      },
    );
  }

  return sharedLoaderPromise;
}

/**
 * Configure the shared loader instance with explicit dependencies. Subsequent
 * calls to {@link loadFullContent} will reuse this configuration.
 */
export function configureFullContentLoader(
  dependencies: ContentLoaderDependencies,
  options?: FullContentLoaderOptions,
): FullContentLoader {
  sharedLoader = new FullContentLoader(dependencies, options);
  sharedLoaderPromise = Promise.resolve(sharedLoader);
  return sharedLoader;
}

/**
 * Reset the shared loader, primarily for test suites or environment teardown.
 */
export function resetSharedFullContentLoader(): void {
  sharedLoader = null;
  sharedLoaderPromise = null;
}

/**
 * Load full content using the shared loader instance. Dependencies are lazily
 * resolved the first time this function is invoked.
 */
export async function loadFullContent(
  contentId: string,
  options?: LoadFullContentOptions,
): Promise<FullContent> {
  const loader = await resolveSharedLoader();
  return loader.loadFullContent(contentId, options);
}

function normalizeStorageReference(
  metadata: ContentMetadata,
): FullContentStorage {
  const metaRecord = metadata as ContentMetadata & Record<string, unknown>;

  const storageCandidateRaw =
    (metaRecord.storage as ContentStorageReference | undefined) ??
    (metaRecord.storageTier as ContentStorageReference | undefined) ??
    (metaRecord.tieredStorage as ContentStorageReference | undefined);

  const metadataFallback = [
    metaRecord.fallbackPreview,
    metaRecord.excerpt,
    metaRecord.preview,
    metaRecord.summary,
  ].find((value) => typeof value === "string" && value.length > 0) as
    | string
    | undefined;

  if (storageCandidateRaw) {
    const storageRecord = storageCandidateRaw as ContentStorageReference &
      Record<string, unknown>;
    const tier = normalizeStorageTier(
      storageRecord.tier ??
        storageRecord.kind ??
        storageRecord.type ??
        (storageRecord as Record<string, unknown>).tier,
    );

    const archiveCandidate =
      storageRecord.archive ??
      (storageRecord as Record<string, unknown>).filesystem ??
      (storageRecord as Record<string, unknown>).fs;

    const storageFallback = [
      storageRecord.fallbackPreview,
      (storageRecord as Record<string, unknown>).preview,
      (storageRecord as Record<string, unknown>).excerpt,
    ].find((value) => typeof value === "string" && value.length > 0) as
      | string
      | undefined;

    const reason =
      typeof storageRecord.reason === "string" && storageRecord.reason.length > 0
        ? storageRecord.reason
        : undefined;

    return {
      tier,
      ...(isArchiveDescriptor(archiveCandidate)
        ? { archive: cloneArchiveDescriptor(archiveCandidate) }
        : {}),
      ...(storageFallback
        ? { fallbackPreview: storageFallback }
        : metadataFallback
        ? { fallbackPreview: metadataFallback }
        : {}),
      ...(reason ? { reason } : {}),
    };
  }

  return {
    tier: "indexeddb",
    ...(metadataFallback ? { fallbackPreview: metadataFallback } : {}),
  };
}

function normalizeStorageTier(value: unknown): StorageTier {
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (normalized === "filesystem" || normalized === "fs" || normalized === "archive") {
      return "filesystem";
    }
  }
  return "indexeddb";
}

function isArchiveDescriptor(value: unknown): value is FileArchiveDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }

  const descriptor = value as Record<string, unknown>;
  return (
    typeof descriptor.archiveHandleId === "string" &&
    typeof descriptor.relativePath === "string"
  );
}

function cloneArchiveDescriptor(
  descriptor: FileArchiveDescriptor,
): FileArchiveDescriptor {
  return {
    archiveHandleId: descriptor.archiveHandleId,
    relativePath: descriptor.relativePath,
    estimatedBytes: descriptor.estimatedBytes,
    mimeType: descriptor.mimeType,
    compression: descriptor.compression,
    lastModified: descriptor.lastModified,
  };
}

function hasContentPayload(value: string | ArrayBuffer): boolean {
  if (typeof value === "string") {
    return value.length > 0;
  }
  return value.byteLength > 0;
}
