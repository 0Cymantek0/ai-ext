# Debug Recorder

> **Note**: This is documentation for a planned diagnostic tool. The features described here represent the intended functionality and design. Implementation is in progress.

A diagnostic tool for capturing runtime state, performance metrics, and AI interaction data from the AI Pocket Chrome extension. This tool helps developers debug issues, analyze performance bottlenecks, and understand extension behavior in production-like scenarios.

## Table of Contents

- [Purpose](#purpose)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage](#cli-usage)
- [Data Captured](#data-captured)
- [Privacy Considerations](#privacy-considerations)
- [Interpreting Reports](#interpreting-reports)
- [AI Assistance Guidelines](#ai-assistance-guidelines)
- [Troubleshooting](#troubleshooting)
- [Example Output](#example-output)

## Purpose

The Debug Recorder tool serves as a comprehensive diagnostics utility for the AI Pocket extension, designed to:

- **Capture Extension State**: Record IndexedDB contents, chrome.storage state, and service worker status
- **Monitor AI Performance**: Track Gemini Nano and Cloud AI API usage, latency, token consumption, and quota limits
- **Analyze Storage Patterns**: Monitor storage usage across IndexedDB, chrome.storage.local, and chrome.storage.sync
- **Record Message Flow**: Log inter-component messaging between service worker, content scripts, and UI surfaces
- **Track Vector Operations**: Monitor RAG pipeline performance, embedding generation, and vector search operations
- **Profile Performance**: Capture detailed timing metrics for all major operations
- **Generate Diagnostic Reports**: Export findings in human-readable Markdown format with actionable insights

This tool is essential for:

- Debugging production issues reported by users
- Performance regression analysis
- Understanding quota/rate-limit errors
- Validating AI model selection logic
- Analyzing vector search relevance

## Installation

### Prerequisites

- Node.js 18+ and npm/pnpm
- Chrome/Chromium browser (120+)
- AI Pocket extension source code
- Chrome extension developer mode enabled

### Setup Steps

1. **Clone or navigate to the repository root:**

   ```bash
   cd /path/to/ai-pocket-repo
   ```

2. **Install dependencies:**

   ```bash
   cd ai-extension
   npm install
   # or
   pnpm install
   ```

3. **Build the extension in development mode:**

   ```bash
   npm run dev
   ```

4. **Load the extension in Chrome:**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `ai-extension/dist` directory

5. **Install debug recorder CLI (future):**

   ```bash
   # When CLI is available:
   npm install -g @ai-pocket/debug-recorder
   ```

   For now, the debug recorder is integrated into the extension's developer build.

## Quick Start

### Running the Extension in Debug Mode

1. **Start the development server with debug logging:**

   ```bash
   cd ai-extension
   DEBUG=* npm run dev
   ```

2. **Enable verbose logging in Chrome:**
   - Open Chrome DevTools (F12)
   - Navigate to the "Console" tab
   - Click the filter dropdown and enable "Verbose" logs
   - Right-click in the console and select "Save as..." to capture logs

3. **Access the service worker console:**
   - Navigate to `chrome://extensions/`
   - Find "AI Pocket" extension
   - Click "service worker" link (or "Inspect views: service worker")
   - This opens DevTools for the background service worker

4. **Trigger the debug recorder:**

   **Option A: Via Extension UI (when implemented):**
   - Open the side panel
   - Navigate to Settings → Debug Tools
   - Click "Generate Debug Report"

   **Option B: Via Console (current method):**

   ```javascript
   // In the service worker console:
   chrome.runtime.sendMessage({
     kind: 'DEBUG_REPORT_REQUEST',
     payload: { includeStorage: true, includeMetrics: true },
   });
   ```

5. **View the generated report:**
   - Reports are saved to chrome.downloads folder
   - Default filename: `ai-pocket-debug-report-{timestamp}.md`

### Running the Recorder Alongside Normal Usage

To capture diagnostic data during regular extension usage:

1. **Enable background recording:**

   ```javascript
   // In the service worker console:
   chrome.storage.local.set({ debugRecorderEnabled: true });
   ```

2. **Use the extension normally:**
   - Capture content to pockets
   - Have conversations with AI
   - Perform searches
   - Switch between models

3. **Generate report when ready:**

   ```javascript
   chrome.runtime.sendMessage({ kind: 'DEBUG_REPORT_REQUEST', payload: {} });
   ```

4. **Disable recording:**
   ```javascript
   chrome.storage.local.set({ debugRecorderEnabled: false });
   ```

## CLI Usage

### Basic Commands

When the CLI tool is available, use these commands:

```bash
# Start recording (attaches to extension)
debug-recorder start --extension-id <extension-id>

# Stop recording and generate report
debug-recorder stop --output ./debug-report.md

# Generate report from running extension
debug-recorder capture --extension-id <extension-id> --output ./report.md

# Analyze existing report
debug-recorder analyze ./debug-report.md --section performance

# Compare two reports
debug-recorder diff report-before.md report-after.md
```

### Advanced Options

```bash
# Capture with specific filters
debug-recorder capture \
  --extension-id <extension-id> \
  --include storage,metrics,ai \
  --exclude pii \
  --duration 5m \
  --output ./report.md

# Real-time monitoring
debug-recorder monitor \
  --extension-id <extension-id> \
  --watch storage,ai \
  --interval 1s

# Generate report with custom sections
debug-recorder capture \
  --extension-id <extension-id> \
  --sections "overview,storage,ai,vectors,messages" \
  --format markdown \
  --output ./report.md
```

### Finding Extension ID

```bash
# List installed extensions
chrome://extensions/

# Or programmatically:
debug-recorder list-extensions
```

## Data Captured

The debug recorder captures the following categories of data:

### 1. Extension Overview

- Extension version and manifest details
- Chrome version and platform information
- Installation timestamp and update history
- Enabled features and permissions

### 2. Service Worker State

- Worker status (active, terminated, restarting)
- Lifecycle event history
- Alarm schedules and periodic tasks
- Message port connections

### 3. Storage Metrics

**IndexedDB:**

- Database size and quota usage
- Object store sizes (content, conversations, vectors, embeddings)
- Record counts and average record size
- Index statistics

**Chrome Storage:**

- `chrome.storage.local` size and quota
- `chrome.storage.sync` size and quota
- Key distribution and value sizes
- Settings and preferences

### 4. AI Performance

**Gemini Nano (Built-in AI):**

- Availability status and model version
- Session count (active, total, failed)
- Token usage (input, output, total)
- Average latency per operation
- Error rates and failure modes

**Cloud AI (Gemini Flash/Pro):**

- API key status (valid, expired, missing)
- Model selection logic
- Request count and rate limit status
- Token consumption and costs
- Average latency per model
- Error types and retry attempts

### 5. Vector Operations

- Embedding generation count and latency
- Vector store size and chunk count
- Indexing queue status (pending, processing, completed, failed)
- Search operations (count, average latency, relevance scores)
- RAG pipeline performance

### 6. Message Flow

- Inter-component message counts (by type)
- Average message handling time
- Message router statistics
- Failed message delivery attempts
- Broadcast statistics

### 7. Content & Conversations

- Pocket count and total size
- Conversation count and message distribution
- Content types captured (text, image, pdf)
- Tag usage statistics
- Export history

### 8. Performance Metrics

- Operation timing percentiles (p50, p95, p99)
- Memory usage snapshots
- Network request timings
- Script execution times
- DOM interaction latencies (content script)

### 9. Error Logs

- Recent errors (last 100)
- Error frequency by type
- Stack traces (sanitized)
- Recovery attempts

## Privacy Considerations

The debug recorder is designed with privacy in mind:

### Data Anonymization

**Automatically Redacted:**

- API keys (replaced with `***REDACTED***`)
- User email addresses
- Personal names in content (when detectable)
- URLs containing auth tokens

**Hashed:**

- User IDs (consistent hash for correlation)
- Extension installation ID
- Device identifiers

**Excluded by Default:**

- Actual pocket content text (only metadata)
- Conversation message bodies (only metadata)
- Image data URLs
- PDF file contents

### Opting into Full Data Capture

If debugging requires actual content:

```javascript
chrome.runtime.sendMessage({
  kind: 'DEBUG_REPORT_REQUEST',
  payload: {
    includeStorage: true,
    includeContent: true, // ⚠️ Includes actual text
    includePII: false, // Still redacts PII
  },
});
```

⚠️ **Warning:** Reports with `includeContent: true` may contain sensitive user data. Share these reports only via secure channels and delete after debugging.

### Sharing Reports

**Safe to share publicly:**

- Reports with default settings (no content, PII redacted)
- Anonymized performance metrics
- Error logs (stack traces sanitized)

**Share only with trusted team members:**

- Reports with `includeContent: true`
- Reports containing specific conversation patterns
- Storage dumps

**Never share:**

- API keys (already redacted)
- Full IndexedDB exports with user content
- Reports marked as containing PII

### GDPR Compliance

The debug recorder respects GDPR requirements:

- No data is sent to external servers by default
- Reports are stored locally only
- Users can request data deletion
- Minimal data collection principle applied

## Interpreting Reports

Debug reports are structured in Markdown with the following sections:

### Report Header

```markdown
# AI Pocket Debug Report

Generated: 2024-01-15 14:30:22 UTC
Extension Version: 1.0.0
Chrome Version: 120.0.6099.109
Platform: Mac OS X (arm64)
Report ID: 7f3d9c8a-1234-5678-90ab-cdef12345678
```

**Key indicators:**

- Extension and Chrome versions (verify compatibility)
- Platform info (performance may vary)
- Report ID (for cross-referencing)

### Storage Health Section

```markdown
## Storage Status

### IndexedDB

- **Size**: 45.2 MB / 300 MB (15% used)
- **Status**: ✅ Healthy
- **Object Stores**:
  - content: 1,234 records, 25.1 MB
  - conversations: 89 records, 8.3 MB
  - vectors: 15,678 chunks, 11.8 MB

### Chrome Storage

- **Local**: 2.1 MB / 10 MB (21% used)
- **Sync**: 45 KB / 100 KB (45% used)
- **Status**: ✅ Healthy
```

**What to look for:**

- ✅ Healthy: < 80% quota used
- ⚠️ Warning: 80-95% quota used
- 🚨 Critical: > 95% quota used

**Action items:**

- If nearing quota: User should export/delete old pockets
- If sync storage full: Reduce settings size
- If vectors disproportionately large: Check chunking strategy

### AI Performance Section

```markdown
## AI Performance

### Gemini Nano (Built-in)

- **Status**: ✅ Available (v1.5.0)
- **Sessions**: 12 active, 145 total, 3 failed (2% failure rate)
- **Tokens**: 45,678 input, 23,456 output, 69,134 total
- **Latency**: p50=1.2s, p95=3.4s, p99=5.6s
- **Errors**: 3 context_length_exceeded, 0 other

### Cloud AI (Gemini Flash)

- **Status**: ✅ Configured
- **Requests**: 234 total, 2 rate-limited, 1 failed (0.4% failure rate)
- **Tokens**: 234,567 input, 123,456 output, 358,023 total
- **Latency**: p50=0.8s, p95=2.1s, p99=3.2s
- **Errors**: 2 rate_limit, 1 network_timeout
```

**What to look for:**

- High failure rates (> 5%): Check API keys, network, quotas
- High latency (p95 > 10s): Performance issue or model overload
- Frequent `context_length_exceeded`: User hitting token limits
- Rate limiting: Too many requests, need backoff strategy

**Action items:**

- If Nano unavailable: User needs Chrome 120+ with AI features enabled
- If high latency: Check network, consider model switching
- If rate limited: Implement request throttling

### Vector Operations Section

```markdown
## Vector Operations

### Indexing Queue

- **Status**: ⚠️ Processing (234 pending, 12 in-progress)
- **Completed**: 1,234 jobs, avg 2.3s per job
- **Failed**: 5 jobs (0.4% failure rate)
- **Rate**: 8.2 jobs/min

### Search Performance

- **Queries**: 456 total
- **Latency**: p50=150ms, p95=450ms, p99=850ms
- **Results**: avg 12.3 results per query
- **Relevance**: avg similarity score 0.82
```

**What to look for:**

- Large pending queue: Backlog of indexing work
- High failure rate: Embedding API issues
- Slow search: Index optimization needed
- Low relevance scores: Embedding quality issues

**Action items:**

- If queue stuck: Check embedding API connectivity
- If search slow (> 1s): Consider index optimization
- If low relevance: Review chunking and embedding strategy

### Message Flow Section

```markdown
## Message Flow

| Source → Target | Count | Avg Time | Failures |
| --------------- | ----- | -------- | -------- |
| Content → SW    | 1,234 | 45ms     | 2        |
| SW → Sidepanel  | 890   | 23ms     | 0        |
| Sidepanel → SW  | 567   | 67ms     | 1        |
```

**What to look for:**

- High failure count: Communication issues
- High latency: Performance bottleneck
- Unusual patterns: Potential infinite loops

### Error Log Section

```markdown
## Recent Errors (Last 100)

1. [2024-01-15 14:25:10] QuotaExceededError: IndexedDB quota exceeded
   - Source: indexeddb-manager.ts:234
   - Context: Saving vector chunk
   - Recovery: User prompted to free space

2. [2024-01-15 14:20:33] RateLimitError: Gemini API rate limit
   - Source: embedding-engine.ts:89
   - Context: Generating embeddings
   - Recovery: Exponential backoff, retry succeeded
```

**What to look for:**

- Recurring errors: Systematic issues
- Quota errors: Storage management needed
- API errors: Network or configuration issues

### Performance Summary

```markdown
## Performance Summary

### Top Slow Operations

1. Vector search (p95=450ms) - Within acceptable range
2. Embedding generation (p95=2.1s) - Network-dependent
3. PDF processing (p95=5.2s) - CPU-intensive

### Recommendations

✅ Storage usage is healthy
⚠️ Consider implementing request caching for repeated embeddings
✅ Message routing performance is optimal
```

**Interpretation:**

- Green checkmarks: No action needed
- Yellow warnings: Monitor or optimize
- Red alerts: Immediate action required

## AI Assistance Guidelines

When AI assistants (like chatbots or coding assistants) are helping debug AI Pocket issues, they should request developers run the debug recorder in these scenarios:

### When to Request a Debug Report

**Performance Issues:**

```
User: "The extension is really slow when saving content"
AI: Could you generate a debug report to help diagnose the issue?
   1. Open Chrome DevTools (F12)
   2. Navigate to the service worker console (chrome://extensions/)
   3. Run: chrome.runtime.sendMessage({kind:"DEBUG_REPORT_REQUEST",payload:{}})
   4. Share the generated markdown file
```

**Error Messages:**

```
User: "I'm getting 'quota exceeded' errors"
AI: Let's capture detailed storage metrics. Please run the debug recorder:
   [provide instructions]
   This will show us exactly which storage is full and what's using space.
```

**AI Feature Not Working:**

```
User: "AI responses aren't working"
AI: To diagnose this, we need to check AI availability and API configuration.
   Please generate a debug report focusing on AI metrics:
   [provide instructions with includeMetrics: true]
```

**Installation/Update Issues:**

```
User: "Extension stopped working after Chrome update"
AI: Let's check compatibility and service worker status:
   [provide instructions]
   Look for the Extension Overview and Service Worker sections in the report.
```

### How to Request the Report

**Step-by-step instructions to provide:**

1. **Basic report** (most cases):

   ```
   1. Open Chrome and navigate to: chrome://extensions/
   2. Find "AI Pocket" and click "service worker"
   3. In the console that opens, paste:
      chrome.runtime.sendMessage({kind:"DEBUG_REPORT_REQUEST",payload:{}})
   4. The report will download automatically
   5. Share the .md file (it's safe, no personal data)
   ```

2. **Detailed report** (when content analysis needed):

   ```
   ⚠️ This captures actual pocket content. Only share via secure channels.

   1-3. [same as basic]
   4. Paste:
      chrome.runtime.sendMessage({
        kind:"DEBUG_REPORT_REQUEST",
        payload:{includeContent:true}
      })
   ```

3. **Performance-focused report:**
   ```
   1-3. [same as basic]
   4. Paste:
      chrome.runtime.sendMessage({
        kind:"DEBUG_REPORT_REQUEST",
        payload:{includeMetrics:true,includeStorage:true}
      })
   ```

### Analyzing User-Provided Reports

When a user shares a debug report:

1. **Check report header:**
   - Verify extension and Chrome versions are compatible
   - Note platform (performance varies)

2. **Identify the root cause:**
   - Storage issues → Check storage sections
   - AI issues → Check AI performance sections
   - Performance issues → Check performance metrics and error logs

3. **Provide targeted advice:**

   ```
   Based on your report:
   - Issue: IndexedDB at 96% quota
   - Cause: 15,000 vector chunks (12 MB)
   - Solution: Export old pockets and delete to free space
   - Prevention: Enable auto-cleanup in settings
   ```

4. **Request follow-up if needed:**
   ```
   The report shows [X], but to fully diagnose, we need [Y].
   Could you [specific action] and generate a new report?
   ```

## Troubleshooting

### Connection Failures

**Issue:** Debug recorder can't connect to extension

**Symptoms:**

- "Extension not found" error
- Timeout when sending message
- No response from service worker

**Solutions:**

1. **Verify extension is loaded:**

   ```bash
   # Navigate to chrome://extensions/
   # Check "AI Pocket" is enabled
   ```

2. **Check service worker is active:**

   ```javascript
   // In chrome://extensions/, look for:
   "service worker" link (active) vs. "Inspect views" (inactive)

   // If inactive, reload the extension
   chrome.runtime.reload();
   ```

3. **Ensure developer mode is enabled:**
   - Toggle "Developer mode" on in chrome://extensions/

4. **Check for extension errors:**

   ```javascript
   // In service worker console:
   chrome.runtime.lastError;
   ```

5. **Reload the extension:**
   - Click reload button in chrome://extensions/
   - Or run: `chrome.runtime.reload()` in service worker console

### Port Conflicts

**Issue:** Debug recorder CLI reports port already in use

**Symptoms:**

- "Port 9222 already in use"
- "Cannot attach to debugging port"
- Chrome refuses connection

**Solutions:**

1. **Find process using the port:**

   ```bash
   # macOS/Linux:
   lsof -i :9222

   # Windows:
   netstat -ano | findstr :9222
   ```

2. **Kill conflicting process:**

   ```bash
   # macOS/Linux:
   kill -9 <PID>

   # Windows:
   taskkill /PID <PID> /F
   ```

3. **Use alternative port:**

   ```bash
   debug-recorder start --extension-id <id> --port 9223
   ```

4. **Close other Chrome debugging sessions:**
   - Check for open DevTools windows
   - Close any automated testing frameworks (Puppeteer, Selenium)

5. **Restart Chrome with fresh debugging port:**
   ```bash
   # Close all Chrome instances first
   chrome --remote-debugging-port=9222
   ```

### Extension Reload Issues

**Issue:** Extension doesn't reflect changes after reload

**Symptoms:**

- Old code still running
- Service worker not restarting
- Console shows stale logs

**Solutions:**

1. **Hard reload the extension:**

   ```javascript
   // In service worker console:
   self.skipWaiting();
   chrome.runtime.reload();
   ```

2. **Reload affected pages:**

   ```javascript
   // Reload all tabs (from service worker):
   chrome.tabs.query({}, (tabs) => {
     tabs.forEach((tab) => chrome.tabs.reload(tab.id));
   });
   ```

3. **Clear service worker cache:**

   ```javascript
   // In service worker console:
   caches.keys().then((keys) => {
     return Promise.all(keys.map((key) => caches.delete(key)));
   });
   ```

4. **Use unpacked extension workflow:**

   ```bash
   # Keep dev server running:
   npm run dev

   # Vite auto-reloads changes, then:
   # 1. Click reload in chrome://extensions/
   # 2. Refresh any active extension pages
   ```

5. **Check for caching issues:**
   - Open DevTools → Network tab
   - Check "Disable cache" while DevTools is open
   - Perform a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Missing Debug Reports

**Issue:** Debug report generation completes but file not found

**Symptoms:**

- Message "Report generated" but no download
- Download notification shows but file missing
- File appears in downloads but is empty

**Solutions:**

1. **Check Chrome downloads folder:**

   ```bash
   # macOS:
   open ~/Downloads

   # Linux:
   xdg-open ~/Downloads

   # Windows:
   explorer %USERPROFILE%\Downloads
   ```

2. **Verify download permissions:**
   - Navigate to chrome://settings/downloads
   - Ensure "Ask where to save each file" is disabled for automated downloads
   - Check "Location" is accessible

3. **Check service worker logs:**

   ```javascript
   // In service worker console, look for:
   'Debug report generated: <filename>';

   // If missing, check for errors:
   chrome.runtime.lastError;
   ```

4. **Generate report to clipboard instead:**

   ```javascript
   chrome.runtime.sendMessage({
     kind: 'DEBUG_REPORT_REQUEST',
     payload: { outputTo: 'clipboard' },
   });
   // Then paste into a text editor and save manually
   ```

5. **Check for quota issues:**
   ```javascript
   // In service worker console:
   navigator.storage.estimate().then((estimate) => {
     console.log('Available:', estimate.quota - estimate.usage);
   });
   ```

### Performance Issues During Recording

**Issue:** Extension becomes slow when debug recorder is active

**Symptoms:**

- UI lag when recording
- Delayed AI responses
- Browser feels sluggish

**Solutions:**

1. **Use sampling mode:**

   ```javascript
   chrome.runtime.sendMessage({
     kind: 'DEBUG_REPORT_REQUEST',
     payload: {
       sampling: true, // Reduces data collection frequency
       samplingInterval: 1000, // Sample every 1 second
     },
   });
   ```

2. **Exclude expensive operations:**

   ```javascript
   chrome.runtime.sendMessage({
     kind: 'DEBUG_REPORT_REQUEST',
     payload: {
       exclude: ['messages', 'vectors'], // Skip message logs and vector data
     },
   });
   ```

3. **Generate report after usage:**

   ```javascript
   // Instead of continuous recording:
   // 1. Use extension normally
   // 2. Then generate report from current state:
   chrome.runtime.sendMessage({ kind: 'DEBUG_REPORT_REQUEST', payload: {} });
   ```

4. **Increase Chrome's memory allocation:**

   ```bash
   # Launch Chrome with more resources:
   chrome --max-old-space-size=4096
   ```

5. **Close unnecessary tabs and extensions:**
   - Disable other extensions temporarily
   - Close resource-heavy tabs

### Common Error Messages

| Error                            | Meaning                           | Solution                                            |
| -------------------------------- | --------------------------------- | --------------------------------------------------- |
| `Extension context invalidated`  | Extension was reloaded            | Refresh the page and try again                      |
| `Could not establish connection` | Service worker not responding     | Reload extension in chrome://extensions/            |
| `Storage quota exceeded`         | No space for report               | Free up storage or use `outputTo: "clipboard"`      |
| `Permission denied`              | Missing download permission       | Check manifest.json includes `downloads` permission |
| `Timeout waiting for response`   | Report generation taking too long | Use sampling mode or exclude large sections         |

## Example Output

### Sample Report Structure

A typical debug report looks like this:

```markdown
# AI Pocket Debug Report

Generated: 2024-01-15 14:30:22 UTC
Extension Version: 1.0.0
Chrome Version: 120.0.6099.109
Platform: Mac OS X (arm64)
Report ID: 7f3d9c8a-1234-5678-90ab-cdef12345678

---

## Executive Summary

**Overall Health**: ✅ Healthy

- Storage: ✅ 15% used (45.2 MB / 300 MB)
- AI Services: ✅ All operational
- Performance: ✅ No bottlenecks detected
- Errors: ⚠️ 3 minor errors (rate limiting)

**Recommendations**:

1. Monitor storage growth (trending toward quota)
2. Consider implementing embedding cache to reduce API calls
3. No immediate action required

---

## Extension Overview

- **Version**: 1.0.0
- **Manifest Version**: 3
- **Installation Date**: 2024-01-01 10:15:30 UTC
- **Last Update**: 2024-01-10 08:22:15 UTC
- **Permissions**: storage, sidePanel, contextMenus, tabs, scripting, downloads

### Enabled Features

- ✅ Gemini Nano (Built-in AI)
- ✅ Cloud AI (Gemini Flash/Pro)
- ✅ Vector Search (RAG)
- ✅ PDF Processing
- ✅ Context Bundling
- ✅ Conversation History

---

## Service Worker State

- **Status**: ✅ Active
- **Uptime**: 2h 34m 12s
- **Restarts**: 2 (last: 1h 15m ago)
- **Active Connections**: 3 (sidepanel, content-script×2)

### Lifecycle Events (Recent)

- `14:28:15` - Message received: CHAT_REQUEST
- `14:27:42` - Alarm fired: vector-indexing-check
- `14:25:30` - Connection opened: sidepanel
- `14:20:10` - Service worker activated

---

## Storage Status

### IndexedDB: ✅ Healthy (15% used)

- **Total Size**: 45.2 MB / 300 MB
- **Growth Rate**: ~500 KB/day
- **Projected Full**: ~600 days

#### Object Stores

| Store         | Records | Size    | Avg Record |
| ------------- | ------- | ------- | ---------- |
| content       | 1,234   | 25.1 MB | 20.3 KB    |
| conversations | 89      | 8.3 MB  | 93.2 KB    |
| vectors       | 15,678  | 11.8 MB | 752 B      |
| embeddings    | 1,456   | 892 KB  | 612 B      |

### Chrome Storage: ✅ Healthy

**Local Storage**: 2.1 MB / 10 MB (21% used)

- Settings: 45 KB
- Cache: 1.8 MB
- Temp: 250 KB

**Sync Storage**: 45 KB / 100 KB (45% used)

- User preferences: 30 KB
- Model selection: 5 KB
- Abbreviations: 10 KB

---

## AI Performance

### Gemini Nano: ✅ Available (v1.5.0)

**Session Statistics**

- Active: 12
- Total: 145
- Failed: 3 (2% failure rate)

**Token Usage**

- Input: 45,678
- Output: 23,456
- Total: 69,134
- Avg per session: 476 tokens

**Latency**

- p50: 1.2s
- p95: 3.4s
- p99: 5.6s
- Max: 8.2s

**Errors**

- `context_length_exceeded`: 3
- Other: 0

### Cloud AI (Gemini Flash): ✅ Configured

**Request Statistics**

- Total: 234
- Rate-limited: 2 (0.9%)
- Failed: 1 (0.4%)
- Retried: 3

**Token Usage**

- Input: 234,567
- Output: 123,456
- Total: 358,023
- Avg per request: 1,530 tokens

**Latency**

- p50: 0.8s
- p95: 2.1s
- p99: 3.2s
- Max: 4.5s

**Errors**

- `rate_limit`: 2 (recovered via backoff)
- `network_timeout`: 1 (retry succeeded)

---

## Vector Operations

### Indexing Queue: ⚠️ Processing

**Status**

- Pending: 234 jobs
- In-progress: 12 jobs
- Completed: 1,234 jobs
- Failed: 5 jobs (0.4%)

**Performance**

- Processing rate: 8.2 jobs/min
- Avg time per job: 2.3s
- Estimated completion: ~28 minutes

**Recent Failures**

1. Content ID: abc123 - Rate limit, retrying...
2. Content ID: xyz789 - Network timeout, retry #2
3. Content ID: def456 - Invalid content, skipped

### Search Performance: ✅ Optimal

**Query Statistics**

- Total queries: 456
- Avg results: 12.3 per query
- Avg relevance score: 0.82

**Latency**

- p50: 150ms
- p95: 450ms
- p99: 850ms
- Max: 1.2s

---

## Message Flow

| Source → Target | Count | Avg Time | Failures  |
| --------------- | ----- | -------- | --------- |
| Content → SW    | 1,234 | 45ms     | 2 (0.16%) |
| SW → Sidepanel  | 890   | 23ms     | 0         |
| Sidepanel → SW  | 567   | 67ms     | 1 (0.18%) |
| SW → Offscreen  | 45    | 89ms     | 0         |

**Message Types** (Top 5)

1. CHAT_REQUEST: 234
2. SEARCH_CONTENT: 189
3. SAVE_CONTENT: 123
4. UPDATE_UI: 98
5. GET_SETTINGS: 67

---

## Content & Conversations

### Pockets: 1,234 total

- Text: 1,100 (89%)
- Images: 89 (7%)
- PDFs: 45 (4%)
- Total size: 25.1 MB
- Avg size: 20.3 KB

**Top Tags**

1. programming: 234
2. research: 189
3. recipes: 123
4. documentation: 98

### Conversations: 89 total

- Total messages: 456
- Avg per conversation: 5.1
- Total size: 8.3 MB
- Avg conversation: 93.2 KB

**Model Distribution**

- Gemini Nano: 67 conversations (75%)
- Gemini Flash: 18 conversations (20%)
- Gemini Pro: 4 conversations (5%)

---

## Performance Metrics

### Operation Timings

| Operation          | p50   | p95   | p99   | Count |
| ------------------ | ----- | ----- | ----- | ----- |
| Save content       | 45ms  | 120ms | 250ms | 123   |
| Search content     | 150ms | 450ms | 850ms | 456   |
| Generate embedding | 1.2s  | 2.8s  | 4.5s  | 1,456 |
| AI chat response   | 1.5s  | 3.8s  | 6.2s  | 234   |
| Vector search      | 85ms  | 320ms | 650ms | 456   |
| PDF processing     | 2.3s  | 5.2s  | 8.7s  | 45    |

### Memory Usage

- Service worker: 45 MB
- Sidepanel: 78 MB
- Content scripts: 12 MB (per tab)

---

## Recent Errors (Last 20)

1. **[14:25:10] QuotaExceededError**
   - Source: `indexeddb-manager.ts:234`
   - Context: Saving vector chunk for content ID abc123
   - Recovery: User prompted to free space
   - Status: ⚠️ Requires user action

2. **[14:20:33] RateLimitError**
   - Source: `embedding-engine.ts:89`
   - Context: Generating embeddings for batch job
   - Recovery: Exponential backoff, retry #2 succeeded
   - Status: ✅ Resolved

3. **[14:15:18] NetworkError**
   - Source: `cloud-ai-manager.ts:156`
   - Context: Fetching Gemini Flash response
   - Recovery: Automatic retry succeeded
   - Status: ✅ Resolved

---

## Recommendations

### Immediate Actions

✅ No critical issues detected

### Short-term Improvements

⚠️ **Storage Management**

- Current: 15% used, growing at 500 KB/day
- Action: Monitor growth, implement auto-cleanup at 80%
- Priority: Medium

⚠️ **Embedding Cache**

- Observation: 1,456 embeddings generated, ~10% duplicate requests
- Action: Implement caching layer to reduce API calls by ~10%
- Priority: Low

### Long-term Optimizations

💡 **Vector Index Optimization**

- Current search latency p95: 450ms (acceptable)
- Future: Consider index optimization if corpus grows >50k chunks
- Priority: Monitor

💡 **Model Selection Tuning**

- Nano usage: 75%, Flash: 20%, Pro: 5%
- Observation: Appropriate distribution for workload
- Action: Continue monitoring user satisfaction
- Priority: Ongoing

---

## Diagnostic Summary

**Overall Assessment**: ✅ Extension is healthy and performing well

**Key Findings**:

1. Storage usage is within normal ranges
2. AI services are operational with low error rates
3. Performance metrics are within acceptable thresholds
4. No critical issues detected

**Next Steps**:

1. Continue normal usage
2. Monitor storage growth
3. Report any new issues with this report ID: 7f3d9c8a-1234-5678-90ab-cdef12345678

---

_Report generated by AI Pocket Debug Recorder v1.0.0_
_For support, see: dev-tools/debug-recorder/README.md_
```

### Additional Example Reports

For more example reports covering specific scenarios:

- [Example: Storage Quota Issue](./examples/storage-quota-issue.md) - Diagnosing storage exhaustion
- [Example: AI Performance Problem](./examples/ai-performance-issue.md) - Debugging slow AI responses
- [Example: Vector Search Relevance](./examples/search-relevance-issue.md) - Analyzing search quality

---

## Next Steps

1. **Learn more about the extension architecture**: See [README.md](../../README.md)
2. **Review testing documentation**: See [ai-extension/tests/README-VECTOR-INDEXING.md](../../ai-extension/tests/README-VECTOR-INDEXING.md)
3. **Explore performance monitoring**: See [ai-extension/src/background/monitoring.ts](../../ai-extension/src/background/monitoring.ts)
4. **Contribute to debug tooling**: See [CONTRIBUTING.md](../../CONTRIBUTING.md)

## Support

If you encounter issues with the debug recorder itself:

1. Check this troubleshooting guide
2. Review recent GitHub issues
3. Open a new issue with:
   - Steps to reproduce
   - Chrome version and platform
   - Console logs (if available)
   - Expected vs. actual behavior

## License

The debug recorder tool follows the same license as the AI Pocket extension. See [LICENSE](../../LICENSE) for details.
