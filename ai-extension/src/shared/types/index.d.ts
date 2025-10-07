export type MessageKind =
  | "CAPTURE_REQUEST"
  | "CAPTURE_RESULT"
  | "SCREENSHOT_REQUEST"
  | "SCREENSHOT_RESULT"
  | "AI_PROCESS_REQUEST"
  | "AI_PROCESS_UPDATE"
  | "AI_PROCESS_RESULT"
  | "AI_PROCESS_STREAM_START"
  | "AI_PROCESS_STREAM_CHUNK"
  | "AI_PROCESS_STREAM_END"
  | "AI_PROCESS_STREAM_ERROR"
  | "AI_PROCESS_CANCEL"
  | "POCKET_CREATE"
  | "POCKET_UPDATE"
  | "POCKET_LIST"
  | "ENABLE_ELEMENT_SELECTOR"
  | "DISABLE_ELEMENT_SELECTOR"
  | "ERROR";

export interface BaseMessage<K extends MessageKind, T> {
  kind: K;
  requestId?: string;
  payload: T;
}

export interface CaptureRequestPayload {
  mode: "full-page" | "selection" | "element" | "note" | "media";
  pocketId: string;
}

export interface AiProcessRequestPayload {
  contentId: string;
  task: "summarize" | "embed" | "translate" | "alt-text";
  preferLocal: boolean;
}

export interface AiStreamRequestPayload {
  prompt: string;
  conversationId?: string;
  preferLocal?: boolean;
  model?: "nano" | "flash" | "pro";
}

export interface AiStreamChunkPayload {
  requestId: string;
  chunk: string;
  conversationId?: string;
}

export interface AiStreamEndPayload {
  requestId: string;
  conversationId?: string;
  totalTokens: number;
  processingTime: number;
  source: "gemini-nano" | "gemini-flash" | "gemini-pro";
}

export interface AiStreamErrorPayload {
  requestId: string;
  error: string;
  conversationId?: string;
}

export interface AiCancelRequestPayload {
  requestId: string;
}

export interface ScreenshotRequestPayload {
  format?: "png" | "jpeg";
  quality?: number;
}

export interface ScreenshotResultPayload {
  screenshot: string;
  format: string;
  timestamp: number;
}
