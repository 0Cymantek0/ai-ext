(() => {
  console.info("AI Pocket content script initialized");

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.debug("Content script received message", { message, sender });
    sendResponse({ ok: true });
    return false;
  });
})();
