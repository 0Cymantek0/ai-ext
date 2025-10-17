"use client";

import { Cloud, CornerRightUp, Cpu, FileUp, Paperclip, Sparkles, X, Zap, Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/animate-ui/components/animate/tooltip";

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
  autoContext?: boolean;
  onAutoContextChange?: (enabled: boolean) => void;
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
  autoContext = true,
  onAutoContextChange,
}: AIInputWithFileProps) {
  const [inputValue, setInputValue] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

  // Process transcript with Gemini Nano for grammar/spelling correction and filler removal
  const processTranscriptWithNano = useCallback(async (transcript: string): Promise<string> => {
    console.log("🎤 [Voice Processing] Starting Nano processing for:", transcript);

    try {
      // Send to background worker for processing (window.ai not available in sidepanel)
      console.log("� [Voiice Processing] Sending to background worker...");

      const response = await chrome.runtime.sendMessage({
        kind: "AI_PROCESS_TEXT_CORRECTION",
        requestId: crypto.randomUUID(),
        payload: {
          text: transcript
        }
      });

      console.log("📥 [Voice Processing] Response from background:", response);

      if (response.success && response.data?.correctedText) {
        const correctedText = response.data.correctedText;
        console.log("✨ [Voice Processing] Nano processing complete:", {
          original: transcript,
          corrected: correctedText
        });
        return correctedText.trim();
      } else {
        console.warn("⚠️ [Voice Processing] No corrected text in response, using original");
        return transcript;
      }
    } catch (error) {
      console.error("❌ [Voice Processing] Error processing transcript with Nano:", error);
      // Fall back to raw transcript on error
      return transcript;
    }
  }, []);

  // Initialize Web Speech API recognition
  useEffect(() => {
    const hasSpeech =
      typeof window !== "undefined" &&
      (((window as any).SpeechRecognition) || ((window as any).webkitSpeechRecognition));
    setIsSpeechSupported(Boolean(hasSpeech));

    if (!hasSpeech) return;

    try {
      const resolveRecognitionLang = (): string => {
        try {
          const uiLang = (window as any)?.chrome?.i18n?.getUILanguage?.();
          const browserLangs: readonly string[] = Array.isArray(navigator.languages) && navigator.languages.length > 0
            ? navigator.languages
            : [navigator.language].filter(Boolean) as string[];
          const candidate = (uiLang || browserLangs[0] || "en-US") as string;
          if (!candidate) return "en-US";
          // Map generic English to US default for better accuracy
          if (candidate.toLowerCase() === "en") return "en-US";
          return candidate;
        } catch {
          return "en-US";
        }
      };
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec: any = new SR();
      // Use continuous mode with manual timeout for better control
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = resolveRecognitionLang();

      rec.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
        // Clear any existing timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };
      // Don't auto-stop on speech end, let timeout handle it
      rec.onspeechend = () => {
        // Start a 2-second timeout after speech ends
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
        }
        silenceTimeoutRef.current = setTimeout(() => {
          try {
            rec.stop();
          } catch { }
          setIsListening(false);
        }, 2000); // 2 seconds of silence before stopping
      };
      rec.onend = () => {
        setIsListening(false);
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      };
      rec.onresult = (event: any) => {
        // Reset silence timeout on new speech
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        let finalTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          if (result && result.isFinal) {
            const alt = result[0];
            if (alt && alt.transcript) finalTranscript += alt.transcript;
          }
        }
        if (finalTranscript) {
          console.log("🎙️ [Voice Input] Final transcript received:", finalTranscript);

          // Process transcript with Gemini Nano
          setIsProcessingVoice(true);
          console.log("⏳ [Voice Input] Processing state set to true");

          processTranscriptWithNano(finalTranscript)
            .then((processedText) => {
              console.log("✅ [Voice Input] Processing complete, updating input value");
              setInputValue((prev) => {
                const next = (prev ? prev + " " : "") + processedText.trim();
                // Ensure textarea grows as text is added
                setTimeout(() => adjustHeight(), 0);
                return next;
              });
            })
            .catch((error) => {
              console.error("❌ [Voice Input] Error processing transcript:", error);
              // Fall back to raw transcript
              setInputValue((prev) => {
                const next = (prev ? prev + " " : "") + finalTranscript.trim();
                setTimeout(() => adjustHeight(), 0);
                return next;
              });
            })
            .finally(() => {
              console.log("🏁 [Voice Input] Processing complete, setting state to false");
              setIsProcessingVoice(false);
            });
        }
      };
      rec.onerror = (event: any) => {
        const err: string = event?.error || "unknown";
        let message = "Speech recognition error";
        if (err === "not-allowed" || err === "service-not-allowed") {
          message = "Microphone permission denied. Enable mic access to use voice.";
        } else if (err === "no-speech") {
          message = "No speech detected. Please try again.";
        } else if (err === "aborted") {
          message = "Voice input stopped.";
        }
        setVoiceError(message);
        setIsListening(false);
      };

      recognitionRef.current = rec;
      return () => {
        try {
          rec.stop();
        } catch { }
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        recognitionRef.current = null;
      };
    } catch (e) {
      setIsSpeechSupported(false);
    }
  }, [adjustHeight, processTranscriptWithNano]);

  const toggleListening = useCallback(() => {
    if (disabled) return;

    const rec = recognitionRef.current;

    if (isListening) {
      // Stop listening
      try {
        rec?.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      setIsListening(false);
    } else {
      // Start listening - the browser will automatically prompt for microphone permission
      if (!isSpeechSupported) {
        setVoiceError("Speech recognition not supported in this browser.");
        return;
      }

      setVoiceError(null);

      try {
        // Simply start the recognition - this will trigger the browser's native permission dialog
        rec?.start();
      } catch (e: any) {
        console.error('Error starting recognition:', e);
        const errMsg = e?.message || '';
        if (errMsg.includes('already started')) {
          // Recognition is already running, stop it first
          try { rec?.stop(); } catch { }
        } else {
          setVoiceError("Unable to start voice input. Please try again.");
        }
      }
    }
  }, [isSpeechSupported, isListening, disabled]);

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
        {(error || voiceError) && (
          <div className="text-red-500 text-sm px-3 py-1 bg-red-50 dark:bg-red-900/20 rounded-lg">
            {error || voiceError}
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

            {/* Model Selector moved below input */}

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
                "max-h-[200px] sm:max-h-[220px] md:max-h-[260px] lg:max-h-[300px] overflow-y-auto resize-none leading-[1.2] scrollbar-custom",
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

            {/* Voice Input Button */}
            <button
              onClick={toggleListening}
              className={cn(
                "absolute right-10 sm:right-12 top-1/2 -translate-y-1/2 z-20 rounded-xl bg-black/30 dark:bg-white/10 backdrop-blur-sm border border-white/10 py-1 px-1",
                disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-black/40 dark:hover:bg-white/15",
                isListening && "ring-1 ring-red-400/60",
                isProcessingVoice && "ring-1 ring-cyan-400/60"
              )}
              type="button"
              disabled={disabled || isProcessingVoice}
              title={
                isProcessingVoice
                  ? "Processing voice input..."
                  : !isSpeechSupported
                    ? "Voice dictation unavailable; click to grant mic permission."
                    : isListening
                      ? "Stop voice input"
                      : "Start voice input"
              }
              aria-pressed={isListening}
              aria-label="Voice input"
            >
              <span className="relative inline-flex items-center justify-center w-7 sm:w-8 h-7 sm:h-8">
                {/* Recording indicator dot */}
                {isListening && (
                  <span className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400/70 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                  </span>
                )}
                {/* Processing indicator - shimmer effect */}
                {isProcessingVoice && (
                  <span className="absolute -top-1 -right-1 inline-flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400/70 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500 animate-pulse"></span>
                  </span>
                )}
                {isListening ? (
                  <MicOff className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-red-400" />
                ) : (
                  <Mic className={cn(
                    "w-3.5 sm:w-4 h-3.5 sm:h-4 dark:text-white",
                    isProcessingVoice && "text-cyan-400 animate-pulse"
                  )} />
                )}
              </span>
            </button>

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

          {/* Model Selector and Auto-Context Toggle row below input */}
          <div className={cn("mt-2 flex items-center gap-2", disabled && "opacity-60 pointer-events-none")}>
            <Tooltip sideOffset={6}>
              <TooltipTrigger asChild>
                <Select
                  value={model}
                  onValueChange={(val) => onModelChange?.(val as any)}
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 sm:h-8 px-2 rounded-2xl bg-white/10 dark:bg-white/10 backdrop-blur-md border border-white/10 text-xs text-white shadow-md hover:bg-white/20 transition-colors"
                  >
                    <SelectValue>
                      <span className="inline-flex items-center gap-1.5">
                        {getModelIcon(model)}
                        <span>{getModelLabel(model)}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    align="start"
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
              <TooltipContent>
                {getModelTooltip(model)}
              </TooltipContent>
            </Tooltip>


            {/* Auto-Context Toggle Button */}
            {onAutoContextChange && (
              <TooltipProvider openDelay={0} closeDelay={100}>
                <Tooltip sideOffset={4}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onAutoContextChange(!autoContext)}
                      disabled={disabled}
                      className={cn(
                        "relative h-7 sm:h-8 min-h-[28px] sm:min-h-[32px] px-2 py-0 leading-none rounded-2xl backdrop-blur-md border text-xs shadow-md inline-flex items-center gap-1.5 transition-all duration-200 focus-visible:outline-none",
                        autoContext
                          ? "bg-slate-800/60 border-slate-700/50 hover:bg-slate-800/70"
                          : "bg-white/10 border-white/10 text-white/60 hover:bg-white/15 hover:text-white/80",
                        disabled && "opacity-50 cursor-not-allowed"
                      )}
                      aria-pressed={autoContext}
                    >
                      {/* Cursor/Pointer Icon */}
                      <svg
                        className={cn(
                          "w-3.5 h-3.5 transition-colors",
                          autoContext ? "text-cyan-400/90" : "text-white/60"
                        )}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                        />
                      </svg>
                      {/* Label with chromatic aberration effect */}
                      <span
                        className={cn(
                          "font-medium relative",
                          autoContext && "chromatic-text"
                        )}
                        style={autoContext ? {
                          color: '#e0f2fe',
                          textShadow: '0.5px 0 0 rgba(255, 0, 255, 0.3), -0.5px 0 0 rgba(0, 255, 255, 0.3)'
                        } : undefined}
                      >
                        Auto context
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[240px] bg-black/80 text-white border border-white/10 shadow-lg backdrop-blur-sm">
                    {autoContext
                      ? "Uses page, tabs, pockets, and history."
                      : "Uses only chat history. Click to enable."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



