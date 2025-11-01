/**
 * Text Chunker Utility
 *
 * Splits large text content into manageable chunks for embedding generation.
 * Ensures chunks respect word boundaries and maintain semantic coherence.
 *
 * Requirements: 7.2 (Vector search and embeddings)
 *
 * TODO: Consider using established text splitting libraries like LangChain's
 * RecursiveCharacterTextSplitter for more advanced chunking strategies.
 */

import { logger } from "./monitoring.js";

export interface ChunkOptions {
  maxChunkSize?: number; // Maximum characters per chunk
  overlapSize?: number; // Overlap between chunks for context
  respectSentences?: boolean; // Try to break at sentence boundaries
  respectParagraphs?: boolean; // Try to break at paragraph boundaries
}

export interface TextChunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
  totalChunks: number;
}

export class TextChunker {
  private defaultOptions: Required<ChunkOptions> = {
    maxChunkSize: 1000,
    overlapSize: 100,
    respectSentences: true,
    respectParagraphs: true,
  };

  /**
   * Split text into chunks with overlap
   */
  chunkText(text: string, options?: ChunkOptions): TextChunk[] {
    const opts = { ...this.defaultOptions, ...options };

    if (!text || text.trim().length === 0) {
      logger.warn("TextChunker", "Empty text provided for chunking");
      return [];
    }

    // If text is smaller than max chunk size, return as single chunk
    if (text.length <= opts.maxChunkSize) {
      return [
        {
          id: this.generateChunkId(0),
          text: text.trim(),
          startIndex: 0,
          endIndex: text.length,
          chunkIndex: 0,
          totalChunks: 1,
        },
      ];
    }

    const chunks: TextChunk[] = [];
    let currentIndex = 0;

    // Split by paragraphs first if requested
    const segments = opts.respectParagraphs
      ? this.splitByParagraphs(text)
      : [text];

    for (const segment of segments) {
      const segmentChunks = this.chunkSegment(segment, currentIndex, opts);
      chunks.push(...segmentChunks);
      currentIndex += segment.length;
    }

    // Update total chunks count
    const totalChunks = chunks.length;
    chunks.forEach((chunk, index) => {
      chunk.chunkIndex = index;
      chunk.totalChunks = totalChunks;
    });

    logger.info("TextChunker", "Text chunked successfully", {
      originalLength: text.length,
      chunksCreated: totalChunks,
      avgChunkSize: Math.round(text.length / totalChunks),
    });

    return chunks;
  }

  /**
   * Split text by paragraphs
   */
  private splitByParagraphs(text: string): string[] {
    return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  }

  /**
   * Chunk a text segment
   */
  private chunkSegment(
    segment: string,
    baseIndex: number,
    options: Required<ChunkOptions>,
  ): TextChunk[] {
    const chunks: TextChunk[] = [];
    let startIndex = 0;

    while (startIndex < segment.length) {
      const endIndex = Math.min(
        startIndex + options.maxChunkSize,
        segment.length,
      );

      let chunkEnd = endIndex;

      // Try to break at sentence boundary if not at the end
      if (options.respectSentences && endIndex < segment.length) {
        const sentenceEnd = this.findSentenceBoundary(
          segment,
          startIndex,
          endIndex,
        );
        if (sentenceEnd > startIndex) {
          chunkEnd = sentenceEnd;
        }
      }

      // If no sentence boundary found, try word boundary
      if (chunkEnd === endIndex && endIndex < segment.length) {
        const wordEnd = this.findWordBoundary(segment, startIndex, endIndex);
        if (wordEnd > startIndex) {
          chunkEnd = wordEnd;
        }
      }

      const chunkText = segment.slice(startIndex, chunkEnd).trim();

      if (chunkText.length > 0) {
        chunks.push({
          id: this.generateChunkId(chunks.length),
          text: chunkText,
          startIndex: baseIndex + startIndex,
          endIndex: baseIndex + chunkEnd,
          chunkIndex: chunks.length,
          totalChunks: 0, // Will be set later
        });
      }

      // Move to next chunk with overlap
      // New start should be: chunkEnd - overlap (to create overlap)
      // But not less than previous startIndex (to prevent infinite loop)
      const nextStart = chunkEnd - options.overlapSize;
      if (nextStart <= startIndex) {
        // No overlap possible or would create infinite loop, move forward
        startIndex = chunkEnd;
      } else {
        startIndex = nextStart;
      }

      // Prevent infinite loop
      if (startIndex >= segment.length) break;
    }

    return chunks;
  }

  /**
   * Find sentence boundary near target index
   */
  private findSentenceBoundary(
    text: string,
    start: number,
    target: number,
  ): number {
    const searchText = text.slice(start, target);
    const sentenceEndings = /[.!?]\s+/g;
    let lastMatch = -1;
    let match;

    while ((match = sentenceEndings.exec(searchText)) !== null) {
      lastMatch = match.index + match[0].length;
    }

    if (lastMatch > 0) {
      return start + lastMatch;
    }

    return target;
  }

  /**
   * Find word boundary near target index
   */
  private findWordBoundary(
    text: string,
    start: number,
    target: number,
  ): number {
    // Look backwards from target to find last space
    for (let i = target - 1; i > start; i--) {
      if (/\s/.test(text[i] || "")) {
        return i + 1;
      }
    }

    return target;
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(index: number): string {
    return `chunk_${Date.now()}_${index}`;
  }

  /**
   * Merge chunks back into original text (for testing)
   */
  mergeChunks(chunks: TextChunk[]): string {
    return chunks.map((c) => c.text).join(" ");
  }

  /**
   * Estimate number of chunks for given text
   */
  estimateChunkCount(textLength: number, chunkSize: number = 1000): number {
    return Math.ceil(textLength / chunkSize);
  }
}

export const textChunker = new TextChunker();
