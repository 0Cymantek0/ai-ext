import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildSnippetCapturePayload } from "../snippet-utils.js";

describe("buildSnippetCapturePayload", () => {
  let originalTitle: string;
  let originalUrl: string;

  beforeEach(() => {
    originalTitle = document.title;
    originalUrl = window.location.href;

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    document.title = "Example Title";
    window.history.replaceState({}, "", "https://example.com/page");
  });

  afterEach(() => {
    document.title = originalTitle;
    window.history.replaceState({}, "", originalUrl);
    vi.useRealTimers();
  });

  it("constructs snippet payload with derived metrics", () => {
    const text = "Hello world from snippet";
    const payload = buildSnippetCapturePayload(text, {
      sourceUrl: "https://custom.example/route",
      title: "Custom Title",
    });

    expect(payload.mode).toBe("selection");
    expect(payload.content.type).toBe("snippet");
    expect(payload.content.text.wordCount).toBe(4);
    expect(payload.content.text.characterCount).toBe(text.length);
    expect(payload.content.text.selection.text).toBe(text);
    expect(payload.metadata.url).toBe("https://custom.example/route");
    expect(payload.metadata.title).toBe("Custom Title");
    expect(payload.timestamp).toBe(new Date("2024-01-01T00:00:00Z").getTime());
  });

  it("falls back to window metadata when options are omitted", () => {
    const payload = buildSnippetCapturePayload("Just text");
    expect(payload.metadata.url).toBe(window.location.href);
    expect(payload.metadata.title).toBe("Example Title");
  });

  it("includes provided selection context", () => {
    const payload = buildSnippetCapturePayload("Central text", {
      sourceUrl: "https://example.com",
      context: {
        before: "Before context",
        after: "After context",
      },
    });

    expect(payload.content.text.context.before).toBe("Before context");
    expect(payload.content.text.context.after).toBe("After context");
  });

  it("includes HTML content when provided", () => {
    const text = "Bold text";
    const html = "<strong>Bold text</strong>";
    const payload = buildSnippetCapturePayload(text, {
      sourceUrl: "https://example.com",
      htmlContent: html,
    });

    expect(payload.content.text.content).toBe(text);
    expect(payload.content.text.formattedContent).toBe(html);
  });

  it("falls back to plain text when HTML content is not provided", () => {
    const text = "Plain text";
    const payload = buildSnippetCapturePayload(text, {
      sourceUrl: "https://example.com",
    });

    expect(payload.content.text.content).toBe(text);
    expect(payload.content.text.formattedContent).toBe(text);
  });
});
