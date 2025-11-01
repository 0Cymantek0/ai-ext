/**
 * Filesystem Access Service
 * Provides higher-level helpers around Chrome's File System Access API for
 * tiered storage operations while reusing existing permission lifecycle logic.
 */

import { ChromeLocalStorage } from "../background/storage-wrapper.js";
import { logger } from "../background/monitoring.js";

export const FS_ACCESS_STORAGE_KEY = "fsAccess.directory.granted";

export type FsPermissionMode = "read" | "readwrite";
export type FsPermissionState = "granted" | "denied" | "prompt";

interface FsPermissionDescriptor {
  mode?: FsPermissionMode;
}

interface FsPermissionCapable {
  queryPermission?: (
    descriptor?: FsPermissionDescriptor,
  ) => Promise<FsPermissionState | undefined>;
  requestPermission?: (
    descriptor?: FsPermissionDescriptor,
  ) => Promise<FsPermissionState | undefined>;
}

export interface FileLike {
  arrayBuffer: () => Promise<ArrayBuffer>;
  text?: () => Promise<string>;
  size?: number;
  type?: string;
  lastModified?: number;
}

export interface FileWritableLike {
  write: (data: Blob | ArrayBuffer | Uint8Array | string) => Promise<void>;
  close: () => Promise<void>;
}

export interface FileHandleLike extends FsPermissionCapable {
  readonly name?: string;
  getFile?: () => Promise<FileLike>;
  createWritable?: () => Promise<FileWritableLike>;
}

export interface DirectoryHandleLike extends FsPermissionCapable {
  readonly name?: string;
  getDirectoryHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<DirectoryHandleLike>;
  getFileHandle?: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<FileHandleLike>;
  removeEntry?: (
    name: string,
    options?: { recursive?: boolean },
  ) => Promise<void>;
}

interface LocalStorageLike
  extends Pick<ChromeLocalStorage, "get" | "set" | "remove"> {}

interface FsAccessStorageRecord {
  granted: boolean;
  timestamp: number;
}

type FsAccessStorageState = Record<string, FsAccessStorageRecord>;

type DirectoryPickerLike = (
  options?: DirectoryPickerOptions,
) => Promise<DirectoryHandleLike>;

interface DirectoryPickerOptions {
  id?: string;
  mode?: FsPermissionMode;
  startIn?: unknown;
  suggestedName?: string;
}

export interface FilesystemAccessRequestOptions {
  handleId?: string;
  mode?: FsPermissionMode;
  startIn?: unknown;
  suggestedName?: string;
}

export interface FilesystemAccessAvailabilityOptions {
  handleId?: string;
  mode?: FsPermissionMode;
}

export interface FilesystemAccessRevokeOptions {
  handleId?: string;
}

export interface FilesystemWriteOptions {
  handleId?: string;
  relativePath: string;
  data: Blob | ArrayBuffer | ArrayBufferView | Uint8Array | string;
  encoding?: "utf-8" | "base64";
  mimeType?: string;
}

export interface FilesystemDeleteOptions {
  handleId?: string;
  relativePath: string;
  recursive?: boolean;
}

export interface FilesystemReadOptions {
  handleId?: string;
  relativePath: string;
  encoding?: "utf-8" | "base64" | "binary";
}

export interface DirectoryAccessResult {
  granted: boolean;
  reason?: string;
  handle?: DirectoryHandleLike | null;
}

export interface AccessAvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface RevokeAccessResult {
  revoked: boolean;
  reason?: string;
}

export interface FileWriteResult {
  success: boolean;
  reason?: string;
  path: string;
  handleId: string;
  bytesWritten?: number;
  mimeType?: string;
}

export interface FileReadResult {
  success: boolean;
  reason?: string;
  path: string;
  handleId: string;
  data?: ArrayBuffer;
  text?: string;
  mimeType?: string;
  size?: number;
  lastModified?: number;
}

export interface FileDeleteResult {
  success: boolean;
  reason?: string;
  path: string;
  handleId: string;
}

export interface FilesystemAccessServiceOptions {
  storage?: LocalStorageLike;
  defaultHandleId?: string;
  rootDirectoryName?: string;
  directoryPicker?: DirectoryPickerLike;
  now?: () => number;
}

