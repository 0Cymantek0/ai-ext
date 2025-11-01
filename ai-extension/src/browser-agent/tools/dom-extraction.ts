/**
 * DOM Extraction Tools
 * Tools for extracting content from web pages
 */

import { z } from "zod";
import {
  ToolCategory,
  ToolComplexity,
} from "../tool-registry.js";
import type {
  BrowserToolDefinition,
  ToolExecutionContext,
} from "../tool-registry.js";

/**
 * Extract page title
 */
const extractPageTitleSchema = z.object({
  tabId: z.number().optional().describe("Tab ID to extract from, defaults to active tab"),
});

async function extractPageTitleHandler(
  input: z.infer<typeof extractPageTitleSchema>,
  context: ToolExecutionContext,
): Promise<{ title: string; url: string }> {
  const tabId = input.tabId || context.tabId;
  
  if (tabId) {
    const tab = await chrome.tabs.get(tabId);
    return {
      title: tab.title || "",
      url: tab.url || "",
    };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab found");
  }

  return {
    title: tab.title || "",
    url: tab.url || "",
  };
}

export const extractPageTitleTool: BrowserToolDefinition = {
  name: "extract_page_title",
  description: "Extract the title and URL from the current web page or a specific tab",
  category: ToolCategory.DOM_EXTRACTION,
  complexity: ToolComplexity.LOW,
  requiresHumanApproval: false,
  parametersSchema: extractPageTitleSchema,
  handler: extractPageTitleHandler,
  examples: [
    "Get the title of the current page",
    "Extract page title and URL",
  ],
};

/**
 * Extract page content
 */
const extractPageContentSchema = z.object({
  tabId: z.number().optional().describe("Tab ID to extract from"),
  selector: z.string().optional().describe("CSS selector to extract specific element"),
  sanitize: z.boolean().default(true).describe("Whether to sanitize HTML content"),
});

async function extractPageContentHandler(
  input: z.infer<typeof extractPageContentSchema>,
  context: ToolExecutionContext,
): Promise<{ content: string; html?: string }> {
  const tabId = input.tabId || context.tabId;
  
  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    kind: "CAPTURE_REQUEST",
    payload: {
      mode: "full-page",
      selector: input.selector,
      sanitize: input.sanitize,
      pocketId: "temp",
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message || "Failed to extract content");
  }

  return response.data;
}

export const extractPageContentTool: BrowserToolDefinition = {
  name: "extract_page_content",
  description: "Extract text content from the current page or a specific element using CSS selector",
  category: ToolCategory.CONTENT_EXTRACTION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: false,
  parametersSchema: extractPageContentSchema,
  handler: extractPageContentHandler,
  examples: [
    "Extract all text from the page",
    "Extract content from element with class 'article'",
    "Get text content from main element",
  ],
};

/**
 * Extract links from page
 */
const extractLinksSchema = z.object({
  tabId: z.number().optional().describe("Tab ID to extract from"),
  selector: z.string().optional().describe("CSS selector to limit extraction scope"),
});

async function extractLinksHandler(
  input: z.infer<typeof extractLinksSchema>,
  context: ToolExecutionContext,
): Promise<{ links: Array<{ href: string; text: string; title?: string }> }> {
  const tabId = input.tabId || context.tabId;
  
  if (!tabId) {
    throw new Error("No tab ID provided");
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    kind: "EXTRACT_LINKS",
    payload: {
      selector: input.selector,
    },
  });

  if (!response.success) {
    throw new Error(response.error?.message || "Failed to extract links");
  }

  return response.data;
}

export const extractLinksTool: BrowserToolDefinition = {
  name: "extract_links",
  description: "Extract all hyperlinks from a web page with their text and URLs",
  category: ToolCategory.DOM_EXTRACTION,
  complexity: ToolComplexity.LOW,
  requiresHumanApproval: false,
  parametersSchema: extractLinksSchema,
  handler: extractLinksHandler,
  examples: [
    "Get all links from the page",
    "Extract navigation links",
  ],
};
