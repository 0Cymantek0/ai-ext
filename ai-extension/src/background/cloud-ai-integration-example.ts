/**
 * Cloud AI Integration Example
 *
 * This file demonstrates how to use the Cloud AI Manager with Google Gemini models.
 */

import { cloudAIManager, GeminiModel } from "./cloud-ai-manager";
import { aiManager } from "./ai-manager";
import { createHybridAIEngine, TaskOperation } from "./hybrid-ai-engine";

/**
 * Example 1: Basic Cloud Processing
 */
async function basicCloudProcessing() {
  console.log("=== Example 1: Basic Cloud Processing ===");

  if (!cloudAIManager.isAvailable()) {
    console.error(
      "Cloud AI not available. Please set VITE_GEMINI_API_KEY in .env",
    );
    return;
  }

  try {
    const response = await cloudAIManager.processWithFlash(
      "Explain quantum computing in simple terms.",
    );

    console.log("Response:", response.result);
    console.log("Source:", response.source);
    console.log("Tokens used:", response.tokensUsed);
    console.log("Processing time:", response.processingTime, "ms");
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example 2: Streaming Responses
 */
async function streamingExample() {
  console.log("=== Example 2: Streaming Responses ===");

  if (!cloudAIManager.isAvailable()) {
    console.error("Cloud AI not available");
    return;
  }

  try {
    let fullResponse = "";

    for await (const chunk of cloudAIManager.processWithFlashStreaming(
      "Write a short story about a robot learning to paint.",
    )) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }

    console.log("Full response length:", fullResponse.length);
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example 3: Content Sanitization
 */
async function sanitizationExample() {
  console.log("=== Example 3: Content Sanitization ===");

  const sensitiveContent = "Contact: john@example.com, 555-1234";
  const sanitized = cloudAIManager.sanitizeContent(sensitiveContent);

  console.log("Original:", sensitiveContent);
  console.log("Sanitized:", sanitized);
}

/**
 * Run all examples
 */
export async function runCloudAIExamples() {
  await basicCloudProcessing();
  await streamingExample();
  await sanitizationExample();
}
