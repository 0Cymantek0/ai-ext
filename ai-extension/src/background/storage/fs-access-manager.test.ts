import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../monitoring.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger };
});

vi.mock("../storage-wrapper.js", () => {
  class MockChromeLocalStorage {
    get = vi.fn(async () => ({}));
    set = vi.fn(async () => {});
    remove = vi.fn(async () => {});
  }

  return {
    ChromeLocalStorage: MockChromeLocalStorage,
  };
});

import {
  FsAccessManager,
  registerFsAccessHandlers,
  FS_ACCESS_STORAGE_KEY,
  type DirectoryHandleLike,
} from "./fs-access-manager.js";
import { logger } from "../monitoring.js";

type StorageMock = ReturnType<typeof createStorageMock>;

describe("FsAccessManager", () => {
  let storage: StorageMock;

  beforeEach(() => {
    storage = createStorageMock();
    vi.clearAllMocks();
    delete (globalThis as any).showDirectoryPicker;
  });

  afterEach(() => {
    delete (globalThis as any).showDirectoryPicker;
  });

  it("returns unsupported when File System Access API missing", async () => {
    const manager = new FsAccessManager(storage);

    expect(manager.isSupported()).toBe(false);
    const result = await manager.requestDirectoryAccess();
    expect(result).toEqual({ granted: false, reason: "unsupported" });
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("persists granted permission after successful request", async () => {
    const handle = createHandle({ query: "granted" });
    (globalThis as any).showDirectoryPicker = vi.fn().mockResolvedValue(handle);

    const manager = new FsAccessManager(storage);
    const result = await manager.requestDirectoryAccess();

    expect(result.granted).toBe(true);
    expect(storage.set).toHaveBeenCalledWith({
      [FS_ACCESS_STORAGE_KEY]: expect.objectContaining({
        workspace: expect.objectContaining({ granted: true }),
      }),
    });
    expect(storage.store[FS_ACCESS_STORAGE_KEY]?.workspace?.granted).toBe(true);
    expect(handle.queryPermission).toHaveBeenCalled();
  });

  it("requests permission when query returns prompt", async () => {
    const handle = createHandle({ query: "prompt", request: "granted" });
    (globalThis as any).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(handle);

    const manager = new FsAccessManager(storage);
    const result = await manager.requestDirectoryAccess();

    expect(result.granted).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("handles user cancellation gracefully", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    (globalThis as any).showDirectoryPicker = vi
      .fn()
      .mockRejectedValue(abortError);

    const manager = new FsAccessManager(storage);
    const result = await manager.requestDirectoryAccess();

    expect(result).toEqual({ granted: false, reason: "aborted" });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "FilesystemAccessService",
      "Directory picker request failed",
      expect.objectContaining({ reason: "aborted" }),
    );
  });

  it("clears state when permission revoked", async () => {
    const handle = createHandle({ query: "prompt", request: "denied" });
    (globalThis as any).showDirectoryPicker = vi
      .fn()
      .mockResolvedValue(handle);

    const manager = new FsAccessManager(storage);
    const requestResult = await manager.requestDirectoryAccess();

    expect(requestResult.granted).toBe(false);
    expect(requestResult.reason).toBe("denied");
    expect(storage.remove).toHaveBeenCalledWith(FS_ACCESS_STORAGE_KEY);
  });

  it("reports availability when cached handle retains permission", async () => {
    const handle = createHandle({ query: "granted" });
    const manager = new FsAccessManager(storage);
    (manager as any).setHandle("workspace", handle);

    const result = await manager.hasValidAccess();
    expect(result).toEqual({ available: true });
  });

  it("detects missing handle when flag persists", async () => {
    storage.store[FS_ACCESS_STORAGE_KEY] = {
      workspace: { granted: true, timestamp: Date.now() },
    };
    const manager = new FsAccessManager(storage);

    const result = await manager.hasValidAccess();
    expect(result).toEqual({ available: false, reason: "missing-handle" });
  });

  it("supports legacy persisted flag structure", async () => {
    storage.store[FS_ACCESS_STORAGE_KEY] = { granted: true, timestamp: Date.now() };
    const manager = new FsAccessManager(storage);

    const result = await manager.hasValidAccess();
    expect(result).toEqual({ available: false, reason: "missing-handle" });
  });

  it("clears cached state on revoke", async () => {
    storage.store[FS_ACCESS_STORAGE_KEY] = {
      workspace: { granted: true, timestamp: Date.now() },
    };
    const manager = new FsAccessManager(storage);

    const result = await manager.revokeAccess();

    expect(result).toEqual({ revoked: true });
    expect(storage.remove).toHaveBeenCalledWith(FS_ACCESS_STORAGE_KEY);
  });
});

describe("registerFsAccessHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns granted response when helper succeeds", async () => {
    const router = createRouterMock();
    const manager = {
      requestDirectoryAccess: vi.fn().mockResolvedValue({ granted: true }),
      hasValidAccess: vi.fn().mockResolvedValue({ available: true }),
      revokeAccess: vi.fn().mockResolvedValue({ revoked: true }),
    };

    registerFsAccessHandlers(router as any, manager as any);

    expect(router.registerHandler).toHaveBeenCalledTimes(3);
    expect(router.handlers.has("STORAGE_REQUEST_FS_ACCESS")).toBe(true);
    expect(router.handlers.has("STORAGE_CHECK_FS_ACCESS")).toBe(true);
    expect(router.handlers.has("STORAGE_REVOKE_FS_ACCESS")).toBe(true);

    const requestHandler = router.handlers.get("STORAGE_REQUEST_FS_ACCESS");
    const response = await requestHandler({});

    expect(response).toEqual({ granted: true });
    expect(manager.requestDirectoryAccess).toHaveBeenCalled();
  });

  it("includes reason when helper denies access", async () => {
    const router = createRouterMock();
    const manager = {
      requestDirectoryAccess: vi
        .fn()
        .mockResolvedValue({ granted: false, reason: "denied" }),
      hasValidAccess: vi.fn().mockResolvedValue({ available: false, reason: "denied" }),
      revokeAccess: vi.fn().mockResolvedValue({ revoked: false, reason: "error" }),
    };

    registerFsAccessHandlers(router as any, manager as any);

    const requestHandler = router.handlers.get("STORAGE_REQUEST_FS_ACCESS");
    const requestResponse = await requestHandler({});
    expect(requestResponse).toEqual({ granted: false, reason: "denied" });

    const checkHandler = router.handlers.get("STORAGE_CHECK_FS_ACCESS");
    const checkResponse = await checkHandler({});
    expect(checkResponse).toEqual({ available: false, reason: "denied" });

    const revokeHandler = router.handlers.get("STORAGE_REVOKE_FS_ACCESS");
    const revokeResponse = await revokeHandler({});
    expect(revokeResponse).toEqual({ revoked: false, reason: "error" });
  });

  it("handles helper exceptions gracefully", async () => {
    const router = createRouterMock();
    const failingManager = {
      requestDirectoryAccess: vi.fn().mockRejectedValue(new Error("boom")),
      hasValidAccess: vi.fn().mockRejectedValue(new Error("boom")),
      revokeAccess: vi.fn().mockRejectedValue(new Error("boom")),
    };

    registerFsAccessHandlers(router as any, failingManager as any);

    const requestResponse = await router.handlers
      .get("STORAGE_REQUEST_FS_ACCESS")
      ?.({});
    expect(requestResponse).toEqual({ granted: false, reason: "error" });

    const checkResponse = await router.handlers
      .get("STORAGE_CHECK_FS_ACCESS")
      ?.({});
    expect(checkResponse).toEqual({ available: false, reason: "error" });

    const revokeResponse = await router.handlers
      .get("STORAGE_REVOKE_FS_ACCESS")
      ?.({});
    expect(revokeResponse).toEqual({ revoked: false, reason: "error" });

    expect(logger.error).toHaveBeenCalledTimes(3);
  });
});

function createStorageMock() {
  const store: Record<string, any> = {};

  return {
    store,
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (!keys) {
        return { ...store };
      }

      if (typeof keys === "string") {
        return store[keys] ? { [keys]: store[keys] } : {};
      }

      const result: Record<string, any> = {};
      for (const key of keys) {
        if (store[key] !== undefined) {
          result[key] = store[key];
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, any>) => {
      Object.assign(store, items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        delete store[key];
      }
    }),
  };
}

function createHandle(options: {
  query?: "granted" | "prompt" | "denied";
  request?: "granted" | "prompt" | "denied";
}): DirectoryHandleLike {
  return {
    queryPermission: vi
      .fn()
      .mockResolvedValue(options.query ?? "granted"),
    requestPermission: vi
      .fn()
      .mockResolvedValue(options.request ?? "granted"),
  };
}

function createRouterMock() {
  const handlers = new Map<string, (payload: unknown) => any>();
  return {
    handlers,
    registerHandler: vi.fn((kind: string, handler: (payload: unknown) => any) => {
      handlers.set(kind, handler);
    }),
  };
}
