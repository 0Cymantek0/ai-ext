/**
 * API Testing Tools for Browser Agent
 * Provides HTTP request utilities with CORS bypass, schema validation, retry logic,
 * network monitoring, and authentication token management
 */

import { z, type ZodSchema } from "zod";

/**
 * HTTP Methods
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * API Request Options
 */
export interface ApiRequestOptions {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  validateStatus?: (status: number) => boolean;
  schema?: ZodSchema<any>;
  retryConfig?: RetryConfig;
  usePageContext?: boolean; // If true, execute in page context for same-origin CORS bypass
  tabId?: number; // Tab ID for page context execution
}

/**
 * Retry Configuration
 */
export interface RetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBackoff?: boolean;
}

/**
 * API Response
 */
export interface ApiResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: T;
  bodyType: "json" | "text" | "arrayBuffer" | "blob" | "unknown";
  bodyEncoding?: "base64";
  timing: {
    startTime: number;
    endTime: number;
    durationMs: number;
  };
  fromCache?: boolean;
  retryCount?: number;
}

/**
 * Network Request Log Entry
 */
export interface NetworkRequestLog {
  id: string;
  timestamp: number;
  tabId: number;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  timing?: {
    startTime: number;
    endTime?: number;
    durationMs?: number;
  };
  size?: {
    requestBytes?: number;
    responseBytes?: number;
  };
  type?: string;
  error?: string;
  fromCache?: boolean;
  ip?: string;
  initiator?: string;
}

/**
 * Authentication Token Storage Key
 */
const AUTH_TOKEN_KEY = "browser_agent_auth_token";

/**
 * Network monitoring state
 */
interface MonitoringState {
  isMonitoring: boolean;
  logs: Map<number, NetworkRequestLog[]>; // Map of tabId -> logs
  requestMap: Map<string, NetworkRequestLog>; // Map of requestId -> log entry
}

const monitoringState: MonitoringState = {
  isMonitoring: false,
  logs: new Map(),
  requestMap: new Map(),
};

/**
 * Set authentication token
 * Stores the token in chrome.storage.session for secure, temporary storage
 */
export async function setAuthToken(token: string): Promise<void> {
  await chrome.storage.session.set({ [AUTH_TOKEN_KEY]: token });
}

/**
 * Get authentication token
 */
export async function getAuthToken(): Promise<string | null> {
  const result = await chrome.storage.session.get(AUTH_TOKEN_KEY);
  return result[AUTH_TOKEN_KEY] || null;
}

/**
 * Clear authentication token
 */
export async function clearAuthToken(): Promise<void> {
  await chrome.storage.session.remove(AUTH_TOKEN_KEY);
}

/**
 * Calculate retry delay with exponential backoff
 */
function calculateRetryDelay(
  attempt: number,
  config: Required<RetryConfig>,
): number {
  if (!config.exponentialBackoff) {
    return config.baseDelayMs;
  }

  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Check if status code should trigger retry
 */
function shouldRetry(status: number, attempt: number, maxRetries: number): boolean {
  if (attempt >= maxRetries) {
    return false;
  }

  // Retry on 5xx server errors
  if (status >= 500 && status < 600) {
    return true;
  }

  // Retry on 429 (Too Many Requests)
  if (status === 429) {
    return true;
  }

  // Don't retry on other 4xx client errors
  if (status >= 400 && status < 500) {
    return false;
  }

  // Retry on network errors (status 0)
  if (status === 0) {
    return true;
  }

  return false;
}

class ApiRequestError extends Error {
  status: number | undefined;
  retryable: boolean;

  constructor(message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status ?? undefined;
    this.retryable = options.retryable ?? true;
  }
}

type ParsedResponseBody = {
  body: any;
  bodyType: ApiResponse["bodyType"];
  bodyEncoding?: "base64";
};

const JSON_CONTENT_TYPE = /application\/(.+\+)?json/;
const TEXT_CONTENT_TYPE = /^text\//i;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function hasHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.keys(headers).find((key) => key.toLowerCase() === target);
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = hasHeader(headers, name);
  if (existing) {
    headers[existing] = value;
  } else {
    headers[name] = value;
  }
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value);
}

