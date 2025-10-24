import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CapturedContent } from "@/background/indexeddb-manager";

export interface ImageViewerProps {
  content: CapturedContent | null;
  allImages: CapturedContent[];
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: ((content: CapturedContent) => void) | undefined;
}

export function ImageViewer({ content, allImages, isOpen, onClose, onNavigate }: ImageViewerProps) {
  const [zoom, setZoom] = React.useState(1);
  const [isDragging, setIsDragging] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const imageRef = React.useRef<HTMLImageElement>(null);

  // Find current image index
  const currentIndex = React.useMemo(() => {
    if (!content) return -1;
    return allImages.findIndex(img => img.id === content.id);
  }, [content, allImages]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allImages.length - 1;

  // Reset zoom and position when content changes
  React.useEffect(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, [content?.id]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          if (hasPrevious) handlePrevious();
          break;
        case "ArrowRight":
          if (hasNext) handleNext();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case "0":
          handleResetZoom();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, hasPrevious, hasNext, zoom]);

  if (!isOpen || !content) return null;

  const handlePrevious = () => {
    if (hasPrevious && onNavigate) {
      const prevImage = allImages[currentIndex - 1];
      if (prevImage) {
        onNavigate(prevImage);
      }
    }
  };

  const handleNext = () => {
    if (hasNext && onNavigate) {
      const nextImage = allImages[currentIndex + 1];
      if (nextImage) {
        onNavigate(nextImage);
      }
    }
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleDownload = async () => {
    try {
      const imageSrc = getImageSrc();
      if (!imageSrc) return;

      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `${content.metadata.title || "image"}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download image:", error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getImageSrc = (): string | null => {
    if (content.type !== "image") return null;
    
    try {
      if (content.content instanceof ArrayBuffer) {
        const blob = new Blob([content.content], { type: "image/png" });
        return URL.createObjectURL(blob);
      }
      
      if (typeof content.content === "string") {
        try {
          const parsed = JSON.parse(content.content);
          return parsed?.image?.src || null;
        } catch {
          return content.content;
        }
      }
    } catch (error) {
      console.error("Failed to get image source:", error);
    }
    return null;
  };

  const getImageMetadata = () => {
    const metadata: Record<string, string> = {};
    
    if (content.metadata.dimensions) {
      metadata["Dimensions"] = `${content.metadata.dimensions.width} × ${content.metadata.dimensions.height}px`;
    }
    
    if (content.metadata.fileSize) {
      const sizeInKB = (content.metadata.fileSize / 1024).toFixed(2);
      const sizeInMB = (content.metadata.fileSize / (1024 * 1024)).toFixed(2);
      metadata["File Size"] = parseFloat(sizeInMB) >= 1 ? `${sizeInMB} MB` : `${sizeInKB} KB`;
    }
    
    if (content.metadata.fileExtension) {
      metadata["Format"] = content.metadata.fileExtension.toUpperCase();
    }
    
    metadata["Captured"] = new Date(content.capturedAt).toLocaleString();
    
    if (content.sourceUrl) {
      try {
        const url = new URL(content.sourceUrl);
        metadata["Domain"] = url.hostname;
      } catch {
        metadata["Source"] = content.sourceUrl;
      }
    }
    
    return metadata;
  };

  const imageSrc = getImageSrc();
  const imageMetadata = getImageMetadata();
  const imageAlt = content.metadata.title || "Captured image";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/95 z-50"
        onClick={onClose}
      />

      {/* Image Viewer */}
      <div className="fixed inset-0 z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-900/90 backdrop-blur-sm border-b border-zinc-800">
          <div className="flex-1 min-w-0 mr-4">
            <h2 className="text-lg font-semibold text-white truncate">
              {imageAlt}
            </h2>
            {allImages.length > 1 && (
              <p className="text-sm text-zinc-400">
                {currentIndex + 1} of {allImages.length}
              </p>
            )}
          </div>
          
          {/* Zoom Controls */}
          <div className="flex items-center gap-2 mr-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.25}
              className="h-9 w-9 p-0 text-zinc-300 hover:text-white hover:bg-zinc-800"
              title="Zoom out (-)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
              </svg>
            </Button>
            
            <span className="text-sm text-zinc-300 font-medium min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
              className="h-9 w-9 p-0 text-zinc-300 hover:text-white hover:bg-zinc-800"
              title="Zoom in (+)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetZoom}
              className="h-9 px-3 text-zinc-300 hover:text-white hover:bg-zinc-800"
              title="Reset zoom (0)"
            >
              Reset
            </Button>
          </div>

          {/* Download Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="h-9 px-3 text-zinc-300 hover:text-white hover:bg-zinc-800 mr-2"
            title="Download image"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </Button>

          {/* Close Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-9 w-9 p-0 text-zinc-300 hover:text-white hover:bg-zinc-800"
            title="Close (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        {/* Main Content Area - Vertical Layout */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Image Display - Top Section */}
          <div 
            className="flex-1 flex items-center justify-center overflow-hidden relative bg-zinc-900"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          >
            {/* Navigation Buttons */}
            {hasPrevious && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 p-0 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full z-10"
                title="Previous image (←)"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Button>
            )}

            {hasNext && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 p-0 bg-zinc-900/80 hover:bg-zinc-800 text-white rounded-full z-10"
                title="Next image (→)"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
            )}

            {imageSrc ? (
              <img
                ref={imageRef}
                src={imageSrc}
                alt={imageAlt}
                className="max-w-full max-h-full object-contain select-none"
                style={{
                  transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                }}
                draggable={false}
              />
            ) : (
              <div className="text-zinc-400">Failed to load image</div>
            )}
          </div>

          {/* Metadata Section - Bottom */}
          <div className="h-64 bg-zinc-900 border-t border-zinc-800 overflow-y-auto">
            <div className="px-6 py-4">
              <div className="grid grid-cols-3 gap-6">
                {/* Column 1: Image Details & Metadata */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Image Details
                    </h3>
                    <p className="text-sm text-white font-medium break-words">
                      {imageAlt}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                      Metadata
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(imageMetadata).map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-xs text-zinc-500">{key}:</dt>
                          <dd className="text-xs text-zinc-200 text-right break-words">{value}</dd>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Column 2: Source & Tags */}
                <div className="space-y-4">
                  {content.sourceUrl && (
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Source
                      </h3>
                      <a
                        href={content.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 underline break-all inline-flex items-start gap-1"
                      >
                        <span className="break-all">{content.sourceUrl}</span>
                        <svg className="w-3 h-3 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}

                  {content.metadata.tags && content.metadata.tags.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                        Tags
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {content.metadata.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-xs font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 3: Keyboard Shortcuts */}
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Keyboard Shortcuts
                  </h3>
                  <div className="space-y-1.5 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span>Navigate</span>
                      <span className="text-zinc-500 font-mono">← →</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Zoom in/out</span>
                      <span className="text-zinc-500 font-mono">+ / -</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reset zoom</span>
                      <span className="text-zinc-500 font-mono">0</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Close</span>
                      <span className="text-zinc-500 font-mono">Esc</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
