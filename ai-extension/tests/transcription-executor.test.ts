import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsManager } from '../src/background/routing/settings-manager.js';
import { getProviderConfigManager } from '../src/background/provider-config-manager.js';
import { TranscriptionExecutor } from '../src/background/provider-execution/transcription-executor.js';

vi.mock('../src/background/routing/settings-manager.js', () => ({
  SettingsManager: vi.fn(),
}));

vi.mock('../src/background/provider-config-manager.js', () => ({
  getProviderConfigManager: vi.fn(),
}));

describe('TranscriptionExecutor', () => {
  let executor: TranscriptionExecutor;
  let mockSettingsManager: {
    getSpeechSettings: ReturnType<typeof vi.fn>;
  };
  let mockProviderConfigManager: {
    isInitialized: ReturnType<typeof vi.fn>;
    initialize: ReturnType<typeof vi.fn>;
    getProvider: ReturnType<typeof vi.fn>;
    getDecryptedApiKey: ReturnType<typeof vi.fn>;
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mockSettingsManager = {
      getSpeechSettings: vi.fn(),
    };
    vi.mocked(SettingsManager).mockImplementation(() => mockSettingsManager as never);

    mockProviderConfigManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      getProvider: vi.fn(),
      getDecryptedApiKey: vi.fn(),
    };
    vi.mocked(getProviderConfigManager).mockReturnValue(mockProviderConfigManager as never);

    executor = new TranscriptionExecutor();
  });

  const makeAudioRequest = () => ({
    audio: new Blob(['audio-bytes'], { type: 'audio/webm' }),
    fileName: 'capture.webm',
    mimeType: 'audio/webm',
  });

  const makeProvider = (overrides: Record<string, unknown> = {}) => ({
    id: 'provider-openai',
    type: 'openai',
    name: 'OpenAI Speech',
    enabled: true,
    endpointMode: 'native',
    baseUrl: 'https://api.openai.com/v1/',
    apiKeyRequired: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  });

  const makeSpeechSettings = (overrides: Record<string, unknown> = {}) => ({
    provider: {
      providerId: 'provider-openai',
      modelId: 'whisper-1',
    },
    language: 'es',
    timestampGranularity: 'none',
    advancedOptions: {},
    ...overrides,
  });

  it.each([
    ['openai', 'https://api.openai.com/v1'],
    ['groq', 'https://api.groq.com/openai/v1'],
    ['openrouter', 'https://openrouter.ai/api/v1'],
    ['custom', 'https://custom.example/v1'],
    ['ollama', 'http://localhost:11434/v1'],
    ['nvidia', 'https://integrate.api.nvidia.com/v1'],
  ])(
    'sends translation requests to /audio/translations for %s providers and transcription requests otherwise',
    async (providerType, baseUrl) => {
      mockSettingsManager.getSpeechSettings.mockResolvedValueOnce(
        makeSpeechSettings({
          advancedOptions: { enableTranslation: true },
        }),
      );
      mockSettingsManager.getSpeechSettings.mockResolvedValueOnce(makeSpeechSettings());

      mockProviderConfigManager.getProvider.mockResolvedValue(
        makeProvider({
          id: `provider-${providerType}`,
          type: providerType,
          baseUrl,
          endpointMode: providerType === 'nvidia' ? 'nvidia-nim' : 'openai-compatible',
          apiKeyRequired: providerType !== 'ollama',
        }),
      );
      mockProviderConfigManager.getDecryptedApiKey.mockResolvedValue('secret-key');

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: 'hola', language: 'es' }),
      });

      await executor.transcribeAudio(makeAudioRequest());
      await executor.transcribeAudio(makeAudioRequest());

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        `${baseUrl.replace(/\/$/, '')}/audio/translations`,
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        `${baseUrl.replace(/\/$/, '')}/audio/transcriptions`,
        expect.any(Object),
      );
    },
  );

  it.each([
    ['segment', ['segment']],
    ['word', ['segment', 'word']],
  ])(
    'sets verbose_json and timestamp_granularities[] when granularity is %s',
    async (timestampGranularity, expectedGranularities) => {
      mockSettingsManager.getSpeechSettings.mockResolvedValue(
        makeSpeechSettings({
          timestampGranularity,
          advancedOptions: { prompt: 'meeting notes', temperature: 0.2 },
        }),
      );
      mockProviderConfigManager.getProvider.mockResolvedValue(makeProvider());
      mockProviderConfigManager.getDecryptedApiKey.mockResolvedValue('secret-key');
      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            text: 'hello',
            language: 'en',
            segments: [{ start: 0, end: 1, text: 'hello' }],
            words: [{ word: 'hello', start: 0, end: 1 }],
          }),
      });

      await executor.transcribeAudio(makeAudioRequest());

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = init.body as FormData;

      expect(body.get('response_format')).toBe('verbose_json');
      expect(body.getAll('timestamp_granularities[]')).toEqual(expectedGranularities);
      expect(body.get('prompt')).toBe('meeting notes');
      expect(body.get('temperature')).toBe('0.2');
      expect(body.get('language')).toBe('es');
      expect(body.get('model')).toBe('whisper-1');
      expect(body.get('file')).toBeInstanceOf(File);
    },
  );

  it('throws when diarization is requested for a non-NVIDIA provider', async () => {
    mockSettingsManager.getSpeechSettings.mockResolvedValue(
      makeSpeechSettings({
        advancedOptions: { enableDiarization: true },
      }),
    );
    mockProviderConfigManager.getProvider.mockResolvedValue(
      makeProvider({
        type: 'groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        endpointMode: 'openai-compatible',
      }),
    );

    await expect(executor.transcribeAudio(makeAudioRequest())).rejects.toThrow(
      'Speaker diarization is only supported for NVIDIA speech providers in Phase 5.',
    );
  });
});
