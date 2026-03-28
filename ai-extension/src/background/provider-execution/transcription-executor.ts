import { getProviderConfigManager, type ProviderConfigManager } from '../provider-config-manager.js';
import type { ProviderConfig } from '../provider-types.js';
import { SettingsManager } from '../routing/settings-manager.js';
import type {
  ProviderAudioRequest,
  ProviderAudioResult,
  ProviderAudioSegment,
  ProviderAudioWordTimestamp,
} from './types.js';

interface VerboseAudioResponse {
  text?: string;
  language?: string;
  segments?: ProviderAudioSegment[];
  words?: ProviderAudioWordTimestamp[];
}

export class TranscriptionExecutor {
  constructor(
    private readonly settingsManager = new SettingsManager(),
    private readonly providerConfigManager: ProviderConfigManager = getProviderConfigManager(),
  ) {}

  async transcribeAudio(request: ProviderAudioRequest): Promise<ProviderAudioResult> {
    const settings = await this.settingsManager.getSpeechSettings();
    const providerId = settings.provider.providerId.trim();
    const modelId = settings.provider.modelId.trim();

    if (!providerId) {
      throw new Error('Speech provider is not configured.');
    }

    if (!modelId) {
      throw new Error('Speech model is not configured.');
    }

    if (!this.providerConfigManager.isInitialized()) {
      await this.providerConfigManager.initialize();
    }

    const provider = await this.providerConfigManager.getProvider(providerId);
    if (!provider) {
      throw new Error('Speech provider is not configured.');
    }

    if (settings.advancedOptions?.enableDiarization === true && provider.type !== 'nvidia') {
      throw new Error(
        'Speaker diarization is only supported for NVIDIA speech providers in Phase 5.',
      );
    }

    const baseUrl = provider.baseUrl?.replace(/\/$/, '');
    if (!baseUrl) {
      throw new Error(`Speech provider '${providerId}' does not have a base URL configured.`);
    }

    const apiKey =
      provider.apiKeyRequired !== false
        ? await this.providerConfigManager.getDecryptedApiKey(providerId)
        : null;

    if (provider.apiKeyRequired !== false && !apiKey) {
      throw new Error(`Speech provider '${providerId}' API key is not configured.`);
    }

    const audioPath = settings.advancedOptions?.enableTranslation
      ? 'audio/translations'
      : 'audio/transcriptions';
    const endpoint = `${baseUrl}/${audioPath}`;
    const responseFormat =
      settings.timestampGranularity !== 'none' || settings.advancedOptions?.enableDiarization === true
        ? 'verbose_json'
        : 'json';

    const formData = this.buildFormData(request, {
      modelId,
      language: settings.language,
      responseFormat,
      timestampGranularity: settings.timestampGranularity,
      provider,
      diarization: settings.advancedOptions?.enableDiarization === true,
      ...(settings.advancedOptions?.prompt
        ? { prompt: settings.advancedOptions.prompt }
        : {}),
      ...(typeof settings.advancedOptions?.temperature === 'number'
        ? { temperature: settings.advancedOptions.temperature }
        : {}),
    });

    const headers = new Headers();
    if (apiKey) {
      headers.set('Authorization', `Bearer ${apiKey}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await this.readErrorMessage(response));
    }

    const payload = (await response.json()) as VerboseAudioResponse;
    return {
      text: payload.text ?? '',
      providerId,
      modelId,
      language: payload.language ?? settings.language,
      rawResponse: payload,
      ...(payload.segments ? { segments: payload.segments } : {}),
      ...(payload.words ? { words: payload.words } : {}),
    };
  }

  private buildFormData(
    request: ProviderAudioRequest,
    options: {
      modelId: string;
      language: string;
      responseFormat: 'json' | 'verbose_json';
      prompt?: string;
      temperature?: number;
      timestampGranularity: 'none' | 'segment' | 'word';
      provider: ProviderConfig;
      diarization: boolean;
    },
  ): FormData {
    const formData = new FormData();

    formData.append(
      'file',
      new File([request.audio], request.fileName, { type: request.mimeType }),
    );
    formData.append('model', options.modelId);
    formData.append('language', options.language);
    formData.append('response_format', options.responseFormat);

    if (typeof options.temperature === 'number') {
      formData.append('temperature', String(options.temperature));
    }

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }

    if (options.timestampGranularity === 'segment') {
      formData.append('timestamp_granularities[]', 'segment');
    }

    if (options.timestampGranularity === 'word') {
      formData.append('timestamp_granularities[]', 'segment');
      formData.append('timestamp_granularities[]', 'word');
    }

    if (options.provider.type === 'nvidia' && options.diarization) {
      formData.append('diarize', 'true');
    }

    return formData;
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as { error?: { message?: string }; message?: string };
      return payload.error?.message ?? payload.message ?? `Transcription request failed with status ${response.status}.`;
    } catch {
      return `Transcription request failed with status ${response.status}.`;
    }
  }
}
