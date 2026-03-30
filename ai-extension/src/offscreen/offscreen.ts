/// <reference types="chrome"/>

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "NANO_PROXY") {
    if (message.action === "capabilities") {
      const ai = (self as any).ai;
      if (ai && ai.languageModel) {
        ai.languageModel.capabilities().then((cap: any) => sendResponse(cap));
        return true; // async response
      } else {
        sendResponse({ available: "no" });
      }
    }
  }
});
