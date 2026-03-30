/**
 * ZORK: INFINITE EDITION - Gemini Nano AI Engine
 * Core AI interface for Chrome's built-in Gemini Nano
 */

interface AISession {
  prompt: (text: string) => Promise<string>;
  promptStreaming: (text: string) => ReadableStream;
  destroy: () => void;
}

interface AICapabilities {
  available: "readily" | "after-download" | "no";
  defaultTemperature?: number;
  defaultTopK?: number;
  maxTopK?: number;
}

export class GeminiNanoEngine {
  private session: AISession | null = null;
  private isInitialized = false;
  private capabilities: AICapabilities | null = null;

  async initialize(): Promise<boolean> {
    try {
      // Check if Chrome AI is available
      if (!("ai" in window)) {
        console.error("Chrome AI not available");
        return false;
      }

      const ai = (window as any).ai;

      // Check capabilities
      this.capabilities = await ai.languageModel.capabilities();

      if (!this.capabilities) {
        console.error("Could not get AI capabilities");
        return false;
      }

      if (this.capabilities.available === "no") {
        console.error("Gemini Nano not available on this device");
        return false;
      }

      if (this.capabilities.available === "after-download") {
        console.log("Downloading Gemini Nano model...");
        // Model will download in background
      }

      // Create session with optimal parameters for creative storytelling
      this.session = await ai.languageModel.create({
        temperature: 0.9, // High creativity
        topK: this.capabilities.maxTopK || 40, // Diverse outputs
      });

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize Gemini Nano:", error);
      return false;
    }
  }

  async generate(prompt: string): Promise<string> {
    if (!this.session) {
      throw new Error("AI Engine not initialized");
    }

    try {
      const response = await this.session.prompt(prompt);
      return response;
    } catch (error) {
      console.error("Generation failed:", error);
      throw error;
    }
  }

  async *generateStreaming(
    prompt: string,
  ): AsyncGenerator<string, void, unknown> {
    if (!this.session) {
      throw new Error("AI Engine not initialized");
    }

    try {
      const stream = this.session.promptStreaming(prompt);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        yield chunk;
      }
    } catch (error) {
      console.error("Streaming generation failed:", error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.session !== null;
  }

  getCapabilities(): AICapabilities | null {
    return this.capabilities;
  }

  destroy(): void {
    if (this.session) {
      this.session.destroy();
      this.session = null;
    }
    this.isInitialized = false;
  }
}
