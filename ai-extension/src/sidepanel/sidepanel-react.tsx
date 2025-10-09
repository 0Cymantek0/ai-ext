import * as React from "react"
import * as ReactDOM from "react-dom/client"
import { ChatApp } from "./ChatApp"
import "@/styles/globals.css"

const root = document.getElementById("chat-interface-container")

if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ChatApp />
    </React.StrictMode>
  )
}

