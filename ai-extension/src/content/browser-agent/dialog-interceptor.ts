/**
 * Dialog Interceptor Content Script
 * Injects into MAIN world at document_start to override native dialog functions
 * and bridge them to the extension for workflow integration
 *
 * LIMITATION: window.confirm() and window.prompt() are synchronous functions
 * that require immediate return values. This interceptor captures dialog events
 * for logging and workflow tracking, but cannot block execution to wait for
 * extension responses. The dialogs fall back to native browser behavior to
 * maintain page functionality.
 *
 * window.alert() works correctly as it doesn't require a return value.
 *
 * For true dialog control, pages would need to use async alternatives or
 * advanced techniques like SharedArrayBuffer-based blocking (complex).
 */

// This script runs in MAIN world to intercept page dialogs
(() => {
  // Store original dialog functions
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;

  // Track if interceptors are active
  let interceptorsActive = true;

  const isRuntimeAvailable =
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.sendMessage === "function";

  function bridgeDialogToExtension(dialog: {
    id: string;
    type: "alert" | "confirm" | "prompt";
    message: string;
    defaultValue?: string;
    timestamp: number;
  }): void {
    // Emit via window message for potential listeners
    window.postMessage(
      {
        type: "DIALOG_INTERCEPTED",
        source: "ai-pocket-dialog-interceptor",
        dialog,
      },
      "*",
    );

    if (isRuntimeAvailable) {
      try {
        void chrome.runtime.sendMessage({
          kind: "DIALOG_EVENT",
          payload: dialog,
        });
      } catch (error) {
        // If runtime messaging fails, keep interceptors active but log
        console.warn(
          "AI Pocket dialog interceptor failed to bridge event",
          error,
        );
      }
    }
  }

  // Override window.alert
  window.alert = function (message?: unknown): void {
    if (!interceptorsActive) {
      return originalAlert.call(window, message);
    }

    const dialogId = crypto.randomUUID();
    const messageStr = String(message ?? "");

    bridgeDialogToExtension({
      id: dialogId,
      type: "alert",
      message: messageStr,
      timestamp: Date.now(),
    });

    // Alerts don't require synchronous return values, so we can just return
    return;
  };

  // Override window.confirm
  window.confirm = function (message?: unknown): boolean {
    if (!interceptorsActive) {
      return originalConfirm.call(window, message);
    }

    const dialogId = crypto.randomUUID();
    const messageStr = String(message ?? "");

    bridgeDialogToExtension({
      id: dialogId,
      type: "confirm",
      message: messageStr,
      timestamp: Date.now(),
    });

    // LIMITATION: Confirm dialogs require a synchronous boolean return.
    // We cannot wait for the extension's async response without breaking
    // the page's execution flow. We fall back to native behavior to maintain
    // page functionality while capturing the event for logging/tracking.
    // To suppress the native dialog, we would need to return a default value,
    // but this would break page logic that expects user input.
    return originalConfirm.call(window, message);
  };

  // Override window.prompt
  window.prompt = function (
    message?: unknown,
    defaultValue?: unknown,
  ): string | null {
    if (!interceptorsActive) {
      return originalPrompt.call(window, message, defaultValue);
    }

    const dialogId = crypto.randomUUID();
    const messageStr = String(message ?? "");

    const dialogData: {
      id: string;
      type: "prompt";
      message: string;
      timestamp: number;
      defaultValue?: string;
    } = {
      id: dialogId,
      type: "prompt",
      message: messageStr,
      timestamp: Date.now(),
    };

    if (defaultValue !== undefined) {
      dialogData.defaultValue = String(defaultValue);
    }

    bridgeDialogToExtension(dialogData);

    // LIMITATION: Prompt dialogs expect string|null return synchronously.
    // Same limitation as confirm - we cannot wait for async extension response.
    // We fall back to native behavior to maintain page functionality while
    // capturing the event for logging/tracking.
    return originalPrompt.call(window, message, defaultValue);
  };

  // Listen for restore commands from extension
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.type === "DIALOG_RESTORE_ORIGINALS") {
      if (event.data.source === "ai-pocket-extension") {
        window.alert = originalAlert;
        window.confirm = originalConfirm;
        window.prompt = originalPrompt;
        interceptorsActive = false;
      }
    }
  });

  // Signal that interceptors are ready
  window.postMessage(
    {
      type: "DIALOG_INTERCEPTORS_READY",
      source: "ai-pocket-dialog-interceptor",
      timestamp: Date.now(),
    },
    "*",
  );
})();
