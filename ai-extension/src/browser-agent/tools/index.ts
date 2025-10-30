/**
 * Browser Agent Tools Index
 * Exports all available browser automation tools
 */

export * from "./dom-extraction.js";
export * from "./navigation.js";
export * from "./interaction.js";

import {
  extractPageTitleTool,
  extractPageContentTool,
  extractLinksTool,
} from "./dom-extraction.js";

import {
  navigateToUrlTool,
  reloadPageTool,
  closeTabTool,
  takeScreenshotTool,
} from "./navigation.js";

import {
  clickElementTool,
  typeTextTool,
  scrollToElementTool,
} from "./interaction.js";

import type { BrowserToolDefinition } from "../tool-registry.js";

/**
 * All available browser agent tools
 */
export const ALL_BROWSER_TOOLS: BrowserToolDefinition[] = [
  // DOM Extraction
  extractPageTitleTool,
  extractPageContentTool,
  extractLinksTool,

  // Navigation
  navigateToUrlTool,
  reloadPageTool,
  closeTabTool,
  takeScreenshotTool,

  // Interaction
  clickElementTool,
  typeTextTool,
  scrollToElementTool,
];
