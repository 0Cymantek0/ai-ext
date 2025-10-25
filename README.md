# AI Pocket

A powerful Chrome MV3 extension that brings AI-powered content management and conversational assistance to your browsing experience.

## Overview

AI Pocket is a Chrome extension that helps you capture, organize, and interact with web content using cutting-edge AI technologies. Built with Chrome's Manifest V3, it integrates both on-device AI (Gemini Nano via Chrome's Prompt API) and cloud-based models (Gemini Flash/Pro) to provide a seamless, privacy-focused experience.

### Key Features

- **Smart Content Capture**: Save text, images, and PDFs from any webpage with context preservation
- **AI-Powered Conversations**: Chat with AI using Gemini Nano (on-device) or Cloud AI models
- **Vector Search & RAG**: Semantic search across your saved content with retrieval-augmented generation
- **Inline Writing Assistant**: AI-powered text enhancement injected directly into page inputs
- **Pocket Management**: Organize content with tags, analytics, and multi-format exports (Markdown, PDF, JSON)
- **Privacy-First Design**: On-device processing with Gemini Nano, optional cloud fallback
- **Performance Monitoring**: Built-in quota tracking, performance metrics, and observability

## Tech Stack

### Core Technologies
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite + CRXJS (Chrome Extension plugin)
- **UI Library**: Tailwind CSS + shadcn/ui + Radix UI primitives
- **Virtualization**: TanStack Virtual for efficient list rendering

### AI Integration
- **Chrome Built-in AI**: Prompt API for Gemini Nano (on-device)
- **Cloud AI**: Google Generative AI SDK (Gemini Flash/Pro)
- **Embeddings**: Vector search with IndexedDB persistence
- **Local ML**: TensorFlow.js + Universal Sentence Encoder (fallback)

### Storage & Performance
- **Primary Storage**: IndexedDB (via `idb` wrapper)
- **Configuration**: Chrome Storage API (local/sync)
- **Vector Store**: Custom vector search service with chunking
- **Performance**: Built-in monitoring and quota management

### Development
- **Testing**: Vitest + Testing Library
- **Linting**: ESLint + TypeScript ESLint + Prettier
- **Type Safety**: TypeScript with strict mode
- **Schema Validation**: Zod

## Getting Started

### Prerequisites

- Node.js 18+ and npm/pnpm
- Chrome/Chromium browser (version 120+ for Gemini Nano support)
- Git

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/0Cymantek0/ai-extension.git
   cd ai-extension
   ```

2. **Install dependencies:**
   ```bash
   cd ai-extension
   npm install
   # or
   pnpm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Load extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `ai-extension/dist` directory
   - The extension icon should appear in your toolbar

