/**
 * Vision Tools
 * Tools for vision-based interaction and analysis
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
import { getVisionManager, type CaptureResult } from "../vision.js";

/**
 * Capture screenshot for vision analysis
 */
const captureForVisionSchema = z.object({
  tabId: z.number().optional().describe("Tab ID, defaults to active tab"),
  format: z.enum(["png", "jpeg"]).default("png").describe("Screenshot format"),
  quality: z.number().min(0).max(100).default(90).describe("JPEG quality (0-100)"),
  annotateElements: z.boolean().default(false).describe("Add numbered bounding boxes for elements"),
});

async function captureForVisionHandler(
  input: z.infer<typeof captureForVisionSchema>,
  context: ToolExecutionContext,
): Promise<{
  dataUrl: string;
  format: string;
  width: number;
  height: number;
  elementMappings?: Array<{
    index: number;
    selector: string;
    boundingBox: any;
    tagName: string;
    text?: string;
  }> | undefined;
}> {
  const visionManager = getVisionManager();
  
  if (!visionManager || !visionManager.isAvailable()) {
    throw new Error("Vision features are not available. Please enable and configure API key.");
  }

  const captureOptions: Parameters<typeof visionManager.captureForVision>[0] = {
    format: input.format,
    quality: input.quality,
    annotateElements: input.annotateElements,
    includeMappings: true,
  };

  const resolvedTabId = input.tabId ?? context.tabId;
  if (resolvedTabId !== undefined) {
    captureOptions.tabId = resolvedTabId;
  }

  const result = await visionManager.captureForVision(captureOptions);

  return {
    dataUrl: result.dataUrl,
    format: result.format,
    width: result.width,
    height: result.height,
    elementMappings: result.elementMappings,
  };
}

export const captureForVisionTool: BrowserToolDefinition = {
  name: "capture_for_vision",
  description: "Capture a screenshot optimized for vision analysis with optional element annotations",
  category: ToolCategory.VISION,
  complexity: ToolComplexity.MEDIUM,
  requiresHumanApproval: false,
  parametersSchema: captureForVisionSchema,
  handler: captureForVisionHandler,
  examples: [
    "Capture screenshot for vision analysis",
    "Take screenshot with numbered elements",
    "Capture page with element overlays",
  ],
};

/**
 * Analyze screenshot using Gemini Vision
 */
const analyzeScreenshotSchema = z.object({
  screenshot: z.string().describe("Base64 data URL of screenshot"),
  prompt: z.string().describe("Analysis prompt for the vision model"),
  model: z
    .enum(["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"])
    .default("gemini-2.5-flash")
    .describe("Vision model to use"),
  useCache: z.boolean().default(true).describe("Use cached results if available"),
});

async function analyzeScreenshotHandler(
  input: z.infer<typeof analyzeScreenshotSchema>,
  context: ToolExecutionContext,
): Promise<{
  text: string;
  model: string;
  tokensUsed?: number;
  processingTimeMs: number;
  fromCache: boolean;
  cost?: number;
}> {
  const visionManager = getVisionManager();
  
  if (!visionManager || !visionManager.isAvailable()) {
    throw new Error("Vision features are not available. Please enable and configure API key.");
  }

  const result = await visionManager.analyzeScreenshot(input.screenshot, {
    prompt: input.prompt,
    model: input.model,
    useCache: input.useCache,
  });

  return result;
}

export const analyzeScreenshotTool: BrowserToolDefinition = {
  name: "analyze_screenshot",
  description: "Analyze a screenshot using Gemini Vision models to extract information or answer questions",
  category: ToolCategory.VISION,
  complexity: ToolComplexity.HIGH,
  requiresHumanApproval: false,
  parametersSchema: analyzeScreenshotSchema,
  handler: analyzeScreenshotHandler,
  examples: [
    "What elements are visible in this screenshot?",
    "Describe the layout of this page",
    "Is there a login button in this image?",
  ],
};

/**
 * Detect page state (CAPTCHA, auth, errors)
 */
const detectPageStateSchema = z.object({
  screenshot: z.string().describe("Base64 data URL of screenshot"),
});

async function detectPageStateHandler(
  input: z.infer<typeof detectPageStateSchema>,
  context: ToolExecutionContext,
): Promise<{
  detected: boolean;
  type: string;
  confidence: number;
  details?: string;
  requiresHumanIntervention: boolean;
}> {
  const visionManager = getVisionManager();
  
  if (!visionManager || !visionManager.isAvailable()) {
    throw new Error("Vision features are not available. Please enable and configure API key.");
  }

  const result = await visionManager.detectPageState(input.screenshot);

  return result;
}

export const detectPageStateTool: BrowserToolDefinition = {
  name: "detect_page_state",
  description: "Detect if page requires human intervention (CAPTCHA, authentication, errors, rate limiting)",
  category: ToolCategory.VISION,
  complexity: ToolComplexity.HIGH,
  requiresHumanApproval: false,
  parametersSchema: detectPageStateSchema,
  handler: detectPageStateHandler,
  examples: [
    "Check if page shows CAPTCHA",
    "Detect if authentication is required",
    "Check for error pages",
  ],
};

/**
 * Find element by description using vision
 */
const findElementByVisionSchema = z.object({
  screenshot: z.object({
    dataUrl: z.string(),
    format: z.string(),
    width: z.number(),
    height: z.number(),
    timestamp: z.number().optional(),
    tabId: z.number().optional(),
    tabUrl: z.string().optional(),
    devicePixelRatio: z.number().optional(),
    elementMappings: z.array(z.any()).optional(),
  }).describe("Screenshot with element mappings"),
  description: z.string().describe("Description of the element to find"),
});

async function findElementByVisionHandler(
  input: z.infer<typeof findElementByVisionSchema>,
  context: ToolExecutionContext,
): Promise<{
  index: number;
  selector: string;
  confidence: number;
} | null> {
  const visionManager = getVisionManager();
  
  if (!visionManager || !visionManager.isAvailable()) {
    throw new Error("Vision features are not available. Please enable and configure API key.");
  }

  const captureResult: CaptureResult = {
    dataUrl: input.screenshot.dataUrl,
    format: input.screenshot.format as "png" | "jpeg",
    width: input.screenshot.width,
    height: input.screenshot.height,
    timestamp: input.screenshot.timestamp ?? Date.now(),
    tabId: input.screenshot.tabId,
    tabUrl: input.screenshot.tabUrl,
    devicePixelRatio: input.screenshot.devicePixelRatio,
    elementMappings: input.screenshot.elementMappings,
  };

  const result = await visionManager.findElementByDescription(
    captureResult,
    input.description,
  );

  return result;
}

export const findElementByVisionTool: BrowserToolDefinition = {
  name: "find_element_by_vision",
  description: "Find an element on the page by describing it in natural language (fallback for selector failures)",
  category: ToolCategory.VISION,
  complexity: ToolComplexity.HIGH,
  requiresHumanApproval: false,
  parametersSchema: findElementByVisionSchema,
  handler: findElementByVisionHandler,
  examples: [
    "Find the login button",
    "Locate the search input field",
    "Find the submit button",
  ],
};
