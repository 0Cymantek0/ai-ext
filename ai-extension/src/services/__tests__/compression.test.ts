import { describe, expect, it } from "vitest";

import {
  DefaultCompressionService,
  CompressionError,
  type CompressionRuntimeAdapter,
} from "../compression.js";

class StubRuntime implements CompressionRuntimeAdapter {
  lastBlobSize = 0;
  draws: Array<{ width: number; height: number }> = [];

  async decodeImage(blob: Blob) {
    this.lastBlobSize = blob.size;
    return {
      width: 1600,
      height: 900,
      source: { kind: "stub" },
      close() {
        /* no-op */
      },
    };
  }

  createCanvas(width: number, height: number) {
    const runtime = this;
    return {
      width,
      height,
      draw(_image, targetWidth: number, targetHeight: number) {
        runtime.draws.push({ width: targetWidth, height: targetHeight });
      },
      async toBlob(mimeType: string) {
        const targetSize = Math.max(1, Math.floor(runtime.lastBlobSize * 0.45));
        const buffer = new Uint8Array(targetSize).fill(97);
        return new Blob([buffer], { type: mimeType });
      },
    };
  }
}

class NullCanvasRuntime implements CompressionRuntimeAdapter {
  async decodeImage(_blob: Blob) {
    return {
      width: 640,
      height: 360,
      source: { kind: "null" },
      close() {
        /* no-op */
      },
    };
  }

  createCanvas() {
    return null;
  }
}

class ErrorRuntime implements CompressionRuntimeAdapter {
  async decodeImage() {
    throw new Error("decode-fail");
  }

  createCanvas() {
    return null;
  }
}

describe("CompressionService", () => {
  it("compresses image blobs and emits progress events", async () => {
    const runtime = new StubRuntime();
    const service = new DefaultCompressionService({ runtime });
    const payload = new Uint8Array(4000).fill(123);
    const blob = new Blob([payload], { type: "image/png" });

    const stages: string[] = [];
    const result = await service.compressImage(blob, {
      onProgress: (event) => stages.push(event.stage),
    });

    expect(result.original.bytes).toBe(blob.size);
    expect(result.compressed.bytes).toBeLessThan(blob.size);
    expect(result.ratio).toBeCloseTo(
      result.compressed.bytes / result.original.bytes,
      5,
    );
    expect(result.fallback).toBe(false);
    expect(result.attemptedFormats?.length).toBeGreaterThan(0);
    expect(stages[0]).toBe("decode");
    expect(stages).toContain("complete");
  });

  it("creates thumbnails with bounded dimensions and base64 output", async () => {
    const runtime = new StubRuntime();
    const service = new DefaultCompressionService({ runtime });
    const payload = new Uint8Array(2048).fill(77);
    const blob = new Blob([payload], { type: "image/png" });

    const thumbnail = await service.createThumbnail(blob, { size: 100 });

    expect(thumbnail.width).toBeLessThanOrEqual(100);
    expect(thumbnail.height).toBeLessThanOrEqual(100);
    expect(thumbnail.bytes).toBeGreaterThan(0);
    expect(thumbnail.dataUrl).toMatch(/^data:image\/(webp|jpeg|png);base64,/);
  });

  it("generates excerpts without mid-word truncation", () => {
    const service = new DefaultCompressionService({ runtime: new StubRuntime() });
    const text =
      "First sentence has five words. Another sentence contains six planned words for testing.";

    const result = service.createExcerpt(text, { maxWords: 8 });

    expect(result.wordCount).toBe(8);
    expect(result.truncated).toBe(true);
    expect(result.excerpt.endsWith("contains…")).toBe(true);
    expect(result.originalWordCount).toBeGreaterThan(result.wordCount);
  });

  it("falls back gracefully when canvas APIs are unavailable", async () => {
    const service = new DefaultCompressionService({ runtime: new NullCanvasRuntime() });
    const blob = new Blob([new Uint8Array(1024)], { type: "image/jpeg" });

    const result = await service.compressImage(blob);

    expect(result.fallback).toBe(true);
    expect(result.compressed.bytes).toBe(blob.size);
    expect(result.message).toMatch(/Canvas/);
  });

  it("propagates decode failures as CompressionError", async () => {
    const service = new DefaultCompressionService({ runtime: new ErrorRuntime() });
    const blob = new Blob([new Uint8Array(512)], { type: "image/png" });

    await expect(service.compressImage(blob)).rejects.toBeInstanceOf(CompressionError);
  });
});
