/**
 * Full Page Capture Usage Example
 * Demonstrates how to use the FullPageCapture class
 * Requirements: 2.1, 2.2, 2.5
 */

import { fullPageCapture, type CapturedContent, type CaptureOptions } from "./content-capture.js";

/**
 * Example 1: Basic full page capture with all features
 */
async function captureFullPageBasic(): Promise<void> {
  console.log("=== Example 1: Basic Full Page Capture ===");

  try {
    // Capture with default options (all features enabled)
    const content = await fullPageCapture.captureFullPage();

    console.log("Capture successful!");
    console.log("Content ID:", content.id);
    console.log("Page Title:", content.title);
    console.log("URL:", content.url);
    console.log("Word Count:", content.text.wordCount);
    console.log("Character Count:", content.text.characterCount);
    console.log("PII Detected:", content.sanitizationInfo.detectedPII);
    console.log("Has Screenshot:", !!content.screenshot);
    console.log("Reading Time:", content.readability?.readingTimeMinutes, "minutes");

    // Get capture statistics
    const stats = fullPageCapture.getCaptureStats(content);
    console.log("Capture Stats:", stats);

    // Validate capture
    const validation = fullPageCapture.validateCapture(content);
    console.log("Validation:", validation);
  } catch (error) {
    console.error("Capture failed:", error);
  }
}

/**
 * Example 2: Capture without screenshot (faster)
 */
async function captureWithoutScreenshot(): Promise<void> {
  console.log("\n=== Example 2: Capture Without Screenshot ===");

  try {
    const options: CaptureOptions = {
      includeScreenshot: false,
      sanitizeContent: true,
      includeReadability: true,
      includeStructuredData: true,
    };

    const content = await fullPageCapture.captureFullPage(options);

    console.log("Capture successful (no screenshot)!");
    console.log("Content ID:", content.id);
    console.log("Has Screenshot:", !!content.screenshot);
    console.log("Text Length:", content.sanitizedText.length);
  } catch (error) {
    console.error("Capture failed:", error);
  }
}

/**
 * Example 3: Minimal capture (text only, no sanitization)
 */
async function captureMinimal(): Promise<void> {
  console.log("\n=== Example 3: Minimal Capture ===");

  try {
    const options: CaptureOptions = {
      includeScreenshot: false,
      sanitizeContent: false,
      includeReadability: false,
      includeStructuredData: false,
    };

    const content = await fullPageCapture.captureFullPage(options);

    console.log("Minimal capture successful!");
    console.log("Content ID:", content.id);
    console.log("Original Text Length:", content.text.content.length);
    console.log("Sanitized Text Length:", content.sanitizedText.length);
  } catch (error) {
    console.error("Capture failed:", error);
  }
}

/**
 * Example 4: Capture with metadata analysis
 */
async function captureWithMetadataAnalysis(): Promise<void> {
  console.log("\n=== Example 4: Capture with Metadata Analysis ===");

  try {
    const content = await fullPageCapture.captureFullPage();

    console.log("Metadata:");
    console.log("  Title:", content.metadata.title);
    console.log("  Domain:", content.metadata.domain);
    console.log("  Author:", content.metadata.author || "N/A");
    console.log("  Published Date:", content.metadata.publishedDate || "N/A");
    console.log("  Language:", content.metadata.language);
    console.log("  Keywords:", content.metadata.keywords?.join(", ") || "N/A");
    console.log("  Canonical URL:", content.metadata.canonicalUrl || "N/A");

    console.log("\nText Structure:");
    console.log("  Headings:", content.text.headings.length);
    console.log("  Paragraphs:", content.text.paragraphs.length);
    console.log("  Links:", content.text.links.length);
    console.log("  Images:", content.text.images.length);

    if (content.structuredData && content.structuredData.length > 0) {
      console.log("\nStructured Data:");
      console.log("  Found", content.structuredData.length, "structured data items");
    }
  } catch (error) {
    console.error("Capture failed:", error);
  }
}

/**
 * Example 5: Capture and store in IndexedDB (simulated)
 */
async function captureAndStore(): Promise<void> {
  console.log("\n=== Example 5: Capture and Store ===");

  try {
    const content = await fullPageCapture.captureFullPage();

    // Validate before storing
    const validation = fullPageCapture.validateCapture(content);
    if (!validation.isValid) {
      console.error("Validation failed:", validation.errors);
      return;
    }

    console.log("Content validated successfully!");
    console.log("Ready to store in IndexedDB");

    // In a real implementation, you would store this in IndexedDB:
    // await storageManager.saveContent(content);

    console.log("Content would be stored with ID:", content.id);
  } catch (error) {
    console.error("Capture and store failed:", error);
  }
}

/**
 * Example 6: Performance measurement
 */
async function measureCapturePerformance(): Promise<void> {
  console.log("\n=== Example 6: Performance Measurement ===");

  const iterations = 3;
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = performance.now();

    try {
      await fullPageCapture.captureFullPage({
        includeScreenshot: false, // Faster without screenshot
        sanitizeContent: true,
        includeReadability: true,
        includeStructuredData: true,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;
      times.push(duration);

      console.log(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error(`Iteration ${i + 1} failed:`, error);
    }
  }

  if (times.length > 0) {
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log("\nPerformance Summary:");
    console.log("  Average:", avgTime.toFixed(2), "ms");
    console.log("  Min:", minTime.toFixed(2), "ms");
    console.log("  Max:", maxTime.toFixed(2), "ms");
  }
}

// Export examples for testing
export {
  captureFullPageBasic,
  captureWithoutScreenshot,
  captureMinimal,
  captureWithMetadataAnalysis,
  captureAndStore,
  measureCapturePerformance,
};

// Run examples if this file is executed directly
if (typeof window !== "undefined") {
  console.log("Full Page Capture Examples");
  console.log("==========================");
  console.log("Available functions:");
  console.log("- captureFullPageBasic()");
  console.log("- captureWithoutScreenshot()");
  console.log("- captureMinimal()");
  console.log("- captureWithMetadataAnalysis()");
  console.log("- captureAndStore()");
  console.log("- measureCapturePerformance()");
  console.log("\nCall any function from the console to see it in action!");
}
