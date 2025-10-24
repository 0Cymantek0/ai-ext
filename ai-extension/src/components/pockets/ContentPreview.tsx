import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Response } from "@/components/ai/response";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface ContentPreviewProps {
  content: CapturedContent | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ContentPreview({ content, isOpen, onClose }: ContentPreviewProps) {
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !content) return null;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleViewFile = () => {
    if (!content || !content.content) return;

    try {
      const fileContent = typeof content.content === 'string' 
        ? JSON.parse(content.content) 
        : content.content;
      
      // For PDFs, open in Chrome's built-in viewer
      if (content.type === "pdf" && fileContent.fileData) {
        // Convert base64 to blob
        const base64Data = fileContent.fileData.split(',')[1] || fileContent.fileData;
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Open in new tab with Chrome's PDF viewer
        window.open(url, '_blank');
        return;
      }

      // For other files, download them
      if (fileContent.fileData) {
        const link = document.createElement("a");
        link.href = fileContent.fileData;
        link.download = fileContent.fileName || content.metadata.title || "download";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error("Error viewing/downloading file:", error);
      alert("Failed to open file");
    }
  };

  const renderContent = () => {
    // Handle file types (PDF, DOCX, XLSX, etc.)
    if (content.type === "pdf" || content.type === "document" || content.type === "spreadsheet" || content.type === "file") {
      const fileContent = content.content as any;
      const fileSize = content.metadata.fileSize 
        ? `${(content.metadata.fileSize / 1024).toFixed(1)} KB`
        : "Unknown size";
      const fileType = content.metadata.fileExtension?.toUpperCase() || content.type.toUpperCase();
      
      return (
        <div className="p-8 bg-accent/10 rounded-lg text-center">
          <div className="flex flex-col items-center gap-4">
            {/* File icon */}
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              {content.type === "pdf" ? (
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              ) : content.type === "document" ? (
                <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ) : content.type === "spreadsheet" ? (
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            
            {/* File info */}
            <div>
              <h3 className="text-lg font-semibold">{fileContent.fileName || content.metadata.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{fileType} • {fileSize}</p>
              
              {/* PDF metadata preview */}
              {content.type === "pdf" && content.pdfMetadata && (
                <div className="mt-4 text-left max-w-md">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>📄 {content.pdfMetadata.pageCount} pages</p>
                    {content.pdfMetadata.structuredContent.headings.length > 0 && (
                      <p>📑 {content.pdfMetadata.structuredContent.headings.length} headings</p>
                    )}
                    {content.pdfMetadata.structuredContent.tables.length > 0 && (
                      <p>📊 {content.pdfMetadata.structuredContent.tables.length} tables</p>
                    )}
                    {content.pdfMetadata.images.length > 0 && (
                      <p>🖼️ {content.pdfMetadata.images.length} images</p>
                    )}
                    <p className="text-green-600 dark:text-green-400">✓ AI-readable metadata extracted</p>
                  </div>
                </div>
              )}
            </div>

            {/* View/Download button */}
            <Button onClick={handleViewFile} className="mt-4">
              {content.type === "pdf" ? (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Open PDF
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download File
                </>
              )}
            </Button>
          </div>
        </div>
      );
    }

    if (content.type === "image") {
      // Handle ArrayBuffer images
      if (content.content instanceof ArrayBuffer) {
        const blob = new Blob([content.content], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        return (
          <div className="flex items-center justify-center p-4 bg-accent/10 rounded-lg">
            <img src={url} alt={content.metadata.title || "Captured image"} className="max-w-full max-h-96 rounded" />
          </div>
        );
      }
      
      // Handle string-based images (URL or JSON)
      if (typeof content.content === "string") {
        try {
          const parsed = JSON.parse(content.content);
          const imageSrc = parsed?.image?.src;
          if (imageSrc) {
            return (
              <div className="flex flex-col items-center justify-center p-4 bg-accent/10 rounded-lg gap-4">
                <img 
                  src={imageSrc} 
                  alt={parsed?.image?.alt || content.metadata.title || "Captured image"} 
                  className="max-w-full max-h-[500px] rounded shadow-lg"
                />
                {parsed?.image?.alt && (
                  <p className="text-sm text-muted-foreground italic text-center">
                    {parsed.image.alt}
                  </p>
                )}
              </div>
            );
          }
        } catch {
          // If parsing fails, treat as direct URL
          return (
            <div className="flex items-center justify-center p-4 bg-accent/10 rounded-lg">
              <img 
                src={content.content} 
                alt={content.metadata.title || "Captured image"} 
                className="max-w-full max-h-[500px] rounded shadow-lg"
              />
            </div>
          );
        }
      }
    }

    if (content.type === "snippet" && typeof content.content === "string") {
      try {
        const parsed = JSON.parse(content.content);
        const isObject = parsed && typeof parsed === "object" && !Array.isArray(parsed);
        const snippetText = isObject ? (parsed as any).text ?? "" : typeof parsed === "string" ? parsed : "";
        const contextBefore = isObject ? (parsed as any).context?.before : undefined;
        const contextAfter = isObject ? (parsed as any).context?.after : undefined;

        return (
          <div className="space-y-4">
            {contextBefore && (
              <div className="p-3 rounded-lg bg-accent/10 text-sm text-muted-foreground italic">
                <Response>{contextBefore}</Response>
              </div>
            )}
            <div className="p-4 bg-accent/10 rounded-lg prose prose-sm prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-purple-400 prose-strong:text-zinc-100 prose-code:text-pink-400 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
              <Response>{snippetText}</Response>
            </div>
            {contextAfter && (
              <div className="p-3 rounded-lg bg-accent/10 text-sm text-muted-foreground italic">
                <Response>{contextAfter}</Response>
              </div>
            )}
          </div>
        );
      } catch (error) {
        console.warn("Failed to parse snippet content", error);
      }
    }

    // For snippet and page types (captured text), render as markdown
    if ((content.type === "snippet" || content.type === "page") && typeof content.content === "string") {
      return (
        <div className="p-4 bg-accent/10 rounded-lg prose prose-sm prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-purple-400 prose-strong:text-zinc-100 prose-code:text-pink-400 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
          <Response>{content.content}</Response>
        </div>
      );
    }

    if (typeof content.content === "string") {
      return (
        <div className="p-4 bg-accent/10 rounded-lg prose prose-sm prose-invert max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-a:text-purple-400 prose-strong:text-zinc-100 prose-code:text-pink-400 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-800">
          <Response>{content.content}</Response>
        </div>
      );
    }

    return (
      <div className="p-4 bg-accent/10 rounded-lg text-center text-muted-foreground">
        <p>Binary content preview not available</p>
        <p className="text-xs mt-2">Type: {content.type}</p>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Preview Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            "bg-background border rounded-lg shadow-lg",
            "w-full max-w-3xl max-h-[90vh] overflow-hidden",
            "flex flex-col"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold truncate">
                {content.metadata.title || "Content Preview"}
              </h2>
              <p className="text-sm text-muted-foreground truncate">
                {content.sourceUrl}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="ml-4 shrink-0"
            >
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

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}

            {/* Metadata */}
            <div className="mt-6 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Type:</span>
                  <span className="ml-2 capitalize">{content.type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Captured:</span>
                  <span className="ml-2">{formatDate(content.capturedAt)}</span>
                </div>
                {content.metadata.fileSize && (
                  <div>
                    <span className="text-muted-foreground">File Size:</span>
                    <span className="ml-2">{(content.metadata.fileSize / 1024).toFixed(1)} KB</span>
                  </div>
                )}
                {content.metadata.fileExtension && (
                  <div>
                    <span className="text-muted-foreground">Format:</span>
                    <span className="ml-2 uppercase">{content.metadata.fileExtension}</span>
                  </div>
                )}
                {content.sourceUrl && (
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <span className="ml-2 text-xs break-all">{content.sourceUrl}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <span className="ml-2 capitalize">{content.processingStatus}</span>
                </div>
              </div>

              {content.metadata.selectionContext && (
                <div>
                  <span className="text-muted-foreground text-sm">Context:</span>
                  <p className="mt-1 text-sm p-2 bg-accent/10 rounded">
                    {content.metadata.selectionContext}
                  </p>
                </div>
              )}

              {content.metadata.elementSelector && (
                <div>
                  <span className="text-muted-foreground text-sm">Selector:</span>
                  <code className="mt-1 block text-xs p-2 bg-accent/10 rounded font-mono">
                    {content.metadata.elementSelector}
                  </code>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
