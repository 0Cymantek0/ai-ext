export interface SnippetContext {
  before?: string;
  after?: string;
}

export interface SnippetOptions {
  sourceUrl?: string;
  title?: string;
  timestamp?: number;
  context?: SnippetContext;
  htmlContent?: string;
}

export interface SnippetCapturePayload {
  mode: "selection";
  content: {
    type: "snippet";
    text: {
      content: string;
      formattedContent: string;
      wordCount: number;
      characterCount: number;
      headings: any[];
      links: any[];
      images: any[];
      lists: any[];
      tables: any[];
      paragraphs: string[];
      context: SnippetContext;
      selection: {
        text: string;
        length: number;
      };
    };
    context: SnippetContext;
    selection: {
      text: string;
      length: number;
    };
    sanitization: {
      detectedPII: number;
      redactionCount: number;
      piiTypes: string[];
    } | null;
  };
  metadata: {
    url: string;
    timestamp: number;
    title?: string;
  };
  timestamp: number;
}

function normalizeText(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function buildSnippetCapturePayload(
  selectionText: string,
  options: SnippetOptions = {},
): SnippetCapturePayload {
  const rawText = selectionText ?? "";
  const normalized = normalizeText(rawText);
  const characterCount = normalized.length;
  const wordCount = countWords(normalized);

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const timestamp = options.timestamp ?? Date.now();
  const url =
    options.sourceUrl ??
    (typeof window !== "undefined" ? window.location.href : "");
  const title =
    options.title ??
    (typeof document !== "undefined" ? document.title : undefined);
  const context: SnippetContext = {
    before: options.context?.before ?? "",
    after: options.context?.after ?? "",
  };

  // Use provided HTML content if available, otherwise fall back to plain text
  const formattedContent = options.htmlContent || normalized;

  return {
    mode: "selection",
    content: {
      type: "snippet",
      text: {
        content: normalized,
        formattedContent: formattedContent,
        wordCount,
        characterCount,
        headings: [],
        links: [],
        images: [],
        lists: [],
        tables: [],
        paragraphs,
        context,
        selection: {
          text: normalized,
          length: characterCount,
        },
      },
      context,
      selection: {
        text: normalized,
        length: characterCount,
      },
      sanitization: null,
    },
    metadata: {
      url,
      timestamp,
      ...(title ? { title } : {}),
    },
    timestamp,
  };
}
