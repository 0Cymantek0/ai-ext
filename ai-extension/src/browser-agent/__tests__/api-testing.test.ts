/**
 * API Testing Tools Unit Tests
 * Tests for HTTP request utilities, retry logic, auth token management, and network monitoring
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  apiRequest,
  get,
  post,
  put,
  patch,
  del,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  startNetworkMonitoring,
  stopNetworkMonitoring,
  getNetworkLogs,
  isNetworkMonitoringActive,
  type ApiResponse,
  type NetworkRequestLog,
  type ApiRequestOptions,
} from "../api-testing.js";
import { z } from "zod";

// Mock chrome APIs
global.chrome = {
  storage: {
    session: {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  },
  scripting: {
    executeScript: vi.fn(),
  },
  webRequest: {
    onBeforeRequest: {
      addListener: vi.fn(),
    },
    onSendHeaders: {
      addListener: vi.fn(),
    },
    onCompleted: {
      addListener: vi.fn(),
    },
    onErrorOccurred: {
      addListener: vi.fn(),
    },
  },
} as any;

// Mock fetch globally
global.fetch = vi.fn();

function createJsonResponse(
  data: any,
  overrides: Partial<{ status: number; statusText: string; headers: Headers; text: () => Promise<string> } & Record<string, any>> = {},
): any {
  const jsonString = JSON.stringify(data);
  const response = {
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    text: vi.fn().mockResolvedValue(jsonString),
    json: vi.fn().mockResolvedValue(data),
  };

  return Object.assign(response, overrides);
}

describe("API Testing Tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  describe("Authentication Token Management", () => {
    it("should set auth token", async () => {
      await setAuthToken("test-token");
      
      expect(chrome.storage.session.set).toHaveBeenCalledWith({
        browser_agent_auth_token: "test-token",
      });
    });

    it("should get auth token", async () => {
      (chrome.storage.session.get as any).mockResolvedValue({
        browser_agent_auth_token: "test-token",
      });

      const token = await getAuthToken();
      
      expect(token).toBe("test-token");
      expect(chrome.storage.session.get).toHaveBeenCalledWith("browser_agent_auth_token");
    });

    it("should return null when no token is set", async () => {
      (chrome.storage.session.get as any).mockResolvedValue({});

      const token = await getAuthToken();
      
      expect(token).toBeNull();
    });

    it("should clear auth token", async () => {
      await clearAuthToken();
      
      expect(chrome.storage.session.remove).toHaveBeenCalledWith("browser_agent_auth_token");
    });
  });

  describe("API Request - Success Cases", () => {
    it("should make successful GET request", async () => {
      const mockResponse = createJsonResponse({ data: "test" });
      (global.fetch as any).mockResolvedValue(mockResponse);

      const options: ApiRequestOptions = {
        method: "GET",
        url: "https://api.example.com/data",
      };

      const response = await apiRequest(options);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: "test" });
      expect(response.bodyType).toBe("json");
      expect(response.timing.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should make successful POST request with JSON body", async () => {
      const mockResponse = createJsonResponse(
        { id: "123" },
        {
          status: 201,
          statusText: "Created",
        }
      );
      (global.fetch as any).mockResolvedValue(mockResponse);

      const options: ApiRequestOptions = {
        method: "POST",
        url: "https://api.example.com/items",
        body: { name: "Test Item" },
      };

      const response = await apiRequest(options);

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ id: "123" });
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/items",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Test Item" }),
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("should inject Authorization header when token is set", async () => {
      (chrome.storage.session.get as any).mockResolvedValue({
        browser_agent_auth_token: "test-token",
      });

      const mockResponse = createJsonResponse({ data: "protected" });
      (global.fetch as any).mockResolvedValue(mockResponse);

      const options: ApiRequestOptions = {
        method: "GET",
        url: "https://api.example.com/protected",
      };

      await apiRequest(options);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/protected",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should parse text responses", async () => {
      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/plain" }),
        text: vi.fn().mockResolvedValue("Plain text response"),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const response = await apiRequest({
        method: "GET",
        url: "https://api.example.com/text",
      });

      expect(response.body).toBe("Plain text response");
      expect(response.bodyType).toBe("text");
    });
  });

  describe("API Request - Error Handling", () => {
    it("should throw error on non-2xx status without retry for 4xx", async () => {
      const mockResponse = {
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("Not found"),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/missing",
          retryConfig: { maxRetries: 3, baseDelayMs: 10 },
        })
      ).rejects.toThrow("Request failed with status 404");

      // Should not retry on 404
      expect(global.fetch).toHaveBeenCalledTimes(1);
    }, 10000);

    it("should timeout when request takes too long", async () => {
      (global.fetch as any).mockImplementation((_, init) => {
        return new Promise((resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener("abort", () => {
              const error = new Error("Aborted");
              (error as any).name = "AbortError";
              reject(error);
            });
          }
          // Never resolve to simulate hang until aborted
        });
      });

      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/slow",
          timeout: 50,
          retryConfig: { maxRetries: 0 },
        })
      ).rejects.toThrow("timeout");
    }, 10000);

    it("should handle network errors", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/data",
          retryConfig: { maxRetries: 0 },
        })
      ).rejects.toThrow("Network error");
    });
  });

  describe("API Request - Retry Logic", () => {
    it("should retry on 500 server errors", async () => {
      const mockError = {
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("Error"),
      };
      const mockSuccess = createJsonResponse({ data: "success" });

      (global.fetch as any)
        .mockResolvedValueOnce(mockError)
        .mockResolvedValueOnce(mockError)
        .mockResolvedValueOnce(mockSuccess);

      const response = await apiRequest({
        method: "GET",
        url: "https://api.example.com/data",
        retryConfig: {
          maxRetries: 3,
          baseDelayMs: 10,
          exponentialBackoff: false,
        },
      });

      expect(response.status).toBe(200);
      expect(response.retryCount).toBe(2);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it("should retry on 429 (Too Many Requests)", async () => {
      const mockRateLimited = {
        status: 429,
        statusText: "Too Many Requests",
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("Rate limited"),
      };
      const mockSuccess = createJsonResponse({ data: "success" });

      (global.fetch as any)
        .mockResolvedValueOnce(mockRateLimited)
        .mockResolvedValueOnce(mockSuccess);

      const response = await apiRequest({
        method: "GET",
        url: "https://api.example.com/data",
        retryConfig: {
          maxRetries: 2,
          baseDelayMs: 10,
          exponentialBackoff: false,
        },
      });

      expect(response.status).toBe(200);
      expect(response.retryCount).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("should not retry on 4xx errors (except 429)", async () => {
      const mockResponse = {
        status: 400,
        statusText: "Bad Request",
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("Bad request"),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/data",
          retryConfig: { maxRetries: 3, baseDelayMs: 10 },
        })
      ).rejects.toThrow("Request failed with status 400");

      expect(global.fetch).toHaveBeenCalledTimes(1);
    }, 10000);

    it("should use exponential backoff for retries", async () => {
      const mockError = {
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        text: vi.fn().mockResolvedValue("Error"),
      };

      (global.fetch as any).mockResolvedValue(mockError);

      const startTime = Date.now();
      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/data",
          retryConfig: {
            maxRetries: 2,
            baseDelayMs: 50,
            maxDelayMs: 500,
            exponentialBackoff: true,
          },
        })
      ).rejects.toThrow();

      const duration = Date.now() - startTime;
      // With exponential backoff: 50ms + 100ms = at least 150ms
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe("Schema Validation", () => {
    it("should validate response with zod schema", async () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const mockResponse = createJsonResponse({ id: "123", name: "Test" });
      (global.fetch as any).mockResolvedValue(mockResponse);

      const response = await apiRequest({
        method: "GET",
        url: "https://api.example.com/item",
        schema,
      });

      expect(response.body).toEqual({ id: "123", name: "Test" });
    });

    it("should throw error when response doesn't match schema", async () => {
      const schema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const mockResponse = createJsonResponse({ id: "123" }); // Missing 'name'
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        apiRequest({
          method: "GET",
          url: "https://api.example.com/item",
          schema,
        })
      ).rejects.toThrow("Response validation failed");
    });
  });

  describe("Convenience Methods", () => {
    beforeEach(() => {
      const mockResponse = createJsonResponse({ success: true });
      (global.fetch as any).mockResolvedValue(mockResponse);
    });

    it("should use GET method", async () => {
      await get("https://api.example.com/data");
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("should use POST method with body", async () => {
      await post("https://api.example.com/data", { key: "value" });
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ key: "value" }),
        })
      );
    });

    it("should use PUT method with body", async () => {
      await put("https://api.example.com/data", { key: "value" });
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ key: "value" }),
        })
      );
    });

    it("should use PATCH method with body", async () => {
      await patch("https://api.example.com/data", { key: "value" });
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ key: "value" }),
        })
      );
    });

    it("should use DELETE method", async () => {
      await del("https://api.example.com/data");
      
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("Network Monitoring", () => {
    it("should start network monitoring", () => {
      startNetworkMonitoring();
      
      expect(chrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onSendHeaders.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
      expect(chrome.webRequest.onErrorOccurred.addListener).toHaveBeenCalled();
      expect(isNetworkMonitoringActive()).toBe(true);
    });

    it("should stop network monitoring and return logs", () => {
      startNetworkMonitoring();
      const logs = stopNetworkMonitoring();
      
      expect(Array.isArray(logs)).toBe(true);
      expect(isNetworkMonitoringActive()).toBe(false);
    });

    it("should filter logs by tabId", () => {
      startNetworkMonitoring(123);
      const logs = stopNetworkMonitoring(123);
      
      expect(Array.isArray(logs)).toBe(true);
    });

    it("should get logs without stopping monitoring", () => {
      startNetworkMonitoring();
      const logs = getNetworkLogs();
      
      expect(Array.isArray(logs)).toBe(true);
      expect(isNetworkMonitoringActive()).toBe(true);
    });
  });

  describe("Custom validateStatus", () => {
    it("should use custom status validator", async () => {
      const mockResponse = createJsonResponse(
        { error: "not found" },
        {
          status: 404,
          statusText: "Not Found",
        }
      );
      (global.fetch as any).mockResolvedValue(mockResponse);

      // Accept 404 as valid
      const response = await apiRequest({
        method: "GET",
        url: "https://api.example.com/data",
        validateStatus: (status) => status === 404,
      });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "not found" });
    });
  });

  describe("Custom Headers", () => {
    it("should include custom headers", async () => {
      const mockResponse = createJsonResponse({ data: "test" });
      (global.fetch as any).mockResolvedValue(mockResponse);

      await apiRequest({
        method: "GET",
        url: "https://api.example.com/data",
        headers: {
          "X-Custom-Header": "custom-value",
          "X-Api-Key": "secret-key",
        },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.example.com/data",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom-Header": "custom-value",
            "X-Api-Key": "secret-key",
          }),
        })
      );
    });
  });
});
