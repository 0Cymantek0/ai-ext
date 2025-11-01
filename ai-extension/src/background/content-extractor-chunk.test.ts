/**
 * Content Extractor Chunk Tests
 *
 * Tests for chunk-specific content extraction functions
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractLLMContentFromChunk,
  getChunkPreview,
  formatChunkMetadata,
  estimateChunkTokens,
} from "./content-extractor";
import type { VectorChunk } from "./vector-chunk-types";
import { ContentType } from "./indexeddb-manager";

// Mock dependencies
vi.mock("./pdf-processor", () => ({
  pdfProcessor: {
    generateLLMSummary: vi.fn().mockReturnValue("PDF summary"),
  },
}));

// Helper to create mock chunk
function createMockChunk(overrides: Partial<VectorChunk> = {}): VectorChunk {
  return {
    id: "chunk-123",
    text: "This is a sample chunk of text about machine learning and artificial intelligence.",
    embedding: Array(384).fill(0.1),
    metadata: {
      contentId: "content-456",
      pocketId: "pocket-789",
      sourceType: ContentType.TEXT,
      sourceUrl: "https://example.com/article",
      chunkIndex: 0,
      totalChunks: 3,
      startOffset: 0,
      endOffset: 100,
      capturedAt: new Date("2024-01-15").getTime(),
      chunkedAt: Date.now(),
      title: "Machine Learning Basics",
      category: "education",
      textPreview: "This is a sample chunk...",
    },
    ...overrides,
  };
}

describe("Content Extractor - Chunk Functions", () => {
  describe("extractLLMContentFromChunk", () => {
    it("should extract formatted content with metadata", () => {
      const chunk = createMockChunk();
      const result = extractLLMContentFromChunk(chunk);

      expect(result).toContain("Title: Machine Learning Basics");
      expect(result).toContain("Source: https://example.com/article");
      expect(result).toContain("Type: text");
      expect(result).toContain("Part 1 of 3");
      expect(result).toContain("Captured:");
      expect(result).toContain(chunk.text);
    });

    it("should handle chunk without title", () => {
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          textPreview: "Sample text",
        },
      });

      const result = extractLLMContentFromChunk(chunk);

      expect(result).not.toContain("Title:");
      expect(result).toContain("Source:");
      expect(result).toContain(chunk.text);
    });

    it("should handle single-chunk content (no part info)", () => {
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          title: "Single Chunk Article",
          textPreview: "Sample text",
        },
      });

      const result = extractLLMContentFromChunk(chunk);

      expect(result).not.toContain("Part");
      expect(result).toContain("Title: Single Chunk Article");
    });

    it("should handle different content types", () => {
      const pdfChunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.PDF,
          sourceUrl: "https://example.com/document.pdf",
          chunkIndex: 2,
          totalChunks: 10,
          startOffset: 1000,
          endOffset: 1700,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          title: "Research Paper",
          textPreview: "Sample text",
        },
      });

      const result = extractLLMContentFromChunk(pdfChunk);

      expect(result).toContain("Type: pdf");
      expect(result).toContain("Part 3 of 10");
    });

    it("should format dates correctly", () => {
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: new Date("2024-03-15").getTime(),
          chunkedAt: Date.now(),
          textPreview: "Sample text",
        },
      });

      const result = extractLLMContentFromChunk(chunk);

      expect(result).toContain("Captured:");
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
    });
  });

  describe("getChunkPreview", () => {
    it("should return full text if under max length", () => {
      const chunk = createMockChunk({
        text: "Short text",
      });

      const preview = getChunkPreview(chunk, 150);

      expect(preview).toBe("Short text");
      expect(preview).not.toContain("...");
    });

    it("should truncate long text with ellipsis", () => {
      const longText = "A".repeat(200);
      const chunk = createMockChunk({
        text: longText,
      });

      const preview = getChunkPreview(chunk, 150);

      expect(preview.length).toBe(153); // 150 + "..."
      expect(preview.endsWith("...")).toBe(true);
      expect(preview.startsWith("AAA")).toBe(true);
    });

    it("should respect custom max length", () => {
      const chunk = createMockChunk({
        text: "This is a longer piece of text that should be truncated",
      });

      const preview = getChunkPreview(chunk, 20);

      expect(preview.length).toBe(23); // 20 + "..."
      expect(preview.endsWith("...")).toBe(true);
    });

    it("should handle empty text", () => {
      const chunk = createMockChunk({
        text: "",
      });

      const preview = getChunkPreview(chunk, 150);

      expect(preview).toBe("");
    });
  });

  describe("formatChunkMetadata", () => {
    it("should format metadata with title", () => {
      const chunk = createMockChunk();
      const formatted = formatChunkMetadata(chunk.metadata);

      expect(formatted).toContain("Machine Learning Basics");
      expect(formatted).toContain("text");
      expect(formatted).toContain("example.com");
      expect(formatted).toContain("(part 1/3)");
    });

    it("should format metadata without title", () => {
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          textPreview: "Sample text",
        },
      });

      const formatted = formatChunkMetadata(chunk.metadata);

      expect(formatted).not.toContain("Machine Learning");
      expect(formatted).toContain("text");
      expect(formatted).toContain("example.com");
    });

    it("should omit part info for single-chunk content", () => {
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: "https://example.com/article",
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          title: "Single Chunk",
          textPreview: "Sample text",
        },
      });

      const formatted = formatChunkMetadata(chunk.metadata);

      expect(formatted).not.toContain("part");
      expect(formatted).toContain("Single Chunk");
    });

    it("should handle different content types", () => {
      const pdfChunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.PDF,
          sourceUrl: "https://example.com/doc.pdf",
          chunkIndex: 5,
          totalChunks: 20,
          startOffset: 5000,
          endOffset: 5700,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          title: "PDF Document",
          textPreview: "Sample text",
        },
      });

      const formatted = formatChunkMetadata(pdfChunk.metadata);

      expect(formatted).toContain("pdf");
      expect(formatted).toContain("(part 6/20)");
    });
  });

  describe("estimateChunkTokens", () => {
    it("should estimate tokens for short chunk", () => {
      const chunk = createMockChunk({
        text: "Short text", // 10 chars ≈ 2.5 tokens + 50 overhead
      });

      const tokens = estimateChunkTokens(chunk);

      expect(tokens).toBeGreaterThan(50); // At least overhead
      expect(tokens).toBeLessThan(100); // Not too much
    });

    it("should estimate tokens for long chunk", () => {
      const longText = "A".repeat(2000); // 2000 chars ≈ 500 tokens + 50 overhead
      const chunk = createMockChunk({
        text: longText,
      });

      const tokens = estimateChunkTokens(chunk);

      expect(tokens).toBeGreaterThan(500);
      expect(tokens).toBeLessThan(600);
    });

    it("should include metadata overhead", () => {
      const chunk1 = createMockChunk({
        text: "Same text",
      });

      const chunk2 = createMockChunk({
        text: "Same text",
      });

      const tokens1 = estimateChunkTokens(chunk1);
      const tokens2 = estimateChunkTokens(chunk2);

      // Both should have same overhead
      expect(tokens1).toBe(tokens2);
      expect(tokens1).toBeGreaterThan(50); // Includes overhead
    });

    it("should handle empty text", () => {
      const chunk = createMockChunk({
        text: "",
      });

      const tokens = estimateChunkTokens(chunk);

      expect(tokens).toBe(50); // Just overhead
    });

    it("should scale linearly with text length", () => {
      const shortChunk = createMockChunk({
        text: "A".repeat(400), // 400 chars
      });

      const longChunk = createMockChunk({
        text: "A".repeat(800), // 800 chars (2x)
      });

      const shortTokens = estimateChunkTokens(shortChunk);
      const longTokens = estimateChunkTokens(longChunk);

      // Long should be roughly 2x short (accounting for fixed overhead)
      const shortTextTokens = shortTokens - 50;
      const longTextTokens = longTokens - 50;

      expect(longTextTokens).toBeCloseTo(shortTextTokens * 2, 0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle chunks with special characters", () => {
      const chunk = createMockChunk({
        text: "Text with émojis 🎉 and spëcial çharacters <>&\"'",
      });

      const extracted = extractLLMContentFromChunk(chunk);
      const preview = getChunkPreview(chunk);

      expect(extracted).toContain("émojis");
      expect(extracted).toContain("🎉");
      expect(preview).toContain("émojis");
    });

    it("should handle chunks with newlines", () => {
      const chunk = createMockChunk({
        text: "Line 1\n\nLine 2\nLine 3",
      });

      const extracted = extractLLMContentFromChunk(chunk);

      expect(extracted).toContain("\n");
      expect(extracted).toContain("Line 1");
      expect(extracted).toContain("Line 2");
    });

    it("should handle very long URLs", () => {
      const longUrl = "https://example.com/" + "a".repeat(200);
      const chunk = createMockChunk({
        metadata: {
          contentId: "content-456",
          pocketId: "pocket-789",
          sourceType: ContentType.TEXT,
          sourceUrl: longUrl,
          chunkIndex: 0,
          totalChunks: 1,
          startOffset: 0,
          endOffset: 100,
          capturedAt: Date.now(),
          chunkedAt: Date.now(),
          textPreview: "Sample text",
        },
      });

      const extracted = extractLLMContentFromChunk(chunk);

      expect(extracted).toContain(longUrl);
    });

    it("should handle chunks with Unicode characters", () => {
      const chunk = createMockChunk({
        text: "Unicode: 你好世界 مرحبا العالم Привет мир",
      });

      const extracted = extractLLMContentFromChunk(chunk);
      const tokens = estimateChunkTokens(chunk);

      expect(extracted).toContain("你好世界");
      expect(tokens).toBeGreaterThan(0);
    });
  });
});
