export type MessageKind =
  | "CAPTURE_REQUEST"
  | "CAPTURE_RESULT"
  | "AI_PROCESS_REQUEST"
  | "AI_PROCESS_UPDATE"
  | "AI_PROCESS_RESULT"
  | "POCKET_CREATE"
  | "POCKET_UPDATE"
  | "POCKET_LIST"
  | "ERROR";

export interface BaseMessage<K extends MessageKind, T> {
  kind: K;
  requestId?: string;
  payload: T;
}

export interface CaptureRequestPayload {
  mode: "full-page" | "selection" | "element" | "note";
  pocketId: string;
}

export interface AiProcessRequestPayload {
  contentId: string;
  task: "summarize" | "embed" | "translate" | "alt-text";
  preferLocal: boolean;
}
