/**
 * Navigation Tools
 * Tools for browser navigation and tab management
 */

import { z } from "zod";
import { ToolCategory, ToolComplexity } from "../tool-registry.js";
import type {
  BrowserToolDefinition,
  ToolExecutionContext,
} from "../tool-registry.js";

/**
 * Navigate to URL
 */
const navigateToUrlSchema = z.object({
  url: z.string().url().describe("URL to navigate to"),
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  waitForLoad: z
    .boolean()
    .default(true)
    .describe("Wait for page to finish loading"),
});

async function navigateToUrlHandler(
  input: z.infer<typeof navigateToUrlSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean; url: string; title?: string }> {
  const tabId = input.tabId || context.tabId;

  if (!tabId) {
    const tab = await chrome.tabs.create({ url: input.url, active: true });
    if (!tab.id) {
      throw new Error("Failed to create tab");
    }

    const result: { success: boolean; url: string; title?: string } = {
      success: true,
      url: input.url,
    };

    if (typeof tab.title === "string" && tab.title.length > 0) {
      result.title = tab.title;
    }

    return result;
  }

  await chrome.tabs.update(tabId, { url: input.url });

  if (input.waitForLoad) {
    await new Promise<void>((resolve, reject) => {
      const listener = (
        updatedTabId: number,
        changeInfo: any, // chrome.tabs.TabChangeInfo not available in @types/chrome
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          clearTimeout(timeoutId);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);

      // Timeout after 30 seconds
      const timeoutId = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error("Page load timed out after 30 seconds"));
      }, 30000);
    });
  }

  const tab = await chrome.tabs.get(tabId);

  const result: { success: boolean; url: string; title?: string } = {
    success: true,
    url: tab.url || input.url,
  };

  if (typeof tab.title === "string" && tab.title.length > 0) {
    result.title = tab.title;
  }

  return result;
}

export const navigateToUrlTool: BrowserToolDefinition = {
  name: "navigate_to_url",
  description:
    "Navigate to a specific URL in the browser. Can create a new tab or use an existing one.",
  category: ToolCategory.NAVIGATION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: false,
  parametersSchema: navigateToUrlSchema,
  handler: navigateToUrlHandler,
  examples: [
    "Navigate to https://example.com",
    "Open Google in a new tab",
    "Go to the documentation page",
  ],
};

/**
 * Reload page
 */
const reloadPageSchema = z.object({
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  bypassCache: z
    .boolean()
    .default(false)
    .describe("Bypass cache when reloading"),
});

async function reloadPageHandler(
  input: z.infer<typeof reloadPageSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean }> {
  const tabId = input.tabId || context.tabId;

  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  await chrome.tabs.reload(tabId, { bypassCache: input.bypassCache });

  return { success: true };
}

export const reloadPageTool: BrowserToolDefinition = {
  name: "reload_page",
  description: "Reload the current page, optionally bypassing the cache",
  category: ToolCategory.NAVIGATION,
  complexity: ToolComplexity.LOW,
  requiresHumanApproval: false,
  parametersSchema: reloadPageSchema,
  handler: reloadPageHandler,
  examples: ["Reload the current page", "Refresh page without cache"],
};

/**
 * Close tab
 */
const closeTabSchema = z.object({
  tabId: z.number().describe("Tab ID to close"),
});

async function closeTabHandler(
  input: z.infer<typeof closeTabSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean }> {
  await chrome.tabs.remove(input.tabId);
  return { success: true };
}

export const closeTabTool: BrowserToolDefinition = {
  name: "close_tab",
  description: "Close a specific browser tab. Use with caution.",
  category: ToolCategory.NAVIGATION,
  complexity: ToolComplexity.LOW,
  requiresHumanApproval: true, // Destructive action
  parametersSchema: closeTabSchema,
  handler: closeTabHandler,
  examples: ["Close the current tab", "Close tab with ID 123"],
};

/**
 * Take screenshot
 */
const takeScreenshotSchema = z.object({
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  format: z.enum(["png", "jpeg"]).default("png").describe("Screenshot format"),
  quality: z
    .number()
    .min(0)
    .max(100)
    .default(90)
    .describe("JPEG quality (0-100)"),
});

async function takeScreenshotHandler(
  input: z.infer<typeof takeScreenshotSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean; dataUrl: string; format: string }> {
  const dataUrl = await chrome.tabs.captureVisibleTab({
    format: input.format,
    quality: input.format === "jpeg" ? input.quality : undefined,
  });

  return {
    success: true,
    dataUrl,
    format: input.format,
  };
}

export const takeScreenshotTool: BrowserToolDefinition = {
  name: "take_screenshot",
  description: "Capture a screenshot of the visible area of the current tab",
  category: ToolCategory.CONTENT_EXTRACTION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: false,
  parametersSchema: takeScreenshotSchema,
  handler: takeScreenshotHandler,
  examples: [
    "Take a screenshot of the current page",
    "Capture visible area as PNG",
    "Screenshot with JPEG format",
  ],
};
