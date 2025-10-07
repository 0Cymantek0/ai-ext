/**
 * Side Panel Entry Point
 * Initializes the chat interface
 * Requirements: 8.1, 8.2, 8.3
 */

import { ChatInterface } from './chat-interface';

console.info("AI Pocket side panel initialized");

// Initialize chat interface
let chatInterface: ChatInterface | null = null;

try {
  chatInterface = new ChatInterface('app');
  console.info("Chat interface initialized successfully");
} catch (error) {
  console.error("Failed to initialize chat interface:", error);
  
  // Show error message
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #dc3545;">
        <h2>⚠️ Initialization Error</h2>
        <p>Failed to initialize the chat interface.</p>
        <p style="font-size: 12px; color: #666;">${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}

// Notify service worker that side panel is ready
chrome.runtime.sendMessage({ kind: "SIDE_PANEL_READY" }).catch((error) => {
  console.warn("Failed to notify service worker:", error);
});

// Export for debugging
(window as any).chatInterface = chatInterface;