function serializeRequestBody(
  body: any,
  headers: Record<string, string>,
  method: HttpMethod,
): BodyInit | undefined {
  if (method === "GET") {
    return undefined;
  }

  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (
    body instanceof Blob ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof ReadableStream
  ) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (isArrayBufferView(body)) {
    return body as BodyInit;
  }

  if (typeof body === "object") {
    if (!hasHeader(headers, "Content-Type")) {
      setHeader(headers, "Content-Type", "application/json");
    }
    try {
      return JSON.stringify(body);
    } catch {
      return String(body);
    }
  }

  return String(body);
}

/**
 * Parse response body based on content type
 */
async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  const contentTypeRaw = response.headers.get("content-type") || "";
  const contentType = contentTypeRaw.toLowerCase();

  // Handle no-content responses
  if (response.status === 204 || response.status === 205) {
    return { body: null, bodyType: "unknown" };
  }

  if (JSON_CONTENT_TYPE.test(contentType)) {
    const text = await response.text();
    if (!text) {
      return { body: null, bodyType: "json" };
    }
    try {
      return { body: JSON.parse(text), bodyType: "json" };
    } catch {
      return { body: text, bodyType: "text" };
    }
  }

  if (TEXT_CONTENT_TYPE.test(contentType) || contentType.includes("charset")) {
    const text = await response.text();
    return { body: text, bodyType: "text" };
  }

  try {
    const buffer = await response.arrayBuffer();
    return {
      body: arrayBufferToBase64(buffer),
      bodyType: "arrayBuffer",
      bodyEncoding: "base64",
    };
  } catch {
    const text = await response.text().catch(() => "");
    return { body: text, bodyType: "unknown" };
  }
}

/**
 * Convert Headers object to plain object
 */
function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Execute fetch in page context (for CORS bypass on same-origin requests)
 */
async function executeInPageContext(
  options: ApiRequestOptions,
  authToken: string | null,
  tabId: number,
): Promise<ApiResponse> {
  const scriptResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (
      url: string,
      method: string,
      headers: Record<string, string>,
      body: any,
      timeout: number,
      authToken: string | null,
    ) => {
      const startTime = performance.now();

      // Prepare headers
      const finalHeaders: Record<string, string> = { ...headers };
      if (authToken) {
        finalHeaders["Authorization"] = `Bearer ${authToken}`;
      }

      // Prepare fetch options
      const fetchOptions: RequestInit = {
        method,
        headers: finalHeaders,
      };

      if (body !== undefined && method !== "GET") {
        if (typeof body === "object" && !(body instanceof Blob)) {
          fetchOptions.body = JSON.stringify(body);
          if (!finalHeaders["Content-Type"]) {
            finalHeaders["Content-Type"] = "application/json";
          }
        } else {
          fetchOptions.body = body;
        }
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const endTime = performance.now();

        // Parse response body
        const contentType = response.headers.get("content-type") || "";
        let parsedBody: any;
        let bodyType: "json" | "text" | "arrayBuffer" | "blob" | "unknown" = "unknown";

        if (contentType.includes("application/json")) {
          try {
            parsedBody = await response.json();
            bodyType = "json";
          } catch {
            parsedBody = await response.text();
            bodyType = "text";
          }
        } else if (contentType.includes("text/")) {
          parsedBody = await response.text();
          bodyType = "text";
        } else {
          parsedBody = await response.text();
          bodyType = "text";
        }

        // Convert headers to object
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: parsedBody,
          bodyType,
          timing: {
            startTime,
            endTime,
            durationMs: endTime - startTime,
          },
        };
      } catch (error: any) {
        clearTimeout(timeoutId);
        throw new Error(error.message || "Fetch failed in page context");
      }
    },
    args: [
      options.url,
      options.method,
      options.headers || {},
      options.body,
      options.timeout || 30000,
      authToken,
    ],
  });

  if (!scriptResult || scriptResult.length === 0 || !scriptResult[0]) {
    throw new Error("Failed to execute script in page context");
  }

  const result = scriptResult[0].result;
  if (!result) {
    throw new Error("No result from page context execution");
  }

  return result as ApiResponse;
}

/**
 * Execute fetch in service worker context
 */
