import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typesPath = path.resolve(__dirname, "../src/shared/types/index.d.ts");
const streamingHandlerPath = path.resolve(
  __dirname,
  "../src/background/streaming-handler.ts",
);

const typesSource = readFileSync(typesPath, "utf8");
const streamingHandlerSource = readFileSync(streamingHandlerPath, "utf8");

describe("stream metadata provider contract", () => {
  it("defines AiStreamStartPayload with provider metadata fields", () => {
    expect(typesSource).toContain("export interface AiStreamStartPayload");
    expect(typesSource).toContain("fallbackOccurred?: boolean");
    expect(typesSource).toContain("providerId?: string");
    expect(typesSource).toContain("providerType?: string");
    expect(typesSource).toContain("modelId?: string");
    expect(typesSource).toContain("fallbackFromProviderId?: string");
    expect(typesSource).toContain("attemptedProviderIds?: string[]");
  });

  it("extends AiStreamEndPayload with the same provider metadata fields", () => {
    const aiStreamEndBlock = typesSource.slice(
      typesSource.indexOf("export interface AiStreamEndPayload"),
      typesSource.indexOf("export interface AiStreamErrorPayload"),
    );

    expect(aiStreamEndBlock).toContain("fallbackOccurred?: boolean");
    expect(aiStreamEndBlock).toContain("providerId?: string");
    expect(aiStreamEndBlock).toContain("providerType?: string");
    expect(aiStreamEndBlock).toContain("modelId?: string");
    expect(aiStreamEndBlock).toContain("fallbackFromProviderId?: string");
    expect(aiStreamEndBlock).toContain("attemptedProviderIds?: string[]");
  });

  it("keeps the streaming handler wired to start and end payload contracts", () => {
    expect(streamingHandlerSource).toContain('kind: "AI_PROCESS_STREAM_START"');
    expect(streamingHandlerSource).toContain('kind: "AI_PROCESS_STREAM_END"');
    expect(streamingHandlerSource).toContain("AiStreamEndPayload");
  });
});
