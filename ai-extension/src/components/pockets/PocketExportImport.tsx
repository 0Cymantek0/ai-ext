import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { PocketData } from "./PocketCard";

interface PocketExportImportProps {
  pockets: PocketData[];
  onImport: (pockets: PocketData[]) => Promise<void>;
  onClose: () => void;
}

interface ExportData {
  version: string;
  exportDate: string;
  pockets: PocketData[];
  metadata: {
    totalPockets: number;
    totalContent: number;
  };
}

export function PocketExportImport({
  pockets,
  onImport,
  onClose,
}: PocketExportImportProps) {
  const [selectedPockets, setSelectedPockets] = React.useState<Set<string>>(
    new Set(),
  );
  const [isImporting, setIsImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSelectAll = () => {
    if (selectedPockets.size === pockets.length) {
      setSelectedPockets(new Set());
    } else {
      setSelectedPockets(new Set(pockets.map((p) => p.id)));
    }
  };

  const handleTogglePocket = (id: string) => {
    const newSelected = new Set(selectedPockets);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedPockets(newSelected);
  };

  const handleExport = () => {
    const pocketsToExport = pockets.filter((p) => selectedPockets.has(p.id));

    if (pocketsToExport.length === 0) {
      alert("Please select at least one pocket to export");
      return;
    }

    const exportData: ExportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      pockets: pocketsToExport,
      metadata: {
        totalPockets: pocketsToExport.length,
        totalContent: pocketsToExport.reduce(
          (sum, p) => sum + p.contentIds.length,
          0,
        ),
      },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-pocket-export-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;

      // Validate import data
      if (!data.version || !data.pockets || !Array.isArray(data.pockets)) {
        throw new Error("Invalid export file format");
      }

      // Validate each pocket has required fields
      for (const pocket of data.pockets) {
        if (!pocket.name || !pocket.id) {
          throw new Error("Invalid pocket data in export file");
        }
      }

      await onImport(data.pockets);
      alert(`Successfully imported ${data.pockets.length} pocket(s)`);
      onClose();
    } catch (error) {
      console.error("Import error:", error);
      setImportError(
        error instanceof Error ? error.message : "Failed to import file",
      );
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleExportAsMarkdown = () => {
    const pocketsToExport = pockets.filter((p) => selectedPockets.has(p.id));

    if (pocketsToExport.length === 0) {
      alert("Please select at least one pocket to export");
      return;
    }

    let markdown = `# AI Pocket Export\n\n`;
    markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n`;
    markdown += `**Total Pockets:** ${pocketsToExport.length}\n\n`;
    markdown += `---\n\n`;

    pocketsToExport.forEach((pocket, index) => {
      markdown += `## ${index + 1}. ${pocket.name}\n\n`;
      if (pocket.description) {
        markdown += `${pocket.description}\n\n`;
      }
      markdown += `- **Created:** ${new Date(pocket.createdAt).toLocaleDateString()}\n`;
      markdown += `- **Updated:** ${new Date(pocket.updatedAt).toLocaleDateString()}\n`;
      markdown += `- **Content Items:** ${pocket.contentIds.length}\n`;
      if (pocket.tags.length > 0) {
        markdown += `- **Tags:** ${pocket.tags.join(", ")}\n`;
      }
      if ((pocket as any).category) {
        markdown += `- **Category:** ${(pocket as any).category}\n`;
      }
      markdown += `\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-pocket-export-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareSelected = () => {
    const pocketsToShare = pockets.filter((p) => selectedPockets.has(p.id));

    if (pocketsToShare.length === 0) {
      alert("Please select at least one pocket to share");
      return;
    }

    // Create a shareable JSON string
    const shareData: ExportData = {
      version: "1.0",
      exportDate: new Date().toISOString(),
      pockets: pocketsToShare,
      metadata: {
        totalPockets: pocketsToShare.length,
        totalContent: pocketsToShare.reduce(
          (sum, p) => sum + p.contentIds.length,
          0,
        ),
      },
    };

    const shareText = JSON.stringify(shareData, null, 2);

    // Copy to clipboard
    navigator.clipboard.writeText(shareText).then(
      () => {
        alert(
          "Pocket data copied to clipboard! You can share this with others.",
        );
      },
      (err) => {
        console.error("Failed to copy:", err);
        alert("Failed to copy to clipboard");
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-3xl max-h-[90vh] m-4 p-6 rounded-2xl shadow-2xl border overflow-y-auto",
          "bg-[rgba(17,25,40,0.75)] border-white/10 backdrop-blur-xl",
          "text-white",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">Export & Import Pockets</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Button>
        </div>

        {/* Import Section */}
        <div className="mb-6 p-4 rounded-lg bg-accent/30 border border-white/10">
          <h3 className="text-lg font-semibold mb-3">Import Pockets</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Import pockets from a previously exported JSON file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button onClick={handleImportClick} disabled={isImporting}>
            {isImporting ? (
              <>
                <svg
                  className="w-4 h-4 mr-2 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Importing...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                Choose File to Import
              </>
            )}
          </Button>
          {importError && (
            <div className="mt-3 p-3 rounded-lg bg-destructive/20 border border-destructive/50 text-sm">
              {importError}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Export Pockets</h3>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedPockets.size === pockets.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </div>

          {pockets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No pockets available to export</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                {pockets.map((pocket) => (
                  <label
                    key={pocket.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedPockets.has(pocket.id)
                        ? "bg-accent/50 border-primary"
                        : "bg-accent/20 border-white/10 hover:bg-accent/30",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPockets.has(pocket.id)}
                      onChange={() => handleTogglePocket(pocket.id)}
                      className="w-4 h-4"
                    />
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: pocket.color }}
                    >
                      {pocket.icon || "📁"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{pocket.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {pocket.contentIds.length} items
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleExport}
                  disabled={selectedPockets.size === 0}
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                    />
                  </svg>
                  Export as JSON
                </Button>
                <Button
                  onClick={handleExportAsMarkdown}
                  disabled={selectedPockets.size === 0}
                  variant="outline"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Export as Markdown
                </Button>
                <Button
                  onClick={handleShareSelected}
                  disabled={selectedPockets.size === 0}
                  variant="outline"
                >
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  Copy to Share
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Note:</strong> Exported files contain pocket metadata and
            structure. Content items are referenced by ID and may need to be
            exported separately for complete backup.
          </p>
        </div>
      </div>
    </div>
  );
}
