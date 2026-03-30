import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddProviderFlow } from "@/sidepanel/components/settings/AddProviderFlow";

const mockSendMessage = vi.fn();

vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

describe("AddProviderFlow", () => {
  beforeEach(() => {
    mockSendMessage.mockReset();
  });

  it("shows Gemini Nano as a provider preset", () => {
    render(<AddProviderFlow onBack={() => {}} onComplete={() => {}} />);

    expect(screen.getByRole("button", { name: "Gemini Nano" })).toBeDefined();
  });

  it("creates the built-in Gemini Nano provider directly from the preset", async () => {
    const onComplete = vi.fn();
    mockSendMessage.mockResolvedValue({ success: true });

    render(<AddProviderFlow onBack={() => {}} onComplete={onComplete} />);

    await userEvent.click(screen.getByRole("button", { name: "Gemini Nano" }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith({
        kind: "PROVIDER_SETTINGS_SAVE",
        payload: {
          type: "gemini-nano",
          name: "Gemini Nano",
          enabled: true,
          modelId: "gemini-nano",
        },
      });
    });

    expect(onComplete).toHaveBeenCalled();
  });
});
