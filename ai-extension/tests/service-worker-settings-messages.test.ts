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

describe("service worker settings message contracts", () => {
  it("preserves the existing provider and speech settings message families", () => {
    expect(typesSource).toContain('"PROVIDER_SETTINGS_LOAD"');
    expect(typesSource).toContain('"PROVIDER_SETTINGS_SAVE"');
    expect(typesSource).toContain('"SPEECH_SETTINGS_LOAD"');
    expect(typesSource).toContain('"SPEECH_SETTINGS_SAVE"');
    expect(typesSource).toContain('"AUDIO_TRANSCRIBE_REQUEST"');
  });

  it("types provider settings handlers instead of using any payloads", () => {
    expect(serviceWorkerSource).toMatch(
      /registerHandler\(\s*"PROVIDER_SETTINGS_LOAD",\s*async\s*\(payload: ProviderSettingsLoadPayload\)/,
    );
    expect(serviceWorkerSource).toMatch(
      /registerHandler\(\s*"PROVIDER_SETTINGS_SAVE",\s*async\s*\(payload: ProviderSettingsSavePayload\)/,
    );
  });

  it("types speech settings handlers instead of using any payloads", () => {
    expect(serviceWorkerSource).toMatch(
      /registerHandler\(\s*"SPEECH_SETTINGS_LOAD",\s*async\s*\(\s*payload: SpeechSettingsLoadPayload\s*\)/,
    );
    expect(serviceWorkerSource).toMatch(
      /registerHandler\(\s*"SPEECH_SETTINGS_SAVE",\s*async\s*\(payload: SpeechSettingsSavePayload\)/,
    );
  });
});
