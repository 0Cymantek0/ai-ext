# Dialog Upload Handler Implementation

## Overview

The Dialog Upload Handler feature provides a comprehensive system for intercepting and managing browser dialogs (alert, confirm, prompt), handling file upload workflows, managing permissions, and working with cookies in the context of browser automation workflows.

## Limitations & Known Issues

### **CRITICAL: Synchronous Dialog Limitation**

**The most significant limitation** of this implementation:

#### The Problem
- `window.confirm()` and `window.prompt()` are **synchronous** JavaScript functions
- They **must return immediately** with a value (boolean for confirm, string|null for prompt)
- Extension messaging (`chrome.runtime.sendMessage`) is **asynchronous**
- There is **no standard way** to block JavaScript execution while waiting for an extension response

#### Current Behavior
The interceptor currently:
1. ✅ **Captures the dialog event** and sends it to the extension for logging/tracking
2. ❌ **Cannot control the dialog outcome** - immediately calls the native dialog
3. ✅ **Maintains page functionality** - page logic that expects user input still works
4. ❌ **Dialog queue/resolution system is non-functional** for confirm/prompt

#### Why Not Just Return a Default Value?
Returning `false` or `null` instead of showing the native dialog would:
- ❌ Break page logic that expects user decisions
- ❌ Cause unpredictable page behavior
- ❌ Not actually solve the underlying problem

#### `window.alert()` Works Correctly
- `alert()` has no return value, so it can be fully controlled
- The extension can capture, log, and potentially suppress alerts

