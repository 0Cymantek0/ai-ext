/**
 * Unit tests for dialogs module
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  handleAlert,
  handleConfirm,
  handlePrompt,
  resolveDialog,
  getPendingDialogs,
  setDialogConfig,
  getDialogConfig,
  requestFileUpload,
  resolveFileUpload,
  rejectFileUpload,
  getPendingFileUploads,
  getCookies,
  setCookie,
  removeCookie,
  checkPermissions,
  requestPermissions,
  type DialogResponse,
} from "../dialogs.js";

// Mock Chrome APIs
global.chrome = {
  cookies: {
    getAll: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
  },
  downloads: {
    download: vi.fn(),
  },
} as any;

describe("Dialog Queue Management", () => {
  beforeEach(() => {
    // Reset dialog config
    setDialogConfig({
      autoAcceptAlerts: false,
      autoAcceptConfirms: false,
      autoAcceptPromptsWithDefault: false,
    });
  });

  it("should queue an alert dialog", async () => {
    const alertPromise = handleAlert("Test alert");
    const pending = getPendingDialogs();
    
    expect(pending.length).toBe(1);
    expect(pending[0]?.type).toBe("alert");
    expect(pending[0]?.message).toBe("Test alert");

    // Resolve the alert
    if (pending[0]) {
      resolveDialog(pending[0].id, {
        id: pending[0].id,
        type: "alert",
        accepted: true,
      });
    }

    await alertPromise;
    expect(getPendingDialogs().length).toBe(0);
  });

  it("should queue a confirm dialog", async () => {
    const confirmPromise = handleConfirm("Are you sure?");
    const pending = getPendingDialogs();
    
    expect(pending.length).toBe(1);
    expect(pending[0]?.type).toBe("confirm");
    expect(pending[0]?.message).toBe("Are you sure?");

    // Resolve the confirm with true
    if (pending[0]) {
      resolveDialog(pending[0].id, {
        id: pending[0].id,
        type: "confirm",
        accepted: true,
      });
    }

    const result = await confirmPromise;
    expect(result).toBe(true);
  });

  it("should queue a prompt dialog", async () => {
    const promptPromise = handlePrompt("Enter your name", "John");
    const pending = getPendingDialogs();
    
    expect(pending.length).toBe(1);
    expect(pending[0]?.type).toBe("prompt");
    expect(pending[0]?.message).toBe("Enter your name");
    expect(pending[0]?.defaultValue).toBe("John");

    // Resolve the prompt with a value
    if (pending[0]) {
      resolveDialog(pending[0].id, {
        id: pending[0].id,
        type: "prompt",
        accepted: true,
        value: "Jane",
      });
    }

    const result = await promptPromise;
    expect(result).toBe("Jane");
  });

  it("should auto-accept alerts when configured", async () => {
    setDialogConfig({ autoAcceptAlerts: true });
    
    const alertPromise = handleAlert("Test alert");
    
    // Should resolve immediately
    await alertPromise;
    expect(getPendingDialogs().length).toBe(0);
  });

  it("should auto-accept confirms when configured", async () => {
    setDialogConfig({ autoAcceptConfirms: true });
    
    const confirmPromise = handleConfirm("Are you sure?");
    const result = await confirmPromise;
    
    expect(result).toBe(true);
    expect(getPendingDialogs().length).toBe(0);
  });

  it("should auto-accept prompts with default when configured", async () => {
    setDialogConfig({ autoAcceptPromptsWithDefault: true });
    
    const promptPromise = handlePrompt("Enter your name", "Default");
    const result = await promptPromise;
    
    expect(result).toBe("Default");
    expect(getPendingDialogs().length).toBe(0);
  });

  it("should reject prompt when declined", async () => {
    const promptPromise = handlePrompt("Enter your name");
    const pending = getPendingDialogs();
    
    if (pending[0]) {
      resolveDialog(pending[0].id, {
        id: pending[0].id,
        type: "prompt",
        accepted: false,
      });
    }

    const result = await promptPromise;
    expect(result).toBeNull();
  });

  it("should get and set dialog config", () => {
    const config = {
      autoAcceptAlerts: true,
      autoAcceptConfirms: false,
      autoAcceptPromptsWithDefault: true,
      defaultTimeout: 60000,
    };

    setDialogConfig(config);
    const retrievedConfig = getDialogConfig();
    
    expect(retrievedConfig).toEqual(config);
  });
});

describe("File Upload Management", () => {
  it("should queue a file upload request", async () => {
    const uploadPromise = requestFileUpload("Please upload a file", {
      acceptedTypes: ".pdf,.doc",
      tabId: 1,
    });

    const pending = getPendingFileUploads();
    expect(pending.length).toBe(1);
    expect(pending[0]?.message).toBe("Please upload a file");
    expect(pending[0]?.acceptedTypes).toBe(".pdf,.doc");

    // Resolve the file upload
    if (pending[0]) {
      resolveFileUpload(pending[0].id, "/path/to/file.pdf");
    }

    const filePath = await uploadPromise;
    expect(filePath).toBe("/path/to/file.pdf");
    expect(getPendingFileUploads().length).toBe(0);
  });

  it("should reject a file upload request", async () => {
    const uploadPromise = requestFileUpload("Please upload a file");
    const pending = getPendingFileUploads();

    if (pending[0]) {
      rejectFileUpload(pending[0].id, new Error("User cancelled"));
    }

    await expect(uploadPromise).rejects.toThrow("User cancelled");
    expect(getPendingFileUploads().length).toBe(0);
  });
});

describe("Cookie Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should get cookies", async () => {
    const mockCookies = [
      { name: "session", value: "abc123", domain: ".example.com" },
    ];
    (chrome.cookies.getAll as any).mockResolvedValue(mockCookies);

    const cookies = await getCookies({ domain: ".example.com" });
    
    expect(chrome.cookies.getAll).toHaveBeenCalledWith({
      domain: ".example.com",
    });
    expect(cookies).toEqual(mockCookies);
  });

  it("should set a cookie", async () => {
    const mockCookie = { name: "test", value: "value", domain: ".example.com" };
    (chrome.cookies.set as any).mockResolvedValue(mockCookie);

    const cookie = await setCookie({
      url: "https://example.com",
      name: "test",
      value: "value",
      domain: ".example.com",
    });

    expect(chrome.cookies.set).toHaveBeenCalledWith({
      url: "https://example.com",
      name: "test",
      value: "value",
      domain: ".example.com",
    });
    expect(cookie).toEqual(mockCookie);
  });

  it("should remove a cookie", async () => {
    const mockResult = { url: "https://example.com", name: "test" };
    (chrome.cookies.remove as any).mockResolvedValue(mockResult);

    const result = await removeCookie("https://example.com", "test");

    expect(chrome.cookies.remove).toHaveBeenCalledWith({
      url: "https://example.com",
      name: "test",
    });
    expect(result).toEqual(mockResult);
  });

  it("should handle cookie permission errors", async () => {
    (chrome.cookies.getAll as any).mockRejectedValue(
      new Error("Missing cookies permission")
    );

    await expect(getCookies()).rejects.toThrow(
      'Permission denied: "cookies" permission required'
    );
  });
});

describe("Permission Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should check permissions", async () => {
    (chrome.permissions.contains as any)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const results = await checkPermissions(["notifications", "geolocation"]);

    expect(results).toEqual({
      notifications: true,
      geolocation: false,
    });
    expect(chrome.permissions.contains).toHaveBeenCalledTimes(2);
  });

  it("should request permissions", async () => {
    (chrome.permissions.request as any).mockResolvedValue(true);

    const granted = await requestPermissions(["notifications"]);

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      permissions: ["notifications"],
    });
    expect(granted).toBe(true);
  });

  it("should handle permission request rejection", async () => {
    (chrome.permissions.request as any).mockResolvedValue(false);

    const granted = await requestPermissions(["geolocation"]);

    expect(granted).toBe(false);
  });
});
