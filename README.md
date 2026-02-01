# AI Pocket

**The Offline-First AI Companion for Your Browser**

AI Pocket is an advanced Chrome Extension that transforms your browsing experience by integrating local, privacy-first AI (Gemini Nano) directly into your workflow. It captures content, organizes it into "Pockets," and allows you to chat with, search through, and automate interactions with the web—all while prioritizing on-device processing.

---

## 📚 Table of Contents

- [Overview](#overview)
- [Repository Structure](#repository-structure)
- [Key Features](#key-features)
- [Architecture Deep Dive](#architecture-deep-dive)
  - [Hybrid AI Engine](#hybrid-ai-engine)
  - [RAG & Vector Search](#rag--vector-search)
  - [Browser Agent](#browser-agent)
  - [Content Capture Pipeline](#content-capture-pipeline)
- [Development Guide](#development-guide)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Project](#running-the-project)
  - [Testing](#testing)
- [Playground](#playground)
- [Dev Tools](#dev-tools)

---

## 🌟 Overview

AI Pocket is built on the **Chrome Manifest V3** platform and leverages the new **Chrome Prompt API** to run Google's **Gemini Nano** model directly in the browser. This enables:

1.  **Privacy**: Sensitive data can be processed locally without leaving your device.
2.  **Speed**: Near-instant responses for many tasks without network latency.
3.  **Cost Efficiency**: Reduces reliance on paid cloud API calls.
4.  **Offline Capability**: Many features work without an internet connection.

When local models aren't enough (e.g., for complex reasoning or multimodal tasks), the extension intelligently routes requests to **Google's Cloud AI (Gemini Pro/Flash)** via a Hybrid AI Engine.

---

## 📂 Repository Structure

This project is a **monorepo** managed with `pnpm workspaces`.

- **`ai-extension/`**: The core Chrome Extension source code.
  - `src/background/`: Service worker, AI orchestration, RAG, and storage logic.
  - `src/content/`: Scripts injected into web pages for capture and automation.
  - `src/sidepanel/`: The React-based UI (Chat, Pocket management).
  - `src/browser-agent/`: The autonomous agent state machine and tool registry.
- **`playground/`**: A testbed environment containing sample static sites (e.g., "Pawsitive Vibes") to test extension capabilities like content capture and DOM interaction.
- **`dev-tools/`**: Diagnostic utilities, including the **Debug Recorder** for analyzing runtime performance and AI model behavior.

---

## 🚀 Key Features

-   **Smart Capture**: Save text selections, images, full pages, or notes into organized "Pockets".
-   **Contextual Chat**: Chat with your saved content using RAG (Retrieval-Augmented Generation).
-   **Hybrid AI**: Seamlessly switches between On-Device (Nano) and Cloud (Flash/Pro) models.
-   **Browser Agent**: An autonomous agent that can navigate, click, type, and extract data from websites.
-   **Semantic Search**: Find content by meaning, not just keywords, using vector embeddings.
-   **Privacy-First**: Your data stays in IndexedDB within your browser.

---

## 🏗️ Architecture Deep Dive

### Hybrid AI Engine
*Location: `ai-extension/src/background/hybrid-ai-engine.ts`*

The **Hybrid AI Engine** is the brain of AI Pocket. It decides *where* to process a prompt based on:
1.  **Task Complexity**: Simple tasks (summarization, reformatting) go to Nano. Complex reasoning goes to Cloud.
2.  **Device Capabilities**: Checks for Gemini Nano availability (`ai-manager.ts`).
3.  **User Preference**: Users can force "Local Only" mode.

It implements a "fall-through" mechanism:
-   **Tier 1**: Try Gemini Nano (On-Device).
-   **Tier 2**: If Nano is unavailable or the task is too complex, check user consent/settings.
-   **Tier 3**: Route to Cloud (Gemini Flash/Pro) if permitted.

### RAG & Vector Search
*Location: `ai-extension/src/background/vector-search-service.ts`*

To enable "Chat with your Pockets", we use **RAG (Retrieval-Augmented Generation)**:
1.  **Ingestion**: When you save content, it is chunked (`text-chunker.ts`).
2.  **Embedding**: Text chunks are converted into vector embeddings. We prioritize local embedding models where available, falling back to Cloud APIs.
3.  **Storage**: Embeddings are stored locally in **IndexedDB** via `idb`.
4.  **Retrieval**: When you ask a question, we calculate **Cosine Similarity** between your query's embedding and stored chunks to find the most relevant context.

### Browser Agent
*Location: `ai-extension/src/browser-agent/`*

AI Pocket includes an autonomous **Browser Agent** capable of multi-step workflows.
-   **State Machine (`agent-state.ts`)**: Defines the agent's lifecycle (START → NAVIGATE → EXTRACT → INTERACT → VALIDATE → END).
-   **Workflow Manager (`workflow-manager.ts`)**: Manages execution, persistence (checkpoints), and pausing/resuming workflows.
-   **Tool Registry (`tool-registry.ts`)**: A library of actions the agent can perform (e.g., `click_element`, `type_text`, `extract_page_content`). These tools are exposed to the LLM, allowing it to "drive" the browser.

### Content Capture Pipeline
*Location: `ai-extension/src/content/`*

Content scripts are injected into every page to enable interaction:
1.  **Capture Handler**: Listens for user actions (Context Menu "Save to Pocket", or Sidepanel commands).
2.  **DOM Analysis**: Extracts clean text, metadata, and structured data from the page.
3.  **Sanitization**: Optionally removes PII (Personally Identifiable Information) before saving.
4.  **Messaging**: Sends the processed data to the Background Service Worker for storage and indexing.

---

## 🛠️ Development Guide

### Prerequisites
-   **Node.js 18+**
-   **pnpm** (preferred) or npm
-   **Chrome Browser** (v120+ recommended for Gemini Nano)

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/0Cymantek0/ai-extension.git
    cd ai-extension
    ```

2.  **Install dependencies (Root Workspace)**:
    ```bash
    pnpm install
    ```
    *Note: Since this is a workspace, `pnpm install` at the root will install dependencies for all packages.*

### Running the Project

1.  **Start the Extension**:
    ```bash
    cd ai-extension
    npm run dev
    ```
    This runs Vite in watch mode.

2.  **Load in Chrome**:
    -   Go to `chrome://extensions/`
    -   Enable **Developer Mode** (top right).
    -   Click **Load Unpacked**.
    -   Select the `ai-extension/dist` folder.

3.  **(Optional) Configure Cloud AI**:
    -   Click the extension icon or open the Sidepanel.
    -   Go to **Settings**.
    -   Enter your **Google Gemini API Key** (required for Cloud fallback and Embeddings if local model is unavailable).

### Testing

We use **Vitest** for unit and integration tests.

-   **Run all tests**:
    ```bash
    cd ai-extension
    npm test
    ```
-   **Vector Indexing Tests**:
    See `ai-extension/tests/README-VECTOR-INDEXING.md` for specific details on testing the RAG pipeline.

---

## 🛝 Playground

The `playground/` directory contains sample web content to test the extension against.
-   **Pawsitive Vibes**: A mock e-commerce site for a pet store (`playground/nano-generated-response/index.html`).
-   **Usage**: Open this file in Chrome to test the "Browser Agent" capabilities (e.g., "Find the dog toy price") or to test content capture on a clean, controlled page.

---

## 🧰 Dev Tools

The `dev-tools/` directory contains utilities for extension developers.
-   **Debug Recorder**: A tool to capture runtime logs, state transitions, and performance metrics from the extension.
-   **Usage**: See `dev-tools/debug-recorder/README.md` for instructions on how to record and analyze debug sessions.

---

## 📜 License

This project is licensed under the **ISC License**.
