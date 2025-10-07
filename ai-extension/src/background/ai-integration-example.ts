/**
 * AI Manager Integration Example
 * 
 * This file demonstrates how to use the AI Manager in the service worker
 * to process AI requests from content scripts and the side panel.
 */

import { aiManager } from './ai-manager';

/**
 * Example 1: Initialize AI on extension startup
 */
export async function initializeAI(): Promise<void> {
  try {
    console.log('Checking Gemini Nano availability...');
    const availability = await aiManager.checkModelAvailability();
    
    console.log(`Gemini Nano availability: ${availability}`);
    
    if (availability === 'no') {
      console.warn('Gemini Nano is not available on this device');
      return;
    }
    
    if (availability === 'after-download') {
      console.log('Gemini Nano requires download');
    }
    
    // Get model parameters
    const params = await aiManager.getModelParams();
    console.log('Model parameters:', params);
    
    // Create a default session with system prompt
    const sessionId = await aiManager.initializeGeminiNano(
      {
        temperature: params.defaultTemperature,
        topK: params.defaultTopK,
        initialPrompts: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant for the AI Pocket extension. You help users summarize, analyze, and interact with web content.'
          }
        ]
      },
      (progress) => {
        console.log(`Model download progress: ${progress.percentage.toFixed(2)}%`);
      }
    );
    
    console.log(`Default session created: ${sessionId}`);
    
    // Store session ID for later use
    await chrome.storage.local.set({ 
      defaultAISessionId: sessionId,
      aiAvailability: availability 
    });
    
  } catch (error) {
    console.error('Failed to initialize AI:', error);
  }
}

/**
 * Example 2: Process a simple prompt
 */
export async function processSimplePrompt(prompt: string): Promise<string> {
  try {
    // Get the default session
    const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
    
    if (!defaultAISessionId) {
      throw new Error('No AI session available');
    }
    
    // Process the prompt
    const response = await aiManager.processPrompt(defaultAISessionId, prompt);
    
    // Check token usage
    const usage = aiManager.getSessionUsage(defaultAISessionId);
    console.log(`Token usage: ${usage.used}/${usage.quota} (${usage.percentage.toFixed(2)}%)`);
    
    // If usage is high, consider cloning the session
    if (usage.percentage > 80) {
      console.warn('Session usage is high, consider creating a new session');
    }
    
    return response;
  } catch (error) {
    console.error('Failed to process prompt:', error);
    throw error;
  }
}

/**
 * Example 3: Process a streaming prompt
 */
export async function processStreamingPrompt(
  prompt: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  try {
    const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
    
    if (!defaultAISessionId) {
      throw new Error('No AI session available');
    }
    
    const stream = await aiManager.processPromptStreaming(defaultAISessionId, prompt);
    
    // Process the stream
    for await (const chunk of stream) {
      onChunk(chunk);
    }
    
  } catch (error) {
    console.error('Failed to process streaming prompt:', error);
    throw error;
  }
}

/**
 * Example 4: Summarize content
 */
export async function summarizeContent(content: string): Promise<string> {
  try {
    const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
    
    if (!defaultAISessionId) {
      throw new Error('No AI session available');
    }
    
    const prompt = `Please provide a concise summary of the following content:\n\n${content}`;
    const summary = await aiManager.processPrompt(defaultAISessionId, prompt);
    
    return summary;
  } catch (error) {
    console.error('Failed to summarize content:', error);
    throw error;
  }
}

/**
 * Example 5: Generate alt text for accessibility
 */
export async function generateAltText(imageDescription: string): Promise<string> {
  try {
    const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
    
    if (!defaultAISessionId) {
      throw new Error('No AI session available');
    }
    
    const prompt = `Generate a concise and descriptive alt text for an image with the following description: ${imageDescription}`;
    const altText = await aiManager.processPrompt(defaultAISessionId, prompt);
    
    return altText;
  } catch (error) {
    console.error('Failed to generate alt text:', error);
    throw error;
  }
}

/**
 * Example 6: Create a specialized session for a specific task
 */
export async function createSummarizationSession(): Promise<string> {
  try {
    const params = await aiManager.getModelParams();
    
    // Create a session optimized for summarization
    const sessionId = await aiManager.createSession({
      temperature: params.defaultTemperature * 0.8, // Lower temperature for more focused output
      topK: params.defaultTopK,
      initialPrompts: [
        {
          role: 'system',
          content: 'You are an expert at creating concise, accurate summaries. Focus on key points and main ideas.'
        }
      ]
    });
    
    console.log(`Summarization session created: ${sessionId}`);
    return sessionId;
  } catch (error) {
    console.error('Failed to create summarization session:', error);
    throw error;
  }
}

/**
 * Example 7: Handle message from content script
 */
export function setupMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AI_PROCESS_REQUEST') {
      (async () => {
        try {
          const { prompt, streaming } = message.payload;
          
          if (streaming) {
            // For streaming, we need a different approach
            // This is a simplified example
            const response = await processSimplePrompt(prompt);
            sendResponse({ success: true, response });
          } else {
            const response = await processSimplePrompt(prompt);
            sendResponse({ success: true, response });
          }
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      })();
      return true; // Keep channel open for async response
    }
    
    if (message.type === 'AI_SUMMARIZE') {
      (async () => {
        try {
          const { content } = message.payload;
          const summary = await summarizeContent(content);
          sendResponse({ success: true, summary });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      })();
      return true;
    }
    
    if (message.type === 'AI_CHECK_AVAILABILITY') {
      (async () => {
        try {
          const availability = await aiManager.checkModelAvailability();
          sendResponse({ success: true, availability });
        } catch (error) {
          sendResponse({ 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      })();
      return true;
    }
  });
}

/**
 * Example 8: Cleanup on extension unload
 */
export function cleanupAI(): void {
  console.log('Cleaning up AI sessions...');
  aiManager.destroyAllSessions();
  console.log('All AI sessions destroyed');
}

/**
 * Example 9: Session management with abort controller
 */
export async function processWithTimeout(
  prompt: string,
  timeoutMs: number = 10000
): Promise<string> {
  const controller = new AbortController();
  
  // Set timeout
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
    
    if (!defaultAISessionId) {
      throw new Error('No AI session available');
    }
    
    const response = await aiManager.processPrompt(
      defaultAISessionId,
      prompt,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

/**
 * Example 10: Monitor and manage session usage
 */
export async function monitorSessionUsage(): Promise<void> {
  const { defaultAISessionId } = await chrome.storage.local.get('defaultAISessionId');
  
  if (!defaultAISessionId || !aiManager.hasSession(defaultAISessionId)) {
    console.log('No active session to monitor');
    return;
  }
  
  const usage = aiManager.getSessionUsage(defaultAISessionId);
  console.log(`Session usage: ${usage.used}/${usage.quota} tokens (${usage.percentage.toFixed(2)}%)`);
  
  // If usage is high, create a new session
  if (usage.percentage > 90) {
    console.log('Session usage is very high, creating new session...');
    
    // Clone the session to preserve initial prompts
    const newSessionId = await aiManager.cloneSession(defaultAISessionId);
    
    // Update stored session ID
    await chrome.storage.local.set({ defaultAISessionId: newSessionId });
    
    // Destroy old session
    aiManager.destroySession(defaultAISessionId);
    
    console.log(`New session created: ${newSessionId}`);
  }
}
