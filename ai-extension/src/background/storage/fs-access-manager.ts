import { ChromeLocalStorage } from "../storage-wrapper.js";
import { logger } from "../monitoring.js";
import type { MessageKind } from "../../shared/types/index.d.ts";
import type {
  StorageFsAccessCheckResponse,
  StorageFsAccessRequestResponse,
  StorageFsAccessRevokeResponse,
} from "../../shared/types/index.d.ts";

import {
  FilesystemAccessService,
  type FilesystemAccessServiceOptions,
} from "../../storage/filesystem-access.js";

export {
  FS_ACCESS_STORAGE_KEY,
  type DirectoryHandleLike,
  type DirectoryAccessResult,
  type AccessAvailabilityResult,
  type RevokeAccessResult,
} from "../../storage/filesystem-access.js";

type LocalStorageLike = NonNullable<FilesystemAccessServiceOptions["storage"]>;

export class FsAccessManager extends FilesystemAccessService {
  constructor(storage: LocalStorageLike = new ChromeLocalStorage()) {
    super({ storage });
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
          logger.info("FsAccessHandlers", "STORAGE_REQUEST_FS_ACCESS granted");
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
          logger.info("FsAccessHandlers", "STORAGE_CHECK_FS_ACCESS available");
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
          logger.info("FsAccessHandlers", "STORAGE_REVOKE_FS_ACCESS completed");
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