const DEFAULT_HANDLE_ID = "workspace";
const DEFAULT_ROOT_DIRECTORY = "AI Pocket";
const PERMISSION_MODE: FsPermissionMode = "readwrite";

function isFunction<T extends (...args: any[]) => unknown>(
  value: unknown,
): value is T {
  return typeof value === "function";
}

export function normalizeErrorReason(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : undefined;

  const normalizedName = name ? name.toLowerCase() : undefined;
  if (normalizedName === "aborterror") {
    return "aborted";
  }
  if (normalizedName === "notallowederror") {
    return "denied";
  }
  if (normalizedName === "notfounderror") {
    return "not-found";
  }

  if (error instanceof Error) {
    const errorName =
      typeof error.name === "string" ? error.name.toLowerCase() : undefined;
    if (errorName && errorName !== "error") {
      return errorName;
    }
    return "error";
  }

  return normalizedName || "error";
}

async function callWithCatch<T>(
  operation: () => Promise<T>,
  onError: (error: unknown) => void,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    onError(error);
    return undefined;
  }
}

function sanitizeSegments(
  relativePath: string,
  rootDirectory: string,
): { directorySegments: string[]; fileName: string; normalizedPath: string } | null {
  const normalized = String(relativePath ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.some((segment) => segment === "..")) {
    return null;
  }

  const finalSegments =
    normalized[0]?.toLowerCase() === rootDirectory.toLowerCase()
      ? normalized
      : [rootDirectory, ...normalized];

  const fileName = finalSegments[finalSegments.length - 1];
  if (!fileName) {
    return null;
  }

  return {
    directorySegments: finalSegments.slice(0, -1),
    fileName,
    normalizedPath: finalSegments.join("/"),
  };
}

function encodeBase64(data: Uint8Array): string {
  if (typeof globalThis.btoa === "function") {
    let binary = "";
    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }
    return globalThis.btoa(binary);
  }

  const bufferGlobal = (globalThis as { Buffer?: any }).Buffer;
  if (bufferGlobal?.from) {
    return bufferGlobal.from(data).toString("base64");
  }

  throw new Error("base64-encoder-unavailable");
}

