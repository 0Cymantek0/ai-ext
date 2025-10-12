export type MessageKind =
  | "CAPTURE_REQUEST"
  | "CAPTURE_RESULT"
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
  | "POCKET_DELETE"
  | "POCKET_SEARCH"
  | "CONTENT_LIST"
  | "CONTENT_GET"
  | "CONTENT_DELETE"
  | "CONTENT_SEARCH"
  | "CONVERSATION_LIST"
  | "CONVERSATION_GET"
  | "CONVERSATION_CREATE"
  | "CONVERSATION_UPDATE"
  | "CONVERSATION_DELETE"
  | "ABBREVIATION_CREATE"
  | "ABBREVIATION_GET"
  | "ABBREVIATION_UPDATE"
  | "ABBREVIATION_DELETE"
  | "ABBREVIATION_LIST"
  | "ABBREVIATION_EXPAND"
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

export interface ContentListPayload {
  pocketId: string;
}

export interface ContentGetPayload {
  contentId: string;
}

export interface ContentDeletePayload {
  contentId: string;
}

export interface PocketSearchPayload {
  query: string;
  limit?: number;
}

export interface ContentSearchPayload {
  query: string;
  pocketId?: string;
  limit?: number;
}

export interface SearchResult<T> {
  item: T;
  relevanceScore: number;
  matchedFields?: string[];
}

// User Preferences
export interface UserPreferences {
  theme: "light" | "dark" | "auto";
  language: string;
  defaultAIModel: "nano" | "flash" | "pro";
  privacyMode: "strict" | "balanced" | "performance";
  accessibility: AccessibilityPreferences;
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reducedMotion: boolean;
  screenReaderOptimized: boolean;
  keyboardNavigationOnly: boolean;
}

// Side Panel State
export interface SidePanelState {
  version: number;
  activeTab: "chat" | "pockets";
  currentConversationId: string | null;
  lastActiveTimestamp: number;

  // UI State
  ui: {
    chatScrollPosition: number;
    pocketsScrollPosition: number;
    expandedSections: string[];
    sidebarCollapsed: boolean;
  };

  // Pocket State
  pockets: {
    selectedPocketId: string | null;
    filterQuery: string;
    sortBy: "date" | "name" | "size";
    viewMode: "list" | "grid";
  };

  // Chat State
  chat: {
    draftMessage: string;
    recentPrompts: string[];
    preferredModel: "nano" | "flash" | "pro" | null;
  };
}

// Abbreviation Types
export interface Abbreviation {
  shortcut: string;
  expansion: string;
  category?: string;
  usageCount: number;
  createdAt: number;
  lastUsed: number;
}

export interface AbbreviationCreatePayload {
  shortcut: string;
  expansion: string;
  category?: string;
}

export interface AbbreviationUpdatePayload {
  shortcut: string;
  expansion?: string;
  category?: string;
}

export interface AbbreviationGetPayload {
  shortcut: string;
}

export interface AbbreviationDeletePayload {
  shortcut: string;
}

export interface AbbreviationExpandPayload {
  shortcut: string;
}

export interface AbbreviationExpandResult {
  expansion: string;
  abbreviation: Abbreviation;
}

// Storage Keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: "userPreferences",
  SIDE_PANEL_STATE: "sidePanelState",
  CONVERSATIONS: "conversations",
  POCKETS: "pockets",
  ABBREVIATIONS: "abbreviations",
} as const;
