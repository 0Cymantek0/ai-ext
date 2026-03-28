import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typesPath = path.resolve(__dirname, "../src/shared/types/index.d.ts");
const serviceWorkerPath = path.resolve(
  __dirname,
  "../src/background/service-worker.ts",
);

const typesSource = readFileSync(typesPath, "utf8");
const serviceWorkerSource = readFileSync(serviceWorkerPath, "utf8");

describe("service worker AI_PROCESS_REQUEST contract", () => {
  it("defines typed provider-aware AI process request and response payloads", () => {
    expect(typesSource).toContain("export interface AiProcessRequestPayload");
    expect(typesSource).toContain("export interface AiProcessResponsePayload");
    expect(typesSource).toContain("prompt: string");
    expect(typesSource).toContain('mode?: "ask" | "ai-pocket"');
    expect(typesSource).toContain("originalText?: string");
    expect(typesSource).toContain("source:");
    expect(typesSource).toContain("tokensUsed:");
  });

  it("registers AI_PROCESS_REQUEST with an explicit payload type instead of any", () => {
    expect(serviceWorkerSource).toMatch(
      /registerHandler\("AI_PROCESS_REQUEST", async \(payload: AiProcessRequestPayload\)/,
    );
    expect(serviceWorkerSource).not.toMatch(
      /registerHandler\("AI_PROCESS_REQUEST", async \(payload: any\)/,
    );
  });

  it("wires the shared AUDIO_TRANSCRIBE_REQUEST contract through the service worker", () => {
    expect(typesSource).toContain('"AUDIO_TRANSCRIBE_REQUEST"');
    expect(typesSource).toContain(
      "export interface AudioTranscribeRequestPayload",
    );
    expect(typesSource).toContain(
      "export interface AudioTranscribeResponsePayload",
    );
    expect(serviceWorkerSource).toContain("new TranscriptionExecutor()");
    expect(serviceWorkerSource).toMatch(
      /registerHandler\("AUDIO_TRANSCRIBE_REQUEST", async \(payload: AudioTranscribeRequestPayload\)/,
    );
    expect(serviceWorkerSource).toContain("providerId:");
    expect(serviceWorkerSource).toContain("modelId:");
    expect(serviceWorkerSource).toContain("segments:");
    expect(serviceWorkerSource).toContain("words:");
  });
});
