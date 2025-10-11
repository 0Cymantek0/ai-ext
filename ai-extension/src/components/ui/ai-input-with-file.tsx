"use client";

import { Cloud, CornerRightUp, Cpu, FileUp, Paperclip, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useFileInput } from "@/components/hooks/use-file-input";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface FileDisplayProps {
  fileName: string;
  fileSize?: number;
  onClear: () => void;
}

function FileDisplay({ fileName, fileSize, onClear }: FileDisplayProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 w-fit px-3 py-1 rounded-lg group border dark:border-white/10">
      <FileUp className="w-4 h-4 dark:text-white" />
      <div className="flex flex-col">
        <span className="text-sm dark:text-white font-medium">{fileName}</span>
        {fileSize && (
          <span className="text-xs text-muted-foreground dark:text-white/70">
            {formatFileSize(fileSize)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        title="Remove file"
      >
        <X className="w-3 h-3 dark:text-white" />
      </button>
    </div>
  );
}

interface AIInputWithFileProps {
  id?: string;
  placeholder?: string;
  minHeight?: number;
  maxHeight?: number;
  accept?: string;
  maxFileSize?: number;
  maxFiles?: number;
  onSubmit?: (message: string, files?: File[]) => void;
  className?: string;
  disabled?: boolean;
  model?: "auto" | "nano" | "flash-lite" | "flash" | "pro";
  onModelChange?: (model: "auto" | "nano" | "flash-lite" | "flash" | "pro") => void;
}

export function AIInputWithFile({
  id = "ai-input-with-file",
  placeholder = "File Upload and Chat!",
  minHeight = 52,
  maxHeight = 200,
  accept = "image/*",
  maxFileSize = 5,
  maxFiles,
  onSubmit,
  className,
  disabled = false,
  model = "auto",
  onModelChange,
}: AIInputWithFileProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const {
    error,
    files,
    isDragging,
    openFilePicker,
    handleDrop,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    clearFiles,
    removeFileAt,
  } = useFileInput({
    accept,
    maxSize: maxFileSize,
    multiple: true,
    ...(typeof maxFiles === "number" ? { maxFiles } : {}),
  });

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });

  const getModelLabel = (m: AIInputWithFileProps["model"]) => {
    switch (m) {
      case "nano":
        return "Gemini Nano";
      case "flash-lite":
        return "Gemini 2.5 Flash Lite";
      case "flash":
        return "Gemini 2.5 Flash";
      case "pro":
        return "Gemini 2.5 Pro";
      default:
        return "Auto";
    }
  };

  const getModelIcon = (m: AIInputWithFileProps["model"]) => {
    switch (m) {
      case "nano":
        return <Cpu className="size-3.5" />;
      case "flash-lite":
      case "flash":
        return <Zap className="size-3.5" />;
      case "pro":
        return <Cloud className="size-3.5" />;
      default:
        return <Sparkles className="size-3.5" />;
    }
  };

  const getModelTooltip = (m: AIInputWithFileProps["model"]) => {
    switch (m) {
      case "nano":
        return "On-device, fastest and private. Limited context and reasoning.";
      case "flash-lite":
        return "Cloud, lowest cost. Best for short and simple prompts.";
      case "flash":
        return "Cloud, balanced speed/cost. Good for larger inputs.";
      case "pro":
        return "Cloud, most capable reasoning and coding. Highest cost.";
      default:
        return "Automatically choose the best model based on task and device.";
    }
  };

  const handleSubmit = () => {
    if (disabled) return;
    const hasText = Boolean(inputValue.trim());
    const hasFiles = Array.isArray(files) && files.length > 0;
    if (!hasText && !hasFiles) return;
    onSubmit?.(inputValue, hasFiles ? files : undefined);
    setInputValue("");
    adjustHeight(true);
  };

  return (
    <div className={cn("w-full py-2 sm:py-4 px-2 sm:px-0", className)}>
      <div className="relative max-w-lg w-full mx-auto flex flex-col gap-2">
        {/* Error Display */}
        {error && (
          <div className="text-red-500 text-sm px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error}
          </div>
        )}

        {/* Files Display */}
        {files && files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <div
                key={`${f.name}-${idx}`}
                className="flex items-center gap-2 bg-black/5 dark:bg-white/5 w-fit px-3 py-1 rounded-lg group border dark:border-white/10"
              >
                <FileUp className="w-4 h-4 dark:text-white" />
                <span className="text-sm dark:text-white font-medium truncate max-w-[180px]">
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeFileAt(idx)}
                  className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                  title="Remove file"
                >
                  <X className="w-3 h-3 dark:text-white" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={clearFiles}
              className="text-xs px-2 py-1 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10"
              title="Clear all"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Drop Zone */}
        <div
          className={cn(
            "relative max-w-lg w-full mx-auto",
            isDragging &&
              "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-2xl"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
        >
          <div className="relative">
            {/* Attachment Button */}
            <div
              className={cn(
                "absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-7 sm:h-8 w-7 sm:w-8 rounded-lg bg-black/30 dark:bg-white/10 backdrop-blur-sm border border-white/10",
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:cursor-pointer hover:bg-black/40 dark:hover:bg-white/15",
              )}
              onClick={() => !disabled && openFilePicker()}
              title={`Attach file (${accept || 'any type'})`}
            >
              <Paperclip className="w-3.5 sm:w-4 h-3.5 sm:h-4 transition-opacity transform scale-x-[-1] rotate-45 dark:text-white" />
            </div>

            {/* Model Selector */}
            <div
              className={cn(
                "absolute right-10 sm:right-12 top-1/2 -translate-y-1/2 z-20",
                disabled && "pointer-events-none opacity-60",
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Select
                    value={model}
                    onValueChange={(val) => onModelChange?.(val as any)}
                    disabled={disabled}
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 sm:h-8 px-2 rounded-2xl bg-white/10 dark:bg-white/10 backdrop-blur-md border border-white/10 text-xs text-white shadow-md hover:bg-white/20 transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
                    >
                      <SelectValue>
                        <span className="inline-flex items-center gap-1.5">
                          {getModelIcon(model)}
                          <span>{getModelLabel(model)}</span>
                        </span>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      align="end"
                      className="backdrop-blur-md bg-white/10 dark:bg-white/10 border border-white/10 shadow-lg"
                    >
                      <SelectItem value="auto">
                        <span className="inline-flex items-center gap-2">
                          <Sparkles className="size-4" /> Auto
                        </span>
                      </SelectItem>
                      <SelectItem value="nano">
                        <span className="inline-flex items-center gap-2">
                          <Cpu className="size-4" /> Gemini Nano
                        </span>
                      </SelectItem>
                      <SelectItem value="flash-lite">
                        <span className="inline-flex items-center gap-2">
                          <Zap className="size-4" /> Gemini 2.5 Flash Lite
                        </span>
                      </SelectItem>
                      <SelectItem value="flash">
                        <span className="inline-flex items-center gap-2">
                          <Zap className="size-4" /> Gemini 2.5 Flash
                        </span>
                      </SelectItem>
                      <SelectItem value="pro">
                        <span className="inline-flex items-center gap-2">
                          <Cloud className="size-4" /> Gemini 2.5 Pro
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>
                  {getModelTooltip(model)}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Drag and Drop Overlay */}
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-blue-50 dark:bg-blue-900/20 rounded-2xl border-2 border-dashed border-blue-500 z-10">
                <div className="text-center">
                  <FileUp className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    Drop file here
                  </p>
                </div>
              </div>
            )}

            <Textarea
              id={id}
              placeholder={isDragging ? "Drop file here..." : placeholder}
              disabled={disabled}
              className={cn(
                "max-w-lg bg-black/30 dark:bg-white/10 backdrop-blur-sm w-full rounded-2xl sm:rounded-3xl pl-14 sm:pl-16 pr-12 sm:pr-16 border border-white/10 shadow-lg",
                "placeholder:text-white/40",
                "ring-0",
                "text-white text-wrap py-3.5 sm:py-4 leading-[1.4]",
                "text-sm sm:text-base",
                "max-h-[200px] overflow-y-auto resize-none leading-[1.2]",
                `min-h-[${minHeight}px]`,
                disabled && "opacity-50 cursor-not-allowed",
                isDragging && "opacity-50",
              )}
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                if (!disabled) {
                  setInputValue(e.target.value);
                  adjustHeight();
                }
              }}
              // Bind DnD on the textarea to ensure drops are captured even when overlay isn't active
              onDrop={(e) => {
                if (disabled) return;
                handleDrop(e);
              }}
              onDragOver={(e) => {
                if (disabled) return;
                handleDragOver(e);
              }}
              onDragEnter={(e) => {
                if (disabled) return;
                handleDragEnter(e);
              }}
              onDragLeave={(e) => {
                if (disabled) return;
                handleDragLeave(e);
              }}
              onKeyDown={(e) => {
                if (!disabled && e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              className={cn(
                "absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 z-20 rounded-xl bg-black/30 dark:bg-white/10 backdrop-blur-sm border border-white/10 py-1 px-1",
                disabled ? "opacity-50 cursor-not-allowed" : "",
              )}
              type="button"
              disabled={disabled}
              title={inputValue || (files && files.length) ? "Send message" : "Type a message or select files"}
            >
              <CornerRightUp
                className={cn(
                  "w-3.5 sm:w-4 h-3.5 sm:h-4 transition-opacity dark:text-white",
                  inputValue || (files && files.length) ? "opacity-100" : "opacity-30",
                )}
              />
            </button>
          </div>          
        </div>
      </div>
    </div>
  );
}
