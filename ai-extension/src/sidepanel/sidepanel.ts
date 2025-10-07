console.info("AI Pocket side panel initialized");

const app = document.getElementById("app");
if (app) {
  const info = document.createElement("div");
  info.textContent = "Side panel is ready.";
  app.appendChild(info);
}

chrome.runtime.sendMessage({ kind: "SIDE_PANEL_READY" });
