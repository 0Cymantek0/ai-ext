/**
 * Type definitions for Chrome's built-in AI APIs
 * Shared across the extension
 */

declare global {
  interface Window {
    ai?: {
      languageModel?: LanguageModelFactory;
      summarizer?: any;
      rewriter?: any;
    };
  }

  interface LanguageModelFactory {
    availability(): Promise<AIModelAvailability>;
    params(): Promise<AIModelParams>;
    create(options?: AISessionOptions): Promise<AISession>;
  }

  interface AIModelAvailability {
    available: "readily" | "after-download" | "no";
  }

  interface AIModelParams {
    defaultTopK: number;
    maxTopK: number;
    defaultTemperature: number;
    maxTemperature: number;
  }

  interface AISessionOptions {
    topK?: number;
    temperature?: number;
    signal?: AbortSignal;
    initialPrompts?: AIPrompt[];
    monitor?: (monitor: AIDownloadMonitor) => void;
  }

  interface AIPrompt {
    role: "system" | "user" | "assistant";
    content: string;
  }

  interface AIDownloadMonitor {
    addEventListener(
      type: "downloadprogress",
      listener: (event: AIDownloadProgressEvent) => void,
    ): void;
    removeEventListener(
      type: "downloadprogress",
      listener: (event: AIDownloadProgressEvent) => void,
    ): void;
    dispatchEvent(event: Event): boolean;
  }

  interface AIDownloadProgressEvent extends Event {
    loaded: number;
    total: number;
  }

  interface AISession {
    prompt(input: string, options?: AIPromptOptions): Promise<string>;
    promptStreaming(
      input: string,
      options?: AIPromptOptions,
    ): ReadableStream<string>;
    clone(options?: { signal?: AbortSignal }): Promise<AISession>;
    destroy(): void;
    inputUsage: number;
    inputQuota: number;
  }

  interface AIPromptOptions {
    signal?: AbortSignal;
  }

  const LanguageModel: LanguageModelFactory;
}

export {};
