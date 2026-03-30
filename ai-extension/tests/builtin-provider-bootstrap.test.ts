import { describe, it, expect, vi } from "vitest";
import { ensureGeminiNanoProvider } from "../src/background/builtin-provider-bootstrap";

describe("ensureGeminiNanoProvider", () => {
  it("adds the built-in Gemini Nano provider when missing", async () => {
    const listProviders = vi.fn().mockResolvedValue([]);
    const addProvider = vi.fn().mockResolvedValue(undefined);

    const added = await ensureGeminiNanoProvider({
      listProviders,
      addProvider,
    } as any);

    expect(added).toBe(true);
    expect(addProvider).toHaveBeenCalledWith({
      type: "gemini-nano",
      name: "Gemini Nano",
      enabled: true,
      modelId: "gemini-nano",
    });
  });

  it("does not add a duplicate Gemini Nano provider", async () => {
    const listProviders = vi.fn().mockResolvedValue([
      { id: "provider_1", type: "gemini-nano" },
    ]);
    const addProvider = vi.fn();

    const added = await ensureGeminiNanoProvider({
      listProviders,
      addProvider,
    } as any);

    expect(added).toBe(false);
    expect(addProvider).not.toHaveBeenCalled();
  });
});
