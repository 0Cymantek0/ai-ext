/**
 * Interaction Tools
 * Tools for interacting with web page elements (click, type, scroll)
 */

import { z } from "zod";
import { ToolCategory, ToolComplexity } from "../tool-registry.js";
import type {
  BrowserToolDefinition,
  ToolExecutionContext,
} from "../tool-registry.js";

/**
 * Click element
 */
const clickElementSchema = z.object({
  selector: z.string().describe("CSS selector for the element to click"),
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  waitAfterClick: z
    .number()
    .default(500)
    .describe("Milliseconds to wait after clicking"),
});

async function clickElementHandler(
  input: z.infer<typeof clickElementSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean; message: string }> {
  const tabId = input.tabId || context.tabId;

  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  // Validate tab exists and is accessible
  try {
    await chrome.tabs.get(tabId);
  } catch (error) {
    throw new Error(`Tab ${tabId} no longer exists or is not accessible`);
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    kind: "CLICK_ELEMENT",
    payload: {
      selector: input.selector,
      waitAfterClick: input.waitAfterClick,
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message || "Failed to click element");
  }

  return {
    success: true,
    message: `Clicked element: ${input.selector}`,
  };
}

export const clickElementTool: BrowserToolDefinition = {
  name: "click_element",
  description: "Click on a web page element identified by CSS selector",
  category: ToolCategory.INTERACTION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: true, // Clicks can trigger actions
  parametersSchema: clickElementSchema,
  handler: clickElementHandler,
  examples: [
    "Click the submit button",
    "Click element with class 'btn-primary'",
    "Click the first link on the page",
  ],
};

/**
 * Type text into element
 */
const typeTextSchema = z.object({
  selector: z.string().describe("CSS selector for the input element"),
  text: z.string().describe("Text to type into the element"),
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  clear: z
    .boolean()
    .default(true)
    .describe("Clear existing text before typing"),
});

async function typeTextHandler(
  input: z.infer<typeof typeTextSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean; message: string }> {
  const tabId = input.tabId || context.tabId;

  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  // Validate tab exists and is accessible
  try {
    await chrome.tabs.get(tabId);
  } catch (error) {
    throw new Error(`Tab ${tabId} no longer exists or is not accessible`);
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    kind: "TYPE_TEXT",
    payload: {
      selector: input.selector,
      text: input.text,
      clear: input.clear,
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message || "Failed to type text");
  }

  return {
    success: true,
    message: `Typed text into ${input.selector}`,
  };
}

export const typeTextTool: BrowserToolDefinition = {
  name: "type_text",
  description:
    "Type text into an input field or textarea identified by CSS selector",
  category: ToolCategory.INTERACTION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: true, // Text input can trigger actions
  parametersSchema: typeTextSchema,
  handler: typeTextHandler,
  examples: [
    "Type 'hello world' into the search box",
    "Fill in the username field",
    "Enter text into textarea",
  ],
};

/**
 * Scroll to element
 */
const scrollToElementSchema = z.object({
  selector: z.string().describe("CSS selector for the element to scroll to"),
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  behavior: z
    .enum(["auto", "smooth"])
    .default("smooth")
    .describe("Scroll behavior"),
});

async function scrollToElementHandler(
  input: z.infer<typeof scrollToElementSchema>,
  context: ToolExecutionContext,
): Promise<{ success: boolean; message: string }> {
  const tabId = input.tabId || context.tabId;

  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  // Validate tab exists and is accessible
  try {
    await chrome.tabs.get(tabId);
  } catch (error) {
    throw new Error(`Tab ${tabId} no longer exists or is not accessible`);
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    kind: "SCROLL_TO_ELEMENT",
    payload: {
      selector: input.selector,
      behavior: input.behavior,
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message || "Failed to scroll");
  }

  return {
    success: true,
    message: `Scrolled to ${input.selector}`,
  };
}

export const scrollToElementTool: BrowserToolDefinition = {
  name: "scroll_to_element",
  description: "Scroll the page to bring a specific element into view",
  category: ToolCategory.INTERACTION,
  complexity: ToolComplexity.LOW,
  requiresHumanApproval: false,
  parametersSchema: scrollToElementSchema,
  handler: scrollToElementHandler,
  examples: [
    "Scroll to the footer",
    "Bring the navigation bar into view",
    "Scroll to element with id 'content'",
  ],
};
