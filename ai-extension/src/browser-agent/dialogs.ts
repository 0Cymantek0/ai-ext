/**
 * Dialog and Browser Interaction Handler for Browser Agent
 * Provides APIs for handling alerts, confirms, prompts, file uploads,
 * permission prompts, and cookie/session management
 */

export interface DialogQueueItem {
  id: string;
  type: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  timestamp: number;
  tabId?: number;
  frameId?: number;
  workflowId?: string;
  timeoutMs?: number;
}

export interface DialogResponse {
  id: string;
  type: "alert" | "confirm" | "prompt";
  accepted: boolean;
  value?: string;
}

export interface FileUploadRequest {
  id: string;
  elementSelector?: string;
  acceptedTypes?: string;
  message: string;
  timestamp: number;
  tabId?: number;
  workflowId?: string;
}

export interface CookieOptions {
  url?: string;
  domain?: string;
  name?: string;
  storeId?: string;
}

export interface SetCookieOptions {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "no_restriction" | "lax" | "strict";
  expirationDate?: number;
}

/**
 * Dialog Queue Manager
 * Manages pending dialog interactions and their resolution
 */
class DialogQueueManager {
  private pendingDialogs = new Map<
    string,
    {
      dialog: DialogQueueItem;
      resolve: (response: DialogResponse) => void;
      reject: (error: Error) => void;
      timeout?: number;
    }
  >();

  private config = {
    autoAcceptAlerts: false,
    autoAcceptConfirms: false,
    autoAcceptPromptsWithDefault: false,
    defaultTimeout: 30000, // 30 seconds
  };

