/**
 * Pocket Export Service
 *
 * Handles complete export of pockets including:
 * - Pocket metadata
 * - All content items (captures, notes)
 * - RAG data (vector chunks, embeddings)
 * - Configuration for full restoration
 */

import JSZip from "jszip";
import type { PocketData } from "@/components/pockets/PocketCard";

interface ExportManifest {
  version: string;
  exportDate: string;
  pocketId: string;
  pocketName: string;
  contentCount: number;
  vectorChunkCount: number;
}

interface ContentItem {
  id: string;
  type: string;
  data: any;
  metadata: any;
}

interface VectorChunk {
  id: string;
  pocketId: string;
  contentId: string;
  embedding: number[];
  chunkText: string;
  metadata: any;
  createdAt: number;
  updatedAt: number;
}

/**
 * Export a single pocket with all its data as a ZIP file
 */
export async function exportPocket(pocket: PocketData): Promise<void> {
  try {
    const zip = new JSZip();

    // 1. Add pocket metadata
    const pocketMetadata = {
      id: pocket.id,
      name: pocket.name,
      description: pocket.description,
      color: pocket.color,
      icon: pocket.icon,
      tags: pocket.tags,
      createdAt: pocket.createdAt,
      updatedAt: pocket.updatedAt,
    };
    zip.file("pocket.json", JSON.stringify(pocketMetadata, null, 2));

    // 2. Fetch and add all content items
    const contents = await fetchPocketContents(pocket.id);
    zip.file("contents.json", JSON.stringify(contents, null, 2));

    // 3. Fetch and add vector chunks (RAG data)
    const vectorChunks = await fetchVectorChunks(pocket.id);
    zip.file("vector-chunks.json", JSON.stringify(vectorChunks, null, 2));

    // 4. Create manifest
    const manifest: ExportManifest = {
      version: "1.0.0",
      exportDate: new Date().toISOString(),
      pocketId: pocket.id,
      pocketName: pocket.name,
      contentCount: contents.length,
      vectorChunkCount: vectorChunks.length,
    };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));

    // 5. Generate and download ZIP
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pocket-${sanitizeFilename(pocket.name)}-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`Exported pocket "${pocket.name}" successfully`);
  } catch (error) {
    console.error("Error exporting pocket:", error);
    throw new Error(
      `Failed to export pocket: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Fetch all content items for a pocket
 */
async function fetchPocketContents(pocketId: string): Promise<ContentItem[]> {
  try {
    const response = await chrome.runtime.sendMessage({
      kind: "CONTENT_LIST",
      requestId: crypto.randomUUID(),
      payload: { pocketId },
    });

    console.log("CONTENT_LIST response:", response);

    // The response structure is { success: true, data: { content: [...] } }
    if (response.success && response.data?.content) {
      console.log(
        `Fetched ${response.data.content.length} content items for pocket ${pocketId}`,
      );
      return response.data.content;
    }
    console.warn("No content found or invalid response structure");
    return [];
  } catch (error) {
    console.error("Error fetching pocket contents:", error);
    return [];
  }
}

/**
 * Fetch all vector chunks for a pocket from IndexedDB
 */
async function fetchVectorChunks(pocketId: string): Promise<VectorChunk[]> {
  try {
    // Open IndexedDB
    const db = await openVectorDB();

    // Get all vector chunks for this pocket
    const transaction = db.transaction(["vectorChunks"], "readonly");
    const store = transaction.objectStore("vectorChunks");
    const index = store.index("pocketId");

    return new Promise((resolve, reject) => {
      const request = index.getAll(pocketId);

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error("Error fetching vector chunks:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error accessing vector database:", error);
    return [];
  }
}

/**
 * Open the vector database
 */
function openVectorDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("ai-pocket-db", 4);

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Note: This upgrade handler is minimal since the main database managers
      // (IndexedDBManager and DatabaseManager) handle the full schema creation.
      // This is only used for reading vector chunks during export.
      
      // Create vectorChunks object store if it doesn't exist (version 2)
      if (!db.objectStoreNames.contains("vectorChunks")) {
        const store = db.createObjectStore("vectorChunks", { keyPath: "id" });
        store.createIndex("pocketId", "pocketId", { unique: false });
        store.createIndex("contentId", "contentId", { unique: false });
        store.createIndex("pocketId_contentId", ["pocketId", "contentId"], {
          unique: false,
        });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

/**
 * Sanitize filename for safe file system usage
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 50);
}

/**
 * Import a pocket from a ZIP file
 */
export async function importPocket(file: File): Promise<void> {
  try {
    const zip = await JSZip.loadAsync(file);

    // 1. Read and validate manifest
    const manifestFile = zip.file("manifest.json");
    if (!manifestFile) {
      throw new Error("Invalid pocket export: missing manifest.json");
    }
    const manifestText = await manifestFile.async("text");
    const manifest: ExportManifest = JSON.parse(manifestText);

    // 2. Read pocket metadata
    const pocketFile = zip.file("pocket.json");
    if (!pocketFile) {
      throw new Error("Invalid pocket export: missing pocket.json");
    }
    const pocketText = await pocketFile.async("text");
    const pocketData = JSON.parse(pocketText);

    // 3. Create new pocket
    const createResponse = await chrome.runtime.sendMessage({
      kind: "POCKET_CREATE",
      requestId: crypto.randomUUID(),
      payload: {
        name: pocketData.name,
        description: pocketData.description,
        color: pocketData.color,
        icon: pocketData.icon,
        tags: pocketData.tags,
      },
    });

    if (!createResponse.success) {
      throw new Error("Failed to create pocket");
    }

    const newPocketId = createResponse.data.pocket.id;

    // 4. Import contents
    const contentsFile = zip.file("contents.json");
    if (contentsFile) {
      const contentsText = await contentsFile.async("text");
      const contents: any[] = JSON.parse(contentsText);

      console.log(`Importing ${contents.length} content items...`);

      for (const content of contents) {
        try {
          // Use CONTENT_IMPORT to directly save content to IndexedDB
          const response = await chrome.runtime.sendMessage({
            kind: "CONTENT_IMPORT",
            requestId: crypto.randomUUID(),
            payload: {
              pocketId: newPocketId,
              content: content.content,
              sourceUrl: content.sourceUrl || "",
              metadata: {
                type: content.type,
                ...content.metadata,
                timestamp:
                  content.metadata?.timestamp ||
                  content.capturedAt ||
                  Date.now(),
              },
            },
          });

          if (response.success) {
            console.log(
              `✅ Imported content item: ${response.data.contentId} (type: ${content.type})`,
            );
          } else {
            console.error(`❌ Failed to import content item:`, response.error);
          }
        } catch (error) {
          console.error(`❌ Error importing content item:`, error);
        }
      }

      console.log(`✅ Finished importing ${contents.length} content items`);
    }

    // 5. Import vector chunks
    const vectorFile = zip.file("vector-chunks.json");
    if (vectorFile) {
      const vectorText = await vectorFile.async("text");
      const vectorChunks: VectorChunk[] = JSON.parse(vectorText);

      // Store vector chunks in IndexedDB
      await importVectorChunks(newPocketId, vectorChunks);
    }

    console.log(`Imported pocket "${pocketData.name}" successfully`);
  } catch (error) {
    console.error("Error importing pocket:", error);
    throw new Error(
      `Failed to import pocket: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Import vector chunks into IndexedDB
 */
async function importVectorChunks(
  newPocketId: string,
  chunks: VectorChunk[],
): Promise<void> {
  try {
    const db = await openVectorDB();
    const transaction = db.transaction(["vectorChunks"], "readwrite");
    const store = transaction.objectStore("vectorChunks");

    for (const chunk of chunks) {
      // Update pocketId to new pocket and ensure createdAt is set
      const newChunk = {
        ...chunk,
        pocketId: newPocketId,
        id: crypto.randomUUID(), // Generate new ID
        createdAt: chunk.createdAt || Date.now(), // Preserve or set createdAt
      };

      store.add(newChunk);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error("Error importing vector chunks:", error);
    throw error;
  }
}
