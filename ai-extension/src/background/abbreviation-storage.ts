/**
 * Abbreviation Storage Module
 *
 * Manages CRUD operations for user-defined abbreviations using chrome.storage.sync.
 * Abbreviations are stored in sync storage to enable cross-device synchronization.
 *
 * Storage Structure:
 * - Key: STORAGE_KEYS.ABBREVIATIONS
 * - Value: Record<string, Abbreviation> (shortcut -> abbreviation mapping)
 *
 * Requirements: 10.1, 10.3
 */

import type { Abbreviation } from "../shared/types/index.d.ts";
import type { STORAGE_KEYS as StorageKeysType } from "../shared/types/index.d.ts";

// Import the actual value
const STORAGE_KEYS: typeof StorageKeysType = {
  USER_PREFERENCES: "userPreferences",
  SIDE_PANEL_STATE: "sidePanelState",
  CONVERSATIONS: "conversations",
  POCKETS: "pockets",
  ABBREVIATIONS: "abbreviations",
} as const;

// Storage quota for chrome.storage.sync is 100KB total, 8KB per item
const SYNC_QUOTA_BYTES = 102400; // 100KB
const ITEM_QUOTA_BYTES = 8192; // 8KB

/**
 * Error types for abbreviation storage operations
 */
export class AbbreviationStorageError extends Error {
  constructor(
    message: string,
    public code:
      | "QUOTA_EXCEEDED"
      | "NOT_FOUND"
      | "DUPLICATE"
      | "INVALID_INPUT"
      | "STORAGE_ERROR",
  ) {
    super(message);
    this.name = "AbbreviationStorageError";
  }
}

/**
 * Get all abbreviations from storage
 */
async function getAllAbbreviations(): Promise<Record<string, Abbreviation>> {
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEYS.ABBREVIATIONS);
    return (
      (result[STORAGE_KEYS.ABBREVIATIONS] as Record<string, Abbreviation>) || {}
    );
  } catch (error) {
    console.error("Failed to get abbreviations:", error);
    throw new AbbreviationStorageError(
      "Failed to retrieve abbreviations from storage",
      "STORAGE_ERROR",
    );
  }
}

/**
 * Save all abbreviations to storage
 */
async function saveAllAbbreviations(
  abbreviations: Record<string, Abbreviation>,
): Promise<void> {
  try {
    // Check storage quota before saving
    const dataSize = new Blob([JSON.stringify(abbreviations)]).size;
    if (dataSize > ITEM_QUOTA_BYTES) {
      throw new AbbreviationStorageError(
        `Abbreviations data exceeds storage quota (${dataSize} bytes > ${ITEM_QUOTA_BYTES} bytes)`,
        "QUOTA_EXCEEDED",
      );
    }

    await chrome.storage.sync.set({
      [STORAGE_KEYS.ABBREVIATIONS]: abbreviations,
    });
  } catch (error) {
    if (error instanceof AbbreviationStorageError) {
      throw error;
    }
    console.error("Failed to save abbreviations:", error);
    throw new AbbreviationStorageError(
      "Failed to save abbreviations to storage",
      "STORAGE_ERROR",
    );
  }
}

/**
 * Create a new abbreviation
 *
 * @param shortcut - The shortcut text (e.g., "sig")
 * @param expansion - The full text to expand to
 * @param category - Optional category for organization
 * @returns The created abbreviation
 * @throws AbbreviationStorageError if shortcut already exists or quota exceeded
 */
