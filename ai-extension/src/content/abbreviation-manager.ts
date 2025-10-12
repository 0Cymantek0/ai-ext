/**
 * Abbreviation Manager - Tab Completion
 * 
 * Handles tab completion for abbreviations in text fields.
 * When user types "/shortcut" and presses Tab, it expands to the full text.
 * 
 * Requirements: 10.2, 10.5
 */

import { sendMessage } from "../shared/message-client.js";
import type { AbbreviationExpandResult } from "../shared/types/index.d.ts";

const ABBREVIATION_PATTERN = /\/(\w+)$/;

// Track which text fields have been set up to avoid duplicate listeners
const setupFields = new WeakSet<HTMLInputElement | HTMLTextAreaElement>();

/**
 * Expand an abbreviation by replacing the shortcut with the expansion text
 * 
 * @param textField - The input or textarea element
 * @param shortcut - The abbreviation shortcut (without the leading slash)
 * @returns true if expansion was successful, false otherwise
 */
async function expandAbbreviation(
  textField: HTMLInputElement | HTMLTextAreaElement,
  shortcut: string,
): Promise<boolean> {
  try {
    // Request expansion from service worker
    const response = await sendMessage<AbbreviationExpandResult>(
      "ABBREVIATION_EXPAND",
      { shortcut },
      { timeout: 5000 }
    );

    if (!response.success || !response.data) {
      console.debug("[AbbreviationManager] No expansion found for:", shortcut);
      return false;
    }

    const { expansion } = response.data;
    const { value, selectionStart, selectionEnd } = textField;

    if (selectionStart == null || selectionEnd == null) {
      return false;
    }

    // Find the start of the abbreviation pattern (including the slash)
    const beforeCursor = value.slice(0, selectionStart);
    const match = beforeCursor.match(ABBREVIATION_PATTERN);
    
    if (!match) {
      return false;
    }

    // Calculate positions
    const abbreviationStart = selectionStart - match[0].length;
    const abbreviationEnd = selectionStart;

    // Build the new value with the expansion
    const newValue =
      value.slice(0, abbreviationStart) +
      expansion +
      value.slice(abbreviationEnd);

    // Update the text field
    textField.value = newValue;

    // Set cursor position after the expansion
    const newCursorPosition = abbreviationStart + expansion.length;
    textField.setSelectionRange(newCursorPosition, newCursorPosition);

    // Trigger input event so frameworks detect the change
    textField.dispatchEvent(new Event("input", { bubbles: true }));

    console.debug("[AbbreviationManager] Expanded:", {
      shortcut,
      expansion,
      from: abbreviationStart,
      to: newCursorPosition,
    });

    return true;
  } catch (error) {
    console.error("[AbbreviationManager] Expansion failed:", error);
    return false;
  }
}

/**
 * Handle Tab key press for abbreviation expansion
 * 
 * @param textField - The input or textarea element
 */
export function handleTabCompletion(
  textField: HTMLInputElement | HTMLTextAreaElement,
): void {
  // Avoid setting up the same field multiple times
  if (setupFields.has(textField)) {
    return;
  }
  setupFields.add(textField);

  textField.addEventListener("keydown", async (event) => {
    const keyboardEvent = event as KeyboardEvent;
    
    // Only handle Tab key (not Shift+Tab)
    if (keyboardEvent.key !== "Tab" || keyboardEvent.shiftKey) {
      return;
    }

    const { value, selectionStart } = textField;
    if (selectionStart == null) {
      return;
    }

    // Check if there's an abbreviation pattern before the cursor
    const beforeCursor = value.slice(0, selectionStart);
    const match = beforeCursor.match(ABBREVIATION_PATTERN);
    
    if (!match || !match[1]) {
      // No abbreviation pattern, let Tab work normally
      return;
    }

    // Prevent default Tab behavior (moving focus)
    keyboardEvent.preventDefault();

    const shortcut = match[1];
    console.debug("[AbbreviationManager] Detected abbreviation:", shortcut);

    // Attempt to expand the abbreviation
    const expanded = await expandAbbreviation(textField, shortcut);

    if (!expanded) {
      // If expansion failed, show a subtle indication
      console.debug("[AbbreviationManager] No expansion available for:", shortcut);
      // Could optionally show a tooltip or notification here
    }
  });
}

/**
 * Initialize abbreviation manager by setting up listeners on all text fields
 */
function initializeAbbreviationManager(): void {
  // Set up tab completion on existing text fields
  document.querySelectorAll("input, textarea").forEach((element) => {
    if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    ) {
      handleTabCompletion(element);
    }
  });

  // Set up tab completion on dynamically added text fields
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      handleTabCompletion(target);
    }
  });

  console.debug("[AbbreviationManager] Initialized");
}

// Initialize when the content script loads
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAbbreviationManager);
} else {
  initializeAbbreviationManager();
}
