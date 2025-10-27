import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type NoteData } from "./NoteEditorPage";

interface NoteExporterProps {
  notes: NoteData[];
  onClose: () => void;
  className?: string;
}

type ExportFormat = "markdown" | "html" | "pdf" | "json";

export function NoteExporter({ notes, onClose, className }: NoteExporterProps) {
  const [selectedFormat, setSelectedFormat] =
    React.useState<ExportFormat>("markdown");
  const [isExporting, setIsExporting] = React.useState(false);
  const [includeMetadata, setIncludeMetadata] = React.useState(true);
  const [combineNotes, setCombineNotes] = React.useState(false);

  const exportFormats = [
    {
      id: "markdown" as const,
      name: "Markdown",
      description: "Plain text with markdown formatting",
      extension: ".md",
      icon: "📝",
    },
    {
      id: "html" as const,
      name: "HTML",
      description: "Web page format with styling",
      extension: ".html",
      icon: "🌐",
    },
    {
      id: "pdf" as const,
      name: "PDF",
      description: "Portable document format",
      extension: ".pdf",
      icon: "📄",
    },
    {
      id: "json" as const,
      name: "JSON",
      description: "Structured data format",
      extension: ".json",
      icon: "📊",
    },
  ];

  const formatNoteAsMarkdown = (note: NoteData): string => {
    let content = "";

    if (includeMetadata) {
      content += `---\n`;
      content += `title: ${note.title}\n`;
      if (note.category) content += `category: ${note.category}\n`;
      if (note.tags.length > 0) content += `tags: [${note.tags.join(", ")}]\n`;
      if (note.createdAt)
        content += `created: ${new Date(note.createdAt).toISOString()}\n`;
      if (note.updatedAt)
        content += `updated: ${new Date(note.updatedAt).toISOString()}\n`;
      content += `---\n\n`;
    }

    content += `# ${note.title}\n\n`;
    content += note.content;

    return content;
  };

  const formatNoteAsHTML = (note: NoteData): string => {
    // Simple markdown to HTML conversion
    let htmlContent = note.content
      .replace(/^# (.*$)/gm, "<h1>$1</h1>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/\n/g, "<br>");

    htmlContent = `<p>${htmlContent}</p>`;

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${note.title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
        h1, h2, h3 { color: #333; }
        code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; }
        .metadata { background: #f8f9fa; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
        .tags { margin-top: 0.5rem; }
        .tag { background: #e9ecef; padding: 0.2rem 0.5rem; border-radius: 12px; font-size: 0.8rem; margin-right: 0.5rem; }
    </style>
</head>
<body>`;

    if (includeMetadata) {
      html += `<div class="metadata">
        <h1>${note.title}</h1>`;
      if (note.category)
        html += `<p><strong>Category:</strong> ${note.category}</p>`;
      if (note.createdAt)
        html += `<p><strong>Created:</strong> ${new Date(note.createdAt).toLocaleDateString()}</p>`;
      if (note.updatedAt)
        html += `<p><strong>Updated:</strong> ${new Date(note.updatedAt).toLocaleDateString()}</p>`;
      if (note.tags.length > 0) {
        html += `<div class="tags"><strong>Tags:</strong> `;
        note.tags.forEach((tag) => {
          html += `<span class="tag">${tag}</span>`;
        });
        html += `</div>`;
      }
      html += `</div>`;
    }

    html += `<div class="content">${htmlContent}</div>`;
    html += `</body></html>`;

    return html;
  };

  const generatePDF = async (note: NoteData): Promise<Blob> => {
    // For PDF generation, we'll create an HTML version and use the browser's print functionality
    // This is a simplified approach - in a real implementation, you might use a library like jsPDF
    const htmlContent = formatNoteAsHTML(note);

    // Create a temporary window for printing
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("Could not open print window");

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // This is a placeholder - actual PDF generation would require more complex implementation
    return new Blob([htmlContent], { type: "text/html" });
  };

  const handleExport = async () => {
    if (notes.length === 0) return;

    setIsExporting(true);
    try {
      if (combineNotes && notes.length > 1) {
        // Export all notes as a single file
        await exportCombinedNotes();
      } else {
        // Export each note as a separate file
        for (const note of notes) {
          await exportSingleNote(note);
        }
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const exportSingleNote = async (note: NoteData) => {
    let content: string | Blob;
    let mimeType: string;
    let filename: string;

    const baseFilename = note.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    switch (selectedFormat) {
      case "markdown":
        content = formatNoteAsMarkdown(note);
        mimeType = "text/markdown";
        filename = `${baseFilename}.md`;
        break;
      case "html":
        content = formatNoteAsHTML(note);
        mimeType = "text/html";
        filename = `${baseFilename}.html`;
        break;
      case "pdf":
        content = await generatePDF(note);
        mimeType = "application/pdf";
        filename = `${baseFilename}.pdf`;
        break;
      case "json":
        content = JSON.stringify(note, null, 2);
        mimeType = "application/json";
        filename = `${baseFilename}.json`;
        break;
      default:
        throw new Error(`Unsupported format: ${selectedFormat}`);
    }

    // Create and download the file
    const blob =
      content instanceof Blob
        ? content
        : new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCombinedNotes = async () => {
    let content: string;
    let mimeType: string;
    let filename: string;

    switch (selectedFormat) {
      case "markdown":
        content = notes
          .map((note) => formatNoteAsMarkdown(note))
          .join("\n\n---\n\n");
        mimeType = "text/markdown";
        filename = "notes_export.md";
        break;
      case "html":
        const htmlNotes = notes.map((note) =>
          formatNoteAsHTML(note)
            .replace(/<!DOCTYPE.*?<body>/, "")
            .replace(/<\/body>.*?<\/html>/, ""),
        );
        content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notes Export</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
        .note { margin-bottom: 3rem; padding-bottom: 2rem; border-bottom: 1px solid #eee; }
        .note:last-child { border-bottom: none; }
    </style>
</head>
<body>
    ${htmlNotes.map((html) => `<div class="note">${html}</div>`).join("")}
</body>
</html>`;
        mimeType = "text/html";
        filename = "notes_export.html";
        break;
      case "json":
        content = JSON.stringify(notes, null, 2);
        mimeType = "application/json";
        filename = "notes_export.json";
        break;
      default:
        throw new Error(
          `Combined export not supported for format: ${selectedFormat}`,
        );
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("p-6", className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Export Notes</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <svg
            className="w-4 h-4"
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

      <div className="space-y-6">
        {/* Format Selection */}
        <div>
          <h4 className="font-medium mb-3">Export Format</h4>
          <div className="grid grid-cols-2 gap-3">
            {exportFormats.map((format) => (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format.id)}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                  selectedFormat === format.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent/50",
                )}
              >
                <span className="text-xl">{format.icon}</span>
                <div>
                  <div className="font-medium text-sm">{format.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {format.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div>
          <h4 className="font-medium mb-3">Options</h4>
          <div className="space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">
                Include metadata (tags, dates, category)
              </span>
            </label>

            {notes.length > 1 && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={combineNotes}
                  onChange={(e) => setCombineNotes(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">
                  Combine all notes into a single file
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-sm">
            <strong>Export Summary:</strong>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {notes.length} note{notes.length !== 1 ? "s" : ""} •{" "}
            {selectedFormat.toUpperCase()} format
            {combineNotes && notes.length > 1 ? " • Combined into 1 file" : ""}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || notes.length === 0}
          >
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>
    </div>
  );
}
