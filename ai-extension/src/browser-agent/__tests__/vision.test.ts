/**
 * Unit tests for Vision Integration Layer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  VisionManager,
  DEFAULT_VISION_CONFIG,
  VISION_MODELS,
  type VisionConfig,
  type CaptureResult,
  type AnalysisResult,
  type DetectionResult,
  type ElementMapping,
} from "../vision.js";
import type { Logger } from "../../background/monitoring.js";

// Mock logger
const createMockLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  getLogs: vi.fn().mockReturnValue([]),
  clearLogs: vi.fn(),
  exportLogs: vi.fn().mockReturnValue(""),
  setMinLevel: vi.fn(),
} as any);

// Mock Chrome APIs
const mockChrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
  tabs: {
    get: vi.fn(),
    query: vi.fn(),
    captureVisibleTab: vi.fn(),
    sendMessage: vi.fn(),
  },
};

(global as any).chrome = mockChrome;

// Mock Google Generative AI
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn().mockReturnValue({
  generateContent: mockGenerateContent,
});

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

describe("VisionManager", () => {
  let logger: Logger;
  let manager: VisionManager;
  const testApiKey = "test-api-key";

  beforeEach(() => {
    logger = createMockLogger();
    vi.clearAllMocks();
    mockChrome.storage.local.get.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      manager = new VisionManager(logger);
      const config = await manager.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.defaultModel).toBe(VISION_MODELS.FLASH);
      expect(config.cacheEnabled).toBe(true);
    });

    it("should load config from chrome.storage", async () => {
      const storedConfig: Partial<VisionConfig> = {
        enabled: true,
        apiKey: testApiKey,
        defaultModel: VISION_MODELS.PRO,
      };

      mockChrome.storage.local.get.mockResolvedValueOnce({
        visionConfig: storedConfig,
      });

      manager = new VisionManager(logger);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Wait for async load

      const config = await manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.defaultModel).toBe(VISION_MODELS.PRO);
    });

    it("should initialize Google Generative AI with API key", async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(manager.isAvailable()).resolves.toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        "VisionManager",
        expect.stringContaining("initialized"),
        expect.anything(),
      );
    });

    it("should not be available without API key", async () => {
      manager = new VisionManager(logger);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(manager.isAvailable()).resolves.toBe(false);
    });
  });

  describe("configuration management", () => {
    beforeEach(async () => {
      manager = new VisionManager(logger);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("should update API key", async () => {
      await manager.setApiKey(testApiKey);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
        visionConfig: expect.objectContaining({
          apiKey: testApiKey,
        }),
      });
    });

    it("should enable/disable vision features", async () => {
      await manager.setEnabled(true);

      const config = await manager.getConfig();
      expect(config.enabled).toBe(true);
      expect(mockChrome.storage.local.set).toHaveBeenCalled();
    });

    it("should update partial config", async () => {
      await manager.updateConfig({
        defaultModel: VISION_MODELS.PRO,
        cacheEnabled: false,
      });

      const config = await manager.getConfig();
      expect(config.defaultModel).toBe(VISION_MODELS.PRO);
      expect(config.cacheEnabled).toBe(false);
    });
  });

  describe("screenshot capture", () => {
    const mockDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const mockTab = {
      id: 1,
      windowId: 1,
      url: "https://example.com",
    };

    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockChrome.tabs.get.mockResolvedValue(mockTab);
      mockChrome.tabs.query.mockResolvedValue([mockTab]);
      mockChrome.tabs.captureVisibleTab.mockResolvedValue(mockDataUrl);
      mockChrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        mappings: [],
        devicePixelRatio: 1,
      });
    });

    it("should capture screenshot", async () => {
      const result = await manager.captureForVision();

      expect(result.dataUrl).toBe(mockDataUrl);
      expect(result.format).toBe("png");
      expect(result.timestamp).toBeGreaterThan(0);
      expect(mockChrome.tabs.captureVisibleTab).toHaveBeenCalled();
    });

    it("should capture screenshot with specific tab ID", async () => {
      await manager.captureForVision({ tabId: 1 });

      expect(mockChrome.tabs.get).toHaveBeenCalledWith(1);
      expect(mockChrome.tabs.captureVisibleTab).toHaveBeenCalled();
    });

    it("should include element mappings when requested", async () => {
      const mockMappings: ElementMapping[] = [
        {
          index: 0,
          selector: "#test",
          boundingBox: { x: 10, y: 20, width: 100, height: 50 },
          tagName: "BUTTON",
          text: "Click me",
        },
      ];

      mockChrome.tabs.sendMessage.mockResolvedValue({
        success: true,
        mappings: mockMappings,
        devicePixelRatio: 2,
      });

      const result = await manager.captureForVision({ includeMappings: true });

      expect(result.elementMappings).toBeDefined();
      expect(result.elementMappings?.length).toBe(1);
      expect(result.devicePixelRatio).toBe(2);
    });

    it("should handle capture errors", async () => {
      mockChrome.tabs.captureVisibleTab.mockRejectedValue(new Error("Capture failed"));

      await expect(manager.captureForVision()).rejects.toThrow("Capture failed");
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("screenshot analysis", () => {
    const mockDataUrl = "data:image/png;base64,test";
    const mockAnalysisResponse = {
      response: {
        text: () => "This is a test analysis",
        usageMetadata: { totalTokenCount: 100 },
      },
    };

    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockGenerateContent.mockResolvedValue(mockAnalysisResponse);
    });

    it("should analyze screenshot with prompt", async () => {
      const result = await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "What do you see?",
      });

      expect(result.text).toBe("This is a test analysis");
      expect(result.model).toBe(VISION_MODELS.FLASH);
      expect(result.fromCache).toBe(false);
      expect(result.tokensUsed).toBe(100);
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it("should use specified model", async () => {
      await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        model: VISION_MODELS.PRO,
      });

      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: VISION_MODELS.PRO,
      });
    });

    it("should cache analysis results", async () => {
      // First call - cache miss
      const result1 = await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        useCache: true,
      });

      expect(result1.fromCache).toBe(false);

      // Second call - cache hit
      const result2 = await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        useCache: true,
      });

      expect(result2.fromCache).toBe(true);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Only called once
    });

    it("should skip cache when disabled", async () => {
      await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        useCache: false,
      });

      await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        useCache: false,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });

    it("should track usage stats", async () => {
      await manager.analyzeScreenshot(mockDataUrl, {
        prompt: "Test",
        model: VISION_MODELS.FLASH,
      });

      const stats = manager.getUsageStats();
      expect(stats.totalCalls).toBe(1);
      expect(stats.callsByModel[VISION_MODELS.FLASH]).toBe(1);
      expect(stats.estimatedCostUSD).toBeGreaterThan(0);
    });

    it("should throw error when vision is not available", async () => {
      const disabledManager = new VisionManager(logger);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await expect(
        disabledManager.analyzeScreenshot(mockDataUrl, {
          prompt: "Test",
        }),
      ).rejects.toThrow("Vision feature disabled");
    });
  });

  describe("page state detection", () => {
    const mockDataUrl = "data:image/png;base64,test";

    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("should detect CAPTCHA", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              type: "captcha",
              confidence: 0.95,
              details: "reCAPTCHA detected",
            }),
          usageMetadata: { totalTokenCount: 50 },
        },
      });

      const result = await manager.detectPageState(mockDataUrl);

      expect(result.detected).toBe(true);
      expect(result.type).toBe("captcha");
      expect(result.confidence).toBe(0.95);
      expect(result.requiresHumanIntervention).toBe(true);
    });

    it("should detect normal page", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              type: "normal",
              confidence: 0.99,
              details: "Normal page content",
            }),
          usageMetadata: { totalTokenCount: 50 },
        },
      });

      const result = await manager.detectPageState(mockDataUrl);

      expect(result.detected).toBe(false);
      expect(result.type).toBe("normal");
      expect(result.requiresHumanIntervention).toBe(false);
    });

    it("should handle invalid detection response", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => "Invalid JSON response",
          usageMetadata: { totalTokenCount: 50 },
        },
      });

      const result = await manager.detectPageState(mockDataUrl);

      expect(result.detected).toBe(false);
      expect(result.type).toBe("unknown");
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe("element lookup", () => {
    const mockScreenshot: CaptureResult = {
      dataUrl: "data:image/png;base64,test",
      format: "png",
      width: 800,
      height: 600,
      timestamp: Date.now(),
      elementMappings: [
        {
          index: 0,
          selector: "#login",
          boundingBox: { x: 10, y: 10, width: 100, height: 50 },
          tagName: "BUTTON",
          text: "Login",
        },
        {
          index: 1,
          selector: "#search",
          boundingBox: { x: 200, y: 10, width: 200, height: 40 },
          tagName: "INPUT",
          text: "",
          attributes: { placeholder: "Search..." },
        },
      ],
    };

    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("should find element by description", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              index: 0,
              confidence: 0.9,
              reasoning: "This is the login button",
            }),
          usageMetadata: { totalTokenCount: 100 },
        },
      });

      const result = await manager.findElementByDescription(mockScreenshot, "the login button");

      expect(result).not.toBeNull();
      expect(result?.index).toBe(0);
      expect(result?.selector).toBe("#login");
      expect(result?.confidence).toBe(0.9);
    });

    it("should return null when no element matches", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              index: -1,
              confidence: 0,
              reasoning: "No matching element found",
            }),
          usageMetadata: { totalTokenCount: 100 },
        },
      });

      const result = await manager.findElementByDescription(mockScreenshot, "non-existent");

      expect(result).toBeNull();
    });

    it("should throw error without element mappings", async () => {
      const screenshotWithoutMappings: CaptureResult = {
        ...mockScreenshot,
        elementMappings: undefined,
      };

      await expect(
        manager.findElementByDescription(screenshotWithoutMappings, "test"),
      ).rejects.toThrow("Element mappings required");
    });
  });

  describe("cache management", () => {
    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it("should clear cache", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => "Test",
          usageMetadata: { totalTokenCount: 10 },
        },
      });

      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
      });

      const statsBefore = manager.getUsageStats();
      expect(statsBefore.cacheMisses).toBe(1);

      manager.clearCache();

      // Next call should be a cache miss again
      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
      });

      const statsAfter = manager.getUsageStats();
      expect(statsAfter.cacheMisses).toBe(2);
    });

    it("should reset usage stats", async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => "Test",
          usageMetadata: { totalTokenCount: 10 },
        },
      });

      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
      });

      let stats = manager.getUsageStats();
      expect(stats.totalCalls).toBe(1);

      manager.resetUsageStats();

      stats = manager.getUsageStats();
      expect(stats.totalCalls).toBe(0);
      expect(stats.estimatedCostUSD).toBe(0);
    });
  });

  describe("usage statistics", () => {
    beforeEach(async () => {
      manager = new VisionManager(logger, { apiKey: testApiKey, enabled: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
      mockGenerateContent.mockResolvedValue({
        response: {
          text: () => "Test",
          usageMetadata: { totalTokenCount: 10 },
        },
      });
    });

    it("should track calls by model", async () => {
      await manager.analyzeScreenshot("data:image/png;base64,test1", {
        prompt: "Test",
        model: VISION_MODELS.FLASH,
      });

      await manager.analyzeScreenshot("data:image/png;base64,test2", {
        prompt: "Test",
        model: VISION_MODELS.PRO,
      });

      const stats = manager.getUsageStats();
      expect(stats.callsByModel[VISION_MODELS.FLASH]).toBe(1);
      expect(stats.callsByModel[VISION_MODELS.PRO]).toBe(1);
    });

    it("should track cache hits and misses", async () => {
      // First call - cache miss
      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
        useCache: true,
      });

      // Second call - cache hit
      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
        useCache: true,
      });

      const stats = manager.getUsageStats();
      expect(stats.cacheMisses).toBe(1);
      expect(stats.cacheHits).toBe(1);
    });

    it("should estimate costs", async () => {
      await manager.analyzeScreenshot("data:image/png;base64,test", {
        prompt: "Test",
        model: VISION_MODELS.FLASH,
      });

      const stats = manager.getUsageStats();
      expect(stats.estimatedCostUSD).toBeGreaterThan(0);
    });
  });
});
