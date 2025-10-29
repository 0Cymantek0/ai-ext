import { ChromeLocalStorage } from "../storage-wrapper.js";
import { logger } from "../monitoring.js";
import type { MessageKind } from "../../shared/types/index.d.ts";
import type {
  StorageFsAccessCheckResponse,
  StorageFsAccessRequestResponse,
  StorageFsAccessRevokeResponse,
} from "../../shared/types/index.d.ts";

export const FS_ACCESS_STORAGE_KEY = "fsAccess.directory.granted";

type FsPermissionMode = "read" | "readwrite";
type FsPermissionState = "granted" | "denied" | "prompt";
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

const PERMISSION_MODE: FsPermissionMode = "readwrite";

interface FsAccessStorageRecord {
  granted: boolean;
  timestamp: number;
}

interface LocalStorageLike
  extends Pick<ChromeLocalStorage, "get" | "set" | "remove"> {}

export interface DirectoryHandleLike extends FsPermissionCapable {}

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

function isFunction<T extends (...args: any[]) => unknown>(
  value: unknown,
): value is T {
  return typeof value === "function";
}

function normalizeErrorReason(error: unknown): string {
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

export class FsAccessManager {
  private directoryHandle: DirectoryHandleLike | null = null;
  private readonly storage: LocalStorageLike;

  constructor(storage: LocalStorageLike = new ChromeLocalStorage()) {
    this.storage = storage;
  }

  isSupported(): boolean {
    return isFunction((globalThis as any).showDirectoryPicker);
  }

  async requestDirectoryAccess(): Promise<DirectoryAccessResult> {
    if (!this.isSupported()) {
      logger.warn("FsAccessManager", "File System Access API unsupported");
      return { granted: false, reason: "unsupported" };
    }

    const picker = this.getDirectoryPicker();
    if (!picker) {
      logger.warn("FsAccessManager", "Directory picker not available");
      return { granted: false, reason: "unsupported" };
    }

    try {
      const handle = await picker();
      this.directoryHandle = handle;

      const permission = await this.ensurePermission(handle);
      if (permission === "granted") {
        await this.persistFlag();
        logger.info("FsAccessManager", "Directory access granted");
        return { granted: true, handle };
      }

      if (permission === "denied") {
        await this.clearFlag();
        this.directoryHandle = null;
        logger.warn("FsAccessManager", "Directory access denied by user");
        return { granted: false, reason: "denied" };
      }

      logger.warn("FsAccessManager", "Directory access permission unresolved", {
        permission,
      });
      this.directoryHandle = null;
      return { granted: false, reason: permission ?? "unknown" };
    } catch (error) {
      const reason = normalizeErrorReason(error);
      this.directoryHandle = null;

      if (reason !== "aborted") {
        await this.clearFlag();
      }

      logger.warn("FsAccessManager", "Directory picker request failed", {
        reason,
        error,
      });

      return { granted: false, reason };
    }
  }

  async hasValidAccess(): Promise<AccessAvailabilityResult> {
    if (!this.isSupported()) {
      logger.warn(
        "FsAccessManager",
        "File System Access API unsupported for availability check",
      );
      return { available: false, reason: "unsupported" };
    }

    if (!this.directoryHandle) {
      const stored = await this.readFlag();
      if (stored?.granted) {
        logger.info(
          "FsAccessManager",
          "Stored flag indicates prior grant but handle is missing",
        );
        return { available: false, reason: "missing-handle" };
      }

      return { available: false, reason: "uninitialized" };
    }

    try {
      const permission = await this.queryPermission(this.directoryHandle);
      if (permission === "granted") {
        logger.debug("FsAccessManager", "Directory permission remains granted");
        return { available: true };
      }

      if (!permission || permission === "prompt") {
        const requested = await this.ensurePermission(this.directoryHandle);
        if (requested === "granted") {
          logger.info(
            "FsAccessManager",
            "Directory permission refreshed after prompt",
          );
          return { available: true };
        }

        if (requested === "denied") {
          await this.handlePermissionRevoked();
          return { available: false, reason: "denied" };
        }

        return { available: false, reason: requested ?? "unknown" };
      }

      if (permission === "denied") {
        await this.handlePermissionRevoked();
        return { available: false, reason: "denied" };
      }

      return { available: false, reason: permission ?? "unknown" };
    } catch (error) {
      logger.error(
        "FsAccessManager",
        "Failed to verify directory permission",
        error,
      );
      return { available: false, reason: "error" };
    }
  }

  async revokeAccess(): Promise<RevokeAccessResult> {
    try {
      this.directoryHandle = null;
      await this.clearFlag();
      logger.info("FsAccessManager", "Cleared cached directory access state");
      return { revoked: true };
    } catch (error) {
      logger.error("FsAccessManager", "Failed to revoke directory access", error);
      return {
        revoked: false,
        reason: error instanceof Error ? error.message : "error",
      };
    }
  }

  protected getDirectoryPicker():
    | (() => Promise<DirectoryHandleLike>)
    | null {
    const picker = (globalThis as any).showDirectoryPicker;
    return isFunction(picker) ? picker.bind(globalThis) : null;
  }

  private async ensurePermission(
    handle: DirectoryHandleLike,
  ): Promise<FsPermissionState> {
    const current = await this.queryPermission(handle);
    if (current === "granted" || current === "denied") {
      return current;
    }

    if (isFunction(handle.requestPermission)) {
      const result = await handle.requestPermission({ mode: PERMISSION_MODE });
      return result ?? "prompt";
    }

    return "granted";
  }

  private async queryPermission(
    handle: DirectoryHandleLike,
  ): Promise<FsPermissionState | undefined> {
    if (isFunction(handle.queryPermission)) {
      return await handle.queryPermission({ mode: PERMISSION_MODE });
    }
    return undefined;
  }

  private async persistFlag(): Promise<void> {
    const record: FsAccessStorageRecord = {
      granted: true,
      timestamp: Date.now(),
    };

    await callWithCatch(
      () => this.storage.set({ [FS_ACCESS_STORAGE_KEY]: record }),
      (error) => {
        logger.warn(
          "FsAccessManager",
          "Failed to persist directory access flag",
          error,
        );
      },
    );
  }

  private async clearFlag(): Promise<void> {
    await callWithCatch(
      () => this.storage.remove(FS_ACCESS_STORAGE_KEY),
      (error) => {
        logger.warn(
          "FsAccessManager",
          "Failed to clear directory access flag",
          error,
        );
      },
    );
  }

  private async readFlag(): Promise<FsAccessStorageRecord | null> {
    const result = await callWithCatch(
      () =>
        this.storage.get<{ [FS_ACCESS_STORAGE_KEY]?: FsAccessStorageRecord }>(
          FS_ACCESS_STORAGE_KEY,
        ),
      (error) => {
        logger.warn(
          "FsAccessManager",
          "Failed to read directory access flag",
          error,
        );
      },
    );

    return result?.[FS_ACCESS_STORAGE_KEY] ?? null;
  }

  private async handlePermissionRevoked(): Promise<void> {
    this.directoryHandle = null;
    await this.clearFlag();
    logger.warn("FsAccessManager", "Directory access permission revoked");
  }
}

export const fsAccessManager = new FsAccessManager();

interface MessageRouterLike {
  registerHandler(
    kind: MessageKind,
    handler: (payload: unknown, sender?: chrome.runtime.MessageSender) =>
      | Promise<unknown>
      | unknown,
  ): void;
}

export function registerFsAccessHandlers(
  router: MessageRouterLike,
  manager: FsAccessManager = fsAccessManager,
): void {
  router.registerHandler(
    "STORAGE_REQUEST_FS_ACCESS",
    async (): Promise<StorageFsAccessRequestResponse> => {
      try {
        const result = await manager.requestDirectoryAccess();
        if (result.granted) {
          logger.info(
            "FsAccessHandlers",
            "STORAGE_REQUEST_FS_ACCESS granted",
          );
          return { granted: true };
        }

        logger.warn("FsAccessHandlers", "STORAGE_REQUEST_FS_ACCESS denied", {
          reason: result.reason,
        });

        return {
          granted: false,
          ...(result.reason ? { reason: result.reason } : {}),
        };
      } catch (error) {
        logger.error(
          "FsAccessHandlers",
          "STORAGE_REQUEST_FS_ACCESS failed",
          error,
        );
        return { granted: false, reason: "error" };
      }
    },
  );

  router.registerHandler(
    "STORAGE_CHECK_FS_ACCESS",
    async (): Promise<StorageFsAccessCheckResponse> => {
      try {
        const result = await manager.hasValidAccess();
        if (result.available) {
          logger.info(
            "FsAccessHandlers",
            "STORAGE_CHECK_FS_ACCESS available",
          );
          return { available: true };
        }

        logger.warn("FsAccessHandlers", "STORAGE_CHECK_FS_ACCESS unavailable", {
          reason: result.reason,
        });

        return {
          available: false,
          ...(result.reason ? { reason: result.reason } : {}),
        };
      } catch (error) {
        logger.error(
          "FsAccessHandlers",
          "STORAGE_CHECK_FS_ACCESS failed",
          error,
        );
        return { available: false, reason: "error" };
      }
    },
  );

  router.registerHandler(
    "STORAGE_REVOKE_FS_ACCESS",
    async (): Promise<StorageFsAccessRevokeResponse> => {
      try {
        const result = await manager.revokeAccess();
        if (result.revoked) {
          logger.info(
            "FsAccessHandlers",
            "STORAGE_REVOKE_FS_ACCESS completed",
          );
          return { revoked: true };
        }

        logger.warn("FsAccessHandlers", "STORAGE_REVOKE_FS_ACCESS failed", {
          reason: result.reason,
        });

        return {
          revoked: false,
          ...(result.reason ? { reason: result.reason } : {}),
        };
      } catch (error) {
        logger.error(
          "FsAccessHandlers",
          "STORAGE_REVOKE_FS_ACCESS exception",
          error,
        );
        return { revoked: false, reason: "error" };
      }
    },
  );
}
