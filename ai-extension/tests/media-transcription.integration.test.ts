import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  extractAudioMetadata,
  extractAudioWaveform,
  sendMessage,
} = vi.hoisted(() => ({
  extractAudioMetadata: vi.fn(),
  extractAudioWaveform: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock("../src/content/media-metadata.js", () => ({
  mediaMetadataExtractor: {
    extractAudioMetadata,
  },
}));

vi.mock("../src/content/media-processor.js", () => ({
  mediaProcessor: {
    extractAudioWaveform,
  },
}));

vi.mock("../src/shared/message-client.js", () => ({
  sendMessage,
}));

import { MediaCapture } from "../src/content/media-capture.js";

describe("MediaCapture audio transcription integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractAudioMetadata.mockResolvedValue({
      src: "https://example.com/audio.webm",
      duration: 12.3,
      title: "Sample audio",
    });
    extractAudioWaveform.mockResolvedValue({
      left: [0.1, 0.2],
      right: [0.2, 0.1],
      sampleRate: 44100,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(["audio-bytes"], { type: "audio/webm" })),
      }),
    );
  });

  it("routes audio transcription through the typed background message and stores the returned text", async () => {
    sendMessage.mockResolvedValue({
      success: true,
      data: {
        success: true,
        text: "transcribed speech",
        providerId: "openai-stt",
        modelId: "whisper-1",
        language: "en",
      },
    });

    const capture = new MediaCapture();
    const audio = document.createElement("audio");
    audio.src = "https://example.com/audio.webm";
    Object.defineProperty(audio, "duration", { value: 12.3, configurable: true });

    const result = await capture.captureAudio(audio, true);

    expect(sendMessage).toHaveBeenCalledWith(
      "AUDIO_TRANSCRIBE_REQUEST",
      expect.objectContaining({
        audioBase64: "YXVkaW8tYnl0ZXM=",
        mimeType: "audio/webm",
        fileName: "captured-audio.webm",
        durationMs: 12300,
        sourceUrl: "https://example.com/audio.webm",
      }),
    );
    expect(result.transcription).toBe("transcribed speech");
  });

  it("logs a warning and leaves transcription undefined when the background returns an error", async () => {
    sendMessage.mockResolvedValue({
      success: true,
      data: {
        success: false,
        error: "provider unavailable",
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const capture = new MediaCapture();
    const audio = document.createElement("audio");
    audio.src = "https://example.com/audio.webm";
    Object.defineProperty(audio, "duration", { value: 5, configurable: true });

    const result = await capture.captureAudio(audio, true);

    expect(result.transcription).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[MediaCapture] Audio transcription failed",
      expect.any(Error),
    );
  });
});
