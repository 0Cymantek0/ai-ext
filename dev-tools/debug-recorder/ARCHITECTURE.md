# Debug Recorder Architecture

## Overview

The AI Pocket Debug Recorder is a Node.js/TypeScript CLI tool that provides real-time debugging and diagnostic capabilities for the AI Pocket Chrome extension. It features an interactive terminal UI, session state management, WebSocket bridge for live event streaming, and comprehensive report generation.

## Core Components

### 1. Session Controller (`src/session-controller.ts`)

The session controller implements a finite state machine for managing recording sessions.

#### State Machine

```
┌──────┐
│ idle │
└──┬───┘
   │ start()
   ↓
┌────────────┐  pause()   ┌────────┐
│  recording │ ---------> │ paused │
│            │ <--------- │        │
└────────────┘  resume()  └────────┘
   │                         │
   │ stop()              stop()
   ↓                         ↓
┌──────┐                     │
│ idle │ <-------------------┘
└──────┘
```

#### State Transitions

- **idle → recording**: `start(config)` - Initializes a new session with metadata
- **recording → paused**: `pause()` - Freezes the session clock
- **paused → recording**: `resume()` - Continues the session clock
- **recording/paused → idle**: `stop()` - Finalizes session and persists data

#### Features

- **Uptime Tracking**: Accurate session timing excluding paused duration
- **Metadata Capture**: Session ID, extension version, Chrome profile, CLI flags
- **Event Emission**: Broadcasts state changes for UI updates
- **Graceful Shutdown**: Handles SIGINT/SIGTERM for clean persistence
- **Session Persistence**: Auto-saves to session cache on state changes

### 2. Interactive UI (`src/ui/RecorderUI.tsx`)

Built with [Ink](https://github.com/vadimdemedes/ink), a React renderer for the terminal.

#### Display Components

- **Session Status Box**: Live state indicator, session ID, uptime
- **WebSocket Bridge Box**: Port, connected contexts, events received
- **Command Help**: Context-sensitive keyboard shortcuts

#### Keyboard Controls

- **Ctrl+P**: Pause recording (when in recording state)
- **Ctrl+R**: Resume recording (when in paused state)
- **Ctrl+C**: Stop and exit gracefully

### 3. Bridge Server (`src/bridge-server.ts`)

WebSocket server for bidirectional communication with the extension.

#### Protocol

Based on typed message protocol defined in `dev-tools/shared/protocol.ts`:

- **HANDSHAKE**: Client authentication with session token
- **HEARTBEAT**: Connection health monitoring
- **EVENT**: Single event from extension to CLI
- **BATCH**: Multiple events batched for efficiency
- **COMMAND**: CLI commands to extension (PAUSE, RESUME, STOP, STATUS)
- **ACK Messages**: Acknowledgements for reliable delivery

#### Features

- Configurable port (default: 9229)
- Session token authentication
- Multi-context support (background, content-script, side-panel, offscreen)
- Automatic heartbeat timeout and reconnection handling
- Event hooks for extensibility

### 4. Session Store (`src/session-store.ts`)

File-based persistence layer for session data.

- **Location**: `sessions/` directory
- **Format**: JSON files named by session ID
- **Operations**: save, load, list, delete

### 5. Report Generator (`src/report-generator.ts`)

Generates LLM-optimized markdown reports from session data.

#### Features

- Token budget allocation across report sections
- Collapsible sections for long content
- Timestamp normalization
- Redundant text trimming
- Base64 asset embedding (optional)

## Build System

### tsup Configuration

Dual-entry build configuration:

1. **CLI Entry** (`cli.ts`): Includes shebang, external React/Ink
2. **Library Entry** (`index.ts`): Exports public API for programmatic use

### Scripts

- `npm run build`: Production build with TypeScript declaration files
- `npm run dev`: Watch mode with tsx
- `npm test`: Run Vitest test suite
- `npm run lint`: ESLint with TypeScript and Prettier
- `npm run format`: Prettier formatting

## Directory Structure

```
dev-tools/debug-recorder/
├── src/
│   ├── cli.ts                    # CLI entry point with Commander
│   ├── index.ts                  # Public API exports
│   ├── session-controller.ts    # State machine implementation
│   ├── bridge-server.ts          # WebSocket server
│   ├── session-store.ts          # File-based persistence
│   ├── report-generator.ts       # Markdown report builder
│   ├── normalizer.ts             # Data normalization
│   ├── protocol.ts               # Re-export shared protocol types
│   ├── types.ts                  # Core type definitions
│   ├── ui/
│   │   └── RecorderUI.tsx        # Ink terminal UI component
│   ├── formatters/               # Report section formatters
│   └── utils/                    # Utility functions
├── tests/                        # Vitest test suites
├── sessions/                     # Session cache directory
├── reports/                      # Generated markdown reports
├── examples/                     # Example capture files
├── package.json                  # pnpm workspace entry
├── tsconfig.json                 # TypeScript configuration
├── tsup.config.ts                # Build configuration
├── eslint.config.js              # ESLint configuration
├── .prettierrc                   # Prettier configuration
└── vitest.config.ts              # Vitest configuration
```

## Testing Strategy

### Unit Tests

- **Session Controller**: State machine transitions, timing, persistence
- **Bridge Server**: Connection lifecycle, message protocol, heartbeat
- **Report Generator**: Token budgeting, formatting, collapsing
- **Utilities**: Timestamp normalization, text trimming, capture parsing

### Integration Tests

- **Bridge E2E**: Full lifecycle testing with WebSocket client
- **Log System**: Filter pipeline and temporal correlation
- **Session Store**: File I/O operations

### Test Coverage

162 tests covering state machine logic, WebSocket protocol, and report generation.

## Future Extensibility

The architecture is designed to support additional features:

1. **Event Hooks**: SessionController events can trigger custom handlers
2. **Protocol Extensions**: Bridge protocol is versioned and extensible
3. **Custom Formatters**: Report generator uses pluggable formatters
4. **Storage Backends**: SessionStore interface can be implemented for databases

## Performance Considerations

- **Minimal Dependencies**: Only Commander, Ink, and WS for core functionality
- **Lazy Loading**: React/Ink only loaded when starting interactive session
- **Stream Processing**: Bridge server handles events asynchronously
- **Token Budgeting**: Reports are sized for efficient LLM consumption