#### Potential Solutions (Not Implemented)
1. **SharedArrayBuffer + Atomics.wait()**: Block JS execution, but:
   - Requires CORS headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`)
   - Most websites don't set these headers
   - Would break on most real-world sites

2. **Suppress Native Dialog + Custom UI**: Return default values and show extension UI:
   - Breaks page expectations
   - Requires complex UI injection
   - Page might retry or behave unexpectedly

3. **Page Modification**: Rewrite page code to use async alternatives:
   - Not feasible for arbitrary websites
   - Would break many sites

#### Recommendation
This feature is best used for:
- ✅ **Alert dialogs** (fully controllable)
- ✅ **Logging/auditing** of confirm/prompt dialogs
- ✅ **Workflow tracking** of dialog events
- ❌ **Not for controlling** confirm/prompt outcomes in automated workflows

For browser automation requiring dialog control, consider:
- Using browser automation tools (Puppeteer/Playwright) that run in a different context
- Targeting pages that use custom modal dialogs instead of native ones
- Implementing page-specific solutions that know the expected dialog outcomes

### File Upload Security
Due to browser security restrictions:
- **Cannot programmatically set file paths** in `<input type="file">` elements
- Solution: Human-in-the-loop workflow that pauses and displays instructions
- Fallback: `downloadRemoteFile()` downloads to user's folder with manual attach instructions

### Chrome API Type Casting
- Permission strings cast to `chrome.runtime.ManifestPermissions` for dynamic checking
- Cookie details return type uses `chrome.cookies.CookieDetails`

## Implementation Summary

### 1. Core Modules

#### `src/browser-agent/dialogs.ts`
Main module exposing dialog management APIs:

- **Dialog Queue Management**: Manages pending dialogs with configurable auto-accept behavior
  - `handleAlert()` - Queue and handle alert dialogs
  - `handleConfirm()` - Queue and handle confirm dialogs with boolean responses
  - `handlePrompt()` - Queue and handle prompt dialogs with text input
  - `resolveDialog()` - Resolve pending dialogs from workflow or user input
  - `getPendingDialogs()` - Get list of dialogs awaiting response
  - `setDialogConfig()` / `getDialogConfig()` - Configure auto-accept behavior

- **File Upload Workflow**: Human-in-the-loop file upload management
  - `requestFileUpload()` - Request file upload with message and metadata
  - `resolveFileUpload()` / `rejectFileUpload()` - Resolve upload requests
  - `getPendingFileUploads()` - List pending upload requests
  - `downloadRemoteFile()` - Download files with user instructions for manual attachment

- **Cookie Management**: Session and authentication cookie utilities
  - `getCookies()` - Retrieve cookies with domain/name filtering
  - `setCookie()` - Set cookies with full options (domain, secure, sameSite, etc.)
  - `removeCookie()` - Remove cookies by URL and name

- **Permission Management**: Runtime permission checking and requesting
  - `checkPermissions()` - Check if specific permissions are granted (runs concurrently)
  - `requestPermissions()` - Request additional permissions from user

#### `src/content/browser-agent/dialog-interceptor.ts`
Early-injected content script (MAIN world, document_start) that:

- Overrides `window.alert`, `window.confirm`, and `window.prompt`
- Stores original functions for restoration
- Bridges dialog events to extension via `chrome.runtime.sendMessage`
- Falls back to original behavior for synchronous dialogs (due to limitation above)
- Emits ready signal when interceptors are active

### 2. Service Worker Integration

#### `src/background/service-worker.ts`
Added message handlers for all dialog operations:

- `DIALOG_EVENT` - Receives dialog interception events from content script
- `DIALOG_RESPONSE` - Processes dialog responses
- `DIALOG_GET_PENDING` / `DIALOG_SET_CONFIG` / `DIALOG_GET_CONFIG` - Dialog configuration
- `FILE_UPLOAD_REQUEST` / `FILE_UPLOAD_RESPONSE` / `FILE_UPLOAD_GET_PENDING` - File upload flow
- `DOWNLOAD_REMOTE_FILE` - Remote file download with instructions
- `COOKIES_GET` / `COOKIES_SET` / `COOKIES_REMOVE` - Cookie operations
- `PERMISSIONS_CHECK` / `PERMISSIONS_REQUEST` - Permission management

#### Dynamic Script Registration
Added `registerDialogInterceptor()` function to register the dialog interceptor at:
- Extension install (`chrome.runtime.onInstalled`)
- Browser startup (`chrome.runtime.onStartup`)
- Initial load

Registers content script with:
- `matches: ["<all_urls>"]`
- `runAt: "document_start"`
- `world: "MAIN"`
- Script ID: "dialog-interceptor"

### 3. Manifest Updates

#### `manifest.config.ts`
Added `"cookies"` permission to enable cookie access APIs.

### 4. Type Definitions

#### `src/shared/types/index.d.ts`
Added comprehensive type definitions for all dialog, file upload, cookie, and permission operations.

### 5. Tests

#### `src/browser-agent/__tests__/dialogs.test.ts`
Comprehensive unit tests covering:

- Dialog queue management (alert, confirm, prompt)
- Auto-accept configuration
- Dialog resolution and rejection
- File upload request/response flow
- Cookie CRUD operations
- Permission checking and requesting (concurrent)
- Error handling for missing permissions

**Test Results**: 17 tests passing (100%)

## Build & Test Status

✅ Build: Successful  
✅ TypeScript: No errors  
✅ ESLint: No errors (our files)  
✅ Tests: 17/17 passing  
✅ Performance: Concurrent permission checks implemented

## Usage Example

```typescript
// Configure dialog behavior (for alerts only)
setDialogConfig({ autoAcceptAlerts: true });

// Handle alert (works fully)
await handleAlert("Task completed!", {
  workflowId: "cleanup-workflow",
  tabId: currentTabId
});

// Note: confirm/prompt will show native dialogs but events are captured
const proceed = await handleConfirm("Delete all data?", {
  workflowId: "cleanup-workflow",
  tabId: currentTabId
});
// proceed will be whatever the user clicked in the NATIVE dialog

// Set auth cookie
await setCookie({
  url: "https://api.example.com",
  name: "session",
  value: sessionToken,
  secure: true
});

// Check permissions concurrently
const permissions = await checkPermissions(["notifications", "geolocation"]);
console.log(permissions); // { notifications: true, geolocation: false }

// Request file upload (human-in-the-loop)
const configPath = await requestFileUpload(
  "Upload configuration file",
  { acceptedTypes: ".json" }
);
```

## Related Documentation

- [Browser Agent Architecture](./browser-agent-architecture.md)
- [Workflow Manager](./workflow-manager.md)
- [Content Script Injection](./content-scripts.md)
