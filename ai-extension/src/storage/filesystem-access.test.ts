import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../background/monitoring.js", () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { logger };
});

vi.mock("../background/storage-wrapper.js", () => {
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
  FilesystemAccessService,
  FS_ACCESS_STORAGE_KEY,
} from "./filesystem-access.js";

interface StorageMock {
  store: Record<string, any>;
  get: (keys?: string | string[] | null) => Promise<Record<string, any>>;
  set: (items: Record<string, any>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
}

describe("FilesystemAccessService", () => {
  let storage: StorageMock;
  let directoryHandle: MockDirectoryHandle;
  let picker: ReturnType<typeof vi.fn>;
  let service: FilesystemAccessService;

  beforeEach(() => {
    storage = createStorageMock();
    directoryHandle = new MockDirectoryHandle("root", {
      initialPermission: "prompt",
      requestSequence: ["granted"],
    });
    picker = vi.fn(async () => directoryHandle);
    service = new FilesystemAccessService({
      storage,
      directoryPicker: picker,
      now: () => 1_700_000_000_000,
    });
  });

  it("returns unsupported when API absent and no picker override", async () => {
    const localService = new FilesystemAccessService({ storage });
    delete (globalThis as any).showDirectoryPicker;

    const result = await localService.requestFileSystemAccess();
    expect(result).toEqual({ granted: false, reason: "unsupported" });
  });

  it("requests access through injected picker and persists grant", async () => {
    const result = await service.requestFileSystemAccess();
    expect(result.granted).toBe(true);
    expect(picker).toHaveBeenCalledWith({
      id: "workspace",
      mode: "readwrite",
      startIn: undefined,
      suggestedName: "AI Pocket",
    });

    expect(storage.set).toHaveBeenCalledWith({
      [FS_ACCESS_STORAGE_KEY]: expect.objectContaining({
        workspace: expect.objectContaining({
          granted: true,
          timestamp: 1_700_000_000_000,
        }),
      }),
    });

    const availability = await service.hasFileSystemAccess();
    expect(availability).toEqual({ available: true });
  });

  it("writes, reads, and deletes files relative to application directory", async () => {
    await service.requestFileSystemAccess();

    const writeResult = await service.saveFile({
      relativePath: "pockets/demo/entry.txt",
      data: "hello world",
      encoding: "utf-8",
    });

    expect(writeResult).toEqual({
      success: true,
      path: "AI Pocket/pockets/demo/entry.txt",
      handleId: "workspace",
      bytesWritten: 11,
      mimeType: undefined,
    });

    const readResult = await service.readFile({
      relativePath: "pockets/demo/entry.txt",
      encoding: "utf-8",
    });

    expect(readResult.success).toBe(true);
    expect(readResult.path).toBe("AI Pocket/pockets/demo/entry.txt");
    expect(readResult.text).toBe("hello world");

    const deleteResult = await service.deleteFile({
      relativePath: "pockets/demo/entry.txt",
    });
    expect(deleteResult).toEqual({
      success: true,
      path: "AI Pocket/pockets/demo/entry.txt",
      handleId: "workspace",
    });

    const missingResult = await service.readFile({
      relativePath: "pockets/demo/entry.txt",
    });
    expect(missingResult.success).toBe(false);
    expect(missingResult.reason).toBe("not-found");
  });

  it("rejects path traversal attempts", async () => {
    await service.requestFileSystemAccess();

    const result = await service.saveFile({
      relativePath: "../escape/system.txt",
      data: "blocked",
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("invalid-path");
  });

  it("reports missing handle when save invoked before grant", async () => {
    const result = await service.saveFile({
      relativePath: "pockets/first.txt",
      data: "pending",
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("missing-handle");
  });

  it("handles permission denial gracefully", async () => {
    directoryHandle = new MockDirectoryHandle("root-denied", {
      initialPermission: "prompt",
      requestSequence: ["denied"],
    });
    picker.mockResolvedValueOnce(directoryHandle);

    const result = await service.requestFileSystemAccess();
    expect(result).toEqual({ granted: false, reason: "denied" });
    expect(storage.remove).toHaveBeenCalledWith(FS_ACCESS_STORAGE_KEY);
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
  } satisfies StorageMock;
}

type FsPermissionState = "granted" | "prompt" | "denied";

class MockDirectoryHandle {
  readonly name: string;
  private permissionState: FsPermissionState;
  private requestSequence: FsPermissionState[];
  private directories = new Map<string, MockDirectoryHandle>();
  private files = new Map<string, MockFileHandle>();

  constructor(
    name: string,
    options: {
      initialPermission?: FsPermissionState;
      requestSequence?: FsPermissionState[];
    } = {},
  ) {
    this.name = name;
    this.permissionState = options.initialPermission ?? "granted";
    this.requestSequence = [...(options.requestSequence ?? [])];
  }

  queryPermission = vi.fn(async () => this.permissionState);

  requestPermission = vi.fn(async () => {
    const next = this.requestSequence.shift();
    if (next) {
      this.permissionState = next;
      return next;
    }
    this.permissionState = "granted";
    return "granted";
  });

  getDirectoryHandle = vi.fn(
    async (
      name: string,
      options: { create?: boolean } = {},
    ): Promise<MockDirectoryHandle> => {
      const existing = this.directories.get(name);
      if (existing) {
        return existing;
      }

      if (!options.create) {
        throw createDomException("NotFoundError");
      }

      const child = new MockDirectoryHandle(name, {
        initialPermission: this.permissionState,
        requestSequence: [...this.requestSequence],
      });
      this.directories.set(name, child);
      return child;
    },
  );

  getFileHandle = vi.fn(
    async (name: string, options: { create?: boolean } = {}): Promise<MockFileHandle> => {
      const existing = this.files.get(name);
      if (existing) {
        return existing;
      }

      if (!options.create) {
        throw createDomException("NotFoundError");
      }

      const file = new MockFileHandle(name);
      this.files.set(name, file);
      return file;
    },
  );

  removeEntry = vi.fn(async (name: string) => {
    if (this.files.delete(name) || this.directories.delete(name)) {
      return;
    }
    throw createDomException("NotFoundError");
  });
}

class MockFileHandle {
  readonly name: string;
  private data = new Uint8Array();
  private mimeType?: string;
  private lastModified = Date.now();

  constructor(name: string) {
    this.name = name;
  }

  createWritable = vi.fn(async () => {
    return {
      write: vi.fn(async (payload: Blob | ArrayBuffer | Uint8Array | string) => {
        const bytes = await toUint8Array(payload);
        this.data = bytes;
        this.mimeType = payload instanceof Blob ? payload.type : undefined;
      }),
      close: vi.fn(async () => {
        this.lastModified = Date.now();
      }),
    };
  });

  getFile = vi.fn(async () => {
    const buffer = this.data.slice().buffer;
    const decoder = new TextDecoder();
    return {
      arrayBuffer: async () => buffer.slice(0),
      text: async () => decoder.decode(this.data),
      size: this.data.byteLength,
      type: this.mimeType ?? "application/octet-stream",
      lastModified: this.lastModified,
    };
  });
}

async function toUint8Array(
  payload: Blob | ArrayBuffer | Uint8Array | string,
): Promise<Uint8Array> {
  if (typeof Blob !== "undefined" && payload instanceof Blob) {
    const buffer = await payload.arrayBuffer();
    return new Uint8Array(buffer);
  }

  if (payload instanceof ArrayBuffer) {
    return new Uint8Array(payload);
  }

  if (payload instanceof Uint8Array) {
    return payload;
  }

  if (typeof payload === "string") {
    const encoder = new TextEncoder();
    return encoder.encode(payload);
  }

  throw new TypeError("Unsupported payload type");
}

function createDomException(name: string): Error {
  if (typeof DOMException === "function") {
    return new DOMException(name, name);
  }
  const error = new Error(name);
  error.name = name;
  return error;
}
