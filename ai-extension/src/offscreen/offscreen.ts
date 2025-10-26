import "./offscreen-logging-setup.js";
import { initializeDevInstrumentation } from "../devtools/instrumentation.js";

const offscreenDevtools = initializeDevInstrumentation("offscreen", {
  domTarget: typeof document !== "undefined" ? document : null,
  rootElement: typeof document !== "undefined" ? document.body : null,
});

console.info("AI Pocket offscreen document ready");

if (import.meta.env?.VITE_DEBUG_RECORDER && offscreenDevtools) {
  offscreenDevtools.recordEvent("lifecycle:ready", {
    timestamp: Date.now(),
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("Offscreen received message", { message, sender });
  if (import.meta.env?.VITE_DEBUG_RECORDER && offscreenDevtools) {
    offscreenDevtools.recordEvent("message:received", {
      senderId: sender?.id,
      tabId: sender?.tab?.id,
    });
  }
  sendResponse({ ok: true });
  return false;
});
