export type MessageKind =
  | "PING"
  | "CAPTURE_REQUEST"
  | "CAPTURE_RESULT"
  | "CAPTURE_SCREENSHOT"
  | "CAPTURE_MULTI_SELECTION"
  | "CAPTURE_MEDIA"
  | "CAPTURE_MEDIA_ELEMENT"
  | "CAPTURE_SELECTION_SNIPPET"
  | "CAPTURE_IMAGE_DATA"
  | "FILE_UPLOAD"
  | "CONTEXT_MENU_SAVE_TO_POCKET"
  | "POCKET_SELECTION_REQUEST"
  | "POCKET_SELECTION_RESPONSE"
  | "AI_FORMAT_REQUEST"
  | "AI_PROCESS_REQUEST"
  | "AI_PROCESS_UPDATE"
  | "AI_PROCESS_RESULT"
  | "AI_PROCESS_STREAM_START"
  | "AI_PROCESS_STREAM_CHUNK"
  | "AI_PROCESS_STREAM_END"
  | "AI_PROCESS_STREAM_ERROR"
  | "AI_PROCESS_CANCEL"
  | "AI_PROCESS_TEXT_CORRECTION"
  | "POCKET_CREATE"
  | "POCKET_UPDATE"
  | "POCKET_GET"
  | "POCKET_LIST"
  | "POCKET_DELETE"
  | "POCKET_SEARCH"
  | "CONTENT_LIST"
  | "CONTENT_GET"
  | "CONTENT_DELETE"
  | "CONTENT_SEARCH"
  | "CONTENT_CREATED"
  | "CONTENT_UPDATED"
  | "CONTENT_DELETED"
  | "NOTES_LIST"
  | "NOTE_SAVE"
  | "CONVERSATION_LIST"
  | "CONVERSATION_GET"
  | "CONVERSATION_CREATE"
  | "CONVERSATION_UPDATE"
  | "CONVERSATION_DELETE"
  | "CONVERSATION_GENERATE_METADATA"
  | "CONVERSATION_SEMANTIC_SEARCH"
  | "CONVERSATION_ATTACH_POCKET"
  | "CONVERSATION_DETACH_POCKET"
  | "CONVERSATION_GET_ATTACHED_POCKET"
  | "METADATA_QUEUE_STATUS"
  | "ABBREVIATION_CREATE"
  | "ABBREVIATION_GET"
  | "ABBREVIATION_UPDATE"
  | "ABBREVIATION_DELETE"
  | "ABBREVIATION_LIST"
  | "ABBREVIATION_EXPAND"
  | "VECTOR_INDEXING_RETRY"
  | "VECTOR_INDEXING_PROGRESS"
  | "ERROR";

export interface BaseMessage<K extends MessageKind, T> {
  kind: K;
  requestId?: string;
  payload: T;
  mode?: "ask" | "ai-pocket"; // Optional mode for mode-aware processing
}

export interface CaptureRequestPayload {
  mode: "full-page" | "selection" | "element" | "note";
  pocketId: string;
  showPreview?: boolean; // Whether to show preview UI for selection mode
}

export interface CaptureMultiSelectionPayload {
  pocketId: string;
  sanitize?: boolean;
}

export interface CaptureMediaPayload {
  pocketId: string;
  compressImages?: boolean;
  generateThumbnails?: boolean;
  transcribeAudio?: boolean;
}

export interface CaptureMediaElementPayload {
  elementSelector: string;
  mediaType: "image" | "video" | "audio";
  pocketId: string;
  compress?: boolean;
  generateThumbnail?: boolean;
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
  mode?: "ask" | "ai-pocket";
  pocketId?: string;
  autoContext?: boolean; // Whether to automatically include context
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
  mode?: "ask" | "ai-pocket"; // Mode used for processing
  contextUsed?: string[]; // Context signals used during processing
}

export interface AiStreamErrorPayload {
  requestId: string;
  error: string;
  conversationId?: string;
}

export interface AiCancelRequestPayload {
  requestId: string;
}

export interface AiTextCorrectionPayload {
  text: string;
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

export interface PocketSelectionRequestPayload {
  requestId: string;
  pockets: Array<{ id: string; name: string; description?: string; color?: string }>;
  selectionText?: string;
  preview?: string;
  sourceUrl?: string;
}

export interface PocketSelectionResponsePayload {
  requestId: string;
  status: "success" | "cancelled" | "error";
  pocketId?: string;
  error?: string;
}

export interface AIFormatRequestPayload {
  content: string;
  instructions?: string;
  preferLocal?: boolean;
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

// Conversation Pocket Attachment Types
export interface ConversationAttachPocketPayload {
  conversationId: string;
  pocketId: string;
}

export interface ConversationDetachPocketPayload {
  conversationId: string;
}

export interface ConversationGetAttachedPocketPayload {
  conversationId: string;
}

export interface ConversationAttachedPocketResult {
  conversationId: string;
  attachedPocketId: string | null;
  pocketName?: string;
  pocketDescription?: string;
}

// Storage Keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: "userPreferences",
  SIDE_PANEL_STATE: "sidePanelState",
  CONVERSATIONS: "conversations",
  POCKETS: "pockets",
  ABBREVIATIONS: "abbreviations",
} as const;
