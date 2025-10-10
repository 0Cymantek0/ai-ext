import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { ChatApp } from "./ChatApp";
import "../styles/globals.css";

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
    return;
  }

  console.log("[SidePanel React] Mounting React app...");

  const root = ReactDOM.createRoot(container);
  root.render(
    <React.StrictMode>
      <ChatApp />
    </React.StrictMode>,
  );

  console.log("[SidePanel React] React app mounted successfully!");
}

// Export for debugging
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
