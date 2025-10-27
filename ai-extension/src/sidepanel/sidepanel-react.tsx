import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "./ChatApp";
import "../styles/globals.css";
import "./sidepanel-logging-setup.js";
import { initializeDevInstrumentation } from "../devtools/instrumentation.js";

const sidepanelDevtools = initializeDevInstrumentation("sidepanel", {
  domTarget: typeof document !== "undefined" ? document : null,
  rootElement: typeof document !== "undefined" ? document.body : null,
});

console.log("[SidePanel React] Initializing React app...");

// Wait for DOM to be ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initReactApp);
} else {
  initReactApp();
}

function initReactApp() {
  const container = document.getElementById("chat-interface-container");

  if (!container) {
    console.error(
      "[SidePanel React] Container #chat-interface-container not found!",
    );
    if (import.meta.env?.VITE_DEBUG_RECORDER && sidepanelDevtools) {
      sidepanelDevtools.recordEvent("init:error", {
        reason: "container_not_found",
      });
    }
    return;
  }

  console.log("[SidePanel React] Mounting React app...");

  if (import.meta.env?.VITE_DEBUG_RECORDER && sidepanelDevtools) {
    sidepanelDevtools.recordEvent("init:mounting", {
      containerId: container.id,
    });
  }

  const root = ReactDOM.createRoot(container);
  const profilerCallback =
    import.meta.env?.VITE_DEBUG_RECORDER && sidepanelDevtools
      ? sidepanelDevtools.getProfilerCallback("ChatAppRoot")
      : null;

  root.render(
    <React.StrictMode>
      {profilerCallback ? (
        <React.Profiler id="ChatAppRoot" onRender={profilerCallback}>
          <ChatApp />
        </React.Profiler>
      ) : (
        <ChatApp />
      )}
    </React.StrictMode>,
  );

  console.log("[SidePanel React] React app mounted successfully!");

  if (import.meta.env?.VITE_DEBUG_RECORDER && sidepanelDevtools) {
    sidepanelDevtools.recordEvent("init:mounted", {
      containerId: container.id,
    });
  }
}

// Export for debugging
(window as unknown as Record<string, unknown>).React = React;
(window as unknown as Record<string, unknown>).ReactDOM = ReactDOM;
