/**
 * Vision Helper - Content Script
 * Extracts element mappings for vision-based interaction
 */

import type { ElementMapping, BoundingBox } from "../browser-agent/vision.js";

/**
 * Extract interactive elements with bounding boxes from the page
 */
export function extractElementMappings(): ElementMapping[] {
  const mappings: ElementMapping[] = [];
  let index = 0;

  // Select interactive elements
  const selectors = [
    "a[href]",
    "button",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "[role='button']",
    "[role='link']",
    "[role='tab']",
    "[role='menuitem']",
    "[onclick]",
  ];

  const elements = document.querySelectorAll(selectors.join(", "));

  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;

    // Skip hidden elements
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      continue;
    }

    // Get bounding box
    const rect = element.getBoundingClientRect();

    // Skip elements outside viewport or with no size
    if (
      rect.width === 0 ||
      rect.height === 0 ||
      rect.top > window.innerHeight ||
      rect.bottom < 0 ||
      rect.left > window.innerWidth ||
      rect.right < 0
    ) {
      continue;
    }

    // Generate selector
    const selector = generateSelector(element);

    // Extract text content
    let text = "";
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      text = element.placeholder || element.value || "";
    } else if (element instanceof HTMLSelectElement) {
      text = element.options[element.selectedIndex]?.text || "";
    } else {
      text = element.textContent?.trim().slice(0, 50) || "";
    }

    // Get attributes
    const attributes: Record<string, string> = {};
    for (const attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }

    const boundingBox: BoundingBox = {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      label: element.tagName.toLowerCase(),
      index,
    };

    mappings.push({
      index,
      selector,
      boundingBox,
      tagName: element.tagName,
      text,
      attributes,
    });

    index++;
  }

  return mappings;
}

/**
 * Generate a unique CSS selector for an element
 * Prioritizes stable attributes for reliability
 */
function generateSelector(element: Element): string {
  // If element has an ID, use it
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  // Prioritize stable test attributes
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }

  const dataTest = element.getAttribute("data-test");
  if (dataTest) {
    return `[data-test="${CSS.escape(dataTest)}"]`;
  }

  const name = element.getAttribute("name");
  if (name) {
    const tagName = element.tagName.toLowerCase();
    return `${tagName}[name="${CSS.escape(name)}"]`;
  }

  // Build path from root using nth-of-type for better stability
  const path: string[] = [];
  let current: Element | null = element;

  while (
    current &&
    current.parentElement &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    const tagName = current.tagName.toLowerCase();
    const siblings = Array.from(current.parentElement.children);
    const sameTagSiblings = siblings.filter(
      (sibling) => sibling.tagName.toLowerCase() === tagName,
    );

    let selector = tagName;

    // Use nth-of-type instead of nth-child for more stable selectors
    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current);
      selector += `:nth-of-type(${index + 1})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(" > ");
}

/**
 * Register message listener for element mapping extraction
 */
export function registerVisionHelper(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.kind === "EXTRACT_ELEMENT_MAPPINGS") {
      try {
        const mappings = extractElementMappings();
        const devicePixelRatio = window.devicePixelRatio || 1;
        sendResponse({ success: true, mappings, devicePixelRatio });
      } catch (error) {
        console.error("[VisionHelper] Failed to extract mappings", error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return true; // Keep channel open for async response
    }
  });
}
