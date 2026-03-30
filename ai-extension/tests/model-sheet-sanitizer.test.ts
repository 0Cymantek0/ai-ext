import { describe, it, expect } from "vitest";
import { sanitizeModelSheet } from "../src/background/model-sheet-sanitizer";

describe("sanitizeModelSheet", () => {
  it("removes ghost Gemini cloud models from the gemini-nano provider", () => {
    const providers = [
      {
        id: "nano-provider",
        type: "gemini-nano",
      },
    ] as any;

    const result = sanitizeModelSheet(
      {
        "gemini-nano": {
          modelId: "gemini-nano",
          providerId: "nano-provider",
          providerType: "gemini-nano",
          enabled: true,
        },
        "gemini-2.5-flash": {
          modelId: "gemini-2.5-flash",
          providerId: "nano-provider",
          providerType: "gemini-nano",
          enabled: true,
        },
      } as any,
      providers,
    );

    expect(result.changed).toBe(true);
    expect(result.sheet["gemini-nano"]).toBeDefined();
    expect(result.sheet["gemini-2.5-flash"]).toBeUndefined();
  });

  it("removes entries whose provider type no longer matches the provider", () => {
    const providers = [
      {
        id: "google-provider",
        type: "google",
      },
    ] as any;

    const result = sanitizeModelSheet(
      {
        "gemini-2.5-pro": {
          modelId: "gemini-2.5-pro",
          providerId: "google-provider",
          providerType: "gemini-nano",
          enabled: true,
        },
      } as any,
      providers,
    );

    expect(result.changed).toBe(true);
    expect(Object.keys(result.sheet)).toHaveLength(0);
  });
});
