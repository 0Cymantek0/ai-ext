/**
 * DOM Analyzer Usage Examples
 * Demonstrates how to use the DOM analyzer in different scenarios
 */

import { domAnalyzer } from "./dom-analyzer.js";

/**
 * Example 1: Extract full page content
 */
export async function captureFullPage() {
  console.log("=== Full Page Capture ===");

  // Extract metadata
  const metadata = domAnalyzer.extractMetadata();
  console.log("Page Title:", metadata.title);
  console.log("Author:", metadata.author);
  console.log("Description:", metadata.description);
  console.log("Domain:", metadata.domain);
  console.log("Language:", metadata.language);

  // Extract text content
  const text = domAnalyzer.extractText({
    skipHidden: true,
    skipScripts: true,
    skipStyles: true,
  });
  console.log("Word Count:", text.wordCount);
  console.log("Character Count:", text.characterCount);
  console.log("Paragraphs:", text.paragraphs.length);
  console.log("Headings:", text.headings.length);
  console.log("Links:", text.links.length);
  console.log("Images:", text.images.length);

  // Analyze readability
  const readability = domAnalyzer.analyzeReadability();
  console.log("Reading Time:", readability.readingTimeMinutes, "minutes");
  console.log("Avg Word Length:", readability.averageWordLength.toFixed(2));
  console.log(
    "Avg Sentence Length:",
    readability.averageSentenceLength.toFixed(2),
  );

  // Extract structured data
  const structuredData = domAnalyzer.extractStructuredData();
  console.log("Structured Data Items:", structuredData.length);

  return {
    metadata,
    text,
    readability,
    structuredData,
  };
}

/**
 * Example 2: Extract selected text
 */
export async function captureSelection() {
  console.log("=== Selection Capture ===");

  // Extract selection
  const selection = domAnalyzer.extractSelection();

  if (!selection) {
    console.log("No text selected");
    return null;
  }

  console.log("Selected Text:", selection.content.substring(0, 100) + "...");
  console.log("Word Count:", selection.wordCount);
  console.log("Character Count:", selection.characterCount);

  // Get context around selection
  const context = domAnalyzer.getSelectionContext(100, 100);
  console.log("Context:", context?.substring(0, 200) + "...");

  // Get page metadata for context
  const metadata = domAnalyzer.extractMetadata();

  return {
    selection,
    context,
    metadata,
  };
}

/**
 * Example 3: Extract specific element
 */
export async function captureElement(selector: string) {
  console.log("=== Element Capture ===");

  const element = document.querySelector(selector);

  if (!element) {
    console.log("Element not found:", selector);
    return null;
  }

  const elementInfo = domAnalyzer.extractElement(element);

  console.log("Tag Name:", elementInfo.tagName);
  console.log("Text Content:", elementInfo.textContent.substring(0, 100));
  console.log("Selector:", elementInfo.selector);
  console.log("Position:", {
    x: elementInfo.boundingRect.x,
    y: elementInfo.boundingRect.y,
    width: elementInfo.boundingRect.width,
    height: elementInfo.boundingRect.height,
  });
  console.log("Attributes:", Object.keys(elementInfo.attributes));

  return elementInfo;
}

/**
 * Example 4: Analyze page structure
 */
export async function analyzePage() {
  console.log("=== Page Analysis ===");

  // Extract text with structure
  const text = domAnalyzer.extractText();

  // Analyze headings hierarchy
  console.log("\nHeadings Hierarchy:");
  text.headings.forEach((heading) => {
    const indent = "  ".repeat(heading.level - 1);
    console.log(`${indent}H${heading.level}: ${heading.text}`);
  });

  // Analyze links
  console.log("\nTop 5 Links:");
  text.links.slice(0, 5).forEach((link) => {
    console.log(`- ${link.text} -> ${link.href}`);
  });

  // Analyze images
  console.log("\nImages:");
  text.images.forEach((image) => {
    console.log(`- ${image.alt || "(no alt)"}: ${image.src}`);
  });

  // Get metadata
  const metadata = domAnalyzer.extractMetadata();

  // Get readability
  const readability = domAnalyzer.analyzeReadability();

  return {
    headingsCount: text.headings.length,
    linksCount: text.links.length,
    imagesCount: text.images.length,
    metadata,
    readability,
  };
}

/**
 * Example 5: Extract for AI processing
 */
export async function prepareForAI(mode: "full" | "selection" | "element") {
  console.log("=== Prepare for AI Processing ===");

  let content;
  const metadata = domAnalyzer.extractMetadata();

  switch (mode) {
    case "full":
      const text = domAnalyzer.extractText();
      const readability = domAnalyzer.analyzeReadability();
      content = {
        type: "full-page",
        text: text.content,
        wordCount: text.wordCount,
        headings: text.headings,
        readability,
      };
      break;

    case "selection":
      const selection = domAnalyzer.extractSelection();
      if (!selection) {
        throw new Error("No selection found");
      }
      const context = domAnalyzer.getSelectionContext();
      content = {
        type: "selection",
        text: selection.content,
        wordCount: selection.wordCount,
        context,
      };
      break;

    case "element":
      // This would be called with a specific element
      content = {
        type: "element",
        text: "Element capture requires a specific element",
      };
      break;
  }

  // Prepare payload for AI processing
  const aiPayload = {
    metadata: {
      title: metadata.title,
      url: metadata.url,
      domain: metadata.domain,
      author: metadata.author,
      language: metadata.language,
    },
    content,
    timestamp: Date.now(),
  };

  console.log("AI Payload prepared:", {
    contentType: content.type,
    textLength: "text" in content ? content.text.length : 0,
    metadata: aiPayload.metadata,
  });

  return aiPayload;
}

// Export all examples
export const examples = {
  captureFullPage,
  captureSelection,
  captureElement,
  analyzePage,
  prepareForAI,
};
