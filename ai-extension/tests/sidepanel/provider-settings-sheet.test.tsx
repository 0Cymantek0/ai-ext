/**
 * Tests for the provider settings sheet and related components.
 * Covers custom endpoint URL validation, optional API-key behavior,
 * and speech settings persistence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomEndpointForm } from "@/sidepanel/components/CustomEndpointForm";
import { SpeechSettingsSection } from "@/sidepanel/components/SpeechSettingsSection";
import { ProviderSettingsSheet } from "@/sidepanel/components/ProviderSettingsSheet";

// Mock chrome.runtime.sendMessage
const mockSendMessage = vi.fn();
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: mockSendMessage,
  },
});

beforeEach(() => {
  mockSendMessage.mockReset();
});

describe("CustomEndpointForm", () => {
  it("validates URL format before save", async () => {
    const onSubmit = vi.fn();
    render(
      <CustomEndpointForm onSubmit={onSubmit} onCancel={() => {}} />,
    );

    const nameInput = screen.getByPlaceholderText("My Custom Provider");
    const urlInput = screen.getByPlaceholderText("https://api.example.com");

    // Enter invalid URL
    await userEvent.type(nameInput, "Test Provider");
    await userEvent.type(urlInput, "not-a-url");
    await userEvent.click(screen.getByText("Save Provider"));

    // Should show URL validation error
    expect(
      screen.getByText(/invalid url/i),
    ).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts valid URLs", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEndpointForm onSubmit={onSubmit} onCancel={() => {}} />,
    );

    const nameInput = screen.getByPlaceholderText("My Custom Provider");
    const urlInput = screen.getByPlaceholderText("https://api.example.com");

    await userEvent.type(nameInput, "My Provider");
    await userEvent.type(urlInput, "https://api.openai.com");
    await userEvent.click(screen.getByText("Save Provider"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Provider",
          baseUrl: "https://api.openai.com",
        }),
      );
    });
  });

  it("shows optional label for local-compatible providers", async () => {
    render(
      <CustomEndpointForm onSubmit={vi.fn()} onCancel={() => {}} />,
    );

    // Default type is "custom" which has optional key
    expect(screen.getByText(/\(optional\)/i)).toBeDefined();
  });

  it("shows required API key indicator for cloud providers", async () => {
    render(
      <CustomEndpointForm
        onSubmit={vi.fn()}
        onCancel={() => {}}
        initialValues={{ providerType: "openai" }}
      />,
    );

    // OpenAI requires an API key, so should NOT show optional label
    expect(screen.queryByText(/\(optional\)/i)).toBeNull();
  });

  it("sends custom endpoint data on submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEndpointForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialValues={{ providerType: "custom" }}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("My Custom Provider"),
      "LM Studio",
    );
    await userEvent.type(
      screen.getByPlaceholderText("https://api.example.com"),
      "http://localhost:1234",
    );

    await userEvent.click(screen.getByText("Save Provider"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "LM Studio",
          baseUrl: "http://localhost:1234",
          providerType: "custom",
        }),
      );
    });
  });

  it("allows empty API key for optional providers", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomEndpointForm
        onSubmit={onSubmit}
        onCancel={() => {}}
        initialValues={{ providerType: "ollama" }}
      />,
    );

    await userEvent.type(
      screen.getByPlaceholderText("My Custom Provider"),
      "Local Ollama",
    );
    await userEvent.type(
      screen.getByPlaceholderText("https://api.example.com"),
      "http://localhost:11434",
    );

    // Don't enter API key - should still submit
    await userEvent.click(screen.getByText("Save Provider"));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "",
        }),
      );
    });
  });

  it("calls endpoint validation on Test button click", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { valid: true, modelsAvailable: 5 },
    });

    render(
      <CustomEndpointForm onSubmit={vi.fn()} onCancel={() => {}} />,
    );

    const urlInput = screen.getByPlaceholderText("https://api.example.com");
    await userEvent.type(urlInput, "https://api.openai.com");

    await userEvent.click(screen.getByText("Test"));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "PROVIDER_SETTINGS_VALIDATE_ENDPOINT",
          payload: expect.objectContaining({
            baseUrl: "https://api.openai.com",
          }),
        }),
      );
    });
  });
});

describe("SpeechSettingsSection", () => {
  it("renders STT provider and language controls", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        settings: {
          provider: { providerId: "openai-stt", modelId: "whisper-1" },
          language: "en",
          timestampGranularity: "segment",
          advancedOptions: {},
        },
      },
    });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText("Speech-to-Text Settings")).toBeDefined();
    });

    // Should have language field visible
    expect(screen.getByText("Language")).toBeDefined();
    // Should have timestamp granularity field visible
    expect(screen.getByText("Timestamp Granularity")).toBeDefined();
  });

  it("loads and displays speech settings from background", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        settings: {
          provider: { providerId: "groq-stt", modelId: "whisper-large-v3" },
          language: "es",
          timestampGranularity: "word",
          advancedOptions: { enableTranslation: true },
        },
      },
    });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "SPEECH_SETTINGS_LOAD",
        }),
      );
    });
  });

  it("saves speech settings on save button click", async () => {
    mockSendMessage
      // First call: load settings
      .mockResolvedValueOnce({
        success: true,
        data: {
          settings: {
            provider: { providerId: "openai-stt", modelId: "whisper-1" },
            language: "en",
            timestampGranularity: "segment",
            advancedOptions: {},
          },
        },
      })
      // Second call: save settings
      .mockResolvedValueOnce({
        success: true,
        data: {
          settings: {
            provider: { providerId: "openai-stt", modelId: "whisper-1" },
            language: "en",
            timestampGranularity: "segment",
            advancedOptions: {},
          },
        },
      });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText("Save Speech Settings")).toBeDefined();
    });

    await userEvent.click(screen.getByText("Save Speech Settings"));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "SPEECH_SETTINGS_SAVE",
          payload: expect.objectContaining({
            language: "en",
            timestampGranularity: "segment",
          }),
        }),
      );
    });
  });

  it("shows translation toggle only when provider supports it", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        settings: {
          provider: { providerId: "nvidia-stt", modelId: "nvidia/parakeet-ctc-1.1b-asr" },
          language: "en",
          timestampGranularity: "segment",
          advancedOptions: {},
        },
      },
    });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      // NVIDIA does NOT support translation
      expect(screen.queryByText(/enable translation/i)).toBeNull();
    });
  });

  it("shows diarization toggle only when provider supports it", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        settings: {
          provider: { providerId: "nvidia-stt", modelId: "nvidia/parakeet-ctc-1.1b-asr" },
          language: "en",
          timestampGranularity: "segment",
          advancedOptions: {},
        },
      },
    });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      // NVIDIA supports diarization
      expect(screen.getByText(/enable speaker diarization/i)).toBeDefined();
    });
  });

  it("persists provider and model selection through save", async () => {
    mockSendMessage
      .mockResolvedValueOnce({
        success: true,
        data: {
          settings: {
            provider: { providerId: "groq-stt", modelId: "whisper-large-v3" },
            language: "en",
            timestampGranularity: "segment",
            advancedOptions: {},
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          settings: {
            provider: { providerId: "groq-stt", modelId: "whisper-large-v3" },
            language: "en",
            timestampGranularity: "segment",
            advancedOptions: {},
          },
        },
      });

    render(<SpeechSettingsSection />);

    await waitFor(() => {
      expect(screen.getByText("Save Speech Settings")).toBeDefined();
    });

    await userEvent.click(screen.getByText("Save Speech Settings"));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "SPEECH_SETTINGS_SAVE",
          payload: expect.objectContaining({
            provider: expect.objectContaining({
              providerId: "groq-stt",
              modelId: "whisper-large-v3",
            }),
          }),
        }),
      );
    });
  });
});

describe("ProviderSettingsSheet", () => {
  it("loads providers on open", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        providers: [
          {
            id: "provider_1",
            type: "openai",
            name: "OpenAI",
            enabled: true,
            endpointMode: "native",
          },
        ],
      },
    });

    render(
      <ProviderSettingsSheet isOpen={true} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "PROVIDER_SETTINGS_LOAD",
        }),
      );
    });
  });

  it("displays provider list after loading", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: {
        providers: [
          {
            id: "provider_1",
            type: "openai",
            name: "OpenAI GPT-4",
            enabled: true,
            endpointMode: "native",
          },
          {
            id: "provider_2",
            type: "ollama",
            name: "Local Ollama",
            enabled: true,
            endpointMode: "openai-compatible",
          },
        ],
      },
    });

    render(
      <ProviderSettingsSheet isOpen={true} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("OpenAI GPT-4")).toBeDefined();
      expect(screen.getByText("Local Ollama")).toBeDefined();
    });
  });

  it("includes speech settings section", async () => {
    mockSendMessage.mockResolvedValue({
      success: true,
      data: { providers: [] },
    });

    render(
      <ProviderSettingsSheet isOpen={true} onClose={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("Speech-to-Text Settings")).toBeDefined();
    });
  });

  it("can add a new custom endpoint", async () => {
    mockSendMessage
      // Initial provider load
      .mockResolvedValueOnce({
        success: true,
        data: { providers: [] },
      })
      // Save new provider
      .mockResolvedValueOnce({
        success: true,
        data: {
          provider: {
            id: "provider_new",
            type: "custom",
            name: "LM Studio",
            enabled: true,
          },
        },
      })
      // Reload providers after save
      .mockResolvedValueOnce({
        success: true,
        data: {
          providers: [
            {
              id: "provider_new",
              type: "custom",
              name: "LM Studio",
              enabled: true,
            },
          ],
        },
      });

    render(
      <ProviderSettingsSheet isOpen={true} onClose={() => {}} />,
    );

    // Click Add Provider button
    await waitFor(() => {
      expect(screen.getByText("Add Provider")).toBeDefined();
    });

    await userEvent.click(screen.getByText("Add Provider"));

    // Fill out custom endpoint form
    await waitFor(() => {
      expect(screen.getByText("Add New Provider")).toBeDefined();
    });

    await userEvent.type(
      screen.getByPlaceholderText("My Custom Provider"),
      "LM Studio",
    );
    await userEvent.type(
      screen.getByPlaceholderText("https://api.example.com"),
      "http://localhost:1234",
    );

    await userEvent.click(screen.getByText("Save Provider"));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "PROVIDER_SETTINGS_SAVE",
          payload: expect.objectContaining({
            name: "LM Studio",
            baseUrl: "http://localhost:1234",
          }),
        }),
      );
    });
  });
});