async function executeInServiceWorker(
  options: ApiRequestOptions,
  authToken: string | null,
): Promise<ApiResponse> {
  const startTime = performance.now();

  // Prepare headers
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (authToken) {
    setHeader(headers, "Authorization", `Bearer ${authToken}`);
  }

  // Prepare fetch options
  const fetchOptions: RequestInit = {
    method: options.method,
    headers,
    credentials: "include",
  };

  const serializedBody = serializeRequestBody(options.body, headers, options.method);
  if (serializedBody !== undefined) {
    fetchOptions.body = serializedBody;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || 30000,
  );

  try {
    const response = await fetch(options.url, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const endTime = performance.now();

    // Parse response body
    const parsed = await parseResponseBody(response);

    const responsePayload: ApiResponse = {
      status: response.status,
      statusText: response.statusText,
      headers: headersToObject(response.headers),
      body: parsed.body,
      bodyType: parsed.bodyType,
      timing: {
        startTime,
        endTime,
        durationMs: endTime - startTime,
      },
    };

    if (parsed.bodyEncoding) {
      responsePayload.bodyEncoding = parsed.bodyEncoding;
    }

    return responsePayload;
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      throw new Error(`Request timeout after ${options.timeout || 30000}ms`);
    }

    throw error;
  }
}

/**
 * Validate response against schema
 */
function validateResponse<T>(response: ApiResponse, schema?: ZodSchema<T>): ApiResponse<T> {
  if (!schema) {
    return response as ApiResponse<T>;
  }

  try {
    const validated = schema.parse(response.body);
    return {
      ...response,
      body: validated,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Response validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
      );
    }
    throw error;
  }
}

/**
 * Main API request function with retry logic
 */
export async function apiRequest<T = any>(
  options: ApiRequestOptions,
): Promise<ApiResponse<T>> {
  const retryConfig: Required<RetryConfig> = {
    maxRetries: options.retryConfig?.maxRetries ?? 3,
    baseDelayMs: options.retryConfig?.baseDelayMs ?? 1000,
    maxDelayMs: options.retryConfig?.maxDelayMs ?? 10000,
    exponentialBackoff: options.retryConfig?.exponentialBackoff ?? true,
  };

  const validateStatus = options.validateStatus || ((status) => status >= 200 && status < 300);

  let lastError: Error | null = null;
  let retryCount = 0;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      // Get auth token
      const authToken = await getAuthToken();

      // Execute request
      let response: ApiResponse;
      if (options.usePageContext && options.tabId) {
        response = await executeInPageContext(options, authToken, options.tabId);
      } else {
        response = await executeInServiceWorker(options, authToken);
      }

      // Check status
      if (!validateStatus(response.status)) {
        // Check if we should retry
        const canRetry = shouldRetry(response.status, attempt, retryConfig.maxRetries);
        
        if (canRetry) {
          lastError = new ApiRequestError(
            `Request failed with status ${response.status}: ${response.statusText}`,
            { status: response.status, retryable: true }
          );
          retryCount++;

          const delay = calculateRetryDelay(attempt, retryConfig);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw new ApiRequestError(
          `Request failed with status ${response.status}: ${response.statusText}`,
          { status: response.status, retryable: false }
        );
      }

      // Validate response against schema
      const validatedResponse = validateResponse<T>(response, options.schema);

      // Add retry count to response
      if (retryCount > 0) {
        validatedResponse.retryCount = retryCount;
      }

      return validatedResponse;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      lastError = normalizedError;

      if (normalizedError instanceof ApiRequestError && normalizedError.retryable === false) {
        throw normalizedError;
      }

      if (
        normalizedError instanceof Error &&
        (normalizedError.message.includes("validation failed") ||
          normalizedError.message.includes("Invalid response"))
      ) {
        throw normalizedError;
      }

      // Check if we should retry
      if (attempt < retryConfig.maxRetries) {
        const delay = calculateRetryDelay(attempt, retryConfig);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Max retries reached
      throw normalizedError;
    }
  }

  throw lastError || new Error("Request failed after all retry attempts");
}

/**
 * Start network monitoring for a tab
 */
