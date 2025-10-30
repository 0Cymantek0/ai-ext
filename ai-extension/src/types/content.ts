/**
 * Content Type Definitions
 *
 * Defines shared types for content representation across storage and search modules.
 * These types are designed to be compatible with existing IndexedDB schemas while
 * providing a cleaner contract for future implementations.
 *
 * Note: These types coexist with legacy types in src/background/indexeddb-manager.ts.
 * The legacy CapturedContent type remains the source of truth for IndexedDB operations,
 * while these types provide a cleaner contract for new code.
 */

/**
 * Content type enumeration
 * Represents the various types of content that can be captured and stored
 */
export enum ContentType {
  TEXT = "text",
  SNIPPET = "snippet",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video",
  ELEMENT = "element",
  PAGE = "page",
  NOTE = "note",
  PDF = "pdf",
  DOCUMENT = "document",
  SPREADSHEET = "spreadsheet",
  FILE = "file",
}

/**
 * Processing status for content items
 * Tracks the lifecycle state of content through capture, processing, and completion
 */
export enum ProcessingStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
}

/**
 * Storage tier indicator
 * Specifies where the content data is physically stored
 */
export type StorageTier = "indexeddb" | "filesystem";

/**
 * Archive compression formats supported by the storage system
 */
export type ArchiveCompression = "none" | "gzip" | "brotli" | "zip";

/**
 * File archive descriptor for filesystem-stored content
 * Contains metadata needed to retrieve content from the File System Access API
 */
export interface FileArchiveDescriptor {
  /**
   * Identifier linking to a persisted FileSystemDirectoryHandle
   */
  archiveHandleId: string;

  /**
   * Relative path within the granted directory for this asset
   */
  relativePath: string;

  /**
   * Estimated on-disk footprint in bytes for the archived asset
   */
  estimatedBytes: number;

  /**
   * Optional MIME type for downstream consumers
   */
  mimeType?: string;

  /**
   * Compression applied when writing the archive contents
   */
  compression?: ArchiveCompression;

  /**
   * Timestamp (ms) indicating when the archive was last refreshed
   */
  lastModified?: number;
}

/**
 * Storage reference tracking where content is stored
 * Links content to either IndexedDB or filesystem with optional archive metadata
 */
export interface ContentStorageReference {
  /**
   * Storage tier where the primary content is stored
   */
  tier: StorageTier;

  /**
   * Archive descriptor if stored in filesystem (undefined for IndexedDB)
   */
  archive?: FileArchiveDescriptor;

  /**
   * Fallback preview text stored in IndexedDB when full content is in filesystem
   */
  fallbackPreview?: string;

  /**
   * Optional reason for storage tier selection (e.g., "quota_exceeded", "large_file")
   */
  reason?: string;
}

/**
 * Content metadata
 * Rich metadata associated with captured content, including provenance,
 * classification, and storage information
 */
export interface ContentMetadata {
  /**
   * Timestamp when the content was originally captured (milliseconds since epoch)
   */
  timestamp: number;

  /**
   * Last update timestamp (milliseconds since epoch)
   */
  updatedAt?: number;

  /**
   * Human-readable title or heading
   */
  title?: string;

  /**
   * User-assigned tags for organization and search
   */
  tags?: string[];

  /**
   * Content category (e.g., "research", "reference", "documentation")
   */
  category?: string;

  /**
   * Surrounding text context when capturing a selection
   */
  selectionContext?: string;

  /**
   * CSS selector or XPath for DOM element captures
   */
  elementSelector?: string;

  /**
   * Image or video dimensions
   */
  dimensions?: {
    width: number;
    height: number;
  };

  /**
   * File size in bytes (original, before compression)
   */
  fileSize?: number;

  /**
   * MIME type (e.g., "text/plain", "image/png", "application/pdf")
   */
  fileType?: string;

  /**
   * File extension (e.g., "txt", "png", "pdf")
   */
  fileExtension?: string;

  /**
   * Storage location reference
   */
  storage?: ContentStorageReference;

  /**
   * Short text excerpt for preview (first 200-500 chars)
   */
  excerpt?: string;

  /**
   * Preview representation (e.g., data URL for images, text snippet for documents)
   */
  preview?: string;

  /**
   * AI-generated summary of the content
   */
  summary?: string;

  /**
   * Fallback preview when full content is unavailable
   * @deprecated Use storage.fallbackPreview instead
   */
  fallbackPreview?: string;
}

/**
 * Core content record
 * Represents a single piece of captured content with all associated metadata
 *
 * Note: For IndexedDB operations, continue using CapturedContent from
 * src/background/indexeddb-manager.ts which includes additional storage-specific
 * fields. This interface focuses on the logical representation shared across
 * storage and search modules.
 */
export interface Content {
  /**
   * Unique identifier for this content item (mirrors IndexedDB primary key)
   */
  id: string;

  /**
   * ID of the pocket containing this content
   */
  pocketId: string;