export async function createAbbreviation(
  shortcut: string,
  expansion: string,
  category?: string,
): Promise<Abbreviation> {
  // Validate input
  if (!shortcut || !shortcut.trim()) {
    throw new AbbreviationStorageError(
      "Shortcut cannot be empty",
      "INVALID_INPUT",
    );
  }
  if (!expansion || !expansion.trim()) {
    throw new AbbreviationStorageError(
      "Expansion cannot be empty",
      "INVALID_INPUT",
    );
  }

  // Normalize shortcut (remove leading slash if present, convert to lowercase)
  const normalizedShortcut = shortcut.replace(/^\//, "").toLowerCase().trim();

  const abbreviations = await getAllAbbreviations();

  // Check for duplicates
  if (abbreviations[normalizedShortcut]) {
    throw new AbbreviationStorageError(
      `Abbreviation "${normalizedShortcut}" already exists`,
      "DUPLICATE",
    );
  }

  // Create new abbreviation
  const now = Date.now();
  const newAbbreviation: Abbreviation = {
    shortcut: normalizedShortcut,
    expansion: expansion.trim(),
    ...(category?.trim() && { category: category.trim() }),
    usageCount: 0,
    createdAt: now,
    lastUsed: now,
  };

  // Add to storage
  abbreviations[normalizedShortcut] = newAbbreviation;
  await saveAllAbbreviations(abbreviations);

  return newAbbreviation;
}

/**
 * Get an abbreviation by shortcut
 *
 * @param shortcut - The shortcut to look up
 * @returns The abbreviation if found, null otherwise
 */
export async function getAbbreviation(
  shortcut: string,
): Promise<Abbreviation | null> {
  const normalizedShortcut = shortcut.replace(/^\//, "").toLowerCase().trim();
  const abbreviations = await getAllAbbreviations();
  return abbreviations[normalizedShortcut] || null;
}

/**
 * Update an existing abbreviation
 *
 * @param shortcut - The shortcut to update
 * @param updates - Partial abbreviation data to update
 * @returns The updated abbreviation
 * @throws AbbreviationStorageError if abbreviation not found
 */
export async function updateAbbreviation(
  shortcut: string,
  updates: { expansion?: string; category?: string },
): Promise<Abbreviation> {
  const normalizedShortcut = shortcut.replace(/^\//, "").toLowerCase().trim();
  const abbreviations = await getAllAbbreviations();

  const existing = abbreviations[normalizedShortcut];
  if (!existing) {
    throw new AbbreviationStorageError(
      `Abbreviation "${normalizedShortcut}" not found`,
      "NOT_FOUND",
    );
  }

  // Update fields
  const updated: Abbreviation = {
    ...existing,
    ...(updates.expansion && { expansion: updates.expansion.trim() }),
    ...(updates.category !== undefined &&
      updates.category.trim() && { category: updates.category.trim() }),
  };

  abbreviations[normalizedShortcut] = updated;
  await saveAllAbbreviations(abbreviations);

  return updated;
}

/**
 * Delete an abbreviation
 *
 * @param shortcut - The shortcut to delete
 * @throws AbbreviationStorageError if abbreviation not found
 */
export async function deleteAbbreviation(shortcut: string): Promise<void> {
  const normalizedShortcut = shortcut.replace(/^\//, "").toLowerCase().trim();
  const abbreviations = await getAllAbbreviations();

  if (!abbreviations[normalizedShortcut]) {
    throw new AbbreviationStorageError(
      `Abbreviation "${normalizedShortcut}" not found`,
      "NOT_FOUND",
    );
  }

  delete abbreviations[normalizedShortcut];
  await saveAllAbbreviations(abbreviations);
}

/**
 * List all abbreviations
 *
 * @param category - Optional category filter
 * @returns Array of abbreviations, sorted by usage count (descending)
 */
export async function listAbbreviations(
  category?: string,
): Promise<Abbreviation[]> {
  const abbreviations = await getAllAbbreviations();
  let list = Object.values(abbreviations);

  // Filter by category if specified
  if (category) {
    list = list.filter((abbr) => abbr.category === category);
  }

  // Sort by usage count (most used first), then by creation date (newest first)
  list.sort((a, b) => {
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }
    return b.createdAt - a.createdAt;
  });

  return list;
}

/**
 * Expand an abbreviation and increment its usage count
 *
 * @param shortcut - The shortcut to expand
 * @returns The expansion text and updated abbreviation
 * @throws AbbreviationStorageError if abbreviation not found
 */
export async function expandAbbreviation(shortcut: string): Promise<{
  expansion: string;
  abbreviation: Abbreviation;
}> {
  const normalizedShortcut = shortcut.replace(/^\//, "").toLowerCase().trim();
  const abbreviations = await getAllAbbreviations();

  const abbreviation = abbreviations[normalizedShortcut];
  if (!abbreviation) {
    throw new AbbreviationStorageError(
      `Abbreviation "${normalizedShortcut}" not found`,
      "NOT_FOUND",
    );
  }

  // Update usage statistics
  abbreviation.usageCount++;
  abbreviation.lastUsed = Date.now();

  abbreviations[normalizedShortcut] = abbreviation;
  await saveAllAbbreviations(abbreviations);

  return {
    expansion: abbreviation.expansion,
    abbreviation,
  };
}

/**
 * Get storage usage statistics
 *
 * @returns Storage usage information
 */
export async function getStorageUsage(): Promise<{
  bytesUsed: number;
  bytesAvailable: number;
  percentUsed: number;
  abbreviationCount: number;
}> {
  const abbreviations = await getAllAbbreviations();
  const bytesUsed = new Blob([JSON.stringify(abbreviations)]).size;
  const bytesAvailable = ITEM_QUOTA_BYTES - bytesUsed;
  const percentUsed = (bytesUsed / ITEM_QUOTA_BYTES) * 100;

  return {
    bytesUsed,
    bytesAvailable,
    percentUsed,
    abbreviationCount: Object.keys(abbreviations).length,
  };
}

/**
 * Export all abbreviations as JSON
 *
 * @returns JSON string of all abbreviations
 */
export async function exportAbbreviations(): Promise<string> {
  const abbreviations = await getAllAbbreviations();
  return JSON.stringify(abbreviations, null, 2);
}

/**
 * Import abbreviations from JSON
 *
 * @param jsonData - JSON string containing abbreviations
 * @param merge - If true, merge with existing abbreviations; if false, replace all
 * @returns Number of abbreviations imported
 * @throws AbbreviationStorageError if JSON is invalid or quota exceeded
 */
export async function importAbbreviations(
  jsonData: string,
  merge = true,
): Promise<number> {
  let importedData: Record<string, Abbreviation>;

  try {
    importedData = JSON.parse(jsonData);
  } catch (error) {
    throw new AbbreviationStorageError("Invalid JSON format", "INVALID_INPUT");
  }

  // Validate imported data
  if (typeof importedData !== "object" || importedData === null) {
    throw new AbbreviationStorageError(
      "Invalid abbreviations data format",
      "INVALID_INPUT",
    );
  }

  const abbreviations = merge ? await getAllAbbreviations() : {};

  // Merge or replace
  let importCount = 0;
  for (const [shortcut, abbr] of Object.entries(importedData)) {
    if (
      abbr &&
      typeof abbr === "object" &&
      "shortcut" in abbr &&
      "expansion" in abbr
    ) {
      abbreviations[shortcut] = abbr as Abbreviation;
      importCount++;
    }
  }

  await saveAllAbbreviations(abbreviations);
  return importCount;
}

/**
 * Clear all abbreviations
 *
 * @returns Number of abbreviations deleted
 */
export async function clearAllAbbreviations(): Promise<number> {
  const abbreviations = await getAllAbbreviations();
  const count = Object.keys(abbreviations).length;

  await chrome.storage.sync.remove(STORAGE_KEYS.ABBREVIATIONS);

  return count;
}
