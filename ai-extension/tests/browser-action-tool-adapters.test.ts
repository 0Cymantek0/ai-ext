import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const mockPerformanceMonitor = {
  recordMetric: vi.fn(),
  measureAsync: vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn()),
};

const mockDatabase = {
  open: vi.fn(),
} as any;

describe("browser action tool adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    global.chrome = {
      tabs: {
        get: vi.fn(async (tabId: number) => ({
          id: tabId,
          title: "Example",
          url: "https://example.com",
        })),
        query: vi.fn(async () => []),
        sendMessage: vi.fn(),
      },
      runtime: {
        getPlatformInfo: vi.fn(),
        sendMessage: vi.fn(),
      },
    } as any;
  });

  it("wraps extraction tools with tool.called and tool.completed around CAPTURE_REQUEST", async () => {
    const [{ BrowserToolRegistry }, { extractPageContentTool }] =
      await Promise.all([
        import("../src/browser-agent/tool-registry.js"),
        import("../src/browser-agent/tools/index.js"),
      ]);
    const registry = new BrowserToolRegistry(
      mockLogger as any,
      mockPerformanceMonitor as any,
    );
    registry.register(extractPageContentTool);
    registry.initializeWorkflow("wf-extract");

    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      success: true,
      data: { content: "Page text", html: "<main>Page text</main>" },
    });

    const result = await registry.execute(
      "extract_page_content",
      { selector: "main", sanitize: true, tabId: 7 },
      {
        workflowId: "wf-extract",
        stepNumber: 1,
        timestamp: Date.now(),
        tabId: 7,
      },
    );

    expect(result.success).toBe(true);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        kind: "CAPTURE_REQUEST",
        payload: expect.objectContaining({
          selector: "main",
          sanitize: true,
        }),
      }),
    );

    expect(registry.getWorkflowToolEvents("wf-extract")).toMatchObject([
      {
        type: "tool.called",
        toolName: "extract_page_content",
        requiresHumanApproval: false,
      },
      {
        type: "tool.completed",
        toolName: "extract_page_content",
        requiresHumanApproval: false,
        payload: {
          result: { content: "Page text", html: "<main>Page text</main>" },
        },
      },
    ]);
  });

  it("wraps interaction tools with canonical events and preserves approval metadata on the content-script path", async () => {
    const [
      { BrowserToolRegistry },
      { WorkflowManager },
      { clickElementTool },
    ] = await Promise.all([
      import("../src/browser-agent/tool-registry.js"),
      import("../src/browser-agent/workflow-manager.js"),
      import("../src/browser-agent/tools/index.js"),
    ]);
    const registry = new BrowserToolRegistry(
      mockLogger as any,
      mockPerformanceMonitor as any,
    );
    registry.register(clickElementTool);
    registry.initializeWorkflow("wf-click");

    const manager = new WorkflowManager(
      registry,
      mockDatabase,
      mockLogger as any,
    );

    vi.mocked(chrome.tabs.sendMessage).mockResolvedValue({
      success: true,
      data: {
        success: true,
        command: "CLICK_ELEMENT",
        message: "Clicked element: button.primary",
      },
    });

    const result = await registry.execute(
      "click_element",
      { selector: "button.primary", waitAfterClick: 0, tabId: 11 },
      {
        workflowId: "wf-click",
        stepNumber: 2,
        timestamp: Date.now(),
        tabId: 11,
      },
    );

    expect(result.success).toBe(true);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      11,
      expect.objectContaining({
        kind: "CLICK_ELEMENT",
        payload: expect.objectContaining({
          selector: "button.primary",
        }),
      }),
    );
    expect(manager.getBrowserActionMessageKinds("click_element")).toEqual([
      "CLICK_ELEMENT",
    ]);
    expect(manager.getBrowserActionMessageKinds("extract_page_content")).toEqual(
      ["CAPTURE_REQUEST"],
    );
    expect(manager.getWorkflowToolEvents("wf-click")).toMatchObject([
      {
        type: "tool.called",
        toolName: "click_element",
        requiresHumanApproval: true,
      },
      {
        type: "tool.completed",
        toolName: "click_element",
        requiresHumanApproval: true,
      },
    ]);
  });
});