function decodeBase64(input: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  const bufferGlobal = (globalThis as { Buffer?: any }).Buffer;
  if (bufferGlobal?.from) {
    const buffer = bufferGlobal.from(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  throw new Error("base64-decoder-unavailable");
}

function toArrayBufferView(
  data: Blob | ArrayBuffer | ArrayBufferView | Uint8Array | string,
  encoding: FilesystemWriteOptions["encoding"],
): { payload: Blob | ArrayBuffer | Uint8Array | string; byteLength: number } {
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return { payload: data, byteLength: data.size };
  }

  if (data instanceof ArrayBuffer) {
    return { payload: data, byteLength: data.byteLength };
  }

  if (ArrayBuffer.isView(data)) {
    if (data instanceof Uint8Array) {
      return {
        payload: data,
        byteLength: data.byteLength,
      };
    }

    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    return {
      payload: view,
      byteLength: view.byteLength,
    };
  }

  if (typeof data === "string") {
    if (encoding === "base64") {
      const bytes = decodeBase64(data);
      return { payload: bytes, byteLength: bytes.byteLength };
    }

    const encoder = new TextEncoder();
    const bytes = encoder.encode(data);
    return { payload: bytes, byteLength: bytes.byteLength };
  }

  throw new TypeError("Unsupported data type for filesystem write");
}

export class FilesystemAccessService {
  protected readonly storage: LocalStorageLike;
  protected readonly defaultHandleId: string;
  protected readonly rootDirectoryName: string;
  private readonly now: () => number;
  private readonly directoryPickerOverride: DirectoryPickerLike | undefined;
  protected readonly handles = new Map<string, DirectoryHandleLike>();

  constructor(options: FilesystemAccessServiceOptions = {}) {
    this.storage = options.storage ?? new ChromeLocalStorage();
    this.defaultHandleId = options.defaultHandleId ?? DEFAULT_HANDLE_ID;
    this.rootDirectoryName = options.rootDirectoryName ?? DEFAULT_ROOT_DIRECTORY;
    this.now = options.now ?? Date.now;
    this.directoryPickerOverride = options.directoryPicker;
  }

  isSupported(): boolean {
    return Boolean(
      this.directoryPickerOverride || isFunction((globalThis as any).showDirectoryPicker),
    );
  }

  async requestFileSystemAccess(
    options: FilesystemAccessRequestOptions = {},
  ): Promise<DirectoryAccessResult> {
    const handleId = options.handleId ?? this.defaultHandleId;
    const mode = options.mode ?? PERMISSION_MODE;

    if (!this.isSupported()) {
      logger.warn(
        "FilesystemAccessService",
        "File System Access API unsupported",
      );
      return { granted: false, reason: "unsupported" };
    }

    const picker = this.getDirectoryPicker();
    if (!picker) {
      logger.warn(
        "FilesystemAccessService",
        "Directory picker not available",
      );
      return { granted: false, reason: "unsupported" };
    }

    try {
      const handle = await picker({
        id: handleId,
        mode,
        startIn: options.startIn,
        suggestedName: options.suggestedName ?? this.rootDirectoryName,
      });

      this.setHandle(handleId, handle);

      const permission = await this.ensurePermission(handle, mode);
      if (permission === "granted") {
        await this.persistFlag(handleId);
        logger.info(
          "FilesystemAccessService",
          "Directory access granted",
          { handleId },
        );
        return { granted: true, handle };
      }

      if (permission === "denied") {
        await this.handlePermissionRevoked(handleId);
        logger.warn(
          "FilesystemAccessService",
          "Directory access denied by user",
          { handleId },
        );
        return { granted: false, reason: "denied" };
      }

      logger.warn(
        "FilesystemAccessService",
        "Directory access permission unresolved",
        { handleId, permission },
      );
      this.clearHandle(handleId);
      return { granted: false, reason: permission ?? "unknown" };
    } catch (error) {
      const reason = normalizeErrorReason(error);
      if (reason !== "aborted") {
        await this.handlePermissionRevoked(handleId);
      } else {
        this.clearHandle(handleId);
      }

      logger.warn(
        "FilesystemAccessService",
        "Directory picker request failed",
        { reason, error, handleId },
      );

      return { granted: false, reason };
    }
  }

  async hasFileSystemAccess(
    options: FilesystemAccessAvailabilityOptions = {},
  ): Promise<AccessAvailabilityResult> {
    const handleId = options.handleId ?? this.defaultHandleId;
    const mode = options.mode ?? PERMISSION_MODE;

    if (!this.isSupported()) {
      logger.warn(
        "FilesystemAccessService",
        "File System Access API unsupported for availability check",
      );
      return { available: false, reason: "unsupported" };
    }

    const handle = this.getCachedHandle(handleId);
    if (!handle) {
      const stored = await this.readFlag(handleId);
      if (stored?.granted) {
        logger.info(
          "FilesystemAccessService",
          "Stored grant flag present but handle missing",
          { handleId },
        );
        return { available: false, reason: "missing-handle" };
      }

      return { available: false, reason: "uninitialized" };
    }

    try {
      const permission = await this.queryPermission(handle, mode);
      if (permission === "granted") {
        logger.debug(
          "FilesystemAccessService",
          "Directory permission remains granted",
          { handleId },
        );
        return { available: true };
      }

      if (!permission || permission === "prompt") {
        const refreshed = await this.ensurePermission(handle, mode);
        if (refreshed === "granted") {
          logger.info(
            "FilesystemAccessService",
            "Directory permission refreshed after prompt",
            { handleId },
          );
          return { available: true };
        }

        if (refreshed === "denied") {
          await this.handlePermissionRevoked(handleId);
          return { available: false, reason: "denied" };
        }

        return { available: false, reason: refreshed ?? "unknown" };
      }

      if (permission === "denied") {
        await this.handlePermissionRevoked(handleId);
        return { available: false, reason: "denied" };
      }

      return { available: false, reason: permission ?? "unknown" };
    } catch (error) {
      logger.error(
        "FilesystemAccessService",
        "Failed to verify directory permission",
        error,
      );
      return { available: false, reason: "error" };
    }
  }

  async revokeFileSystemAccess(
    options: FilesystemAccessRevokeOptions = {},
  ): Promise<RevokeAccessResult> {
    const handleId = options.handleId ?? this.defaultHandleId;

    try {
      this.clearHandle(handleId);
      await this.clearFlag(handleId);
      logger.info(
        "FilesystemAccessService",
        "Cleared cached directory access state",
        { handleId },
      );
      return { revoked: true };
    } catch (error) {
      logger.error(
        "FilesystemAccessService",
        "Failed to revoke directory access",
        error,
      );
      return {
        revoked: false,
        reason: error instanceof Error ? error.message : "error",
      };
    }
  }

  async saveFile(options: FilesystemWriteOptions): Promise<FileWriteResult> {
    const handleId = options.handleId ?? this.defaultHandleId;
    const segments = sanitizeSegments(
      options.relativePath,
      this.rootDirectoryName,
    );

    if (!segments) {
      return {
        success: false,
        reason: "invalid-path",
        path: options.relativePath,
        handleId,
      };
    }

    const rootHandle = this.getCachedHandle(handleId);
    if (!rootHandle) {
      return {
        success: false,
        reason: "missing-handle",
        path: segments.normalizedPath,
        handleId,
      };
    }

    if (!isFunction(rootHandle.getDirectoryHandle) || !isFunction(rootHandle.getFileHandle)) {
      return {
        success: false,
        reason: "unsupported",
        path: segments.normalizedPath,
        handleId,
      };
    }

    try {
      let currentHandle: DirectoryHandleLike = rootHandle;
      for (const segment of segments.directorySegments) {
        currentHandle = await currentHandle.getDirectoryHandle!(segment, {
          create: true,
        });
      }

      const fileHandle = await currentHandle.getFileHandle!(segments.fileName, {
        create: true,
      });

      if (!isFunction(fileHandle.createWritable)) {
        return {
          success: false,
          reason: "unsupported",
          path: segments.normalizedPath,
          handleId,
        };
      }

      const { payload, byteLength } = toArrayBufferView(
        options.data,
        options.encoding,
      );
      const writable = await fileHandle.createWritable();
      await writable.write(payload);
      await writable.close();

      const result: FileWriteResult = {
        success: true,
        path: segments.normalizedPath,
        handleId,
        bytesWritten: byteLength,
      };

      if (options.mimeType) {
        result.mimeType = options.mimeType;
      }

      return result;
    } catch (error) {
      const reason = normalizeErrorReason(error);
      logger.warn("FilesystemAccessService", "Failed to save file", {
        handleId,
        reason,
        path: segments.normalizedPath,
        error,
      });
      return {
        success: false,
        reason,
        path: segments.normalizedPath,
        handleId,
      };
    }
  }

  async readFile(options: FilesystemReadOptions): Promise<FileReadResult> {
    const handleId = options.handleId ?? this.defaultHandleId;
    const segments = sanitizeSegments(
      options.relativePath,
      this.rootDirectoryName,
    );

    if (!segments) {
      return {
        success: false,
        reason: "invalid-path",
        path: options.relativePath,
        handleId,
      };
    }

    const rootHandle = this.getCachedHandle(handleId);
    if (!rootHandle) {
      return {
        success: false,
        reason: "missing-handle",
        path: segments.normalizedPath,
        handleId,
      };
    }

    if (!isFunction(rootHandle.getDirectoryHandle) || !isFunction(rootHandle.getFileHandle)) {
      return {
        success: false,
        reason: "unsupported",
        path: segments.normalizedPath,
        handleId,
      };
    }

    try {
      let currentHandle: DirectoryHandleLike = rootHandle;
      for (const segment of segments.directorySegments) {
        currentHandle = await currentHandle.getDirectoryHandle!(segment, {
          create: false,
        });
      }

      const fileHandle = await currentHandle.getFileHandle!(segments.fileName, {
        create: false,
      });

      if (!isFunction(fileHandle.getFile)) {
        return {
          success: false,
          reason: "unsupported",
          path: segments.normalizedPath,
          handleId,
        };
      }

      const file = await fileHandle.getFile();
      const data = await file.arrayBuffer();
      let text: string | undefined;

      if (options.encoding === "utf-8") {
        const decoder = new TextDecoder();
        text = decoder.decode(new Uint8Array(data));
      } else if (options.encoding === "base64") {
        text = encodeBase64(new Uint8Array(data));
      }

      const result: FileReadResult = {
        success: true,
        path: segments.normalizedPath,
        handleId,
        data,
      };

      if (text !== undefined) {
        result.text = text;
      }

      if (typeof file.size === "number") {
        result.size = file.size;
      }

      if (typeof file.type === "string" && file.type.length > 0) {
        result.mimeType = file.type;
      }

      if (typeof file.lastModified === "number") {
        result.lastModified = file.lastModified;
      }

      return result;
    } catch (error) {
      const reason = normalizeErrorReason(error);
      logger.warn("FilesystemAccessService", "Failed to read file", {
        handleId,
        reason,
        path: segments.normalizedPath,
        error,
      });
      return {
        success: false,
        reason,
        path: segments.normalizedPath,
        handleId,
      };
    }
  }

  async deleteFile(options: FilesystemDeleteOptions): Promise<FileDeleteResult> {
    const handleId = options.handleId ?? this.defaultHandleId;
    const segments = sanitizeSegments(
      options.relativePath,
      this.rootDirectoryName,
    );

    if (!segments) {
      return {
        success: false,
        reason: "invalid-path",
        path: options.relativePath,
        handleId,
      };
    }

    const rootHandle = this.getCachedHandle(handleId);
    if (!rootHandle || !isFunction(rootHandle.getDirectoryHandle) || !isFunction(rootHandle.removeEntry)) {
      return {
        success: false,
        reason: rootHandle ? "unsupported" : "missing-handle",
        path: segments.normalizedPath,
        handleId,
      };
    }

    try {
      let currentHandle: DirectoryHandleLike = rootHandle;
      for (const segment of segments.directorySegments) {
        currentHandle = await currentHandle.getDirectoryHandle!(segment, {
          create: false,
        });
      }

      await currentHandle.removeEntry!(segments.fileName, {
        recursive: options.recursive ?? false,
      });

      return {
        success: true,
        path: segments.normalizedPath,
        handleId,
      };
    } catch (error) {
      const reason = normalizeErrorReason(error);
      logger.warn("FilesystemAccessService", "Failed to delete file", {
        handleId,
        reason,
        path: segments.normalizedPath,
        error,
      });
      return {
        success: false,
        reason,
        path: segments.normalizedPath,
        handleId,
      };
    }
  }

  async requestDirectoryAccess(): Promise<DirectoryAccessResult> {
    return this.requestFileSystemAccess({ handleId: this.defaultHandleId });
  }

  async hasValidAccess(): Promise<AccessAvailabilityResult> {
    return this.hasFileSystemAccess({ handleId: this.defaultHandleId });
  }

  async revokeAccess(): Promise<RevokeAccessResult> {
    return this.revokeFileSystemAccess({ handleId: this.defaultHandleId });
  }

  async getDirectoryHandle(handleId = this.defaultHandleId): Promise<DirectoryHandleLike | null> {
    return this.getCachedHandle(handleId);
  }

  protected getDirectoryPicker(): DirectoryPickerLike | null {
    if (this.directoryPickerOverride) {
      return this.directoryPickerOverride;
    }
    const picker = (globalThis as any).showDirectoryPicker;
    return isFunction(picker) ? picker.bind(globalThis) : null;
  }

  protected async ensurePermission(
    handle: DirectoryHandleLike,
    mode: FsPermissionMode,
  ): Promise<FsPermissionState> {
    const current = await this.queryPermission(handle, mode);
    if (current === "granted" || current === "denied") {
      return current;
    }

    if (isFunction(handle.requestPermission)) {
      const result = await handle.requestPermission({ mode });
      return result ?? "prompt";
    }

    return "granted";
  }

  protected async queryPermission(
    handle: DirectoryHandleLike,
    mode: FsPermissionMode,
  ): Promise<FsPermissionState | undefined> {
    if (isFunction(handle.queryPermission)) {
      return await handle.queryPermission({ mode });
    }
    return undefined;
  }

  protected async persistFlag(handleId: string): Promise<void> {
    const record: FsAccessStorageRecord = {
      granted: true,
      timestamp: this.now(),
    };

    await callWithCatch(async () => {
      const state = await this.readAllFlags();
      state[handleId] = record;
      await this.storage.set({ [FS_ACCESS_STORAGE_KEY]: state });
    }, (error) => {
      logger.warn(
        "FilesystemAccessService",
        "Failed to persist directory access flag",
        { handleId, error },
      );
    });
  }

  protected async clearFlag(handleId: string): Promise<void> {
    await callWithCatch(async () => {
      const state = await this.readAllFlags();
      delete state[handleId];
      if (Object.keys(state).length === 0) {
        await this.storage.remove(FS_ACCESS_STORAGE_KEY);
      } else {
        await this.storage.set({ [FS_ACCESS_STORAGE_KEY]: state });
      }
    }, (error) => {
      logger.warn(
        "FilesystemAccessService",
        "Failed to clear directory access flag",
        { handleId, error },
      );
    });
  }

  protected async readFlag(handleId: string): Promise<FsAccessStorageRecord | null> {
    const state = await this.readAllFlags();
    return state[handleId] ?? null;
  }

  protected async readAllFlags(): Promise<FsAccessStorageState> {
    const result = await callWithCatch(
      () =>
        this.storage.get<{ [FS_ACCESS_STORAGE_KEY]?: unknown }>(
          FS_ACCESS_STORAGE_KEY,
        ),
      (error) => {
        logger.warn(
          "FilesystemAccessService",
          "Failed to read directory access flag",
          error,
        );
      },
    );

    const raw = result?.[FS_ACCESS_STORAGE_KEY];
    if (!raw || typeof raw !== "object") {
      return {};
    }

    if (
      "granted" in raw &&
      typeof (raw as { granted?: unknown }).granted === "boolean"
    ) {
      const legacyRecord = raw as { granted?: unknown; timestamp?: unknown };
      if (legacyRecord.granted !== true) {
        return {};
      }

      const timestamp =
        typeof legacyRecord.timestamp === "number"
          ? legacyRecord.timestamp
          : this.now();

      return {
        [this.defaultHandleId]: {
          granted: true,
          timestamp,
        },
      };
    }

    const entries: FsAccessStorageState = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (
        value &&
        typeof value === "object" &&
        "granted" in value &&
        typeof (value as { granted?: unknown }).granted === "boolean"
      ) {
        const record = value as { granted?: unknown; timestamp?: unknown };
        if (record.granted !== true) {
          continue;
        }

        const timestamp =
          typeof record.timestamp === "number" ? record.timestamp : this.now();

        entries[key] = {
          granted: true,
          timestamp,
        };
      }
    }

    return entries;
  }

  protected async handlePermissionRevoked(handleId: string): Promise<void> {
    this.clearHandle(handleId);
    await this.clearFlag(handleId);
    logger.warn(
      "FilesystemAccessService",
      "Directory access permission revoked",
      { handleId },
    );
  }

  protected getCachedHandle(handleId: string): DirectoryHandleLike | null {
    return this.handles.get(handleId) ?? null;
  }

  protected setHandle(handleId: string, handle: DirectoryHandleLike): void {
    this.handles.set(handleId, handle);
  }

  protected clearHandle(handleId: string): void {
    this.handles.delete(handleId);
  }
}

/**
 * Security considerations:
 * - Paths are normalized with traversal prevention so callers cannot escape the
 *   granted root directory.
 * - File system handles are only cached in memory; chrome.storage retains grant
 *   metadata but never the handles themselves to avoid leaking permissions.
 * - Permission checks always run before file mutations, refreshing access where
 *   possible and revoking cached state on denial.
 *
 * Manual Chrome validation (post-build):
 * 1. Run `pnpm run build` and load the extension into Chrome with developer
 *    mode enabled.
 * 2. Trigger a tiered storage save that invokes `requestFileSystemAccess`.
 *    Accept the prompt and verify the AI Pocket directory structure is created.
 * 3. Capture content twice to confirm writes reuse the previously granted
 *    directory without additional prompts.
 * 4. Manually delete the granted folder, then attempt another save to confirm
 *    the service surfaces `missing-handle` and gracefully falls back.
 * 5. Revoke access via UI to ensure the extension clears cached state and
 *    subsequent operations prompt for permission again.
 */