  /**
   * Content type classification
   */
  type: ContentType;

  /**
   * The actual content data (text string or binary ArrayBuffer)
   */
  content: string | ArrayBuffer;

  /**
   * Rich metadata about the content
   */
  metadata: ContentMetadata;

  /**
   * Source URL where the content was captured from
   */
  sourceUrl: string;

  /**
   * Timestamp when the content was captured (milliseconds since epoch)
   */
  capturedAt?: number;

  /**
   * Processing status tracking ingestion lifecycle
   */
  processingStatus?: ProcessingStatus;

  /**
   * Optional vector embedding for semantic search (768 or 1024 dimensions typically)
   */
  embedding?: number[];

  /**
   * Optional PDF-specific metadata for rich documents
   */
  pdfMetadata?: {
    /**
     * Full extracted text from the PDF
     */
    text: string;

    /**
     * Structured content sections
     */
    structuredContent: {
      headings: Array<{ level: number; text: string }>;
      paragraphs: string[];
      lists: string[];
      tables: string[];
    };

    /**
     * Extracted images with positional metadata
     */
    images: Array<{
      data: string;
      width: number;
      height: number;
      pageNumber: number;
    }>;

    /**
     * Total number of pages in the PDF
     */
    pageCount: number;

    /**
     * Timestamp when extraction was performed
     */
    extractedAt: number;

    /**
     * Estimated token count for the extracted text
     */
    tokenCount: number;
  };
}

/**
 * Content chunk metadata
 * Metadata specific to a chunk of text extracted from larger content
 * for vector search and RAG applications
 *
 * Note: contentId and pocketId are stored at the ContentChunk level,
 * not duplicated here to avoid redundancy.
 */
export interface ChunkMetadata {
  /**
   * Type of the source content
   */
  sourceType: ContentType;

  /**
   * Source URL of the original content
   */
  sourceUrl: string;

  /**
   * Zero-based index of this chunk within the content (0, 1, 2, ...)
   */
  chunkIndex: number;

  /**
   * Total number of chunks the source content was split into
   */
  totalChunks: number;

  /**
   * Character offset where this chunk starts in the original content
   */
  startOffset: number;

  /**
   * Character offset where this chunk ends in the original content (exclusive)
   */
  endOffset: number;

  /**
   * Timestamp when the source content was originally captured (optional)
   */
  capturedAt?: number;

  /**
   * Timestamp when this chunk was created during processing
   */
  chunkedAt: number;

  /**
   * Title of the source content
   */
  title?: string | undefined;

  /**
   * Category of the source content
   */
  category?: string | undefined;

  /**
   * Preview text (first 100 characters of the chunk for display)
   */
  textPreview: string;
}

/**
 * Content chunk for vector search
 * Represents a semantically meaningful segment of content with its vector embedding
 * Used in RAG (Retrieval-Augmented Generation) for providing context to AI models
 */
export interface ContentChunk {
  /**
   * Unique identifier for this chunk
   */
  id: string;

  /**
   * Identifier of the source content record
   */
  contentId: string;

  /**
   * Identifier of the pocket containing the source content
   */
  pocketId: string;

  /**
   * The chunk text content
   */
  text: string;

  /**
   * Vector embedding of the chunk text (dimension matches embedding model)
   */
  embedding: number[];

  /**
   * Rich metadata about the chunk and its source
   */
  metadata: ChunkMetadata;

  /**
   * Timestamp when this chunk was created (milliseconds since epoch)
   * Used for persistence and cache invalidation
   */
  createdAt: number;

  /**
   * Optional relevance score when returned from search (0.0 to 1.0)
   * Populated by search operations, not stored
   */
  relevanceScore?: number;
}

/**
 * Partial content update payload
 * Used for updating content fields without replacing the entire record
 */
export interface ContentUpdate {
  /**
   * Updated content data (replaces existing content)
   */
  content?: string | ArrayBuffer;

  /**
   * Partial metadata updates (merged with existing metadata)
   */
  metadata?: Partial<ContentMetadata>;

  /**
   * Updated processing status
   */
  processingStatus?: ProcessingStatus;

  /**
   * Updated or newly generated embedding
   */
  embedding?: number[];
}

/**
 * Content query filters
 * Used for filtering content lists and search results
 */
export interface ContentFilters {
  /**
   * Filter by content type(s)
   */
  types?: ContentType[];

  /**
   * Filter by processing status(es)
   */
  statuses?: ProcessingStatus[];

  /**
   * Filter by tag(s) - content must have at least one matching tag
   */
  tags?: string[];

  /**
   * Filter by category
   */
  category?: string;

  /**
   * Filter by date range (captured after this timestamp)
   */
  capturedAfter?: number;

  /**
   * Filter by date range (captured before this timestamp)
   */
  capturedBefore?: number;

  /**
   * Filter by source URL pattern (supports wildcards)
   */
  sourceUrlPattern?: string;
}