export function startNetworkMonitoring(tabId?: number): void {
  if (monitoringState.isMonitoring) {
    return;
  }

  monitoringState.isMonitoring = true;

  // WebRequest listeners
  chrome.webRequest.onBeforeRequest.addListener(
    (details): chrome.webRequest.BlockingResponse | undefined => {
      if (tabId && details.tabId !== tabId) {
        return;
      }

      const log: NetworkRequestLog = {
        id: details.requestId,
        timestamp: Date.now(),
        tabId: details.tabId,
        method: details.method,
        url: details.url,
        type: details.type,
        timing: {
          startTime: details.timeStamp,
        },
        requestHeaders: {},
      };

      monitoringState.requestMap.set(details.requestId, log);
      return;
    },
    { urls: ["<all_urls>"] },
    [],
  );

  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      if (tabId && details.tabId !== tabId) {
        return;
      }

      const log = monitoringState.requestMap.get(details.requestId);
      if (log && details.requestHeaders) {
        const headers: Record<string, string> = {};
        details.requestHeaders.forEach((header) => {
          headers[header.name] = header.value || "";
        });
        log.requestHeaders = headers;
      }
    },
    { urls: ["<all_urls>"] },
    ["requestHeaders"],
  );

  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (tabId && details.tabId !== tabId) {
        return;
      }

      const log = monitoringState.requestMap.get(details.requestId);
      if (log) {
        log.status = details.statusCode;
        log.statusText = details.statusLine;
        log.timing!.endTime = details.timeStamp;
        log.timing!.durationMs = details.timeStamp - log.timing!.startTime;

        if (details.responseHeaders) {
          const headers: Record<string, string> = {};
          details.responseHeaders.forEach((header) => {
            headers[header.name] = header.value || "";
          });
          log.headers = headers;
        }

        // Store in logs
        if (!monitoringState.logs.has(details.tabId)) {
          monitoringState.logs.set(details.tabId, []);
        }
        monitoringState.logs.get(details.tabId)!.push(log);

        // Clean up request map
        monitoringState.requestMap.delete(details.requestId);
      }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders"],
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (tabId && details.tabId !== tabId) {
        return;
      }

      const log = monitoringState.requestMap.get(details.requestId);
      if (log) {
        log.error = details.error;
        log.timing!.endTime = details.timeStamp;
        log.timing!.durationMs = details.timeStamp - log.timing!.startTime;

        // Store in logs
        if (!monitoringState.logs.has(details.tabId)) {
          monitoringState.logs.set(details.tabId, []);
        }
        monitoringState.logs.get(details.tabId)!.push(log);

        // Clean up request map
        monitoringState.requestMap.delete(details.requestId);
      }
    },
    { urls: ["<all_urls>"] },
  );
}

/**
 * Stop network monitoring and return captured logs
 */
export function stopNetworkMonitoring(tabId?: number): NetworkRequestLog[] {
  if (!monitoringState.isMonitoring) {
    return [];
  }

  monitoringState.isMonitoring = false;

  // Get logs for specific tab or all tabs
  let logs: NetworkRequestLog[] = [];
  if (tabId !== undefined) {
    logs = monitoringState.logs.get(tabId) || [];
    monitoringState.logs.delete(tabId);
  } else {
    monitoringState.logs.forEach((tabLogs) => {
      logs.push(...tabLogs);
    });
    monitoringState.logs.clear();
  }

  // Clear request map
  monitoringState.requestMap.clear();

  return logs;
}

/**
 * Get current network monitoring logs without stopping
 */
export function getNetworkLogs(tabId?: number): NetworkRequestLog[] {
  if (tabId !== undefined) {
    return monitoringState.logs.get(tabId) || [];
  }

  const logs: NetworkRequestLog[] = [];
  monitoringState.logs.forEach((tabLogs) => {
    logs.push(...tabLogs);
  });
  return logs;
}

/**
 * Check if network monitoring is active
 */
export function isNetworkMonitoringActive(): boolean {
  return monitoringState.isMonitoring;
}

/**
 * Convenience methods for common HTTP verbs
 */
export async function get<T = any>(
  url: string,
  options?: Omit<ApiRequestOptions, "method" | "url">,
): Promise<ApiResponse<T>> {
  return apiRequest<T>({ ...options, method: "GET", url });
}

export async function post<T = any>(
  url: string,
  body?: any,
  options?: Omit<ApiRequestOptions, "method" | "url" | "body">,
): Promise<ApiResponse<T>> {
  return apiRequest<T>({ ...options, method: "POST", url, body });
}

export async function put<T = any>(
  url: string,
  body?: any,
  options?: Omit<ApiRequestOptions, "method" | "url" | "body">,
): Promise<ApiResponse<T>> {
  return apiRequest<T>({ ...options, method: "PUT", url, body });
}

export async function patch<T = any>(
  url: string,
  body?: any,
  options?: Omit<ApiRequestOptions, "method" | "url" | "body">,
): Promise<ApiResponse<T>> {
  return apiRequest<T>({ ...options, method: "PATCH", url, body });
}

export async function del<T = any>(
  url: string,
  options?: Omit<ApiRequestOptions, "method" | "url">,
): Promise<ApiResponse<T>> {
  return apiRequest<T>({ ...options, method: "DELETE", url });
}
