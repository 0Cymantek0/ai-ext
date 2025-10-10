import { useState, useRef, useCallback } from "react";

interface UseFileInputOptions {
  accept?: string;
  maxSize?: number; // in MB per file
  multiple?: boolean;
  maxFiles?: number; // cap total number of files
}

export function useFileInput({ accept, maxSize, multiple = true, maxFiles }: UseFileInputOptions) {
  const [error, setError] = useState<string>("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragCounter = useRef<number>(0);

  // Parse and validate accepted types: supports comma-separated values like
  // "image/*,.pdf,.doc,.docx,.txt". Matches by MIME wildcard, exact MIME, or extension.
  const isAccepted = useCallback((file: File): boolean => {
    if (!accept) return true;
    const tokens = accept
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    if (tokens.length === 0) return true;

    const fileType = (file.type || "").toLowerCase();
    const fileName = (file.name || "").toLowerCase();

    for (const token of tokens) {
      // Extension match e.g., .pdf
      if (token.startsWith(".")) {
        if (fileName.endsWith(token)) return true;
        continue;
      }

      // Wildcard MIME e.g., image/*
      if (token.endsWith("/*")) {
        const prefix = token.slice(0, token.length - 1); // keep trailing /
        if (fileType.startsWith(prefix)) return true;
        continue;
      }

      // Exact MIME match
      if (token.includes("/")) {
        if (fileType === token) return true;
        continue;
      }
    }
    return false;
  }, [accept]);

  const validateAndAddFiles = useCallback((incoming: File[] | FileList) => {
    setError("");
    const newFiles = Array.from(incoming);
    if (newFiles.length === 0) return;

    const accepted: File[] = [];
    let skippedForType = 0;
    let skippedForSize = 0;

    for (const f of newFiles) {
      if (maxSize && f.size > maxSize * 1024 * 1024) {
        skippedForSize++;
        continue;
      }
      if (!isAccepted(f)) {
        skippedForType++;
        continue;
      }
      accepted.push(f);
    }

    setSelectedFiles((prev) => {
      const existing = multiple ? prev.slice() : [];
      const capacity = typeof maxFiles === 'number' ? Math.max(0, maxFiles - existing.length) : undefined;
      const toAdd = typeof capacity === 'number' ? accepted.slice(0, capacity) : accepted;
      if (typeof capacity === 'number' && accepted.length > capacity) {
        setError((prevErr) => prevErr || 'Too many files selected. Some were not added.');
      }
      return existing.concat(toAdd);
    });

    if (skippedForType || skippedForSize) {
      const parts: string[] = [];
      if (skippedForType) parts.push(`${skippedForType} not allowed type`);
      if (skippedForSize) parts.push(`${skippedForSize} too large (> ${maxSize}MB)`);
      setError(`Skipped ${parts.join(', ')}.`);
    }
  }, [isAccepted, maxFiles, maxSize, multiple]);

  // Chrome extension compatible file picker
  const openFilePicker = useCallback(async () => {
    try {
      // Try to use the File System Access API if available
      if ('showOpenFilePicker' in window) {
        // Build accept mapping robustly from the comma-separated accept string
        const tokens = (accept || '')
          .split(',')
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

        const acceptMap: Record<string, string[]> = {};

        // Helper to add one or more extensions under a MIME key
        const addExt = (mime: string, ...exts: string[]) => {
          if (!acceptMap[mime]) acceptMap[mime] = [];
          for (const ext of exts) {
            if (!acceptMap[mime].includes(ext)) acceptMap[mime].push(ext);
          }
        };

        // Default image extensions for wildcard image/*
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

        for (const token of tokens) {
          if (token === 'image/*') {
            addExt('image/*', ...imageExts);
            continue;
          }
          if (token === '.pdf') {
            addExt('application/pdf', '.pdf');
            continue;
          }
          if (token === '.doc') {
            addExt('application/msword', '.doc');
            continue;
          }
          if (token === '.docx') {
            addExt('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx');
            continue;
          }
          if (token === '.txt') {
            addExt('text/plain', '.txt');
            continue;
          }
          // Generic fallback: if token looks like a MIME
          if (token.includes('/')) {
            // No specific extensions known; allow any by not specifying extensions.
            if (!acceptMap[token]) acceptMap[token] = [];
            continue;
          }
          // If unknown extension token, attach under application/octet-stream
          if (token.startsWith('.')) {
            addExt('application/octet-stream', token);
          }
        }

        const fileHandle = await (window as any).showOpenFilePicker({
          types: Object.keys(acceptMap).length
            ? [{ description: 'Files', accept: acceptMap }]
            : undefined,
          multiple: Boolean(multiple),
        });

        const files: File[] = [];
        for (const handle of fileHandle) {
          const f = await handle.getFile();
          if (f) files.push(f);
        }
        if (files.length) validateAndAddFiles(files);
      } else {
        // Fallback: Create a temporary input element
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || '';
        input.multiple = Boolean(multiple);
        input.onchange = (e) => {
          const target = e.target as HTMLInputElement;
          if (target.files && target.files.length) {
            validateAndAddFiles(target.files);
          }
        };
        input.click();
      }
    } catch (error) {
      console.error('File picker error:', error);
      setError('Failed to open file picker');
    }
  }, [accept, validateAndAddFiles, multiple]);

  // Handle files from drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndAddFiles(files);
    }
  }, [validateAndAddFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const clearFiles = useCallback(() => {
    setError("");
    setSelectedFiles([]);
  }, []);

  const removeFileAt = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    error,
    files: selectedFiles,
    isDragging,
    openFilePicker,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    clearFiles,
    removeFileAt,
    addFiles: validateAndAddFiles,
  };
}
