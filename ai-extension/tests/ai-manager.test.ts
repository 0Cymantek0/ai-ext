/**
 * AI Manager Tests
 * 
 * Tests for the Gemini Nano integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIManager } from '../src/background/ai-manager';

// Mock the global LanguageModel API
const mockSession = {
  prompt: vi.fn(),
  promptStreaming: vi.fn(),
  clone: vi.fn(),
  destroy: vi.fn(),
  inputUsage: 100,
  inputQuota: 1000,
};

const mockLanguageModel = {
  availability: vi.fn(),
  params: vi.fn(),
  create: vi.fn(),
};

// Setup global mock
(global as any).LanguageModel = mockLanguageModel;

describe('AIManager', () => {
  let aiManager: AIManager;

  beforeEach(() => {
    aiManager = new AIManager();
    vi.clearAllMocks();
  });

  describe('checkModelAvailability', () => {
    it('should return "readily" when model is available', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      
      const result = await aiManager.checkModelAvailability();
      
      expect(result).toBe('readily');
      expect(mockLanguageModel.availability).toHaveBeenCalled();
    });

    it('should return "after-download" when model needs download', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'after-download' });
      
      const result = await aiManager.checkModelAvailability();
      
      expect(result).toBe('after-download');
    });

    it('should return "no" when model is not available', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'no' });
      
      const result = await aiManager.checkModelAvailability();
      
      expect(result).toBe('no');
    });

    it('should handle errors gracefully', async () => {
      mockLanguageModel.availability.mockRejectedValue(new Error('API Error'));
      
      const result = await aiManager.checkModelAvailability();
      
      expect(result).toBe('no');
    });
  });

  describe('getModelParams', () => {
    it('should return model parameters', async () => {
      const mockParams = {
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      };
      mockLanguageModel.params.mockResolvedValue(mockParams);
      
      const result = await aiManager.getModelParams();
      
      expect(result).toEqual(mockParams);
      expect(mockLanguageModel.params).toHaveBeenCalled();
    });

    it('should cache model parameters', async () => {
      const mockParams = {
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      };
      mockLanguageModel.params.mockResolvedValue(mockParams);
      
      await aiManager.getModelParams();
      await aiManager.getModelParams();
      
      // Should only call once due to caching
      expect(mockLanguageModel.params).toHaveBeenCalledTimes(1);
    });
  });

  describe('initializeGeminiNano', () => {
    beforeEach(() => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
    });

    it('should create a session successfully', async () => {
      const sessionId = await aiManager.initializeGeminiNano();
      
      expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(mockLanguageModel.create).toHaveBeenCalled();
      expect(aiManager.hasSession(sessionId)).toBe(true);
    });

    it('should use custom configuration', async () => {
      const config = {
        temperature: 0.8,
        topK: 40,
        initialPrompts: [
          { role: 'system' as const, content: 'Test prompt' }
        ],
      };
      
      await aiManager.initializeGeminiNano(config);
      
      expect(mockLanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          topK: 40,
          initialPrompts: config.initialPrompts,
        })
      );
    });

    it('should throw error when model is not available', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'no' });
      
      await expect(aiManager.initializeGeminiNano()).rejects.toThrow(
        'Gemini Nano is not available on this device'
      );
    });

    it('should call download progress callback', async () => {
      const onProgress = vi.fn();
      
      await aiManager.initializeGeminiNano(undefined, onProgress);
      
      expect(mockLanguageModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          monitor: expect.any(Function),
        })
      );
    });
  });

  describe('processPrompt', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      sessionId = await aiManager.initializeGeminiNano();
    });

    it('should process a prompt successfully', async () => {
      const mockResponse = 'This is a test response';
      mockSession.prompt.mockResolvedValue(mockResponse);
      
      const result = await aiManager.processPrompt(sessionId, 'Test prompt');
      
      expect(result).toBe(mockResponse);
      expect(mockSession.prompt).toHaveBeenCalledWith('Test prompt', undefined);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        aiManager.processPrompt('invalid-session', 'Test prompt')
      ).rejects.toThrow('Session invalid-session not found');
    });

    it('should pass abort signal to session', async () => {
      const controller = new AbortController();
      mockSession.prompt.mockResolvedValue('Response');
      
      await aiManager.processPrompt(sessionId, 'Test', { signal: controller.signal });
      
      expect(mockSession.prompt).toHaveBeenCalledWith('Test', { signal: controller.signal });
    });
  });

  describe('processPromptStreaming', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      sessionId = await aiManager.initializeGeminiNano();
    });

    it('should return a readable stream', async () => {
      const mockStream = new ReadableStream();
      mockSession.promptStreaming.mockReturnValue(mockStream);
      
      const result = await aiManager.processPromptStreaming(sessionId, 'Test prompt');
      
      expect(result).toBe(mockStream);
      expect(mockSession.promptStreaming).toHaveBeenCalledWith('Test prompt', undefined);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        aiManager.processPromptStreaming('invalid-session', 'Test prompt')
      ).rejects.toThrow('Session invalid-session not found');
    });
  });

  describe('cloneSession', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      sessionId = await aiManager.initializeGeminiNano();
    });

    it('should clone a session successfully', async () => {
      const clonedMockSession = { ...mockSession };
      mockSession.clone.mockResolvedValue(clonedMockSession);
      
      const newSessionId = await aiManager.cloneSession(sessionId);
      
      expect(newSessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(newSessionId).not.toBe(sessionId);
      expect(mockSession.clone).toHaveBeenCalled();
      expect(aiManager.hasSession(newSessionId)).toBe(true);
    });

    it('should throw error for non-existent session', async () => {
      await expect(
        aiManager.cloneSession('invalid-session')
      ).rejects.toThrow('Session invalid-session not found');
    });
  });

  describe('destroySession', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      sessionId = await aiManager.initializeGeminiNano();
    });

    it('should destroy a session successfully', () => {
      aiManager.destroySession(sessionId);
      
      expect(mockSession.destroy).toHaveBeenCalled();
      expect(aiManager.hasSession(sessionId)).toBe(false);
    });

    it('should handle destroying non-existent session gracefully', () => {
      expect(() => {
        aiManager.destroySession('invalid-session');
      }).not.toThrow();
    });
  });

  describe('getSessionUsage', () => {
    let sessionId: string;

    beforeEach(async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      sessionId = await aiManager.initializeGeminiNano();
    });

    it('should return session usage information', () => {
      const usage = aiManager.getSessionUsage(sessionId);
      
      expect(usage).toEqual({
        used: 100,
        quota: 1000,
        percentage: 10,
      });
    });

    it('should throw error for non-existent session', () => {
      expect(() => {
        aiManager.getSessionUsage('invalid-session');
      }).toThrow('Session invalid-session not found');
    });
  });

  describe('session management', () => {
    it('should track active sessions', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      const sessionId1 = await aiManager.initializeGeminiNano();
      const sessionId2 = await aiManager.initializeGeminiNano();
      
      const activeSessions = aiManager.getActiveSessions();
      
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions).toContain(sessionId1);
      expect(activeSessions).toContain(sessionId2);
    });

    it('should destroy all sessions', async () => {
      mockLanguageModel.availability.mockResolvedValue({ available: 'readily' });
      mockLanguageModel.params.mockResolvedValue({
        defaultTopK: 3,
        maxTopK: 128,
        defaultTemperature: 1,
        maxTemperature: 2,
      });
      mockLanguageModel.create.mockResolvedValue(mockSession);
      
      await aiManager.initializeGeminiNano();
      await aiManager.initializeGeminiNano();
      
      aiManager.destroyAllSessions();
      
      expect(aiManager.getActiveSessions()).toHaveLength(0);
    });
  });
});