5. **Configure API keys (optional, for Cloud AI):**
   - Open the extension side panel
   - Navigate to Settings
   - Enter your Google AI API key (get one at https://makersuite.google.com/app/apikey)

### Development Workflow

```bash
# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run tests in watch mode
npm test -- --watch

# Lint code
npm run lint

# Format code
npm run format
```

## Project Structure

```
ai-extension/
├── src/
│   ├── background/         # Service worker and background logic
│   │   ├── service-worker.ts
│   │   ├── ai-manager.ts
│   │   ├── hybrid-ai-engine.ts
│   │   ├── indexeddb-manager.ts
│   │   ├── vector-search-service.ts
│   │   └── ...
│   ├── content/            # Content scripts for DOM interaction
│   │   ├── content-script.ts
│   │   ├── capture-handler.ts
│   │   └── ...
│   ├── sidepanel/          # React-based side panel UI
│   │   ├── App.tsx
│   │   ├── Chat.tsx
│   │   ├── PocketList.tsx
│   │   └── ...
│   ├── components/         # Reusable UI components
│   │   ├── ui/            # shadcn/ui primitives
│   │   └── ...
│   ├── shared/            # Shared utilities and types
│   │   ├── messaging.ts
│   │   ├── types.ts
│   │   └── ...
│   └── offscreen/         # Offscreen document for heavy processing
├── tests/                 # Test suites
│   └── README-VECTOR-INDEXING.md
├── icons/                 # Extension icons
├── manifest.config.ts     # Extension manifest
├── vite.config.ts        # Vite configuration
└── package.json
```

## Architecture

### Service Worker (Background)
The extension's brain, handling:
- AI model selection and request routing (Nano vs. Cloud)
- IndexedDB storage management
- Vector indexing and embedding generation
- Performance monitoring and quota tracking
- Message routing between components

### Content Scripts
Injected into web pages for:
- Text/image capture from user selections
- DOM sanitization and context extraction
- Inline AI writing assistance
- Abbreviation expansion

### Side Panel UI
React-based interface providing:
- Conversational AI chat with streaming responses
- Pocket management (view, search, tag, export)
- Settings and preferences
- Analytics and usage metrics

### Offscreen Document
Isolated processing environment for:
- Heavy computations (PDF parsing, local embeddings)
- Background tasks that don't block the UI

## Features Deep Dive

### Hybrid AI Engine
- **Intelligent Model Selection**: Automatically chooses between Gemini Nano (fast, private) and Cloud AI (powerful, feature-rich)
- **Graceful Degradation**: Falls back to cloud when on-device AI is unavailable
- **Context Bundling**: Enriches prompts with relevant pocket content via RAG
- **Streaming Support**: Real-time response streaming with token counting

### Vector Search
- **Semantic Understanding**: Finds relevant content based on meaning, not just keywords
- **Chunking Strategy**: Splits large content into 1000-character chunks with overlap
- **Embedding Pipeline**: Uses Gemini embedding API with rate limiting and retry logic
- **Priority Queue**: Background indexing with high/normal/low priority
- **Local Fallback**: TensorFlow.js + USE for offline embedding generation

### Storage Management
- **Quota Monitoring**: Real-time tracking of IndexedDB and Chrome storage usage
- **Auto-Cleanup**: Configurable thresholds trigger cleanup warnings
- **Efficient Chunking**: Vector data stored separately from content
- **Sync Support**: User preferences sync across devices via chrome.storage.sync

## Development Tools

### Debug Recorder
A comprehensive diagnostics tool for debugging the extension. See **[dev-tools/debug-recorder/README.md](dev-tools/debug-recorder/README.md)** for:
- Capturing runtime state and performance metrics
- Analyzing AI performance and quota usage
- Troubleshooting storage and connectivity issues
- Generating detailed diagnostic reports

### Testing
Comprehensive test suites with Vitest:
- Unit tests for core utilities
- Integration tests for AI pipelines
- End-to-end tests for vector indexing
- Mock implementations for Chrome APIs

See [ai-extension/tests/README-VECTOR-INDEXING.md](ai-extension/tests/README-VECTOR-INDEXING.md) for testing documentation.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Code style and conventions
- Running tests and using debug tools
- Submitting pull requests

## Privacy & Security

- **On-Device First**: Gemini Nano runs entirely on-device, no data sent to cloud
- **Optional Cloud AI**: Users opt-in to cloud features with API keys they control
- **No Telemetry**: No usage data is sent to external servers
- **Local Storage**: All data stored locally in IndexedDB
- **API Key Security**: Keys stored in chrome.storage.local (encrypted by Chrome)

## Browser Compatibility

- **Minimum Chrome Version**: 120 (for Gemini Nano support)
- **Recommended**: Chrome 122+ or Edge 122+ (Canary/Dev channels)
- **Manifest V3**: Full compliance with Chrome's latest extension platform

## Performance

- **Service Worker**: Lightweight, < 50 MB memory
- **Side Panel**: Virtualized lists for smooth scrolling with 10k+ items
- **Vector Search**: < 500ms p95 latency for typical queries
- **AI Responses**: 1-3 seconds for Nano, 0.8-2 seconds for Cloud AI

## Known Issues & Limitations

- Gemini Nano requires Chrome flag enabled: `chrome://flags/#optimization-guide-on-device-model`
- Some websites block content script injection (e.g., chrome://, about:, file://)
- PDF processing requires CORS-enabled PDFs
- Large content (> 100 MB) may hit storage quotas

See [GitHub Issues](https://github.com/0Cymantek0/ai-extension/issues) for known bugs and feature requests.

## Roadmap

- [ ] Multi-modal content support (audio, video)
- [ ] Collaborative pockets (shared collections)
- [ ] Advanced export formats (Notion, Obsidian)
- [ ] Custom AI model fine-tuning
- [ ] Mobile companion app (React Native)
- [ ] Enterprise features (SSO, admin controls)

## License

[ISC License](LICENSE)

## Acknowledgments

- Chrome team for the Prompt API and built-in AI features
- Google AI for Generative AI SDK and Gemini models
- shadcn for the beautiful UI component library
- Radix UI for accessible primitives
- TanStack for Virtual scrolling
- The open-source community

## Support

- **Documentation**: See READMEs in respective directories
- **Issues**: [GitHub Issues](https://github.com/0Cymantek0/ai-extension/issues)
- **Discussions**: [GitHub Discussions](https://github.com/0Cymantek0/ai-extension/discussions)

---

Built with ❤️ using Chrome's cutting-edge AI capabilities.
