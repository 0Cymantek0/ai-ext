import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  HybridAIEngine,
  ProcessingLocation,
  TaskOperation,
  type Task,
} from "./hybrid-ai-engine";
import type { AIManager } from "./ai-manager";
import type { CloudAIManager } from "./cloud-ai-manager";

vi.mock("./ai-performance-monitor", () => ({
  AIModel: {
    GEMINI_NANO: "gemini-nano",
    GEMINI_FLASH: "gemini-flash",
    GEMINI_FLASH_LITE: "gemini-flash-lite",
    GEMINI_PRO: "gemini-pro",
  },
  aiPerformanceMonitor: {
    recordModelSelection: vi.fn(),
  },
}));

const buildTask = (text: string = "Hello world"): Task => ({
  content: { text },
  operation: TaskOperation.GENERAL,
});

function createEngine(
  cloudOverrides?: Partial<CloudAIManager>,
): {
  engine: HybridAIEngine;
  mockAIManager: AIManager;
  mockCloudAIManager: CloudAIManager;
} {
  const mockAIManager = {
    createSession: vi.fn(),
    processPrompt: vi.fn(),
    processPromptStreaming: vi.fn(),
    getSessionUsage: vi.fn().mockReturnValue({
      used: 0,
      quota: 0,
      percentage: 0,
    }),
  } as unknown as AIManager;

  const mockCloudAIManager = {
    isAvailable: vi.fn().mockReturnValue(true),
    ...cloudOverrides,
  } as CloudAIManager;

  const engine = new HybridAIEngine(mockAIManager, mockCloudAIManager);

  (engine as any).cachedCapabilities = {
    memory: 1024,
    cpuCores: 4,
    isOnline: true,
    connectionType: "wifi",
    geminiNanoAvailable: true,
  };
  (engine as any).capabilitiesCacheTime = Date.now();

  return { engine, mockAIManager, mockCloudAIManager };
}

describe("HybridAIEngine routing overrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a forced Pro decision without heuristic reevaluation", async () => {
    const { engine } = createEngine();
    const task = buildTask();

    const decision = await engine.determineProcessingLocation(task, {
      forcedLocation: ProcessingLocation.GEMINI_PRO,
      forcedLocationReason: "Router forced pro",
      forcedLocationConfidence: 0.87,
    });

    expect(decision.location).toBe(ProcessingLocation.GEMINI_PRO);
    expect(decision.requiresConsent).toBe(true);
    expect(decision.reason).toContain("Router forced pro");
    expect(decision.reason).toContain("0.87");
  });

  it("keeps forced Nano routing even when preferLocal is false", async () => {
    const { engine } = createEngine();
    const task = buildTask();

    const decision = await engine.determineProcessingLocation(task, {
      forcedLocation: ProcessingLocation.GEMINI_NANO,
      preferLocal: false,
    });

    expect(decision.location).toBe(ProcessingLocation.GEMINI_NANO);
    expect(decision.requiresConsent).toBe(false);
  });

  it("invokes consent callbacks for forced Pro processing", async () => {
    const { engine } = createEngine();
    const task = buildTask();
    const consentSpy = vi.fn().mockResolvedValue(true);
    const processInCloudSpy = vi
      .spyOn(engine as any, "processInCloud")
      .mockResolvedValue({
        result: "ok",
        source: "gemini-pro",
        confidence: 0.9,
        processingTime: 10,
        tokensUsed: 5,
      });

    const response = await engine.processContent(
      task,
      {
        forcedLocation: ProcessingLocation.GEMINI_PRO,
        forcedLocationReason: "Router forced pro",
      },
      consentSpy,
    );

    expect(consentSpy).toHaveBeenCalledTimes(1);
    expect(consentSpy.mock.calls[0][0].location).toBe(
      ProcessingLocation.GEMINI_PRO,
    );
    expect(response.source).toBe("gemini-pro");
    expect(processInCloudSpy).toHaveBeenCalledWith(
      task,
      ProcessingLocation.GEMINI_PRO,
      expect.objectContaining({ forcedLocation: ProcessingLocation.GEMINI_PRO }),
    );
  });

  it("fails gracefully when forced cloud routing is unavailable", async () => {
    const { engine, mockAIManager, mockCloudAIManager } = createEngine();
    (mockCloudAIManager.isAvailable as any).mockReturnValue(false);

    await expect(
      engine.processContent(buildTask(), {
        forcedLocation: ProcessingLocation.GEMINI_FLASH,
        forcedLocationReason: "Router forced flash",
      }),
    ).rejects.toThrow(/Cloud AI not available/i);
    expect(mockAIManager.createSession).not.toHaveBeenCalled();
  });
});
