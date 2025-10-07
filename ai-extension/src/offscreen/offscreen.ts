console.info("AI Pocket offscreen document ready");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("Offscreen received message", { message, sender });
  sendResponse({ ok: true });
  return false;
});