  /**
   * Enqueue a dialog and return a promise that resolves when the dialog is handled
   */
  enqueue(dialog: DialogQueueItem): Promise<DialogResponse> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingDialogs.delete(dialog.id);
        reject(new Error(`Dialog ${dialog.id} timed out`));
      }, this.config.defaultTimeout) as unknown as number;

      this.pendingDialogs.set(dialog.id, {
        dialog,
        resolve,
        reject,
        timeout,
      });

      // Auto-accept based on configuration
      if (this.shouldAutoAccept(dialog)) {
        const response: DialogResponse = {
          id: dialog.id,
          type: dialog.type,
          accepted: true,
          value: dialog.type === "prompt" ? dialog.defaultValue || "" : undefined,
        };
        this.resolveDialog(dialog.id, response);
      }
    });
  }

  /**
   * Resolve a dialog with a response
   */
  resolveDialog(dialogId: string, response: DialogResponse): boolean {
    const pending = this.pendingDialogs.get(dialogId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.resolve(response);
    this.pendingDialogs.delete(dialogId);
    return true;
  }

  /**
   * Reject a dialog with an error
   */
  rejectDialog(dialogId: string, error: Error): boolean {
    const pending = this.pendingDialogs.get(dialogId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.reject(error);
    this.pendingDialogs.delete(dialogId);
    return true;
  }

  /**
   * Get all pending dialogs
   */
  getPendingDialogs(): DialogQueueItem[] {
    return Array.from(this.pendingDialogs.values()).map((item) => item.dialog);
  }

  /**
   * Check if a dialog should be auto-accepted
   */
  private shouldAutoAccept(dialog: DialogQueueItem): boolean {
    switch (dialog.type) {
      case "alert":
        return this.config.autoAcceptAlerts;
      case "confirm":
        return this.config.autoAcceptConfirms;
      case "prompt":
        return this.config.autoAcceptPromptsWithDefault && !!dialog.defaultValue;
      default:
        return false;
    }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): typeof this.config {
    return { ...this.config };
  }
}

/**
 * File Upload Manager
 * Manages file upload requests and provides fallback workflows
 */
class FileUploadManager {
  private pendingRequests = new Map<
    string,
    {
      request: FileUploadRequest;
      resolve: (filePath: string) => void;
      reject: (error: Error) => void;
      timeout?: number;
    }
  >();

  /**
   * Request file upload and wait for user action
   */
  requestFileUpload(request: FileUploadRequest): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`File upload request ${request.id} timed out`));
      }, 60000) as unknown as number; // 60 seconds for file upload

      this.pendingRequests.set(request.id, {
        request,
        resolve,
        reject,
        timeout,
      });
    });
  }

  /**
   * Resolve a file upload request with the file path
   */
  resolveFileUpload(requestId: string, filePath: string): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.resolve(filePath);
    this.pendingRequests.delete(requestId);
    return true;
  }

  /**
   * Reject a file upload request
   */
  rejectFileUpload(requestId: string, error: Error): boolean {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return false;
    }

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    pending.reject(error);
    this.pendingRequests.delete(requestId);
    return true;
  }

  /**
   * Get all pending file upload requests
   */
  getPendingRequests(): FileUploadRequest[] {
    return Array.from(this.pendingRequests.values()).map((item) => item.request);
  }

  /**
   * Download a remote file to local storage
   * Returns the download ID that can be used to track the download
   */
  async downloadRemoteFile(
    url: string,
    filename?: string,
  ): Promise<{ downloadId: number; instructions: string }> {
    try {
      const downloadId = await chrome.downloads.download({
        url,
        filename,
        saveAs: true, // Prompt user for location
      });

      const instructions = `File download initiated. Please wait for the download to complete, then manually attach the file from your downloads folder.`;

      return { downloadId, instructions };
    } catch (error) {
      throw new Error(
        `Failed to download file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

// Singleton instances
const dialogQueueManager = new DialogQueueManager();
const fileUploadManager = new FileUploadManager();

/**
 * Handle alert dialog
 */
export async function handleAlert(
  message: string,
  options?: { tabId?: number; workflowId?: string; timeout?: number },
): Promise<void> {
  const dialogId = crypto.randomUUID();
  const dialog: DialogQueueItem = {
    id: dialogId,
    type: "alert",
    message,
    timestamp: Date.now(),
    tabId: options?.tabId,
    workflowId: options?.workflowId,
  };

  await dialogQueueManager.enqueue(dialog);
}

/**
 * Handle confirm dialog
 */
export async function handleConfirm(
  message: string,
  options?: { tabId?: number; workflowId?: string; timeout?: number },
): Promise<boolean> {
  const dialogId = crypto.randomUUID();
  const dialog: DialogQueueItem = {
    id: dialogId,
    type: "confirm",
    message,
    timestamp: Date.now(),
    tabId: options?.tabId,
    workflowId: options?.workflowId,
  };

  const response = await dialogQueueManager.enqueue(dialog);
  return response.accepted;
}

/**
 * Handle prompt dialog
 */
export async function handlePrompt(
  message: string,
  defaultValue?: string,
  options?: { tabId?: number; workflowId?: string; timeout?: number },
): Promise<string | null> {
  const dialogId = crypto.randomUUID();
  const dialog: DialogQueueItem = {
    id: dialogId,
    type: "prompt",
    message,
    defaultValue,
    timestamp: Date.now(),
    tabId: options?.tabId,
    workflowId: options?.workflowId,
  };

  const response = await dialogQueueManager.enqueue(dialog);
  return response.accepted ? response.value || null : null;
}

/**
 * Resolve a pending dialog
 */
export function resolveDialog(dialogId: string, response: DialogResponse): boolean {
  return dialogQueueManager.resolveDialog(dialogId, response);
}

/**
 * Get all pending dialogs
 */
export function getPendingDialogs(): DialogQueueItem[] {
  return dialogQueueManager.getPendingDialogs();
}

/**
 * Set dialog auto-accept configuration
 */
export function setDialogConfig(
  config: Partial<{
    autoAcceptAlerts: boolean;
    autoAcceptConfirms: boolean;
    autoAcceptPromptsWithDefault: boolean;
    defaultTimeout: number;
  }>,
): void {
  dialogQueueManager.setConfig(config);
}

/**
 * Get dialog configuration
 */
export function getDialogConfig(): {
  autoAcceptAlerts: boolean;
  autoAcceptConfirms: boolean;
  autoAcceptPromptsWithDefault: boolean;
  defaultTimeout: number;
} {
  return dialogQueueManager.getConfig();
}

/**
 * Request file upload from user
 */
export async function requestFileUpload(
  message: string,
  options?: {
    elementSelector?: string;
    acceptedTypes?: string;
    tabId?: number;
    workflowId?: string;
  },
): Promise<string> {
  const requestId = crypto.randomUUID();
  const request: FileUploadRequest = {
    id: requestId,
    elementSelector: options?.elementSelector,
    acceptedTypes: options?.acceptedTypes,
    message,
    timestamp: Date.now(),
    tabId: options?.tabId,
    workflowId: options?.workflowId,
  };

  return fileUploadManager.requestFileUpload(request);
}

/**
 * Resolve file upload request
 */
export function resolveFileUpload(requestId: string, filePath: string): boolean {
  return fileUploadManager.resolveFileUpload(requestId, filePath);
}

/**
 * Reject file upload request
 */
export function rejectFileUpload(requestId: string, error: Error): boolean {
  return fileUploadManager.rejectFileUpload(requestId, error);
}

/**
 * Get pending file upload requests
 */
export function getPendingFileUploads(): FileUploadRequest[] {
  return fileUploadManager.getPendingRequests();
}

/**
 * Download remote file with instructions for manual attachment
 */
export async function downloadRemoteFile(
  url: string,
  filename?: string,
): Promise<{ downloadId: number; instructions: string }> {
  return fileUploadManager.downloadRemoteFile(url, filename);
}

/**
 * Get cookies matching the provided filter
 */
export async function getCookies(options: CookieOptions = {}): Promise<chrome.cookies.Cookie[]> {
  try {
    const details: chrome.cookies.GetAllDetails = {};

    if (options.url) details.url = options.url;
    if (options.domain) details.domain = options.domain;
    if (options.name) details.name = options.name;
    if (options.storeId) details.storeId = options.storeId;

    const cookies = await chrome.cookies.getAll(details);
    return cookies;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("cookies")) {
      throw new Error(
        'Permission denied: "cookies" permission required in manifest. Please ensure the extension has cookie access.',
      );
    }
    throw new Error(`Failed to get cookies: ${message}`);
  }
}

/**
 * Set a cookie with the provided options
 */
export async function setCookie(options: SetCookieOptions): Promise<chrome.cookies.Cookie> {
  try {
    const details: chrome.cookies.SetDetails = {
      url: options.url,
      name: options.name,
      value: options.value,
    };

    if (options.domain) details.domain = options.domain;
    if (options.path) details.path = options.path;
    if (options.secure !== undefined) details.secure = options.secure;
    if (options.httpOnly !== undefined) details.httpOnly = options.httpOnly;
    if (options.sameSite) details.sameSite = options.sameSite;
    if (options.expirationDate) details.expirationDate = options.expirationDate;

    const cookie = await chrome.cookies.set(details);
    if (!cookie) {
      throw new Error("Failed to set cookie: chrome.cookies.set returned null");
    }
    return cookie;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("cookies")) {
      throw new Error(
        'Permission denied: "cookies" permission required in manifest. Please ensure the extension has cookie access.',
      );
    }
    throw new Error(`Failed to set cookie: ${message}`);
  }
}

/**
 * Remove a cookie
 */
export async function removeCookie(
  url: string,
  name: string,
  storeId?: string,
): Promise<chrome.cookies.Details | null> {
  try {
    const details: chrome.cookies.Details = {
      url,
      name,
    };

    if (storeId) details.storeId = storeId;

    const result = await chrome.cookies.remove(details);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("cookies")) {
      throw new Error(
        'Permission denied: "cookies" permission required in manifest. Please ensure the extension has cookie access.',
      );
    }
    throw new Error(`Failed to remove cookie: ${message}`);
  }
}

/**
 * Check if specific permissions are granted
 */
export async function checkPermissions(
  permissions: string[],
): Promise<{ [key: string]: boolean }> {
  const result: { [key: string]: boolean } = {};

  for (const permission of permissions) {
    try {
      const hasPermission = await chrome.permissions.contains({
        permissions: [permission],
      });
      result[permission] = hasPermission;
    } catch (error) {
      result[permission] = false;
    }
  }

  return result;
}

/**
 * Request additional permissions from user
 */
export async function requestPermissions(permissions: string[]): Promise<boolean> {
  try {
    const granted = await chrome.permissions.request({
      permissions,
    });
    return granted;
  } catch (error) {
    throw new Error(
      `Failed to request permissions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Export manager instances for testing and advanced usage
 */
export const managers = {
  dialogQueue: dialogQueueManager,
  fileUpload: fileUploadManager,
};
