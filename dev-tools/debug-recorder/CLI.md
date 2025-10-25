# Debug Recorder CLI

Command-line tool for capturing runtime state and generating diagnostic markdown reports for the AI Pocket extension.

## Installation

```bash
cd dev-tools/debug-recorder
npm install
npm run build
```

## Usage

### Start Recording

Start a new recording session:

```bash
node dist/cli.js start --extension-id <chrome-extension-id>
```

Options:
- `--extension-id <id>` - Chrome extension ID to monitor
- `--screenshots` - Enable screenshot capture
- `--storage` - Include storage data
- `--metrics` - Include performance metrics

### Stop Recording and Generate Report

Stop recording and generate a markdown report:

```bash
node dist/cli.js stop [session-id]
```

If no session ID is provided, the most recent session will be used.

Options:
- `-o, --output <path>` - Custom output path for the report (default: `reports/<session-id>.md`)
- `--max-tokens <number>` - Maximum tokens for report (default: 10000)
- `--include-assets` - Include base64 screenshots in report
- `--capture <path>` - Path to raw capture JSON to persist before generating
- `--no-collapse-logs` - Do not collapse long logs
- `--no-trim` - Do not trim redundant text

### Capture from JSON

Generate a report directly from a capture JSON file:

```bash
node dist/cli.js capture path/to/capture.json
```

Options:
- `-o, --output <path>` - Custom output path
- `--max-tokens <number>` - Maximum tokens for report
- `--include-assets` - Include base64 screenshots

### List Sessions

List all recorded sessions:

```bash
node dist/cli.js list
```

### Show Session Details

Display details about a specific session:

```bash
node dist/cli.js show <session-id>
```

### Delete Session

Delete a recorded session:

```bash
node dist/cli.js delete <session-id>
```

## Capture JSON Format

The CLI accepts raw capture data in the following format:

```json
{
  "session": {
    "sessionId": "unique-id",
    "startTime": 1704470400000,
    "endTime": 1704471600000,
    "extensionId": "extension-id",
    "extensionVersion": "1.0.0",
    "chromeVersion": "122.0.0",
    "platform": "darwin",
    "recordingOptions": {
      "includeScreenshots": true,
      "includeStorage": true,
      "includeMetrics": true,
      "includePII": false
    }
  },
  "timeline": [
    {
      "id": "interaction-1",
      "timestamp": 1704470410000,
      "type": "navigation",
      "description": "User navigated to https://example.com",
      "status": "success",
      "duration": 1200,
      "context": {
        "url": "https://example.com"
      }
    }
  ],
  "logs": [
    {
      "interactionId": "interaction-1",
      "entries": [
        {
          "timestamp": 1704470410500,
          "level": "info",
          "source": "content-script",
          "message": "Page load detected"
        }
      ]
    }
  ],
  "errors": [
    {
      "interactionId": "interaction-1",
      "timestamp": 1704470480150,
      "message": "Storage quota warning",
      "source": "indexeddb-manager",
      "code": "QUOTA_WARNING",
      "stack": "Error: ...",
      "recovered": true
    }
  ],
  "snapshots": [
    {
      "timestamp": 1704470400000,
      "storageUsage": {
        "indexedDB": 250000000,
        "localStorage": 5000000
      },
      "aiState": {
        "activeModels": ["gemini-nano"],
        "tokenUsage": 1234
      },
      "breadcrumbs": ["Extension started"]
    }
  ],
  "assets": [
    {
      "interactionId": "interaction-1",
      "timestamp": 1704470411200,
      "screenshot": "base64-encoded-image"
    }
  ]
}
```

See `tests/fixtures/sample-capture.json` for a complete example.

## Report Format

Generated reports include:

### 1. Session Metadata
- Session ID, timestamps, duration
- Extension version and platform info
- Recording options

### 2. Session Summary
Timeline table with:
- Interaction number and type
- Status (✅ Success, ❌ Error, ⚠️ Warning, ⏳ Pending)
- Timestamps and relative time deltas
- Duration
- Description

### 3. Detailed Interaction Chronology
Collapsible `<details>` blocks for each interaction:
- Interaction ID and metadata
- Context data (JSON)
- Associated logs (collapsed if large)
- Errors with recovery status

### 4. Error Digests
- Timestamp and message
- Source location
- Error code
- Context (JSON)
- Stack trace (fenced code block)

### 5. State Snapshots
- Storage usage (IndexedDB, localStorage, chrome.storage)
- AI state (active models, pending requests, token usage)
- Performance metrics (memory, CPU)
- Breadcrumbs trail

### 6. Captured Assets (optional)
Collapsible sections with base64-encoded screenshots

## LLM Optimization

Reports are optimized for LLM consumption:

### Token Budget Allocation
- **Metadata**: 5% (500 tokens for 10K budget)
- **Summary**: 10% (1,000 tokens)
- **Interactions**: 30% (3,000 tokens)
- **Logs**: 25% (2,500 tokens)
- **Errors**: 15% (1,500 tokens)
- **Snapshots**: 10% (1,000 tokens)
- **Assets**: 5% (500 tokens)

### Optimizations
- **Timestamp normalization**: ISO 8601 format
- **Redundant line trimming**: Removes duplicate log entries
- **Token-aware truncation**: Chunks long content with continuation markers
- **Collapsible sections**: Large logs and assets behind `<details>` tags
- **Sanitized markdown**: Escaped backticks and special characters

## Examples

### Basic Workflow

```bash
# Start recording
node dist/cli.js start --extension-id abc123

# ... perform actions in the extension ...

# Stop and generate report
node dist/cli.js stop
```

### Generate Report from Capture

```bash
# Capture data from extension (implement in extension code)
# Then generate report
node dist/cli.js capture my-session-data.json -o reports/bug-report.md
```

### Stop with Inline Capture

```bash
# Stop and persist raw capture data in one command
node dist/cli.js stop --capture ./raw-data.json -o reports/debug-session.md
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Run Tests

```bash
npm test
```

### Test with Fixture

```bash
npm run build
node dist/cli.js capture tests/fixtures/sample-capture.json
```

## Integration with Extension

To integrate with the AI Pocket extension, implement a capture mechanism in the service worker:

```typescript
// In background/service-worker.ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.kind === 'DEBUG_CAPTURE_REQUEST') {
    const capture = {
      session: {
        sessionId: generateId(),
        startTime: sessionStartTime,
        endTime: Date.now(),
        extensionId: chrome.runtime.id,
        // ... other metadata
      },
      timeline: capturedInteractions,
      logs: capturedLogs,
      errors: capturedErrors,
      snapshots: stateSnapshots,
    };
    
    // Download as JSON
    const blob = new Blob([JSON.stringify(capture, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: `debug-capture-${Date.now()}.json`,
    });
  }
});
```

Then use the CLI to generate reports from downloaded captures.
